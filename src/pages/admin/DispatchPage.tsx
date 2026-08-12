import { useEffect, useState } from "react";
import { Truck, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DEPARTMENT_LABELS, QUALITY_VERDICT_LABELS, generateBatchReport, type BatchReport } from "@/lib/departmentEntries";

interface Batch {
  id: string;
  style_number: string;
  total_quantity: number;
}

interface Dispatch {
  id: string;
  batch_id: string;
  dispatch_date: string;
  carrier: string | null;
  carton_count: number;
  dispatch_note: string | null;
  created_at: string;
}

export default function DispatchPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);

  const [batchId, setBatchId] = useState("");
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [carrier, setCarrier] = useState("");
  const [cartonCount, setCartonCount] = useState<number>(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [reportBatchId, setReportBatchId] = useState("");
  const [report, setReport] = useState<BatchReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const load = async () => {
    setLoading(true);
    const [batchRes, dispatchRes] = await Promise.all([
      supabase.from("production_batches").select("id, style_number, total_quantity").order("created_at", { ascending: false }),
      supabase.from("batch_dispatches").select("*").order("created_at", { ascending: false }),
    ]);
    setBatches((batchRes.data as Batch[]) ?? []);
    setDispatches((dispatchRes.data as Dispatch[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const batchLabel = (id: string) => batches.find((b) => b.id === id)?.style_number ?? id.slice(0, 8);

  const handleCreate = async () => {
    if (!batchId || !dispatchDate || cartonCount <= 0) {
      toast({ title: "Select a batch, date, and carton count", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("batch_dispatches").insert({
      batch_id: batchId,
      dispatch_date: dispatchDate,
      carrier: carrier.trim() || null,
      carton_count: cartonCount,
      dispatch_note: note.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to log dispatch", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Dispatch logged" });
    setBatchId(""); setCarrier(""); setCartonCount(0); setNote("");
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
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Dispatch</h1>
        <p className="text-sm text-muted-foreground">Log outbound shipments and view the auto-generated per-batch pipeline report.</p>
      </div>

      <Card>
        <CardContent className="py-5 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><Truck className="w-4 h-4 text-accent" /> Log Dispatch</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Batch</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.style_number} ({b.total_quantity} pcs)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Dispatch Date</Label>
              <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Carrier / Vehicle</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. TCS, Truck #123" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Carton Count</Label>
              <Input type="number" min="1" value={cartonCount || ""} onChange={(e) => setCartonCount(Math.max(0, parseInt(e.target.value) || 0))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Dispatch Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" />
          </div>
          <Button onClick={handleCreate} disabled={saving} className="bg-accent text-accent-foreground">
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
                <SelectItem key={b.id} value={b.id}>{b.style_number}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {loadingReport ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
          ) : report && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{report.bundleCount} bundles</Badge>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  {report.qualityVerdicts.confirm} confirmed
                </Badge>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                  {report.qualityVerdicts.alter} altered
                </Badge>
                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                  {report.qualityVerdicts.reject} rejected
                </Badge>
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
            <p className="text-sm text-muted-foreground text-center py-6">No dispatches logged yet.</p>
          ) : (
            <div className="space-y-2">
              {dispatches.map((d) => (
                <div key={d.id} className="p-3 rounded-lg border border-border flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{batchLabel(d.batch_id)}</span>
                    <span className="text-xs text-muted-foreground ml-2">{d.dispatch_date} {d.carrier ? `• ${d.carrier}` : ""}</span>
                  </div>
                  <Badge variant="outline">{d.carton_count} cartons</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
