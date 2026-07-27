import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle } from "lucide-react";
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

// Validation schema for the tracking entry form
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

  // Form state
  const [qtyCompleted, setQtyCompleted] = useState("");
  const [qtyWasted, setQtyWasted] = useState("0");
  const [notes, setNotes] = useState("");

  // 1. Load batch details and phases on mount
  useEffect(() => {
    if (!batchId) return;
    const load = async () => {
      try {
        const [batchRes, phasesRes] = await Promise.all([
          supabase.from("production_batches")
            .select("id, style_number, total_quantity, status, order_id")
            .eq("id", batchId).single(),
          supabase.from("production_phases")
            .select("id, name, sequence_order")
            .order("sequence_order"),
        ]);
        if (batchRes.data) setBatch(batchRes.data as BatchInfo);
        if (phasesRes.data) setPhases(phasesRes.data as Phase[]);
      } catch (err) {
        console.error("Load failed:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [batchId]);

  // 2. When a phase is selected, fetch the admin-configured rate
  useEffect(() => {
    if (!selectedPhase || !batchId) { setRatePerPiece(null); return; }
    const fetchRate = async () => {
      const { data } = await supabase
        .from("batch_phase_rates")
        .select("rate_per_piece")
        .eq("batch_id", batchId)
        .eq("phase_id", selectedPhase)
        .single();
      setRatePerPiece(data?.rate_per_piece ?? null);
    };
    fetchRate();
  }, [selectedPhase, batchId]);

  // 3. Handle form submission with offline support
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
    const entry = {
      batch_id: batchId,
      phase_id: parsed.data.phase_id,
      worker_id: user.id,
      quantity_completed: parsed.data.quantity_completed,
      quantity_wasted: parsed.data.quantity_wasted,
      notes: parsed.data.notes ?? null,
    };

    if (navigator.onLine) {
      try {
        const { error } = await supabase.from("batch_tracking").insert(entry);
        if (error) throw error;
        toast({ title: t("factory.entry.success") });
        setSubmitted(true);
      } catch {
        // Fallback to offline queue if direct insert fails
        await enqueueEntry({ ...entry, created_at: new Date().toISOString() });
        toast({ title: t("factory.entry.savedOffline") });
        setSubmitted(true);
      }
    } else {
      // Device is offline, queue for later sync
      await enqueueEntry({ ...entry, created_at: new Date().toISOString() });
      toast({ title: t("factory.entry.savedOffline") });
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">{t("factory.scanner.notFound")}</p>
        <Button variant="ghost" className="mt-4 text-emerald-400" onClick={() => navigate("/factory/scan")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> {t("factory.nav.scan")}
        </Button>
      </div>
    );
  }

  // Show success screen after submission
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <CheckCircle className="w-16 h-16 text-emerald-400" />
        <p className="text-lg font-semibold text-white">{t("factory.entry.success")}</p>
        <div className="flex gap-3">
          <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={() => navigate("/factory/scan")}>
            {t("factory.nav.scan")}
          </Button>
          <Button variant="outline" className="border-slate-600 text-slate-300" onClick={() => navigate("/factory")}>
            {t("factory.nav.home")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <Button variant="ghost" size="sm" className="text-slate-400 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> {t("factory.nav.scan")}
      </Button>

      <h1 className="text-xl font-bold text-white">{t("factory.entry.title")}</h1>

      {/* Batch Info Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">{t("factory.entry.batchDetails")}</p>
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-white">{batch.style_number}</p>
            <Badge variant="outline" className={
              batch.status === "completed"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-blue-500/15 text-blue-400 border-blue-500/30"
            }>
              {batch.status === "completed" ? t("factory.common.completed") : t("factory.common.inProgress")}
            </Badge>
          </div>
          <p className="text-sm text-slate-400">
            {t("factory.entry.expectedQuantity")}: {batch.total_quantity} {t("factory.common.pieces")}
          </p>
        </CardContent>
      </Card>

      {/* Entry Form */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-4 space-y-4">
          {/* Phase Selector */}
          <div>
            <Label className="text-xs text-slate-400">{t("factory.entry.currentPhase")}</Label>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger className="mt-1 bg-slate-900 border-slate-600 text-white">
                <SelectValue placeholder={t("factory.entry.selectPhase")} />
              </SelectTrigger>
              <SelectContent>
                {phases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rate (read-only) */}
          {selectedPhase && (
            <div>
              <Label className="text-xs text-slate-400">{t("factory.entry.ratePerPiece")}</Label>
              <p className="text-sm text-white mt-1">
                {ratePerPiece !== null && ratePerPiece > 0
                  ? `Rs. ${ratePerPiece}`
                  : <span className="text-amber-400 text-xs">{t("factory.entry.rateNotSet")}</span>
                }
              </p>
            </div>
          )}

          {/* Quantity Completed */}
          <div>
            <Label className="text-xs text-slate-400">{t("factory.entry.quantityCompleted")}</Label>
            <Input
              type="number" min="0" inputMode="numeric"
              value={qtyCompleted} onChange={(e) => setQtyCompleted(e.target.value)}
              className="mt-1 bg-slate-900 border-slate-600 text-white text-lg h-12"
            />
          </div>

          {/* Quantity Wasted */}
          <div>
            <Label className="text-xs text-slate-400">{t("factory.entry.quantityWasted")}</Label>
            <Input
              type="number" min="0" inputMode="numeric"
              value={qtyWasted} onChange={(e) => setQtyWasted(e.target.value)}
              className="mt-1 bg-slate-900 border-slate-600 text-white text-lg h-12"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-slate-400">{t("factory.entry.notes")}</Label>
            <Textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={3} placeholder={t("factory.entry.notesPlaceholder")}
              className="mt-1 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>

          <Button
            className="w-full h-14 text-base bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={handleSubmit} disabled={submitting || !selectedPhase || !qtyCompleted}
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin mr-2" />{t("factory.entry.submitting")}</>
            ) : (
              t("factory.entry.submit")
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
