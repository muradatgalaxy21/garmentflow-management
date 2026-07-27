import { useEffect, useState, useRef } from "react";
import { Plus, Loader2, QrCode, Printer, Settings, Eye, UserCheck, Shield, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import MultiWorkerLogModal from "@/components/factory/MultiWorkerLogModal";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const batchSchema = z.object({
  order_id: z.string().uuid("Select an order"),
  style_number: z.string().trim().min(1, "Style number required").max(100),
  total_quantity: z.coerce.number().int().positive("Quantity must be positive"),
  material_item_id: z.string().optional(),
});

interface Batch {
  id: string;
  order_id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  qr_code_hash: string;
  material_item_id: string | null;
  created_at: string;
}

interface ManagerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface Order { id: string; order_number: string; product_summary: string; }
interface InventoryItem { id: string; name: string; sku: string; }
interface Phase { id: string; name: string; sequence_order: number; }
interface TrackingEntry {
  id: string; phase_name: string; worker_name: string;
  quantity_completed: number; quantity_wasted: number;
  notes: string | null; created_at: string;
}

export default function BatchManagementPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [managers, setManagers] = useState<ManagerProfile[]>([]);
  const [assignedManagers, setAssignedManagers] = useState<string[]>([]);
  const [assigningBatch, setAssigningBatch] = useState<Batch | null>(null);
  const [multiWorkerBatch, setMultiWorkerBatch] = useState<Batch | null>(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [rateDialogBatch, setRateDialogBatch] = useState<Batch | null>(null);
  const [qrBatch, setQrBatch] = useState<Batch | null>(null);
  const [timeline, setTimeline] = useState<TrackingEntry[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [batchRes, orderRes, itemRes, phaseRes, mgrRolesRes] = await Promise.all([
        supabase.from("production_batches").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, order_number, product_summary"),
        supabase.from("inventory_items").select("id, name, sku"),
        supabase.from("production_phases").select("id, name, sequence_order").order("sequence_order"),
        supabase.from("user_roles").select("user_id").in("role", ["manager", "admin", "staff"]),
      ]);
      if (batchRes.data) setBatches(batchRes.data as Batch[]);
      if (orderRes.data) setOrders(orderRes.data as Order[]);
      if (itemRes.data) setItems(itemRes.data as InventoryItem[]);
      if (phaseRes.data) setPhases(phaseRes.data as Phase[]);

      if (mgrRolesRes.data && mgrRolesRes.data.length > 0) {
        const mgrIds = [...new Set(mgrRolesRes.data.map((r) => r.user_id))];
        const { data: mProfiles } = await supabase.from("profiles").select("id, full_name, email").in("id", mgrIds);
        if (mProfiles) setManagers(mProfiles as ManagerProfile[]);
      }
    } catch (err) {
      console.error("Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const parsed = batchSchema.safeParse({
      order_id: String(fd.get("order_id") ?? ""),
      style_number: String(fd.get("style_number") ?? ""),
      total_quantity: fd.get("total_quantity"),
      material_item_id: String(fd.get("material_item_id") ?? "") || undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("production_batches").insert({
      order_id: parsed.data.order_id,
      style_number: parsed.data.style_number,
      total_quantity: parsed.data.total_quantity,
      material_item_id: parsed.data.material_item_id || null,
    });
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Batch created" });
    setCreating(false);
    load();
  };

  const openAssignModal = async (batch: Batch) => {
    setAssigningBatch(batch);
    const { data } = await supabase.from("manager_batch_assignments").select("manager_id").eq("batch_id", batch.id);
    setAssignedManagers((data ?? []).map((m) => m.manager_id));
  };

  const saveAssignments = async () => {
    if (!assigningBatch) return;
    // Clear existing & insert selected
    await supabase.from("manager_batch_assignments").delete().eq("batch_id", assigningBatch.id);
    if (assignedManagers.length > 0) {
      const rows = assignedManagers.map((mId) => ({
        batch_id: assigningBatch.id,
        manager_id: mId,
      }));
      await supabase.from("manager_batch_assignments").insert(rows);
    }
    toast({ title: "Manager batch access permissions saved!" });
    setAssigningBatch(null);
  };

  const showQr = async (batch: Batch) => {
    setQrBatch(batch);
    try {
      const QRCode = (await import("qrcode")).default;
      setTimeout(() => {
        if (qrCanvasRef.current) {
          QRCode.toCanvas(qrCanvasRef.current, batch.qr_code_hash, {
            width: 250, margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
          });
        }
      }, 100);
    } catch (err) {
      console.error("QR generation failed:", err);
    }
  };

  const printQrCards = () => {
    if (!qrCanvasRef.current || !qrBatch) return;
    const dataUrl = qrCanvasRef.current.toDataURL("image/png");
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html><head><title>Batch QR Cards - ${qrBatch.style_number}</title>
        <style>
          body{font-family:sans-serif;padding:30px;display:flex;gap:40px;justify-content:center;}
          .card{border:4px solid #10b981;padding:20px;border-radius:20px;text-align:center;width:300px;background:#f0fdf4;}
          .card.end{border-color:#f59e0b;background:#fffbeb;}
          h2{margin:0;font-size:22px;}
          h3{margin:5px 0 15px 0;font-size:16px;color:#475569;}
          img{width:220px;height:220px;}
          .code{font-family:monospace;font-weight:bold;font-size:12px;margin-top:10px;word-break:break-all;}
        </style></head>
        <body>
          <div class="card">
            <h2>🟢 BATCH START LABEL</h2>
            <h3>Style #${qrBatch.style_number}</h3>
            <img src="${dataUrl}" />
            <p class="code">${qrBatch.qr_code_hash}</p>
          </div>
          <div class="card end">
            <h2>🔴 BATCH END LABEL</h2>
            <h3>Style #${qrBatch.style_number}</h3>
            <img src="${dataUrl}" />
            <p class="code">${qrBatch.qr_code_hash}</p>
          </div>
          <script>window.print();</script>
        </body></html>
      `);
    }
  };

  const openDetail = async (batch: Batch) => {
    setSelectedBatch(batch);
    const { data: tracking } = await supabase
      .from("batch_tracking")
      .select("id, phase_id, worker_id, quantity_completed, quantity_wasted, notes, created_at")
      .eq("batch_id", batch.id)
      .order("created_at", { ascending: false });

    if (tracking && tracking.length > 0) {
      const workerIds = [...new Set(tracking.map((t) => t.worker_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", workerIds);
      const workerMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Worker"]));
      const phaseMap = new Map(phases.map((p) => [p.id, p.name]));

      setTimeline(
        tracking.map((t) => ({
          id: t.id,
          phase_name: phaseMap.get(t.phase_id) ?? "—",
          worker_name: workerMap.get(t.worker_id) ?? "—",
          quantity_completed: t.quantity_completed,
          quantity_wasted: t.quantity_wasted,
          notes: t.notes,
          created_at: t.created_at,
        }))
      );
    } else {
      setTimeline([]);
    }
  };

  const openRateDialog = async (batch: Batch) => {
    setRateDialogBatch(batch);
    const { data } = await supabase
      .from("batch_phase_rates")
      .select("phase_id, rate_per_piece")
      .eq("batch_id", batch.id);
    const rateMap: Record<string, string> = {};
    for (const r of data ?? []) {
      rateMap[r.phase_id] = String(r.rate_per_piece);
    }
    setRates(rateMap);
  };

  const saveRates = async () => {
    if (!rateDialogBatch) return;
    for (const phase of phases) {
      const rateValue = parseFloat(rates[phase.id] ?? "0");
      if (isNaN(rateValue) || rateValue < 0) continue;
      await supabase.from("batch_phase_rates").upsert({
        batch_id: rateDialogBatch.id,
        phase_id: phase.id,
        rate_per_piece: rateValue,
      }, { onConflict: "batch_id,phase_id" });
    }
    toast({ title: "Rates saved" });
    setRateDialogBatch(null);
  };

  const orderLabel = (id: string) => {
    const o = orders.find((x) => x.id === id);
    return o ? `#${o.order_number}` : id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Production Batches</h1>
          <p className="text-sm text-muted-foreground">Manage production runs, manager batch rights, and print QR labels.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-accent text-accent-foreground">
          <Plus className="w-4 h-4 mr-2" /> New Batch
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No batches yet. Create one to start tracking production.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <Card key={b.id} className="hover:border-accent transition-colors">
              <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
                <div className="cursor-pointer" onClick={() => openDetail(b)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">{b.style_number}</h3>
                    <Badge variant="outline">{orderLabel(b.order_id)}</Badge>
                    <Badge variant="outline" className={
                      b.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                        : "bg-blue-500/15 text-blue-600 border-blue-500/30"
                    }>
                      {b.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {b.total_quantity} pcs • Created {new Date(b.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10" onClick={() => setMultiWorkerBatch(b)}>
                    <Users className="w-4 h-4 mr-1 text-emerald-500" /> Multi-Worker Log
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => showQr(b)}>
                    <QrCode className="w-4 h-4 mr-1 text-emerald-500" /> QR Labels
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openAssignModal(b)}>
                    <UserCheck className="w-4 h-4 mr-1 text-blue-500" /> Manager Rights
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openRateDialog(b)}>
                    <Settings className="w-4 h-4 mr-1" /> Piece Rates
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openDetail(b)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manager Assignment Modal */}
      {assigningBatch && (
        <Dialog open={!!assigningBatch} onOpenChange={(o) => !o && setAssigningBatch(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" /> Assign Manager Access
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Select which managers have explicit access rights to monitor and manage batch <strong className="text-foreground">{assigningBatch.style_number}</strong>.
              </p>

              <div className="space-y-2">
                {managers.map((m) => {
                  const isChecked = assignedManagers.includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/30">
                      <div>
                        <p className="font-semibold text-foreground text-sm">{m.full_name || "Unnamed Manager"}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) setAssignedManagers([...assignedManagers, m.id]);
                          else setAssignedManagers(assignedManagers.filter((id) => id !== m.id));
                        }}
                        className="w-4 h-4 rounded text-accent focus:ring-accent"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={saveAssignments} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                Save Manager Access Rights
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dual QR Cards Dialog */}
      <Dialog open={!!qrBatch} onOpenChange={(o) => !o && setQrBatch(null)}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Printable QR Labels - {qrBatch?.style_number}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-3 bg-white rounded-xl shadow-md">
              <canvas ref={qrCanvasRef} />
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all bg-muted p-2 rounded">
              QR Hash: {qrBatch?.qr_code_hash}
            </p>
            <Button onClick={printQrCards} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
              <Printer className="w-4 h-4 mr-2" /> Print Dual Start &amp; End QR Cards
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Rate Configuration Dialog */}
      <Dialog open={!!rateDialogBatch} onOpenChange={(o) => !o && setRateDialogBatch(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set Rates - {rateDialogBatch?.style_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {phases.map((p) => (
              <div key={p.id}>
                <Label className="text-xs">{p.name} (Rs/piece)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={rates[p.id] ?? ""}
                  onChange={(e) => setRates((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="mt-1" placeholder="0.00"
                />
              </div>
            ))}
          </div>
          <DialogFooter><Button onClick={saveRates}>Save Rates</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Detail Sheet */}
      <Sheet open={!!selectedBatch} onOpenChange={(o) => !o && setSelectedBatch(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedBatch && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedBatch.style_number}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6 text-sm">
                <p className="text-muted-foreground">
                  {selectedBatch.total_quantity} pcs • {selectedBatch.status}
                </p>
                <h3 className="font-semibold text-foreground">Tracking Timeline</h3>
                {timeline.length === 0 ? (
                  <p className="text-muted-foreground text-center py-6">No entries yet.</p>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((e) => (
                      <Card key={e.id}>
                        <CardContent className="py-3 px-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-foreground">{e.phase_name}</p>
                              <p className="text-xs text-muted-foreground">{e.worker_name}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="text-xs">Done: {e.quantity_completed}</Badge>
                              {e.quantity_wasted > 0 && (
                                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 ml-1">
                                  Waste: {e.quantity_wasted}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {e.notes && <p className="text-xs text-muted-foreground mt-2 italic">{e.notes}</p>}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(e.created_at).toLocaleString()}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Multi-Worker On-Behalf Entry Modal */}
      <MultiWorkerLogModal
        batch={multiWorkerBatch}
        phases={phases}
        open={!!multiWorkerBatch}
        onOpenChange={(o) => !o && setMultiWorkerBatch(null)}
        onSuccess={() => {
          load();
          if (selectedBatch && multiWorkerBatch && selectedBatch.id === multiWorkerBatch.id) {
            openDetail(selectedBatch);
          }
        }}
      />
    </div>
  );
}
