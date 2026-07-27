import { useEffect, useState } from "react";
import { Users, Loader2, CheckCircle2, Split, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Batch {
  id: string;
  style_number: string;
  total_quantity: number;
}

interface Phase {
  id: string;
  name: string;
}

interface WorkerProfile {
  id: string;
  full_name: string | null;
  skills: string[] | null;
  employee_id: string | null;
}

interface WorkerEntry {
  worker_id: string;
  completed: number;
  wasted: number;
}

interface MultiWorkerLogModalProps {
  batch: Batch | null;
  phases: Phase[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function MultiWorkerLogModal({
  batch,
  phases,
  open,
  onOpenChange,
  onSuccess,
}: MultiWorkerLogModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPhase, setSelectedPhase] = useState<string>("");
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [entryMode, setEntryMode] = useState<"split" | "individual">("split");
  
  // Form states
  const [totalSplitPieces, setTotalSplitPieces] = useState<number>(0);
  const [individualEntries, setIndividualEntries] = useState<Record<string, WorkerEntry>>({});
  const [notes, setNotes] = useState<string>("");
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (phases.length > 0 && !selectedPhase) {
      setSelectedPhase(phases[0].id);
    }
  }, [phases, selectedPhase]);

  useEffect(() => {
    if (!open) return;
    const fetchWorkers = async () => {
      setLoadingWorkers(true);
      try {
        // Fetch users who have role 'worker'
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "worker");

        const workerUserIds = (roleRows || []).map((r) => r.user_id);
        if (workerUserIds.length === 0) {
          setWorkers([]);
          setLoadingWorkers(false);
          return;
        }

        const { data: pData } = await supabase
          .from("profiles")
          .select("id, full_name, skills, employee_id")
          .in("id", workerUserIds);

        setWorkers((pData as WorkerProfile[]) || []);
      } catch (err) {
        console.error("Failed to fetch workers:", err);
      } finally {
        setLoadingWorkers(false);
      }
    };
    fetchWorkers();
  }, [open]);

  // Filter workers based on selected phase skills
  const phaseObj = phases.find((p) => p.id === selectedPhase);
  const filteredWorkers = workers.filter((w) => {
    if (!phaseObj) return true;
    if (!w.skills || w.skills.length === 0) return true; // Include workers without skills set
    return w.skills.some(
      (s) => s.toLowerCase().includes(phaseObj.name.toLowerCase()) ||
             phaseObj.name.toLowerCase().includes(s.toLowerCase())
    );
  });

  const handleWorkerToggle = (wId: string) => {
    if (selectedWorkerIds.includes(wId)) {
      setSelectedWorkerIds(selectedWorkerIds.filter((id) => id !== wId));
    } else {
      setSelectedWorkerIds([...selectedWorkerIds, wId]);
      if (!individualEntries[wId]) {
        setIndividualEntries((prev) => ({
          ...prev,
          [wId]: { worker_id: wId, completed: 0, wasted: 0 },
        }));
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedWorkerIds.length === filteredWorkers.length) {
      setSelectedWorkerIds([]);
    } else {
      const allIds = filteredWorkers.map((w) => w.id);
      setSelectedWorkerIds(allIds);
      const initEntries: Record<string, WorkerEntry> = {};
      allIds.forEach((id) => {
        initEntries[id] = individualEntries[id] || { worker_id: id, completed: 0, wasted: 0 };
      });
      setIndividualEntries(initEntries);
    }
  };

  const handleSubmit = async () => {
    if (!batch || !selectedPhase || selectedWorkerIds.length === 0) {
      toast({ title: "Barae meherbani kam az kam 1 worker select karein", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const trackingRows: Array<{
        batch_id: string;
        phase_id: string;
        worker_id: string;
        quantity_completed: number;
        quantity_wasted: number;
        notes: string;
      }> = [];

      if (entryMode === "split") {
        const perWorkerQty = Math.floor(totalSplitPieces / selectedWorkerIds.length);
        const remainder = totalSplitPieces % selectedWorkerIds.length;

        selectedWorkerIds.forEach((wId, idx) => {
          const qty = perWorkerQty + (idx === 0 ? remainder : 0);
          trackingRows.push({
            batch_id: batch.id,
            phase_id: selectedPhase,
            worker_id: wId,
            quantity_completed: qty,
            quantity_wasted: 0,
            notes: notes ? `[Manager On-Behalf] ${notes}` : "[Manager On-Behalf Entry]",
          });
        });
      } else {
        selectedWorkerIds.forEach((wId) => {
          const entry = individualEntries[wId] || { completed: 0, wasted: 0 };
          trackingRows.push({
            batch_id: batch.id,
            phase_id: selectedPhase,
            worker_id: wId,
            quantity_completed: Number(entry.completed || 0),
            quantity_wasted: Number(entry.wasted || 0),
            notes: notes ? `[Manager On-Behalf] ${notes}` : "[Manager On-Behalf Entry]",
          });
        });
      }

      const { error } = await supabase.from("batch_tracking").insert(trackingRows);

      if (error) throw error;

      toast({
        title: "🟢 Multi-Worker Production Logged!",
        description: `${selectedWorkerIds.length} workers ke behalf par details successfully save ho gayi hain.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast({ title: "Failed to log work", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <Users className="w-6 h-6 text-emerald-500" />
            Manager On-Behalf Multi-Worker Entry
          </DialogTitle>
        </DialogHeader>

        {batch && (
          <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-bold uppercase">Batch Style</span>
              <p className="text-lg font-black text-white">{batch.style_number}</p>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-sm">
              Total {batch.total_quantity} Pcs
            </Badge>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Phase Selection */}
          <div>
            <Label className="text-xs font-bold text-slate-300">Production Phase</Label>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger className="mt-1 font-bold">
                <SelectValue placeholder="Phase Choose Karein" />
              </SelectTrigger>
              <SelectContent>
                {phases.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="font-semibold py-2">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Workers Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-300">
                Select Workers ({selectedWorkerIds.length} Selected)
              </Label>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-emerald-400" onClick={handleSelectAll}>
                {selectedWorkerIds.length === filteredWorkers.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            {loadingWorkers ? (
              <div className="py-6 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
              </div>
            ) : filteredWorkers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Iss phase ke liye koi workers nahi miley.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1 border border-slate-800 rounded-xl">
                {filteredWorkers.map((w) => {
                  const isChecked = selectedWorkerIds.includes(w.id);
                  return (
                    <label
                      key={w.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? "bg-emerald-950/40 border-emerald-500/60 text-white"
                          : "bg-slate-900/60 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-sm font-bold truncate">{w.full_name || "Unnamed Worker"}</p>
                        {w.employee_id && <span className="text-[10px] text-slate-400 font-mono">{w.employee_id}</span>}
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleWorkerToggle(w.id)}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mode Tabs: Equal Split vs Individual Entry */}
          <Tabs value={entryMode} onValueChange={(v) => setEntryMode(v as "split" | "individual")}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="split" className="text-xs font-bold flex items-center gap-1.5">
                <Split className="w-3.5 h-3.5" /> Equal Split Total Pieces
              </TabsTrigger>
              <TabsTrigger value="individual" className="text-xs font-bold flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> Individual Pieces Per Worker
              </TabsTrigger>
            </TabsList>

            <TabsContent value="split" className="mt-3 space-y-3">
              <div>
                <Label className="text-xs font-bold">Total Pieces Completed across selected workers</Label>
                <Input
                  type="number"
                  min="0"
                  value={totalSplitPieces || ""}
                  placeholder="e.g. 600 Pcs total"
                  onChange={(e) => setTotalSplitPieces(Math.max(0, parseInt(e.target.value) || 0))}
                  className="mt-1 h-12 text-lg font-bold"
                />
              </div>
              {selectedWorkerIds.length > 0 && totalSplitPieces > 0 && (
                <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-lg text-xs text-emerald-300 font-semibold">
                  💡 Har worker ko taqriban <strong>{Math.floor(totalSplitPieces / selectedWorkerIds.length)} pieces</strong> assign honge.
                </div>
              )}
            </TabsContent>

            <TabsContent value="individual" className="mt-3 space-y-3">
              {selectedWorkerIds.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Pehle uper se workers choose karein.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedWorkerIds.map((wId) => {
                    const worker = workers.find((w) => w.id === wId);
                    const currentEntry = individualEntries[wId] || { completed: 0, wasted: 0 };
                    return (
                      <div key={wId} className="flex items-center justify-between gap-2 p-2 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="text-xs font-bold text-slate-200 truncate w-32">
                          {worker?.full_name || "Worker"}
                        </span>
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-[10px] text-emerald-400 font-bold block">Done Pcs</span>
                            <Input
                              type="number"
                              min="0"
                              value={currentEntry.completed || ""}
                              onChange={(e) =>
                                setIndividualEntries({
                                  ...individualEntries,
                                  [wId]: { ...currentEntry, completed: Math.max(0, parseInt(e.target.value) || 0) },
                                })
                              }
                              className="w-20 h-8 text-xs font-bold text-center"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-amber-400 font-bold block">Waste Pcs</span>
                            <Input
                              type="number"
                              min="0"
                              value={currentEntry.wasted || ""}
                              onChange={(e) =>
                                setIndividualEntries({
                                  ...individualEntries,
                                  [wId]: { ...currentEntry, wasted: Math.max(0, parseInt(e.target.value) || 0) },
                                })
                              }
                              className="w-20 h-8 text-xs font-bold text-center"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Notes */}
          <div>
            <Label className="text-xs font-bold text-slate-300">Manager Notes (Optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Line 2 shift A output"
              className="mt-1 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedWorkerIds.length === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            Save Multi-Worker Entries ({selectedWorkerIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
