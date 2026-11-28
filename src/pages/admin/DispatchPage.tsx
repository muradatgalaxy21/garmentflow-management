import { useEffect, useState } from "react";
import { Truck, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { withUndo } from "@/lib/undo";
import { useAuth } from "@/hooks/useAuth";
import { DEPARTMENT_LABELS, QUALITY_VERDICT_LABELS, generateBatchReport, type BatchReport } from "@/lib/departmentEntries";
import { formatBatchIdentity } from "@/lib/batchIdentity";
import { fmtDate } from "@/lib/format";
import { dispatchableBatches, type DispatchAvailability } from "@/lib/dispatch";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";

interface Batch {
  id: string;
  style_number: string;
  total_quantity: number;
  order_number: string | null;
  party_name: string | null;
  expected_delivery: string | null;
}

interface Dispatch {
  id: string;
  batch_id: string;
  dispatch_date: string;
  carrier: string | null;
  carton_count: number;
  dispatch_note: string | null;
  created_at: string;
  pcs_count: number | null;
}

export default function DispatchPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { user, can } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [avail, setAvail] = useState<DispatchAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  const [batchId, setBatchId] = useState("");
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [carrier, setCarrier] = useState("");
  const [cartonCount, setCartonCount] = useState<number>(0);
  const [pcsCount, setPcsCount] = useState<number>(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [reportBatchId, setReportBatchId] = useState("");
  const [report, setReport] = useState<BatchReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const load = async () => {
    setLoading(true);
    const [batchRes, dispatchRes, availRes] = await Promise.all([
      supabase.from("production_batches").select("id, style_number, total_quantity, orders(order_number, party_name, expected_delivery)").order("created_at", { ascending: false }),
      supabase.from("batch_dispatches").select("*").order("created_at", { ascending: false }),
      supabase.rpc("dispatch_availability"),
    ]);
    setBatches(((batchRes.data as any[]) ?? []).map((b) => ({
      id: b.id,
      style_number: b.style_number,
      total_quantity: b.total_quantity,
      order_number: b.orders?.order_number ?? null,
      party_name: b.orders?.party_name ?? null,
      expected_delivery: b.orders?.expected_delivery ?? null,
    })));
    setDispatches((dispatchRes.data as Dispatch[]) ?? []);
    setAvail((availRes.data as DispatchAvailability[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const batchLabel = (id: string) => {
    const b = batches.find((x) => x.id === id);
    return b ? formatBatchIdentity(b.order_number, b.style_number, b.party_name) : id.slice(0, 8);
  };

  const eligible = dispatchableBatches(batches, avail);
  const selected = eligible.find((b) => b.id === batchId);
  const batchDispatches = dispatches.filter((d) => d.batch_id === batchId);
  const dispatchedCartons = batchDispatches.reduce((n, d) => n + d.carton_count, 0);
  const errors = {
    batch: batchId ? "" : "Select a batch.",
    date: dispatchDate ? "" : "Choose a dispatch date.",
    pcs: pcsCount >= 1 && (!selected || pcsCount <= selected.remaining) ? "" : selected ? `Enter 1 to ${selected.remaining} pieces.` : "Enter the pieces dispatched.",
    cartons: cartonCount >= 1 ? "" : "Enter a whole number of cartons, at least 1.",
  };
  const valid = !errors.batch && !errors.date && !errors.cartons && !errors.pcs;

  const handleCreate = async () => {
    if (saving) return;
    setTouched(true);
    setSuccess(null);
    if (!valid) return;
    setSaving(true); // lock the button while the confirm dialog is open too
    const ok = await confirm({
      title: "Log this dispatch?",
      description: "You can undo it for 10 minutes.",
      details: [["Batch", batchLabel(batchId)], ["Date", fmtDate(dispatchDate)], ["Pieces", String(pcsCount)], ["Cartons", String(cartonCount)], ["Carrier", carrier.trim() || "—"]],
    });
    if (!ok) { setSaving(false); return; }
    const doneLabel = `${batchLabel(batchId)} · ${cartonCount} carton${cartonCount === 1 ? "" : "s"}`;
    const error = await withUndo("Dispatch logged", async () => (await supabase.from("batch_dispatches").insert({
      batch_id: batchId,
      dispatch_date: dispatchDate,
      carrier: carrier.trim() || null,
      carton_count: cartonCount,
      pcs_count: pcsCount,
      dispatch_note: note.trim() || null,
      created_by: user?.id ?? null,
    })).error, load);
    setSaving(false);
    if (error) {
      toast({ title: "Failed to log dispatch", description: error.message, variant: "destructive" });
      return;
    }
    setBatchId(""); setCarrier(""); setCartonCount(0); setPcsCount(0); setNote(""); setTouched(false);
    setSuccess(doneLabel);
    load();
  };

  const loadReport = async (id: string) => {
    setReportBatchId(id);
    if (!id) { setReport(null); return; }
    setLoadingReport(true);
    setReport(await generateBatchReport(id));
    setLoadingReport(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Dispatch" description="Log outbound shipments and view the auto-generated per-batch pipeline report." />

      <Card>
        <CardContent className="py-5 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><Truck className="w-4 h-4 text-accent" /> Log Dispatch</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Batch <span className="text-danger" aria-hidden>*</span></Label>
              <Select value={batchId} onValueChange={(v) => { setBatchId(v); setSuccess(null); if (v !== reportBatchId) loadReport(v); }}>
                <SelectTrigger className="mt-1" aria-required aria-invalid={touched && !!errors.batch}><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  {eligible.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {formatBatchIdentity(b.order_number, b.style_number, b.party_name)} ({b.dispatched} of {b.packed} pcs dispatched, {b.remaining} left)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loading && eligible.length === 0 && <p className="text-xs text-muted-foreground mt-1">No batch is ready to dispatch. Only completed batches with pieces left can be dispatched. Mark a batch completed in Batches first.</p>}
              {touched && errors.batch && <p className="text-xs text-danger mt-1">{errors.batch}</p>}
            </div>
            <div>
              <Label className="text-xs" htmlFor="dispatch-date">Dispatch Date <span className="text-danger" aria-hidden>*</span></Label>
              <Input id="dispatch-date" type="date" required value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="mt-1" />
              {touched && errors.date && <p className="text-xs text-danger mt-1">{errors.date}</p>}
            </div>
            <div>
              <Label className="text-xs">Carrier / Vehicle</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. TCS, Truck #123" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs" htmlFor="dispatch-pcs">Pieces <span className="text-danger" aria-hidden>*</span></Label>
              <Input id="dispatch-pcs" type="number" min="1" max={selected?.remaining} step="1" required inputMode="numeric" aria-invalid={touched && !!errors.pcs} value={pcsCount || ""} onChange={(e) => setPcsCount(Math.max(0, parseInt(e.target.value) || 0))} className="mt-1" />
              {touched && errors.pcs ? <p className="text-xs text-danger mt-1">{errors.pcs}</p> : selected && <p className="text-xs text-muted-foreground mt-1">Up to {selected.remaining} left.</p>}
            </div>
            <div>
              <Label className="text-xs" htmlFor="dispatch-cartons">Carton Count <span className="text-danger" aria-hidden>*</span></Label>
              <Input id="dispatch-cartons" type="number" min="1" step="1" required inputMode="numeric" aria-invalid={touched && !!errors.cartons} value={cartonCount || ""} onChange={(e) => setCartonCount(Math.max(0, parseInt(e.target.value) || 0))} className="mt-1" />
              {touched && errors.cartons
                ? <p className="text-xs text-danger mt-1">{errors.cartons}</p>
                : <p className="text-xs text-muted-foreground mt-1">Number of cartons leaving in this shipment. Not linked to a packing record, so count what is physically loaded.</p>}
            </div>
          </div>
          <div>
            <Label className="text-xs">Dispatch Note</Label>
            <Textarea aria-label="Dispatch note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" />
          </div>
          {selected && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
              <p className="font-medium text-foreground">{formatBatchIdentity(selected.order_number, selected.style_number, selected.party_name)}</p>
              <p className="text-muted-foreground">
                {selected.packed} pcs packed · {selected.dispatched} dispatched · {selected.remaining} left · {dispatchedCartons} carton{dispatchedCartons === 1 ? "" : "s"} in {batchDispatches.length} shipment{batchDispatches.length === 1 ? "" : "s"}
              </p>
              <p className="text-muted-foreground">Customer: {selected.party_name ?? "—"} · Expected delivery: {fmtDate(selected.expected_delivery)}</p>
            </div>
          )}
          {success && (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Dispatch logged: {success}. You can undo it for 10 minutes.
            </div>
          )}
          <Button onClick={handleCreate} disabled={saving || !valid || !can("dispatch.create")} className="bg-accent text-accent-foreground">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />} Log Dispatch
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><FileText className="w-4 h-4 text-accent" /> Batch Pipeline Report</h3>
          <Select value={reportBatchId} onValueChange={loadReport}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select a batch to view its report" /></SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {formatBatchIdentity(b.order_number, b.style_number, b.party_name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {loadingReport ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
          ) : report && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{report.bundleCount} bundles</Badge>
                <StatusBadge tone="success">
                  {report.qualityVerdicts.confirm} confirmed
                </StatusBadge>
                <StatusBadge tone="warning">
                  {report.qualityVerdicts.alter} altered
                </StatusBadge>
                <StatusBadge tone="danger">
                  {report.qualityVerdicts.reject} rejected
                </StatusBadge>
              </div>
              {report.departments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No stage entries logged yet for this batch.</p>
              ) : (
                <div className="space-y-2">
                  {report.departments.map((d) => (
                    <div key={d.department} className="p-3 rounded-lg border border-border flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="text-sm font-semibold text-foreground">{DEPARTMENT_LABELS[d.department]}</span>
                        <span className="text-xs text-muted-foreground ml-2">{d.entryCount} entries</span>
                        <p className="text-xs text-muted-foreground">Started {fmtDate(d.startDate)} · Ended {fmtDate(d.endDate)}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(d.totals).map(([key, val]) => (
                          <Badge key={key} variant="outline" className="text-xs">{key.replace(/_/g, " ")}: {val}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-5">
          <h3 className="font-semibold text-foreground mb-3">Dispatch History</h3>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
          ) : dispatches.length === 0 ? (
            <EmptyState icon={Truck} title="No dispatches logged yet" description="Shipments you log above will appear here." />
          ) : (
            <div className="space-y-2">
              {dispatches.map((d) => (
                <div key={d.id} className="p-3 rounded-lg border border-border grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_7rem_10rem_6rem] items-center gap-x-4 gap-y-1">
                  <span className="text-sm font-semibold text-foreground min-w-0 break-words">{batchLabel(d.batch_id)}</span>
                  <span className="text-sm text-muted-foreground text-right sm:text-left">{fmtDate(d.dispatch_date)}</span>
                  <span className="text-sm text-muted-foreground min-w-0 truncate">{d.carrier || "No carrier"}</span>
                  <Badge variant="outline" className="justify-self-end">{d.pcs_count != null ? `${d.pcs_count} pcs · ` : ""}{d.carton_count} carton{d.carton_count === 1 ? "" : "s"}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
