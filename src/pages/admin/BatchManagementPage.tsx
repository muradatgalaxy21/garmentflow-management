import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus, Loader2, QrCode, Printer, Settings, Eye, Users, Coins, Trash2, Ban, Boxes, X, Layers,
  CheckCircle2, Circle, CircleDot, Truck, PauseCircle, PlayCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import MultiWorkerLogModal from "@/components/factory/MultiWorkerLogModal";
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge, type Tone } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { MoreMenu } from "@/components/admin/MoreMenu";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { withUndo } from "@/lib/undo";
import { useAuth } from "@/hooks/useAuth";
import { formatBatchIdentity } from "@/lib/batchIdentity";
import type { Permission } from "@/lib/permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { stallCutoff } from "@/lib/dashboardMetrics";
import { DEPARTMENT_LABELS, type Department } from "@/lib/departmentEntries";
import {
  STAGES, STATE_LABELS, batchProgress, batchState, isoDay, matchesDue,
  type BatchStateKey, type BlockReason, type DeptRow, type DueFilter,
} from "@/lib/batchState";
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

interface Order { id: string; order_number: string; product_summary: string; party_name: string | null; expected_delivery: string | null; }
interface InventoryItem { id: string; name: string; sku: string; quantity_on_hand: number; reorder_level: number; }
interface Phase { id: string; name: string; sequence_order: number; }
interface Dispatch { batch_id: string; dispatch_date: string; carton_count: number; carrier: string | null; }
type RateDept = "printing" | "embroidery" | "clipping" | "sticker" | "quality" | "stitching" | "button_ops" | "press" | "quality_final" | "packing";
interface DeptRate { id: string; department: RateDept; label: string; rate: number; }
// Label hint per department — what value each factory-floor form looks up.
// Departments not listed here use a free-text label (printing: any color name).
const RATE_LABEL_HINTS: Partial<Record<RateDept, string>> = {
  stitching: "singer / overlock / flatlock / lock_stitch",
  button_ops: "button / buttonhole / eyelet / bartack",
  sticker: "default", quality: "default", press: "default", quality_final: "default", packing: "default", clipping: "default", embroidery: "default",
};
interface TrackingEntry {
  id: string; phase_name: string; worker_name: string;
  quantity_completed: number; quantity_wasted: number;
  notes: string | null; created_at: string;
}
interface DeptLog { id: string; department: string; stage: string; worker_name: string; created_at: string; }

const STATE_TONE: Record<BatchStateKey, Tone> = {
  not_started: "neutral", in_progress: "info", blocked: "warning", paused: "warning", ready: "success", completed: "success", cancelled: "neutral",
};
const REASON_TEXT: Record<BlockReason, string> = {
  approval: "Scan waiting for approval",
  shortfall: "Material at or below reorder level",
  stalled: "No work logged in 24 working hours",
};
type StatusFilter = "all" | "active" | BatchStateKey;
const STATUS_FILTERS: StatusFilter[] = ["all", "active", "not_started", "in_progress", "blocked", "paused", "ready", "completed", "cancelled"];

