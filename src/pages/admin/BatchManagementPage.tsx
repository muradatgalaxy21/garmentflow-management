import { useEffect, useState, useRef } from "react";
import { Plus, Loader2, QrCode, Printer, Settings, Eye, UserCheck, Shield, Users, Coins, Trash2, Ban, Boxes, X } from "lucide-react";
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
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatBatchIdentity } from "@/lib/batchIdentity";
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

interface Order { id: string; order_number: string; product_summary: string; party_name: string | null; }
interface InventoryItem { id: string; name: string; sku: string; }
interface Phase { id: string; name: string; sequence_order: number; }
interface DeptRate { id: string; department: "printing" | "embroidery" | "clipping"; label: string; rate: number; }
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
  const [panelRates, setPanelRates] = useState<{ id?: string; label: string; rate: string }[]>([]);
  const [deptRatesOpen, setDeptRatesOpen] = useState(false);
  const [packRatioBatch, setPackRatioBatch] = useState<Batch | null>(null);
  const [packRatioRows, setPackRatioRows] = useState<{ size: string; qty: string }[]>([]);
  const [deptRates, setDeptRates] = useState<DeptRate[]>([]);
  const [newRateDept, setNewRateDept] = useState<"printing" | "embroidery" | "clipping">("printing");
  const [newRateLabel, setNewRateLabel] = useState("");
  const [newRateValue, setNewRateValue] = useState("");
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [deletingBatch, setDeletingBatch] = useState<Batch | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [batchRes, orderRes, itemRes, phaseRes, mgrRolesRes] = await Promise.all([
        supabase.from("production_batches").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, order_number, product_summary, party_name"),
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

  const deleteBatch = async (batch: Batch) => {
    const { error } = await supabase.from("production_batches").delete().eq("id", batch.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Batch deleted" });
    if (selectedBatch?.id === batch.id) setSelectedBatch(null);
    load();
  };

  // Deleting a batch cascades to its tracking/department entries - block once workers
  // have logged anything (fabric/inventory already deducted against it too), since that
  // history would be lost silently. Use Cancelled status instead to keep the record.
  const requestDeleteBatch = async (batch: Batch) => {
    const [trackingRes, deptRes] = await Promise.all([
      supabase.from("batch_tracking").select("id", { count: "exact", head: true }).eq("batch_id", batch.id),
      supabase.from("department_entries").select("id", { count: "exact", head: true }).eq("batch_id", batch.id),
    ]);
    const workCount = (trackingRes.count ?? 0) + (deptRes.count ?? 0);
    if (workCount > 0) {
      toast({
        title: "Can't delete — work already logged",
        description: `This batch has ${workCount} worker log ${workCount === 1 ? "entry" : "entries"}. Set its status to "Cancelled" instead to keep the history intact.`,
        variant: "destructive",
      });
      return;
    }
    setDeletingBatch(batch);
  };

  const cancelBatch = async (batch: Batch) => {
    if (!window.confirm(`Mark batch "${batch.style_number}" as cancelled? Its history stays intact but it stops counting as active production.`)) return;
    const { error } = await supabase.from("production_batches").update({ status: "cancelled" }).eq("id", batch.id);
    if (error) {
      toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Batch cancelled" });
    load();
  };

  const deleteTrackingEntry = async (entry: TrackingEntry) => {
    if (!window.confirm("Delete this work entry? This cannot be undone.")) return;
    const { error } = await supabase.from("batch_tracking").delete().eq("id", entry.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setTimeline((prev) => prev.filter((t) => t.id !== entry.id));
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
    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const identity = escapeHtml(batchIdentity(qrBatch));
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
            <h3>${identity}</h3>
            <img src="${dataUrl}" />
            <p class="code">${qrBatch.qr_code_hash}</p>
          </div>
          <div class="card end">
            <h2>🔴 BATCH END LABEL</h2>
            <h3>${identity}</h3>
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

  const cuttingPhase = phases.find((p) => p.name === "Cutting");

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

    if (cuttingPhase) {
      const { data: panelData } = await supabase
        .from("batch_phase_panel_rates")
        .select("id, label, rate_per_piece")
        .eq("batch_id", batch.id)
        .eq("phase_id", cuttingPhase.id);
      const rows = (panelData ?? []).map((r) => ({ id: r.id, label: r.label, rate: String(r.rate_per_piece) }));
      setPanelRates(rows.length > 0 ? rows : [{ label: "", rate: "" }]);
    }
  };

  const saveRates = async () => {
    if (!rateDialogBatch) return;
    for (const phase of phases) {
      if (phase.id === cuttingPhase?.id) continue; // Cutting uses panelRates below, not the flat rate.
      const rateValue = parseFloat(rates[phase.id] ?? "0");
      if (isNaN(rateValue) || rateValue < 0) continue;
      await supabase.from("batch_phase_rates").upsert({
        batch_id: rateDialogBatch.id,
        phase_id: phase.id,
        rate_per_piece: rateValue,
      }, { onConflict: "batch_id,phase_id" });
    }

    if (cuttingPhase) {
      await supabase
        .from("batch_phase_panel_rates")
        .delete()
        .eq("batch_id", rateDialogBatch.id)
        .eq("phase_id", cuttingPhase.id);
      const validPanels = panelRates
        .filter((p) => p.label.trim() && !isNaN(parseFloat(p.rate)) && parseFloat(p.rate) >= 0)
        .map((p) => ({
          batch_id: rateDialogBatch.id,
          phase_id: cuttingPhase.id,
          label: p.label.trim(),
          rate_per_piece: parseFloat(p.rate),
        }));
      if (validPanels.length > 0) {
        await supabase.from("batch_phase_panel_rates").insert(validPanels);
      }
    }

    toast({ title: "Rates saved" });
    setRateDialogBatch(null);
  };

  const openPackRatio = async (batch: Batch) => {
    setPackRatioBatch(batch);
    const { data } = await supabase.from("batch_pack_ratios").select("ratio").eq("batch_id", batch.id).maybeSingle();
    const ratio = (data?.ratio as Record<string, number>) ?? {};
    const rows = Object.entries(ratio).map(([size, qty]) => ({ size, qty: String(qty) }));
    setPackRatioRows(rows.length > 0 ? rows : [{ size: "", qty: "" }]);
  };

  const savePackRatio = async () => {
    if (!packRatioBatch) return;
    const ratio: Record<string, number> = {};
    for (const row of packRatioRows) {
      const qty = parseInt(row.qty, 10);
      if (!row.size.trim() || isNaN(qty) || qty <= 0) continue;
      ratio[row.size.trim()] = qty;
    }
    if (Object.keys(ratio).length === 0) {
      toast({ title: "Add at least one size/qty pair", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("batch_pack_ratios").upsert({
      batch_id: packRatioBatch.id,
      ratio,
    }, { onConflict: "batch_id" });
    if (error) {
      toast({ title: "Failed to save pack ratio", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pack ratio saved" });
    setPackRatioBatch(null);
  };

  const openDeptRates = async () => {
    setDeptRatesOpen(true);
    const { data } = await supabase.from("department_cost_rates").select("id, department, label, rate").order("department");
    setDeptRates((data as DeptRate[]) ?? []);
  };

  const addDeptRate = async () => {
    const rateValue = parseFloat(newRateValue);
    if (!newRateLabel.trim() || isNaN(rateValue) || rateValue < 0) {
      toast({ title: "Enter a label and a valid rate", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("department_cost_rates").upsert({
      department: newRateDept,
      label: newRateLabel.trim(),
      rate: rateValue,
    }, { onConflict: "department,label" });
    if (error) {
      toast({ title: "Failed to save rate", description: error.message, variant: "destructive" });
      return;
    }
    setNewRateLabel("");
    setNewRateValue("");
    openDeptRates();
  };

  const deleteDeptRate = async (id: string) => {
    await supabase.from("department_cost_rates").delete().eq("id", id);
    openDeptRates();
  };

  const orderLabel = (id: string) => {
    const o = orders.find((x) => x.id === id);
    return o ? `#${o.order_number}` : id.slice(0, 8);
  };

  const batchIdentity = (b: Batch) => {
    const o = orders.find((x) => x.id === b.order_id);
    return formatBatchIdentity(o?.order_number, b.style_number, o?.party_name);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Production Batches</h1>
          <p className="text-sm text-muted-foreground">Manage production runs, manager batch rights, and print QR labels.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openDeptRates}>
            <Coins className="w-4 h-4 mr-2" /> Department Rates
          </Button>
          <Button onClick={() => setCreating(true)} className="bg-accent text-accent-foreground">
            <Plus className="w-4 h-4 mr-2" /> New Batch
          </Button>
        </div>
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
                  <p className="text-xs text-muted-foreground mt-0.5">{batchIdentity(b)}</p>
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
                  <Button size="sm" variant="outline" onClick={() => openPackRatio(b)}>
                    <Boxes className="w-4 h-4 mr-1 text-purple-500" /> Pack Ratio
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openDetail(b)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  {isAdmin && b.status !== "cancelled" && b.status !== "completed" && (
                    <Button size="sm" variant="ghost" className="text-amber-500 hover:text-amber-600" onClick={() => cancelBatch(b)}>
                      <Ban className="w-4 h-4" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => requestDeleteBatch(b)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
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
            <DialogTitle>Printable QR Labels - {qrBatch && batchIdentity(qrBatch)}</DialogTitle>
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


      {/* New Batch Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Batch</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate(e.currentTarget);
            }}
          >
            <div>
              <Label className="text-xs">Order</Label>
              <Select name="order_id" required>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      #{o.order_number}{o.party_name ? ` · ${o.party_name}` : ""} - {o.product_summary}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Style Number</Label>
              <Input name="style_number" required className="mt-1" placeholder="e.g. ST-1001" />
            </div>
            <div>
              <Label className="text-xs">Total Quantity</Label>
              <Input name="total_quantity" type="number" min="1" required className="mt-1" placeholder="e.g. 500" />
            </div>
            <div>
              <Label className="text-xs">Material Item (optional)</Label>
              <Select name="material_item_id">
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} ({i.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit">Create Batch</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rate Configuration Dialog */}
      <Dialog open={!!rateDialogBatch} onOpenChange={(o) => !o && setRateDialogBatch(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set Rates - {rateDialogBatch?.style_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {phases.map((p) =>
              p.id === cuttingPhase?.id ? (
                <div key={p.id} className="space-y-2">
                  <Label className="text-xs">{p.name} — panel/size rates (Rs/piece)</Label>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Cutting pays differently per panel/size — add one row per rate, e.g. "Front Panel - L".
                  </p>
                  {panelRates.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={row.label}
                        placeholder="e.g. Front Panel - L"
                        onChange={(e) =>
                          setPanelRates((prev) => prev.map((r, ri) => (ri === i ? { ...r, label: e.target.value } : r)))
                        }
                        className="flex-1"
                      />
                      <Input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        value={row.rate}
                        onChange={(e) =>
                          setPanelRates((prev) => prev.map((r, ri) => (ri === i ? { ...r, rate: e.target.value } : r)))
                        }
                        className="w-24"
                      />
                      <Button
                        type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                        onClick={() => setPanelRates((prev) => prev.filter((_, ri) => ri !== i))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button" size="sm" variant="outline"
                    onClick={() => setPanelRates((prev) => [...prev, { label: "", rate: "" }])}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add panel rate
                  </Button>
                </div>
              ) : (
                <div key={p.id}>
                  <Label className="text-xs">{p.name} (Rs/piece)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={rates[p.id] ?? ""}
                    onChange={(e) => setRates((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="mt-1" placeholder="0.00"
                  />
                </div>
              )
            )}
          </div>
          <DialogFooter><Button onClick={saveRates}>Save Rates</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pack Ratio Dialog (stage 12 config — size/color mix per carton) */}
      <Dialog open={!!packRatioBatch} onOpenChange={(o) => !o && setPackRatioBatch(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-purple-500" /> Pack Ratio — {packRatioBatch?.style_number}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Size/color mix expected per carton (e.g. S:1, M:2, L:2, XL:1) — shown read-only to workers on the Packing form.
          </p>
          <div className="space-y-2">
            {packRatioRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  placeholder="Size (e.g. S)"
                  value={row.size}
                  onChange={(e) => setPackRatioRows((prev) => prev.map((r, idx) => idx === i ? { ...r, size: e.target.value } : r))}
                />
                <Input
                  type="number" min="1" placeholder="Qty"
                  value={row.qty}
                  onChange={(e) => setPackRatioRows((prev) => prev.map((r, idx) => idx === i ? { ...r, qty: e.target.value } : r))}
                />
                <Button size="icon" variant="ghost" onClick={() => setPackRatioRows((prev) => prev.filter((_, idx) => idx !== i))}>
                  <X className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setPackRatioRows((prev) => [...prev, { size: "", qty: "" }])}>
            <Plus className="w-4 h-4 mr-1" /> Add Row
          </Button>
          <DialogFooter><Button onClick={savePackRatio}>Save Pack Ratio</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Department Cost Rates Dialog (global, not per-batch) */}
      <Dialog open={deptRatesOpen} onOpenChange={setDeptRatesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-accent" /> Department Cost Rates
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Printing cost per color, embroidery cost per piece, and clipping rate per piece — shown read-only to workers on the factory-floor entry forms.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {deptRates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No rates set yet.</p>
            ) : (
              deptRates.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
                  <div>
                    <span className="text-xs font-semibold capitalize">{r.department}</span>
                    <span className="text-xs text-muted-foreground ml-2">{r.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">Rs {r.rate}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteDeptRate(r.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end pt-2 border-t border-border">
            <div>
              <Label className="text-xs">Department</Label>
              <Select value={newRateDept} onValueChange={(v: "printing" | "embroidery" | "clipping") => setNewRateDept(v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="printing">Printing</SelectItem>
                  <SelectItem value="embroidery">Embroidery</SelectItem>
                  <SelectItem value="clipping">Clipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{newRateDept === "printing" ? "Color" : "Label"}</Label>
              <Input
                value={newRateLabel}
                onChange={(e) => setNewRateLabel(e.target.value)}
                placeholder={newRateDept === "printing" ? "e.g. Red" : "default"}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Rate (Rs)</Label>
              <Input type="number" step="0.01" min="0" value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} className="mt-1" />
            </div>
          </div>
          <Button onClick={addDeptRate} className="w-full">Save Rate</Button>
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
                <p className="text-xs text-muted-foreground">{batchIdentity(selectedBatch)}</p>
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
                            <div className="flex items-center gap-1 text-right">
                              <Badge variant="outline" className="text-xs">Done: {e.quantity_completed}</Badge>
                              {e.quantity_wasted > 0 && (
                                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 ml-1">
                                  Waste: {e.quantity_wasted}
                                </Badge>
                              )}
                              {isAdmin && (
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => deleteTrackingEntry(e)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
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

      {deletingBatch && (
        <DeleteConfirmDialog
          open={!!deletingBatch}
          onOpenChange={(o) => !o && setDeletingBatch(null)}
          title={`Delete Batch "${deletingBatch.style_number}"`}
          confirmValue={deletingBatch.style_number}
          fieldLabel="Style Number"
          warning="This removes all its tracking history and rates."
          onConfirm={() => deleteBatch(deletingBatch)}
        />
      )}
    </div>
  );
}
