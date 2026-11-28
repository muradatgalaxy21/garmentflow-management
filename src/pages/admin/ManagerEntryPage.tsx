import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/admin/PageHeader";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
// Pakistan-local calendar date (the DB checks work_date against Asia/Karachi); finance.today() is UTC.
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
import { formatBatchIdentity } from "@/lib/batchIdentity";
import { DEPARTMENT_LABELS, getDepartmentStatus, type Department } from "@/lib/departmentEntries";
import {
  OFFICE_DEPARTMENTS,
  defaultRateLabel,
  rateMode,
  slipTotals,
  submitOfficeEntry,
  validateOfficeSlip,
  type OfficeRow,
} from "@/lib/officeEntry";

interface BatchOpt { id: string; style_number: string; status: string; orders: { order_number: string | null; party_name: string | null } | null }
interface WorkerOpt { id: string; full_name: string | null; employee_id: string | null; department: string | null; sub_department: string | null }
interface RateOpt { label: string; rate: number }
interface PanelOpt { id: string; label: string; rate_per_piece: number }

const emptyRow = (): OfficeRow => ({ worker_id: "", completed: 0, wasted: 0, panel_rate_id: null });
const int = (v: string) => Math.max(0, parseInt(v, 10) || 0);

/** Owner/manager type a supervisor's daily paper slip: one batch, one department, one work date, one row per worker. */
export default function ManagerEntryPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [params] = useSearchParams();

  const [batches, setBatches] = useState<BatchOpt[]>([]);
  const [workers, setWorkers] = useState<WorkerOpt[]>([]);
  const [batchId, setBatchId] = useState(params.get("batch") ?? "");
  const [department, setDepartment] = useState<Department | "">("");
  const [workDate, setWorkDate] = useState(today());
  const [rates, setRates] = useState<RateOpt[]>([]);
  const [rateLabel, setRateLabel] = useState<string | null>(null);
  const [panels, setPanels] = useState<PanelOpt[]>([]);
  const [rows, setRows] = useState<OfficeRow[]>([emptyRow()]);
  const [notes, setNotes] = useState("");
  const [finished, setFinished] = useState(false);
  const [allWorkers, setAllWorkers] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: b }, { data: roles }] = await Promise.all([
        supabase.from("production_batches").select("id, style_number, status, orders(order_number, party_name)").in("status", ["in_progress", "paused"]).order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "worker"),
      ]);
      setBatches((b as unknown as BatchOpt[]) ?? []);
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id, full_name, employee_id, department, sub_department").in("id", ids).order("full_name");
        setWorkers((p as WorkerOpt[]) ?? []);
      }
    })();
  }, []);

  const batch = batches.find((b) => b.id === batchId) ?? null;
  const mode = department ? rateMode(department) : null;

  // Rates for the department (slip label) and the batch's cutting panels.
  useEffect(() => {
    setRates([]);
    setRateLabel(null);
    if (!department || rateMode(department) !== "slip") return;
    supabase.from("department_cost_rates").select("label, rate").eq("department", department).then(({ data }) => {
      const list = ((data ?? []) as RateOpt[]).map((r) => ({ label: r.label, rate: Number(r.rate) }));
      setRates(list);
      setRateLabel(defaultRateLabel(list.map((r) => r.label)));
    });
  }, [department]);

  useEffect(() => {
    setPanels([]);
    if (!batchId || department !== "cutting") return;
    supabase.from("batch_phase_panel_rates").select("id, label, rate_per_piece").eq("batch_id", batchId).order("label").then(({ data }) => setPanels((data as PanelOpt[]) ?? []));
  }, [batchId, department]);

  // Same checks the worker QR flow makes: pause, department gate, already closed.
  useEffect(() => {
    setBlocked(null);
    if (!batch || !department) return;
    if (batch.status === "paused") { setBlocked("This batch is paused by admin. No new work can be logged until it is resumed."); return; }
    let live = true;
    setChecking(true);
    (async () => {
      // Same gate function the save uses (department_gate_blocker), so screen and server agree.
      const [{ data: blocker }, status] = await Promise.all([
        supabase.rpc("department_gate_blocker", { _batch_id: batch.id, _department: department }),
        getDepartmentStatus(batch.id, department),
      ]);
      if (!live) return;
      if (blocker) setBlocked(`Previous department "${DEPARTMENT_LABELS[blocker as Department] ?? blocker}" hasn't finished this batch yet.`);
      else if (status?.status === "closed") setBlocked("This department is already closed for this batch.");
      setChecking(false);
    })();
    return () => { live = false; };
  }, [batch, department]);

  const workerOptions = useMemo(() => {
    if (allWorkers || !department) return workers;
    // Lot Bundling is done by cutting workers.
    const dept = department === "lot_bundling" ? "cutting" : department;
    return workers.filter((w) => w.department === dept);
  }, [workers, department, allWorkers]);
  const workerName = (id: string) => workers.find((w) => w.id === id)?.full_name ?? "Worker";

  const setRow = (i: number, patch: Partial<OfficeRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addAllWorkers = () => {
    const present = new Set(rows.map((r) => r.worker_id));
    const extra = workerOptions.filter((w) => !present.has(w.id)).map((w) => ({ ...emptyRow(), worker_id: w.id }));
    setRows((rs) => [...rs.filter((r) => r.worker_id), ...extra]);
  };

  const filledRows = rows.filter((r) => r.worker_id || r.completed || r.wasted);
  const totals = slipTotals(filledRows);
  const slipRate = rates.find((r) => r.label === rateLabel);

  const rowRate = (r: OfficeRow): number | null => {
    if (mode === "panel") return panels.find((p) => p.id === r.panel_rate_id)?.rate_per_piece ?? null;
    if (mode === "slip") return slipRate?.rate ?? null;
    return null; // stitching: worker's machine rate, priced in the DB
  };

  const save = async () => {
    if (!batch || !department) { toast({ title: "Pick the batch and department", variant: "destructive" }); return; }
    const problem = validateOfficeSlip({ department, workDate, today: today(), rows: filledRows, hasPanelRates: panels.length > 0 });
    if (problem) { toast({ title: problem, variant: "destructive" }); return; }
    if (mode === "slip" && rates.length > 1 && !rateLabel) { toast({ title: "Pick the rate for this slip", variant: "destructive" }); return; }
    const ok = await confirm({
      title: `Save ${filledRows.length} row(s) for ${DEPARTMENT_LABELS[department]}?`,
      description: `${totals.completed} done, ${totals.wasted} wasted, work date ${workDate}${finished ? ". Marked as department finished" : ""}. It goes to the owner's Inbox to accept.`,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await submitOfficeEntry({ batchId: batch.id, department, workDate, rateLabel, finished, notes, rows: filledRows });
      toast({ title: "Slip saved", description: "Waiting for the owner to accept it in the Inbox." });
      setRows([emptyRow()]);
      setNotes("");
      setFinished(false);
    } catch (err: any) {
      toast({ title: "Could not save the slip", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Manager Entry"
        description="Type a supervisor's daily slip: one batch, one department, one work date. The owner accepts it in the Inbox before pay counts."
      />

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="me-batch">Batch</Label>
              <Select value={batchId} onValueChange={(v) => { setBatchId(v); setRows([emptyRow()]); }}>
                <SelectTrigger id="me-batch"><SelectValue placeholder="Pick batch" /></SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{formatBatchIdentity(b.orders?.order_number, b.style_number, b.orders?.party_name)}{b.status === "paused" ? " (paused)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-dept">Department</Label>
              <Select value={department} onValueChange={(v) => { setDepartment(v as Department); setRows([emptyRow()]); }}>
                <SelectTrigger id="me-dept"><SelectValue placeholder="Pick department" /></SelectTrigger>
                <SelectContent>
                  {OFFICE_DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{DEPARTMENT_LABELS[d]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-date">Work date</Label>
              <Input id="me-date" type="date" value={workDate} max={today()} onChange={(e) => setWorkDate(e.target.value)} />
            </div>
          </div>

          {batchId && batches.length > 0 && !batch && (
            <p className="text-sm text-muted-foreground">That batch is completed or cancelled, so no work can be entered. Pick an in-progress batch.</p>
          )}
          {checking && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking department…</p>}
          {blocked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {blocked}{" "}
                {batch && <Link className="underline" to={`/admin/batches?batch=${batch.id}`}>Open batch</Link>}
                {" "}(the owner can mark earlier stages "Done before system" or "Not needed" there).
              </AlertDescription>
            </Alert>
          )}

          {department && !blocked && !checking && (
            <>
              {mode === "slip" && (
                <div className="space-y-1.5 max-w-sm">
                  <Label htmlFor="me-rate">Rate</Label>
                  {rates.length === 0 ? (
                    <p className="text-sm text-foreground bg-warning/10 border border-warning/40 rounded-md p-2">
                      No rate set for {DEPARTMENT_LABELS[department]}. You can still save; pay stays pending until a rate is set (Batches &gt; Department Rates).
                    </p>
                  ) : (
                    <Select value={rateLabel ?? ""} onValueChange={setRateLabel}>
                      <SelectTrigger id="me-rate"><SelectValue placeholder="Pick rate" /></SelectTrigger>
                      <SelectContent>
                        {rates.map((r) => <SelectItem key={r.label} value={r.label}>{r.label === "default" ? "Standard" : r.label} · Rs {r.rate}/pc</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {mode === "machine" && <p className="text-sm text-muted-foreground">Each worker is paid at their own machine rate (Singer, Overlock, …).</p>}
              {mode === "panel" && panels.length === 0 && (
                <p className="text-sm text-muted-foreground">This batch has no cutting panel rates. Rows save without cost (set them in Batches &gt; Piece rates).</p>
              )}
              {mode === "panel" && <p className="text-xs text-muted-foreground">Cutting is cost only (cutting staff are on monthly salary): it is not added to worker wages.</p>}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Workers ({filledRows.length})</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={allWorkers} onCheckedChange={(v) => setAllWorkers(v === true)} /> Show all workers
                    </label>
                    <Button type="button" size="sm" variant="outline" onClick={addAllWorkers} disabled={workerOptions.length === 0}>
                      <Users className="h-4 w-4 mr-1" /> Add all listed
                    </Button>
                  </div>
                </div>
                {workerOptions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No workers in {DEPARTMENT_LABELS[department]}. Tick "Show all workers" or set departments on the Employees page.</p>
                )}

                <ul className="space-y-2">
                  {rows.map((r, i) => {
                    const rate = rowRate(r);
                    return (
                      <li key={i} className="rounded-md border border-border p-2 sm:p-3 grid gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-end">
                        <div className="col-span-2 sm:col-span-1 space-y-1 min-w-0">
                          <span className="text-xs text-muted-foreground">Worker</span>
                          <Select value={r.worker_id} onValueChange={(v) => setRow(i, { worker_id: v })}>
                            <SelectTrigger aria-label={`Row ${i + 1} worker`}><SelectValue placeholder="Pick worker" /></SelectTrigger>
                            <SelectContent>
                              {(workerOptions.some((w) => w.id === r.worker_id) || !r.worker_id ? workerOptions : [...workerOptions, ...workers.filter((w) => w.id === r.worker_id)]).map((w) => (
                                <SelectItem key={w.id} value={w.id}>{w.full_name ?? "Unnamed"}{w.employee_id ? ` · ${w.employee_id}` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {mode === "panel" && panels.length > 0 && (
                          <div className="col-span-2 sm:col-span-1 space-y-1">
                            <span className="text-xs text-muted-foreground">Panel</span>
                            <Select value={r.panel_rate_id ?? ""} onValueChange={(v) => setRow(i, { panel_rate_id: v })}>
                              <SelectTrigger className="sm:w-40" aria-label={`Row ${i + 1} panel`}><SelectValue placeholder="Panel" /></SelectTrigger>
                              <SelectContent>
                                {panels.map((p) => <SelectItem key={p.id} value={p.id}>{p.label} · Rs {p.rate_per_piece}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">{mode === "panel" ? "Panels done" : "Pieces done"}</span>
                          <Input type="number" inputMode="numeric" min={0} aria-label={`Row ${i + 1} done`} className="sm:w-24" value={r.completed || ""} onChange={(e) => setRow(i, { completed: int(e.target.value) })} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Wasted</span>
                          <Input type="number" inputMode="numeric" min={0} aria-label={`Row ${i + 1} wasted`} className="sm:w-24" value={r.wasted || ""} onChange={(e) => setRow(i, { wasted: int(e.target.value) })} />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end gap-2">
                          {rate !== null && r.completed > 0 && <span className="text-xs text-muted-foreground whitespace-nowrap">Rs {(rate * r.completed).toLocaleString()}</span>}
                          <Button type="button" size="icon" variant="ghost" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, j) => j !== i)))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
                  <Plus className="h-4 w-4 mr-1" /> Add row
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="me-notes">Notes (optional)</Label>
                <Textarea id="me-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Supervisor slip no. 14" />
              </div>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={finished} onCheckedChange={(v) => setFinished(v === true)} />
                <span>
                  <span className="font-medium text-foreground">Department finished for this batch</span>
                  <span className="block text-muted-foreground">When the owner accepts this slip, {DEPARTMENT_LABELS[department]} closes and the next department can start.</span>
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  {filledRows.length} row(s) · {totals.completed} done · {totals.wasted} wasted
                  {filledRows.length > 0 && <> · {filledRows.filter((r) => r.worker_id).map((r) => workerName(r.worker_id)).slice(0, 3).join(", ")}{filledRows.length > 3 ? "…" : ""}</>}
                </p>
                <Button onClick={save} disabled={saving || filledRows.length === 0}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save slip
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