export default function BatchManagementPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [deptRows, setDeptRows] = useState<Map<string, DeptRow[]>>(new Map());
  const [shortfall, setShortfall] = useState<Set<string>>(new Set());
  const [stalled, setStalled] = useState<Set<string>>(new Set());
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [multiWorkerBatch, setMultiWorkerBatch] = useState<Batch | null>(null);

  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams.get("status") as StatusFilter | null;
    return s && STATUS_FILTERS.includes(s) ? s : "all";
  });
  const [stageFilter, setStageFilter] = useState("all");
  const [orderFilter, setOrderFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [rateDialogBatch, setRateDialogBatch] = useState<Batch | null>(null);
  const [qrBatch, setQrBatch] = useState<Batch | null>(null);
  const [timeline, setTimeline] = useState<TrackingEntry[]>([]);
  const [deptLogs, setDeptLogs] = useState<DeptLog[]>([]);
  const [detailRatio, setDetailRatio] = useState<Record<string, number> | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [panelRates, setPanelRates] = useState<{ id?: string; label: string; rate: string }[]>([]);
  const [deptRatesOpen, setDeptRatesOpen] = useState(false);
  const [packRatioBatch, setPackRatioBatch] = useState<Batch | null>(null);
  const [packRatioRows, setPackRatioRows] = useState<{ size: string; qty: string }[]>([]);
  const [deptRates, setDeptRates] = useState<DeptRate[]>([]);
  const [newRateDept, setNewRateDept] = useState<RateDept>("printing");
  const [newRateLabel, setNewRateLabel] = useState("");
  const [newRateValue, setNewRateValue] = useState("");
  const { toast } = useToast();
  const confirm = useConfirm();
  const { can, isAdmin } = useAuth();
  const [pauseTarget, setPauseTarget] = useState<Batch | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseBusy, setPauseBusy] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [deletingBatch, setDeletingBatch] = useState<Batch | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const since = stallCutoff().toISOString();
      const [batchRes, orderRes, itemRes, phaseRes, statusRes, usedRes, trkRes, deptRes, dispatchRes] = await Promise.all([
        supabase.from("production_batches").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("id, order_number, product_summary, party_name, expected_delivery"),
        supabase.from("inventory_items").select("id, name, sku, quantity_on_hand, reorder_level"),
        supabase.from("production_phases").select("id, name, sequence_order").order("sequence_order"),
        supabase.from("batch_department_status").select("batch_id, department, status, start_verification_status, end_verification_status"),
        supabase.from("department_entries").select("batch_id, inventory_item_id").not("inventory_item_id", "is", null),
        supabase.from("batch_tracking").select("batch_id").gte("created_at", since),
        supabase.from("department_entries").select("batch_id").gte("created_at", since),
        supabase.from("batch_dispatches").select("batch_id, dispatch_date, carton_count, carrier").order("dispatch_date", { ascending: false }),
      ]);
      const batchList = (batchRes.data as Batch[]) ?? [];
      const itemList = (itemRes.data as InventoryItem[]) ?? [];
      setBatches(batchList);
      if (orderRes.data) setOrders(orderRes.data as Order[]);
      setItems(itemList);
      if (phaseRes.data) setPhases(phaseRes.data as Phase[]);
      setDispatches((dispatchRes.data as Dispatch[]) ?? []);

      const rowMap = new Map<string, DeptRow[]>();
      for (const r of statusRes.data ?? []) rowMap.set(r.batch_id, [...(rowMap.get(r.batch_id) ?? []), r]);
      setDeptRows(rowMap);

      // Shortfall: a material this batch uses (its fabric or worker-logged items) is at/below reorder level.
      // Same rule as Pipeline Status.
      const low = new Set(itemList.filter((i) => Number(i.quantity_on_hand) <= Number(i.reorder_level)).map((i) => i.id));
      const short = new Set<string>();
      for (const b of batchList) if (b.material_item_id && low.has(b.material_item_id)) short.add(b.id);
      for (const r of usedRes.data ?? []) if (r.inventory_item_id && low.has(r.inventory_item_id)) short.add(r.batch_id);
      setShortfall(short);

      // Stalled: same rule as the Dashboard — in progress, older than the window, nothing logged since.
      const recent = new Set([...(trkRes.data ?? []), ...(deptRes.data ?? [])].map((r) => r.batch_id));
      setStalled(new Set(batchList.filter((b) => b.status === "in_progress" && b.created_at < since && !recent.has(b.id)).map((b) => b.id)));
    } catch (err) {
      console.error("Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Deep link from Pipeline Status etc.: /admin/batches?batch=<id> opens that batch's detail view once.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (loading || deepLinked.current) return;
    const b = batches.find((x) => x.id === searchParams.get("batch"));
    if (b) { deepLinked.current = true; openDetail(b); }
  }, [loading, batches, searchParams]);

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

  const setBatchStatus = async (batch: Batch, status: "cancelled" | "completed") => {
    const verb = status === "cancelled" ? "cancelled" : "marked completed";
    const error = await withUndo(`Batch ${batch.style_number} ${verb}`, async () =>
      (await supabase.from("production_batches").update({ status }).eq("id", batch.id)).error, load);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    if (selectedBatch?.id === batch.id) setSelectedBatch({ ...batch, status });
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
      const canCancel = can("batches.update") && batch.status === "in_progress";
      const ok = await confirm({
        title: `Can't delete batch "${batch.style_number}"`,
        description: `Workers have logged ${workCount} ${workCount === 1 ? "entry" : "entries"} against it. Deleting would erase that history and their pay records.${canCancel ? " Cancel the batch instead: its history stays and it stops counting as active production." : ""}`,
        confirmLabel: canCancel ? "Cancel batch instead" : "OK",
        destructive: canCancel,
      });
      if (ok && canCancel) setBatchStatus(batch, "cancelled");
      return;
    }
    setDeletingBatch(batch);
  };

  // Admin only (server enforces too). Pause needs a reason; both are logged and undoable for 10 min.
  const pauseBatch = async () => {
    if (!pauseTarget || !pauseReason.trim()) return;
    setPauseBusy(true);
    const b = pauseTarget;
    const error = await withUndo(`Batch ${b.style_number} paused`, async () =>
      (await supabase.rpc("set_batch_paused", { _batch_id: b.id, _paused: true, _reason: pauseReason.trim() })).error, load);
    setPauseBusy(false);
    if (error) { toast({ title: "Pause failed", description: error.message, variant: "destructive" }); return; }
    setPauseTarget(null); setPauseReason("");
    if (selectedBatch?.id === b.id) setSelectedBatch({ ...b, status: "paused" });
    load();
  };

  const resumeBatch = async (b: Batch) => {
    const ok = await confirm({
      title: `Resume batch "${b.style_number}"?`,
      description: "Workers can log new work on it again straight away.",
      confirmLabel: "Resume",
    });
    if (!ok) return;
    const error = await withUndo(`Batch ${b.style_number} resumed`, async () =>
      (await supabase.rpc("set_batch_paused", { _batch_id: b.id, _paused: false })).error, load);
    if (error) { toast({ title: "Resume failed", description: error.message, variant: "destructive" }); return; }
    if (selectedBatch?.id === b.id) setSelectedBatch({ ...b, status: "in_progress" });
    load();
  };

  const cancelBatch = async (batch: Batch) => {
    const ok = await confirm({
      title: `Cancel batch "${batch.style_number}"?`,
      description: "Its history stays intact but it stops counting as active production. You can undo for 10 minutes.",
      confirmLabel: "Cancel batch", destructive: true,
    });
    if (ok) setBatchStatus(batch, "cancelled");
  };

  const completeBatch = async (batch: Batch) => {
    const ok = await confirm({
      title: `Mark batch "${batch.style_number}" completed?`,
      description: "Packing is done. The batch stops counting as active production and moves on to dispatch. You can undo for 10 minutes.",
      confirmLabel: "Mark completed",
    });
    if (ok) setBatchStatus(batch, "completed");
  };

  const deleteTrackingEntry = async (entry: TrackingEntry) => {
    if (!(await confirm({ title: "Delete this work entry?", description: "This cannot be undone.", confirmLabel: "Delete", destructive: true }))) return;
    const { error } = await supabase.from("batch_tracking").delete().eq("id", entry.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setTimeline((prev) => prev.filter((t) => t.id !== entry.id));
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
    setTimeline([]);
    setDeptLogs([]);
    setDetailRatio(null);
    const [{ data: tracking }, { data: entries }, { data: ratio }] = await Promise.all([
      supabase
        .from("batch_tracking")
        .select("id, phase_id, worker_id, quantity_completed, quantity_wasted, notes, created_at")
        .eq("batch_id", batch.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("department_entries")
        .select("id, department, stage, worker_id, created_at")
        .eq("batch_id", batch.id)
        .order("created_at", { ascending: false }),
      supabase.from("batch_pack_ratios").select("ratio").eq("batch_id", batch.id).maybeSingle(),
    ]);
    setDetailRatio((ratio?.ratio as Record<string, number>) ?? null);

    const workerIds = [...new Set([...(tracking ?? []), ...(entries ?? [])].map((t) => t.worker_id))];
    const workerMap = new Map<string, string>();
    if (workerIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", workerIds);
      for (const p of profiles ?? []) workerMap.set(p.id, p.full_name ?? "Worker");
    }
    const phaseMap = new Map(phases.map((p) => [p.id, p.name]));
    setTimeline(
      (tracking ?? []).map((t) => ({
        id: t.id,
        phase_name: phaseMap.get(t.phase_id) ?? "—",
        worker_name: workerMap.get(t.worker_id) ?? "—",
        quantity_completed: t.quantity_completed,
        quantity_wasted: t.quantity_wasted,
        notes: t.notes,
        created_at: t.created_at,
      }))
    );
    setDeptLogs(
      (entries ?? []).map((e) => ({
        id: e.id,
        department: DEPARTMENT_LABELS[e.department as Department] ?? e.department,
        stage: e.stage,
        worker_name: workerMap.get(e.worker_id) ?? "—",
        created_at: e.created_at,
      }))
    );
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
    if (selectedBatch?.id === packRatioBatch.id) setDetailRatio(ratio);
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

  const orderOf = (b: Batch) => orders.find((x) => x.id === b.order_id);

  const batchIdentity = (b: Batch) => {
    const o = orderOf(b);
    return formatBatchIdentity(o?.order_number, b.style_number, o?.party_name);
  };

  const today = isoDay(new Date());

  // Everything the list, filters and detail view need per batch, worked out once.
  const rows = useMemo(() => batches.map((b) => {
    const o = orders.find((x) => x.id === b.order_id);
    const dept = deptRows.get(b.id) ?? [];
    const progress = batchProgress(dept);
    const { state, reasons } = batchState({ status: b.status, rows: dept, shortfall: shortfall.has(b.id), stalled: stalled.has(b.id) });
    const due = o?.expected_delivery ?? null;
    const done = state === "completed" || state === "cancelled";
    return {
      b, o, progress, state, reasons, due,
      overdue: !!due && !done && due < today,
      dispatch: dispatches.find((d) => d.batch_id === b.id) ?? null,
    };
  }), [batches, orders, deptRows, shortfall, stalled, dispatches, today]);

  const needle = q.trim().toLowerCase();
  const visible = rows.filter((r) =>
    (!needle || [r.b.style_number, r.o?.order_number, r.o?.party_name].some((s) => s?.toLowerCase().includes(needle))) &&
    (statusFilter === "all" || (statusFilter === "active" ? r.state !== "completed" && r.state !== "cancelled" : r.state === statusFilter)) &&
    (stageFilter === "all" || (stageFilter === "none" ? !r.progress.current : r.progress.current?.key === stageFilter)) &&
    (orderFilter === "all" || r.b.order_id === orderFilter) &&
    matchesDue(r.due, dueFilter, today, r.state === "completed" || r.state === "cancelled"));
  const filtersActive = statusFilter !== "all" || stageFilter !== "all" || orderFilter !== "all" || dueFilter !== "all";
  const batchOrders = orders.filter((o) => batches.some((b) => b.order_id === o.id));
  const selectedRow = selectedBatch ? rows.find((r) => r.b.id === selectedBatch.id) : undefined;

  // "What happens next" for a batch: short reason + one action (link or button).
  const nextStep = (r: (typeof rows)[number]) => {
    const linkBtn = (to: string, label: string, perm: Permission) =>
      can(perm) ? <Button asChild variant="link" size="sm" className="h-auto p-0"><Link to={to}>{label}</Link></Button> : null;
    switch (r.state) {
      case "blocked":
        return {
          text: r.reasons.map((x) => REASON_TEXT[x]).join(" · "),
          action: r.reasons[0] === "approval" ? linkBtn("/admin/inbox", "Review in Inbox", "inbox.view")
            : r.reasons[0] === "shortfall" ? linkBtn("/admin/inventory", "Open Inventory", "inventory.view")
            : can("batches.update") ? <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setMultiWorkerBatch(r.b)}>Log work</Button> : null,
        };
      case "not_started":
        return { text: "No stage started yet", action: <Button variant="link" size="sm" className="h-auto p-0" onClick={() => showQr(r.b)}>Print QR labels</Button> };
      case "ready":
        return {
          text: "Packing done",
          action: can("batches.update") ? <Button size="sm" variant="outline" className="h-7" onClick={() => completeBatch(r.b)}>Mark completed</Button> : null,
        };
      case "completed":
        return r.dispatch
          ? { text: `Dispatched ${fmtDate(r.dispatch.dispatch_date)}`, action: null }
          : { text: "Not dispatched yet", action: linkBtn("/admin/dispatch", "Record dispatch", "dispatch.view") };
      default:
        return null;
    }
  };

  const stageText = (r: (typeof rows)[number]) => {
    const c = r.progress.current;
    if (!c) return "Not started";
    return c.status === "open" ? `${c.label} · in progress` : `${c.label} · done`;
  };

  const ProgressBar = ({ done, total }: { done: number; total: number }) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-success" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <span className="admin-meta text-xs text-muted-foreground tabular-nums">{done}/{total} stages</span>
    </div>
  );

  const ROW_GRID = "md:grid-cols-[minmax(0,1.6fr)_5.5rem_minmax(0,1.3fr)_minmax(0,1.7fr)_7.5rem_12.5rem]";

  return (
    <div className="space-y-6">
      <PageHeader title="Production Batches" description="Track where each batch is, what's blocking it, and print QR labels.">
        {can("rates.manage") && (
          <Button variant="outline" onClick={openDeptRates}>
            <Coins className="w-4 h-4 mr-2" /> Department Rates
          </Button>
        )}
        {can("batches.create") && (
          <Button onClick={() => setCreating(true)} className="bg-accent text-accent-foreground">
            <Plus className="w-4 h-4 mr-2" /> New Batch
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No batches yet"
          description="A batch is one production run of an order. Create one, then print its QR labels so workers can scan it at each stage."
          action={can("batches.create") && (
            <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" /> New Batch</Button>
          )}
        />
      ) : (
        <div>
          <TableToolbar
            search={q} onSearch={setQ} placeholder="Search batch, order or client…"
            count={visible.length} noun="batch"
            filtersActive={filtersActive}
            onClear={() => { setQ(""); setStatusFilter("all"); setStageFilter("all"); setOrderFilter("all"); setDueFilter("all"); }}
          >
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active (not finished)</SelectItem>
                {(Object.keys(STATE_LABELS) as BatchStateKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{STATE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44" aria-label="Current stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                <SelectItem value="none">Not started</SelectItem>
                {STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={orderFilter} onValueChange={setOrderFilter}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44" aria-label="Order"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All orders</SelectItem>
                {batchOrders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>#{o.order_number}{o.party_name ? ` · ${o.party_name}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40" aria-label="Due date"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any due date</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="week">Due in 7 days</SelectItem>
                <SelectItem value="none">No due date</SelectItem>
              </SelectContent>
            </Select>
          </TableToolbar>

          {visible.length === 0 ? (
            <EmptyState
              title="No batches match"
              description="Try a different search or clear the filters."
              action={<Button variant="outline" onClick={() => { setQ(""); setStatusFilter("all"); setStageFilter("all"); setOrderFilter("all"); setDueFilter("all"); }}>Clear filters</Button>}
            />
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <div className={`hidden md:grid ${ROW_GRID} gap-4 border-b border-border px-4 py-2 admin-label text-xs font-medium text-muted-foreground`}>
                <span>Batch / order</span><span className="text-right">Qty</span><span>Current stage</span><span>Status / next step</span><span>Due</span><span><span className="sr-only">Actions</span></span>
              </div>
              <ul className="divide-y divide-border">
                {visible.map((r) => {
                  const next = nextStep(r);
                  const { b, o } = r;
                  const finished = r.state === "completed" || r.state === "cancelled";
                  return (
                    <li key={b.id} className={`grid grid-cols-1 gap-2 px-4 py-3 md:items-center md:gap-4 ${ROW_GRID}`}>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openDetail(b)}
                          className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm text-left"
                        >
                          {b.style_number}
                        </button>
                        <p className="text-xs text-muted-foreground truncate">
                          {o ? `Order #${o.order_number}` : "Order —"}{o?.party_name ? ` · ${o.party_name}` : ""}
                          <span className="md:hidden"> · {b.total_quantity.toLocaleString()} pcs</span>
                        </p>
                      </div>
                      <div className="hidden md:block text-right text-sm tabular-nums">{b.total_quantity.toLocaleString()} pcs</div>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm text-foreground truncate" title={stageText(r)}>{stageText(r)}</p>
                        <ProgressBar done={r.progress.done} total={r.progress.total} />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <StatusBadge tone={STATE_TONE[r.state]}>{STATE_LABELS[r.state]}</StatusBadge>
                        {next && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>{next.text}</span>
                            {next.action}
                          </div>
                        )}
                      </div>
                      <div className={r.due ? "text-sm" : "hidden md:block text-sm"}>
                        <span className="md:hidden text-muted-foreground">Due </span>
                        {r.due ? fmtDate(r.due) : <span className="text-muted-foreground">—</span>}
                        {r.overdue && <StatusBadge tone="danger" className="ml-1 md:ml-0 md:mt-1 md:flex md:w-fit">Overdue</StatusBadge>}
                      </div>
                      <div className="flex items-center gap-1 md:justify-end">
                        {!finished && can("batches.update") ? (
                          <Button size="sm" variant="outline" disabled={r.state === "paused"} title={r.state === "paused" ? "Batch is paused" : undefined} onClick={() => setMultiWorkerBatch(b)}>
                            <Users className="w-4 h-4 mr-1" /> Multi-Worker Log
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openDetail(b)}>
                            <Eye className="w-4 h-4 mr-1" /> View
                          </Button>
                        )}
                        <MoreMenu label={`More actions for ${b.style_number}`}>
                          <DropdownMenuItem onSelect={() => openDetail(b)}><Eye /> View details</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => showQr(b)}><QrCode /> QR labels</DropdownMenuItem>
                          {can("rates.manage") && <DropdownMenuItem onSelect={() => openRateDialog(b)}><Settings /> Piece rates</DropdownMenuItem>}
                          {can("batches.update") && <DropdownMenuItem onSelect={() => openPackRatio(b)}><Boxes /> Pack ratio</DropdownMenuItem>}
                          {can("batches.update") && r.state === "ready" && (
                            <DropdownMenuItem onSelect={() => completeBatch(b)}><CheckCircle2 /> Mark completed</DropdownMenuItem>
                          )}
                          {isAdmin && r.state === "paused" && (
                            <DropdownMenuItem onSelect={() => resumeBatch(b)}><PlayCircle /> Resume batch</DropdownMenuItem>
                          )}
                          {isAdmin && !finished && r.state !== "paused" && (
                            <DropdownMenuItem onSelect={() => { setPauseReason(""); setPauseTarget(b); }}><PauseCircle /> Pause batch</DropdownMenuItem>
                          )}
                          {(can("batches.update") && !finished || can("batches.delete")) && <DropdownMenuSeparator />}
                          {can("batches.update") && !finished && (
                            <DropdownMenuItem onSelect={() => cancelBatch(b)}><Ban /> Cancel batch</DropdownMenuItem>
                          )}
                          {can("batches.delete") && (
                            <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => requestDeleteBatch(b)}>
                              <Trash2 /> Delete batch…
                            </DropdownMenuItem>
                          )}
                        </MoreMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
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
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Set Rates - {rateDialogBatch?.style_number}</DialogTitle></DialogHeader>
          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto px-1">
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
                    onClick={(e) => {
                      setPanelRates((prev) => [...prev, { label: "", rate: "" }]);
                      const btn = e.currentTarget;
                      requestAnimationFrame(() => btn.scrollIntoView({ block: "nearest" }));
                    }}
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
            Printing/Embroidery are cost-tracking only (like Cutting — not wage). The rest pay the worker per piece — shown read-only to workers on the factory-floor entry forms and summed into their payout.
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
              <Select value={newRateDept} onValueChange={(v: RateDept) => setNewRateDept(v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="printing">Printing (cost only)</SelectItem>
                  <SelectItem value="embroidery">Embroidery (cost only)</SelectItem>
                  <SelectItem value="sticker">Sticker</SelectItem>
                  <SelectItem value="quality">Quality</SelectItem>
                  <SelectItem value="stitching">Stitching Hall</SelectItem>
                  <SelectItem value="button_ops">Button Ops</SelectItem>
                  <SelectItem value="clipping">Clipping</SelectItem>
                  <SelectItem value="press">Press</SelectItem>
                  <SelectItem value="quality_final">Quality (Final)</SelectItem>
                  <SelectItem value="packing">Packing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{newRateDept === "printing" ? "Color" : "Label"}</Label>
              <Input
                value={newRateLabel}
                onChange={(e) => setNewRateLabel(e.target.value)}
                placeholder={newRateDept === "printing" ? "e.g. Red" : RATE_LABEL_HINTS[newRateDept] ?? "default"}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Rate (Rs)</Label>
              <Input type="number" step="0.01" min="0" value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} className="mt-1" />
            </div>
          </div>
          {(newRateDept === "stitching" || newRateDept === "button_ops") && (
            <p className="text-[11px] text-muted-foreground -mt-1">
              Label must exactly match one of: {RATE_LABEL_HINTS[newRateDept]} (lowercase).
            </p>
          )}
          <Button onClick={addDeptRate} className="w-full">Save Rate</Button>
        </DialogContent>
      </Dialog>

      {/* Batch Detail Sheet — every tool for one batch in one place */}
      <Sheet open={!!selectedBatch} onOpenChange={(o) => !o && setSelectedBatch(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedBatch && selectedRow && (() => {
            const r = selectedRow;
            const next = nextStep(r);
            const finished = r.state === "completed" || r.state === "cancelled";
            const batchDispatches = dispatches.filter((d) => d.batch_id === selectedBatch.id);
            return (
              <>
                <SheetHeader className="text-left">
                  <SheetTitle>{selectedBatch.style_number}</SheetTitle>
                  <SheetDescription>{batchIdentity(selectedBatch)}</SheetDescription>
                </SheetHeader>
                <div className="space-y-6 mt-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={STATE_TONE[r.state]}>{STATE_LABELS[r.state]}</StatusBadge>
                      <span className="text-muted-foreground">{selectedBatch.total_quantity.toLocaleString()} pcs</span>
                      <span className="text-muted-foreground">· Due {fmtDate(r.due)}</span>
                      {r.overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Created {fmtDate(selectedBatch.created_at)}</p>
                    {next && (
                      <div className="rounded-md border border-border bg-muted/40 p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium text-foreground">Next:</span>
                        <span className="text-muted-foreground">{next.text}</span>
                        {next.action}
                      </div>
                    )}
                    {!finished && can("batches.update") && (
                      <Button size="sm" variant="outline" onClick={() => setMultiWorkerBatch(selectedBatch)}>
                        <Users className="w-4 h-4 mr-1" /> Multi-Worker Log
                      </Button>
                    )}
                  </div>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="admin-section-title font-semibold text-foreground">Stage progress</h3>
                      <ProgressBar done={r.progress.done} total={r.progress.total} />
                    </div>
                    <ol className="space-y-1">
                      {r.progress.stages.map((s, i) => (
                        <li key={s.key} className="flex items-center gap-2">
                          {s.status === "done" ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden />
                            : s.status === "open" ? <CircleDot className="h-4 w-4 text-info shrink-0" aria-hidden />
                            : <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" aria-hidden />}
                          <span className={s.status === "none" ? "text-muted-foreground" : "text-foreground"}>{i + 1}. {s.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {s.status === "done" ? "Done" : s.status === "open" ? "In progress" : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="space-y-2">
                    <h3 className="admin-section-title font-semibold text-foreground">Worker logs</h3>
                    {deptLogs.length === 0 && timeline.length === 0 ? (
                      <p className="text-muted-foreground">No work logged yet.</p>
                    ) : (
                      <>
                        {deptLogs.length > 0 && (
                          <ul className="divide-y divide-border rounded-md border border-border">
                            {deptLogs.map((e) => (
                              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
                                <span className="text-foreground">{e.department} <span className="text-muted-foreground">· {e.stage === "end" ? "End" : "Start"} · {e.worker_name}</span></span>
                                <span className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {timeline.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Piece-rate phase logs</p>
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
                                      {can("batches.delete") && (
                                        <Button size="icon" variant="ghost" aria-label="Delete work entry" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => deleteTrackingEntry(e)}>
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  {e.notes && <p className="text-xs text-muted-foreground mt-2 italic">{e.notes}</p>}
                                  <p className="text-[10px] text-muted-foreground mt-1">{fmtDateTime(e.created_at)}</p>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className="space-y-2">
                    <h3 className="admin-section-title font-semibold text-foreground">Setup</h3>
                    <div className="divide-y divide-border rounded-md border border-border">
                      <div className="flex items-center justify-between gap-3 px-3 py-2">
                        <div>
                          <p className="text-foreground">QR labels</p>
                          <p className="text-xs text-muted-foreground">Start and end cards workers scan at each stage</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => showQr(selectedBatch)}><QrCode className="w-4 h-4 mr-1" /> Print</Button>
                      </div>
                      {can("rates.manage") && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <div>
                            <p className="text-foreground">Piece rates</p>
                            <p className="text-xs text-muted-foreground">Rs per piece for each phase of this batch</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openRateDialog(selectedBatch)}><Settings className="w-4 h-4 mr-1" /> Edit</Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 px-3 py-2">
                        <div>
                          <p className="text-foreground">Pack ratio</p>
                          <p className="text-xs text-muted-foreground">
                            {detailRatio && Object.keys(detailRatio).length > 0
                              ? Object.entries(detailRatio).map(([s, n]) => `${s}: ${n}`).join(" · ") + " per carton"
                              : "Not set"}
                          </p>
                        </div>
                        {can("batches.update") && (
                          <Button size="sm" variant="outline" onClick={() => openPackRatio(selectedBatch)}><Boxes className="w-4 h-4 mr-1" /> Edit</Button>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="admin-section-title font-semibold text-foreground">Dispatch</h3>
                    {batchDispatches.length === 0 ? (
                      <p className="text-muted-foreground">
                        Not dispatched yet.{" "}
                        {can("dispatch.view") && <Link to="/admin/dispatch" className="text-primary underline-offset-4 hover:underline">Open Dispatch</Link>}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {batchDispatches.map((d, i) => (
                          <li key={i} className="flex items-center gap-2 px-3 py-2">
                            <Truck className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                            <span className="text-foreground">{fmtDate(d.dispatch_date)}</span>
                            <span className="text-muted-foreground">· {d.carton_count} cartons{d.carrier ? ` · ${d.carrier}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <Dialog open={!!pauseTarget} onOpenChange={(o) => { if (!o && !pauseBusy) setPauseTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Pause batch "{pauseTarget?.style_number}"?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Workers and managers can't log new work on it until you resume. Pending approvals can still be accepted or denied.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="pause-reason">Reason (required)</Label>
            <Textarea id="pause-reason" rows={3} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder="e.g. Waiting for fabric, client hold" />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={pauseBusy} onClick={() => setPauseTarget(null)}>Cancel</Button>
            <Button disabled={pauseBusy || !pauseReason.trim()} onClick={pauseBatch}>
              {pauseBusy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Pause batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          warning="No worker work is logged against it yet. Deleting removes the batch with its piece rates, pack ratio and QR labels; the order itself stays. This cannot be undone."
          onConfirm={() => deleteBatch(deletingBatch)}
        />
      )}
    </div>
  );
}
