import { useEffect, useState, useRef } from "react";
import { Plus, Loader2, QrCode, Printer, Settings, Eye } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

// ---------------------------------------------------------------
// BatchManagementPage - Admin page at /admin/batches
//
// Provides full CRUD for production_batches:
//   - Create new batches linked to orders
//   - Auto-generate QR code hashes
//   - Print QR labels for the factory floor
//   - Configure rate_per_piece for each phase
//   - View tracking timeline for each batch
// ---------------------------------------------------------------

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
      const [batchRes, orderRes, itemRes, phaseRes] = await Promise.all([
        supabase.from("production_batches").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, order_number, product_summary"),
        supabase.from("inventory_items").select("id, name, sku"),
        supabase.from("production_phases").select("id, name, sequence_order").order("sequence_order"),
      ]);
      if (batchRes.data) setBatches(batchRes.data as Batch[]);
      if (orderRes.data) setOrders(orderRes.data as Order[]);
      if (itemRes.data) setItems(itemRes.data as InventoryItem[]);
      if (phaseRes.data) setPhases(phaseRes.data as Phase[]);
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

  // Generate QR code image using the qrcode library
  const showQr = async (batch: Batch) => {
    setQrBatch(batch);
    try {
      const QRCode = (await import("qrcode")).default;
      // Wait for canvas to be in the DOM
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

  const printQr = () => {
    if (!qrCanvasRef.current || !qrBatch) return;
    const dataUrl = qrCanvasRef.current.toDataURL("image/png");
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html><head><title>QR - ${qrBatch.style_number}</title>
        <style>body{text-align:center;font-family:sans-serif;padding:20px;}
        img{width:250px;height:250px;}</style></head>
        <body><h2>${qrBatch.style_number}</h2>
        <img src="${dataUrl}" /><p>${qrBatch.qr_code_hash}</p>
        <script>window.print();</script></body></html>
      `);
    }
  };

  // Load tracking timeline for a batch
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

  // Open rate configuration dialog
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
          <p className="text-sm text-muted-foreground">Manage production runs and QR labels.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
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
              <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <div className="cursor-pointer" onClick={() => openDetail(b)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">{b.style_number}</h3>
                    <Badge variant="outline">{orderLabel(b.order_id)}</Badge>
                    <Badge variant="outline" className={
                      b.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-blue-500/15 text-blue-600"
                    }>
                      {b.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {b.total_quantity} pcs • {new Date(b.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 items-start">
                  <Button size="sm" variant="outline" onClick={() => showQr(b)}>
                    <QrCode className="w-4 h-4 mr-1" /> QR
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openRateDialog(b)}>
                    <Settings className="w-4 h-4 mr-1" /> Rates
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

      {/* Create Batch Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Production Batch</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(e.currentTarget); }} className="space-y-3">
            <div>
              <Label className="text-xs">Order *</Label>
              <Select name="order_id" required>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>#{o.order_number} - {o.product_summary.slice(0, 40)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Style Number *</Label>
              <Input name="style_number" required maxLength={100} className="mt-1" /></div>
            <div><Label className="text-xs">Total Quantity *</Label>
              <Input name="total_quantity" type="number" min="1" required className="mt-1" /></div>
            <div>
              <Label className="text-xs">Raw Material (for cutting deduction)</Label>
              <Select name="material_item_id">
                <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name} ({i.sku})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter><Button type="submit">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrBatch} onOpenChange={(o) => !o && setQrBatch(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle>QR Code - {qrBatch?.style_number}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <canvas ref={qrCanvasRef} />
            <p className="text-xs text-muted-foreground font-mono break-all">{qrBatch?.qr_code_hash}</p>
            <Button onClick={printQr}><Printer className="w-4 h-4 mr-2" /> Print QR Label</Button>
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
    </div>
  );
}
