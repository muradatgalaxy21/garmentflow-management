import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle, Plus, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { enqueueEntry } from "@/lib/offlineSync";
import { z } from "zod";

const entrySchema = z.object({
  phase_id: z.string().uuid("Select a phase"),
  quantity_completed: z.coerce.number().int().min(0),
  quantity_wasted: z.coerce.number().int().min(0),
  notes: z.string().max(1000).optional(),
});

interface BatchInfo {
  id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  order_id: string;
}

interface Phase {
  id: string;
  name: string;
  sequence_order: number;
}

export default function BatchEntryPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhase, setSelectedPhase] = useState("");
  const [ratePerPiece, setRatePerPiece] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Numeric Form state
  const [qtyCompleted, setQtyCompleted] = useState<number>(0);
  const [qtyWasted, setQtyWasted] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [userSkills, setUserSkills] = useState<string[]>([]);
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [prevPhaseWarning, setPrevPhaseWarning] = useState<string | null>(null);
  const [currentPhaseStatus, setCurrentPhaseStatus] = useState<"open" | "closed">("open");
  const [togglingPhaseStatus, setTogglingPhaseStatus] = useState(false);

  useEffect(() => {
    if (!batchId || !user) return;
    const load = async () => {
      try {
        const [batchRes, phasesRes, profileRes, rolesRes] = await Promise.all([
          supabase.from("production_batches")
            .select("id, style_number, total_quantity, status, order_id")
            .eq("id", batchId).single(),
          supabase.from("production_phases")
            .select("id, name, sequence_order")
            .order("sequence_order"),
          supabase.from("profiles").select("skills").eq("id", user.id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", user.id),
        ]);

        if (batchRes.data) setBatch(batchRes.data as BatchInfo);
        if (phasesRes.data) {
          setPhases(phasesRes.data as Phase[]);
          if (phasesRes.data.length > 0) setSelectedPhase(phasesRes.data[0].id);
        }
        if (profileRes.data?.skills) setUserSkills(profileRes.data.skills);
        if (rolesRes.data) {
          setIsManagerOrAdmin(rolesRes.data.some((r) => ["admin", "manager", "staff"].includes(r.role)));
        }

        // Check if there is an active session for this worker and batch
        const { data: activeSess } = await supabase
          .from("batch_worker_sessions")
          .select("id, phase_id")
          .eq("worker_id", user.id)
          .eq("batch_id", batchId)
          .eq("status", "active")
          .maybeSingle();

        if (activeSess) {
          setActiveSessionId(activeSess.id);
          if (activeSess.phase_id) setSelectedPhase(activeSess.phase_id);
        }
      } catch (err) {
        console.error("Load failed:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [batchId, user]);

  useEffect(() => {
    if (!selectedPhase || !batchId) {
      setRatePerPiece(null);
      setRoleError(null);
      setPrevPhaseWarning(null);
      return;
    }

    const validatePhaseAccessAndProgression = async () => {
      const selectedPhaseObj = phases.find((p) => p.id === selectedPhase);
      if (!selectedPhaseObj) return;

      // 1. Worker Role Authorization Check
      if (!isManagerOrAdmin && userSkills.length > 0) {
        const matchesSkill = userSkills.some(
          (s) => s.toLowerCase().includes(selectedPhaseObj.name.toLowerCase()) ||
                 selectedPhaseObj.name.toLowerCase().includes(s.toLowerCase())
        );
        if (!matchesSkill) {
          setRoleError(`❌ Aapka assigned role "${userSkills.join(", ")}" hai. Aap "${selectedPhaseObj.name}" step update nahi kar sakte.`);
        } else {
          setRoleError(null);
        }
      } else {
        setRoleError(null);
      }

      // 2. Sequential Phase Progression Check
      const prevPhase = phases
        .filter((p) => p.sequence_order < selectedPhaseObj.sequence_order)
        .sort((a, b) => b.sequence_order - a.sequence_order)[0];

      if (prevPhase) {
        // Check if previous phase is closed or has tracked quantity
        const [{ data: prevStatus }, { data: prevTracking }] = await Promise.all([
          supabase.from("batch_phase_status")
            .select("status")
            .eq("batch_id", batchId)
            .eq("phase_id", prevPhase.id)
            .maybeSingle(),
          supabase.from("batch_tracking")
            .select("quantity_completed")
            .eq("batch_id", batchId)
            .eq("phase_id", prevPhase.id),
        ]);

        const prevClosed = prevStatus?.status === "closed";
        const prevTotalQty = (prevTracking || []).reduce((sum, t) => sum + (t.quantity_completed || 0), 0);

        if (!prevClosed && prevTotalQty === 0) {
          setPrevPhaseWarning(`⚠️ Pichla Step Incomplete! Iss batch ka pichla step "${prevPhase.name}" abhi closed / complete nahi hua.`);
        } else {
          setPrevPhaseWarning(null);
        }
      } else {
        setPrevPhaseWarning(null);
      }

      // 3. Fetch Rate & Current Phase Status
      const [{ data: rateData }, { data: statusData }] = await Promise.all([
        supabase.from("batch_phase_rates")
          .select("rate_per_piece")
          .eq("batch_id", batchId)
          .eq("phase_id", selectedPhase)
          .maybeSingle(),
        supabase.from("batch_phase_status")
          .select("status")
          .eq("batch_id", batchId)
          .eq("phase_id", selectedPhase)
          .maybeSingle(),
      ]);

      setRatePerPiece(rateData?.rate_per_piece ?? null);
      setCurrentPhaseStatus((statusData?.status as "open" | "closed") || "open");
    };

    validatePhaseAccessAndProgression();
  }, [selectedPhase, batchId, phases, userSkills, isManagerOrAdmin]);

  const togglePhaseClosure = async () => {
    if (!batchId || !selectedPhase || !user) return;
    setTogglingPhaseStatus(true);
    try {
      const nextStatus = currentPhaseStatus === "closed" ? "open" : "closed";
      const { error } = await supabase.from("batch_phase_status").upsert({
        batch_id: batchId,
        phase_id: selectedPhase,
        status: nextStatus,
        closed_at: nextStatus === "closed" ? new Date().toISOString() : null,
        closed_by: nextStatus === "closed" ? user.id : null,
      }, { onConflict: "batch_id,phase_id" });

      if (error) throw error;
      setCurrentPhaseStatus(nextStatus);
      toast({
        title: nextStatus === "closed" ? "🟢 Phase Closed Successfully" : "🔓 Phase Re-opened",
        description: `This phase is now marked as ${nextStatus.toUpperCase()}.`,
      });
    } catch (err: any) {
      toast({ title: "Failed to update phase status", description: err.message, variant: "destructive" });
    } finally {
      setTogglingPhaseStatus(false);
    }
  };

  const adjustQty = (amount: number) => {
    setQtyCompleted((prev) => Math.max(0, prev + amount));
  };

  const adjustWasted = (amount: number) => {
    setQtyWasted((prev) => Math.max(0, prev + amount));
  };

  const handleSubmit = async () => {
    if (!user || !batchId) return;
    const parsed = entrySchema.safeParse({
      phase_id: selectedPhase,
      quantity_completed: qtyCompleted,
      quantity_wasted: qtyWasted,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }

    setSubmitting(true);

    try {
      if (activeSessionId) {
        // Close active session -> trigger automatically inserts into batch_tracking
        const { error: sErr } = await supabase
          .from("batch_worker_sessions")
          .update({
            status: "completed",
            end_time: new Date().toISOString(),
            quantity_completed: parsed.data.quantity_completed,
            quantity_wasted: parsed.data.quantity_wasted,
            notes: parsed.data.notes ?? null,
          })
          .eq("id", activeSessionId);

        if (sErr) throw sErr;
      } else {
        // Standard direct tracking insert
        const entry = {
          batch_id: batchId,
          phase_id: parsed.data.phase_id,
          worker_id: user.id,
          quantity_completed: parsed.data.quantity_completed,
          quantity_wasted: parsed.data.quantity_wasted,
          notes: parsed.data.notes ?? null,
        };

        const { error } = await supabase.from("batch_tracking").insert(entry);
        if (error) {
          await enqueueEntry({ ...entry, created_at: new Date().toISOString() });
        }
      }

      toast({ title: "Kam Log Ho Gaya! / Entry Saved Successfully!" });
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Error saving entry", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Batch nahi mila / Batch not found</p>
        <Button variant="ghost" className="mt-4 text-emerald-400" onClick={() => navigate("/factory/scan")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Wapas Scan Karein
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 max-w-md mx-auto text-center px-4">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border-2 border-emerald-500">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-black text-white">Shabash! Entry Saved</h2>
        <p className="text-sm text-slate-300 font-semibold">
          Aap ka kaam successfully log ho gaya hai.
        </p>
        <div className="flex flex-col w-full gap-3 mt-4">
          <Button size="lg" className="w-full h-14 text-lg font-bold bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => navigate("/factory/scan")}>
            Doosra QR Scan Karein
          </Button>
          <Button size="lg" variant="outline" className="w-full h-14 text-lg border-slate-600 text-slate-200" onClick={() => navigate("/factory")}>
            Home Par Wapas Jayein
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg mx-auto pb-10">
      <Button variant="ghost" size="sm" className="text-slate-400 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Wapas / Back
      </Button>

      <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">Style Number</span>
            <h1 className="text-2xl font-black text-white">{batch.style_number}</h1>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-sm font-bold px-3 py-1">
            Total {batch.total_quantity} Pcs
          </Badge>
        </div>
      </div>

      <Card className="bg-slate-800 border-slate-700 shadow-xl">
        <CardContent className="p-5 space-y-6">
          {/* Phase Selector & Closure Control */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm font-bold text-slate-200">1. Production Phase Select Karein</Label>
              {selectedPhase && (
                <Button
                  type="button"
                  size="sm"
                  variant={currentPhaseStatus === "closed" ? "secondary" : "outline"}
                  onClick={togglePhaseClosure}
                  disabled={togglingPhaseStatus}
                  className={`h-8 text-xs font-extrabold ${
                    currentPhaseStatus === "closed"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500"
                      : "border-slate-600 text-slate-300 hover:text-white"
                  }`}
                >
                  {togglingPhaseStatus ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : currentPhaseStatus === "closed" ? (
                    "🟢 Phase Closed (Click to Re-open)"
                  ) : (
                    "🔒 Close This Phase"
                  )}
                </Button>
              )}
            </div>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white text-base h-14 font-bold">
                <SelectValue placeholder="Phase Select Karein" />
              </SelectTrigger>
              <SelectContent>
                {phases.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-base py-3 font-semibold">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role Error Alert */}
          {roleError && (
            <div className="p-4 bg-red-950/80 border-2 border-red-500/60 rounded-2xl text-red-300 text-sm font-bold animate-shake">
              {roleError}
            </div>
          )}

          {/* Previous Phase Warning */}
          {prevPhaseWarning && !roleError && (
            <div className="p-4 bg-amber-950/80 border-2 border-amber-500/60 rounded-2xl text-amber-300 text-sm font-bold">
              {prevPhaseWarning}
            </div>
          )}

          {/* Rate Badge */}
          {selectedPhase && (
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Rate Per Piece:</span>
              <span className="text-base font-black text-emerald-400">
                {ratePerPiece !== null && ratePerPiece > 0 ? `PKR ${ratePerPiece} / piece` : "Rate Admin Se Set Hoga"}
              </span>
            </div>
          )}

          {/* Quantity Completed Touch Stepper */}
          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-700 space-y-3">
            <Label className="text-sm font-bold text-emerald-400 uppercase tracking-wide">
              2. Sahi Pieces Done / Completed Quantity
            </Label>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                size="lg"
                variant="destructive"
                className="w-14 h-14 text-2xl font-black rounded-xl"
                onClick={() => adjustQty(-10)}
              >
                -10
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-12 h-12 text-xl font-bold rounded-xl border-slate-600 text-white"
                onClick={() => adjustQty(-1)}
              >
                -1
              </Button>
              <Input
                type="number"
                min="0"
                value={qtyCompleted}
                onChange={(e) => setQtyCompleted(Math.max(0, parseInt(e.target.value) || 0))}
                className="bg-slate-950 border-emerald-500/50 text-white text-center text-3xl font-black h-16 rounded-xl"
              />
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-12 h-12 text-xl font-bold rounded-xl border-slate-600 text-white"
                onClick={() => adjustQty(1)}
              >
                +1
              </Button>
              <Button
                type="button"
                size="lg"
                className="w-14 h-14 text-2xl font-black rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => adjustQty(10)}
              >
                +10
              </Button>
            </div>
            {/* Quick Touch Chips */}
            <div className="flex gap-2 justify-center pt-2">
              {[+50, +100, +250, +500].map((chip) => (
                <Button
                  key={chip}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="bg-slate-800 text-emerald-300 font-bold border border-emerald-500/30 hover:bg-emerald-500/20"
                  onClick={() => adjustQty(chip)}
                >
                  +{chip}
                </Button>
              ))}
            </div>
          </div>

          {/* Quantity Wasted Stepper */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 space-y-3">
            <Label className="text-sm font-bold text-amber-400 uppercase tracking-wide">
              3. Kharab Pieces / Wasted Quantity
            </Label>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-12 h-12 text-xl font-bold rounded-xl border-slate-600 text-white"
                onClick={() => adjustWasted(-1)}
              >
                -1
              </Button>
              <Input
                type="number"
                min="0"
                value={qtyWasted}
                onChange={(e) => setQtyWasted(Math.max(0, parseInt(e.target.value) || 0))}
                className="bg-slate-950 border-amber-500/50 text-white text-center text-2xl font-black h-14 rounded-xl"
              />
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-12 h-12 text-xl font-bold rounded-xl border-slate-600 text-white"
                onClick={() => adjustWasted(1)}
              >
                +1
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs font-bold text-slate-300">Notes / Wajah (Optional)</Label>
            <Textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} placeholder="Kharabi ki wajah ya koi zaroori baat..."
              className="mt-1 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>

          <Button
            size="lg"
            className="w-full h-16 text-xl font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-2xl rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSubmit}
            disabled={submitting || !selectedPhase || !!roleError || currentPhaseStatus === "closed"}
          >
            {submitting ? (
              <><Loader2 className="w-6 h-6 animate-spin mr-2" /> Saving...</>
            ) : currentPhaseStatus === "closed" ? (
              "PHASE IS CLOSED / PEHLE RE-OPEN KAREIN"
            ) : (
              "KAAM LOG KAREIN / SAVE WORK"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

