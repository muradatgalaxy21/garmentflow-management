import { useEffect, useState } from "react";
import { Users, Loader2, CheckCircle2, Split, UserCheck, AlertTriangle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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

interface PanelRate {
  id: string;
  label: string;
  rate_per_piece: number;
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
  const [panelRates, setPanelRates] = useState<PanelRate[]>([]);
  const [selectedPanelRateId, setSelectedPanelRateId] = useState<string>("");

  useEffect(() => {
    if (phases.length > 0 && !selectedPhase) {
      setSelectedPhase(phases[0].id);
    }
  }, [phases, selectedPhase]);

  const selectedPhaseObj = phases.find((p) => p.id === selectedPhase);
  const isCutting = selectedPhaseObj?.name === "Cutting";

  useEffect(() => {
    if (!batch || !isCutting) {
      setPanelRates([]);
      setSelectedPanelRateId("");
      return;
    }
    supabase
      .from("batch_phase_panel_rates")
      .select("id, label, rate_per_piece")
      .eq("batch_id", batch.id)
      .eq("phase_id", selectedPhase)
      .then(({ data }) => {
        setPanelRates((data as PanelRate[]) ?? []);
        setSelectedPanelRateId("");
      });
  }, [batch, selectedPhase, isCutting]);

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
    if (!w.skills || w.skills.length === 0) return false; // No skills tagged — don't show under any phase
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
    if (isCutting && panelRates.length > 0 && !selectedPanelRateId) {
      toast({ title: "Cutting ke liye panel rate select karein", variant: "destructive" });
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
        panel_rate_id: string | null;
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
            panel_rate_id: selectedPanelRateId || null,
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
            panel_rate_id: selectedPanelRateId || null,
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

  const allSelected = filteredWorkers.length > 0 && selectedWorkerIds.length === filteredWorkers.length;
  const fieldLabel = "text-sm font-medium text-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-4 border-b space-y-1 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold pr-6">
            <Users className="w-5 h-5 text-primary shrink-0" />
            Manager On-Behalf Multi-Worker Entry
          </DialogTitle>
          {batch && (
            <DialogDescription asChild>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Batch style</span>
                <span className="font-semibold text-foreground">{batch.style_number}</span>
                <Badge variant="secondary" className="font-medium">Total {batch.total_quantity} Pcs</Badge>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          {/* Phase Selection */}
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Production Phase</Label>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger>
                <SelectValue placeholder="Phase Choose Karein" />
              </SelectTrigger>
              <SelectContent>
                {phases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cutting Panel Rate Selection */}
          {isCutting && (
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Panel / Size Rate</Label>
              {panelRates.length === 0 ? (
                <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Iss batch ke liye Cutting panel rates set nahi hain — pehle "Piece Rates" se set karein.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={selectedPanelRateId} onValueChange={setSelectedPanelRateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Panel rate choose karein" />
                  </SelectTrigger>
                  <SelectContent>
                    {panelRates.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label} — Rs {r.rate_per_piece}/pc
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Workers Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className={fieldLabel}>Select Workers ({selectedWorkerIds.length} Selected)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-primary"
                onClick={handleSelectAll}
                disabled={filteredWorkers.length === 0}
              >
                {allSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>

            {loadingWorkers ? (
              <div className="py-6 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
              </div>
            ) : filteredWorkers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-6 px-4 text-center">
                <Users className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Iss phase ke liye koi workers nahi miley.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto rounded-lg border p-2">
                {filteredWorkers.map((w) => {
                  const isChecked = selectedWorkerIds.includes(w.id);
                  return (
                    <label
                      key={w.id}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
                        isChecked ? "bg-primary/10 border-primary/50" : "bg-background hover:bg-muted"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{w.full_name || "Unnamed Worker"}</p>
                        {w.employee_id && <span className="text-xs text-muted-foreground font-mono">{w.employee_id}</span>}
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleWorkerToggle(w.id)}
                        className="w-4 h-4 rounded accent-primary shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mode: Equal Split vs Individual Entry */}
          <Tabs value={entryMode} onValueChange={(v) => setEntryMode(v as "split" | "individual")}>
            <TabsList className="grid grid-cols-2 h-auto w-full">
              <TabsTrigger value="split" className="text-xs sm:text-sm gap-1.5 whitespace-normal py-2">
                <Split className="w-3.5 h-3.5 shrink-0" /> Equal Split Total Pieces
              </TabsTrigger>
              <TabsTrigger value="individual" className="text-xs sm:text-sm gap-1.5 whitespace-normal py-2">
                <UserCheck className="w-3.5 h-3.5 shrink-0" /> Individual Pieces Per Worker
              </TabsTrigger>
            </TabsList>

            <TabsContent value="split" className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label className={fieldLabel}>Total Pieces Completed across selected workers</Label>
                <Input
                  type="number"
                  min="0"
                  value={totalSplitPieces || ""}
                  placeholder="e.g. 600 Pcs total"
                  onChange={(e) => setTotalSplitPieces(Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-11 text-base"
                />
              </div>
              {selectedWorkerIds.length > 0 && totalSplitPieces > 0 && (
                <Alert className="border-primary/30 bg-primary/5">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Har worker ko taqriban <strong>{Math.floor(totalSplitPieces / selectedWorkerIds.length)} pieces</strong> assign honge.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            <TabsContent value="individual" className="mt-4">
              {selectedWorkerIds.length === 0 ? (
                <div className="rounded-lg border border-dashed py-6 px-4 text-center text-sm text-muted-foreground">
                  Pehle uper se workers choose karein.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {selectedWorkerIds.map((wId) => {
                    const worker = workers.find((w) => w.id === wId);
                    const currentEntry = individualEntries[wId] || { completed: 0, wasted: 0 };
                    return (
                      <div key={wId} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md border bg-muted/30">
                        <span className="text-sm font-medium truncate min-w-0 flex-1 basis-32">
                          {worker?.full_name || "Worker"}
                        </span>
                        <div className="flex items-end gap-2">
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground block">Done Pcs</span>
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
                              className="w-20 h-9 text-sm text-center"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground block">Waste Pcs</span>
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
                              className="w-20 h-9 text-sm text-center"
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
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Manager Notes (Optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Line 2 shift A output"
            />
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 py-4 border-t bg-background gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || selectedWorkerIds.length === 0}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            Save Multi-Worker Entries ({selectedWorkerIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
