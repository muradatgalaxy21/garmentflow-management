import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Loader2, LayoutList, Kanban, Trash2, ChevronRight, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { withUndo } from "@/lib/undo";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import KanbanBoard from "@/components/KanbanBoard";
import DeleteConfirmDialog from "@/components/DeleteConfirmDialog";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { fmtDate } from "@/lib/format";
import { DEPARTMENT_LABELS, type Department } from "@/lib/departmentEntries";
import OrderDetailSections, { type DetailBatch } from "./OrderDetailSections";
import {
  DEFAULT_FILTERS,
  ORDER_STATUSES,
  RECENT_DAYS,
  STATUS_LABEL,
  blockReason,
  filterOrders,
  isOverdue,
  matchesQuick,
  stageText,
  type DeptStatusRow,
  type OrderFilters,
  type OrderSignals,
  type OrderStatus,
  type QuickFilter,
} from "@/lib/orderFilters";

interface Order {
  id: string;
  client_id: string;
  order_number: string;
  party_name: string | null;
  product_summary: string;
  quantity: number;
  total_amount: number | null;
  currency: string | null;
  status: OrderStatus;
  expected_delivery: string | null;
  tracking_number: string | null;
  color_breakdown: unknown;
  created_at: string;
  updated_at: string;
}

interface ClientUser {
  id: string;
  full_name: string | null;
  company: string | null;
  email: string | null;
}

interface BatchRow {
  id: string;
  order_id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  created_at: string;
}

const orderSchema = z.object({
  client_id: z.string().uuid("Select a client"),
  order_number: z.string().trim().min(1).max(50),
  product_summary: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive(),
  total_amount: z.coerce.number().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  expected_delivery: z.string().optional(),
});

const QUICK: { key: QuickFilter; label: string; hint: string }[] = [
  { key: "blocked", label: "Blocked", hint: "A batch is waiting on a supervisor to verify (or was denied) a department start/end" },
  { key: "overdue", label: "Overdue", hint: "Expected delivery has passed and the order isn't shipped yet" },
  { key: "recent", label: "Recently changed", hint: `Created or updated in the last ${RECENT_DAYS} days` },
];

export default function OrdersAdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [deptRows, setDeptRows] = useState<DeptStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [draftStatus, setDraftStatus] = useState<OrderStatus>("pending");
  const [draftTracking, setDraftTracking] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [issuingCode, setIssuingCode] = useState(false);
  const [issuedCode, setIssuedCode] = useState<{ code: string; email: string } | null>(null);

  // Other pages can link to a filtered view: /admin/orders?status=pending or ?quick=blocked
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<OrderFilters>(() => {
    const status = params.get("status");
    const quick = params.get("quick");
    return {
      ...DEFAULT_FILTERS,
      q: params.get("q") ?? "",
      status: status === "all" || ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderFilters["status"]) : "active",
      quick: QUICK.some((q) => q.key === quick) ? (quick as QuickFilter) : null,
    };
  });
  const setFilter = (patch: Partial<OrderFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const load = async () => {
    setLoading(true);
    const [ordersRes, profilesRes, rolesRes, batchesRes, deptRes] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, company, email"),
      supabase.from("user_roles").select("user_id, role").eq("role", "client"),
      supabase.from("production_batches").select("id, order_id, style_number, total_quantity, status, created_at"),
      supabase.from("batch_department_status").select("batch_id, department, status, start_verification_status, end_verification_status, opened_at"),
    ]);
    if (ordersRes.error) {
      toast({ title: "Failed to load orders", description: ordersRes.error.message, variant: "destructive" });
    } else {
      const list = (ordersRes.data ?? []) as Order[];
      setOrders(list);
      // keep the open panel in sync after a save / undo
      setSelected((s) => (s ? list.find((o) => o.id === s.id) ?? null : s));
    }
    if (!profilesRes.error && !rolesRes.error) {
      const clientIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      setClients((profilesRes.data ?? []).filter((p) => clientIds.has(p.id)) as ClientUser[]);
    }
    setBatches((batchesRes.data ?? []) as BatchRow[]);
    setDeptRows((deptRes.data ?? []) as DeptStatusRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const clientLabel = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (!c) return id.slice(0, 8);
    return c.company ? `${c.full_name ?? "—"} (${c.company})` : c.full_name ?? id.slice(0, 8);
  };
  // Short client name for rows/cards: company if set, else person.
  const clientShort = (o: Order) => {
    const c = clients.find((x) => x.id === o.client_id);
    return c?.company || o.party_name || c?.full_name || o.client_id.slice(0, 8);
  };

  // Per-batch detail + per-order summary (stage text, blocked reasons).
  const { batchesByOrder, signals, blocked } = useMemo(() => {
    const rowsByBatch = new Map<string, DeptStatusRow[]>();
    for (const r of deptRows) rowsByBatch.set(r.batch_id, [...(rowsByBatch.get(r.batch_id) ?? []), r]);

    const batchesByOrder = new Map<string, DetailBatch[]>();
    const latestOpen = new Map<string, string>(); // order -> opened_at of its most recent activity
    for (const b of [...batches].sort((a, z) => a.created_at.localeCompare(z.created_at))) {
      const rows = rowsByBatch.get(b.id) ?? [];
      const detail: DetailBatch = {
        id: b.id,
        style_number: b.style_number,
        total_quantity: b.total_quantity,
        status: b.status,
        stage: stageText(rows),
        done: rows.filter((r) => r.status === "closed").map((r) => DEPARTMENT_LABELS[r.department as Department] ?? r.department),
        blocked: rows.map(blockReason).filter((x): x is string => !!x),
      };
      batchesByOrder.set(b.order_id, [...(batchesByOrder.get(b.order_id) ?? []), detail]);
      const last = rows.reduce((m, r) => (r.opened_at > m ? r.opened_at : m), "");
      if (last > (latestOpen.get(b.order_id) ?? "")) latestOpen.set(b.order_id, last);
    }

    const signals = new Map<string, OrderSignals>();
    const blocked = new Set<string>();
    for (const [orderId, list] of batchesByOrder) {
      const reasons = list.flatMap((b) => b.blocked);
      if (reasons.length) blocked.add(orderId);
      // stage of the batch that moved most recently
      const active = list.find((b) => (rowsByBatch.get(b.id) ?? []).some((r) => r.opened_at === latestOpen.get(orderId))) ?? list[0];
      signals.set(orderId, {
        stage: list.length === 1 ? `Batch #${active.style_number} · ${active.stage}` : `${list.length} batches · ${active.stage}`,
        blocked: reasons,
      });
    }
    return { batchesByOrder, signals, blocked };
  }, [batches, deptRows]);

  const signalFor = (id: string): OrderSignals => signals.get(id) ?? { stage: "No batch yet", blocked: [] };

  const visible = useMemo(
    () => filterOrders(orders, filters, { blocked, clientLabel }),
    [orders, filters, blocked, clients],
  );
  // Quick-filter counts follow the other filters, so the chip number matches what clicking it shows.
  const quickCount = (key: QuickFilter) =>
    filterOrders(orders, { ...filters, quick: null }, { blocked, clientLabel }).filter((o) => matchesQuick(o, key, blocked)).length;
  const orderClients = useMemo(
    () => [...new Set(orders.map((o) => o.client_id))].sort((a, z) => clientLabel(a).localeCompare(clientLabel(z))),
    [orders, clients],
  );
  const filtersActive =
    filters.status !== "active" || filters.client !== "all" || filters.period !== "any" || filters.quick !== null;

  const handleCreate = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const parsed = orderSchema.safeParse({
      client_id: String(fd.get("client_id") ?? ""),
      order_number: String(fd.get("order_number") ?? ""),
      product_summary: String(fd.get("product_summary") ?? ""),
      quantity: fd.get("quantity"),
      total_amount: fd.get("total_amount") || undefined,
      currency: String(fd.get("currency") ?? "USD"),
      expected_delivery: String(fd.get("expected_delivery") ?? "") || undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    const client = clients.find((c) => c.id === parsed.data.client_id);
    const { error } = await supabase.from("orders").insert({
      client_id: parsed.data.client_id,
      order_number: parsed.data.order_number,
      product_summary: parsed.data.product_summary,
      quantity: parsed.data.quantity,
      total_amount: parsed.data.total_amount ?? null,
      currency: parsed.data.currency ?? "USD",
      expected_delivery: parsed.data.expected_delivery || null,
      party_name: client?.company || client?.full_name || null,
    });
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order created" });
    setCreating(false);
    load();
  };

  const deleteOrder = async () => {
    if (!selected) return;
    const { error } = await supabase.from("orders").delete().eq("id", selected.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order deleted" });
    setSelected(null);
    load();
  };

  // Deleting an order cascades to its batches, tracking, and department entries -
  // block it once any worker history/inventory-affecting entries exist, since that
  // audit trail (and the fabric/stock already deducted against it) would be lost silently.
  const requestDeleteOrder = async () => {
    if (!selected) return;
    const { data: batches } = await supabase
      .from("production_batches")
      .select("id")
      .eq("order_id", selected.id);
    const batchIds = (batches ?? []).map((b) => b.id);
    if (batchIds.length > 0) {
      const [trackingRes, deptRes] = await Promise.all([
        supabase.from("batch_tracking").select("id", { count: "exact", head: true }).in("batch_id", batchIds),
        supabase.from("department_entries").select("id", { count: "exact", head: true }).in("batch_id", batchIds),
      ]);
      const workCount = (trackingRes.count ?? 0) + (deptRes.count ?? 0);
      if (workCount > 0) {
        toast({
          title: "Can't delete — work already logged",
          description: `This order's batches have ${workCount} worker log ${workCount === 1 ? "entry" : "entries"}. Set the order status to "Cancelled" instead to keep the history intact.`,
          variant: "destructive",
        });
        return;
      }
    }
    setConfirmingDelete(true);
  };

  const openDetail = (o: Order) => {
    setSelected(o);
    setDraftStatus(o.status);
    setDraftTracking(o.tracking_number ?? "");
    setUpdateNote("");
  };

  // One path for every status change (detail panel and Kanban "Move to"):
  // confirm → update + client timeline entry → 10-minute undo.
  const updateOrder = async (order: Order, status: OrderStatus, tracking: string, note: string) => {
    const ok = await confirm({
      title: `Update order ${order.order_number}?`,
      description: "The client sees this update. You can undo it for 10 minutes.",
      details: [
        ["Status", order.status === status ? STATUS_LABEL[status] : `${STATUS_LABEL[order.status]} → ${STATUS_LABEL[status]}`],
        ["Tracking", tracking || "—"],
        ["Note to client", note || "—"],
      ],
    });
    if (!ok) return false;
    const { data: userData } = await supabase.auth.getUser();

    const orderError = await withUndo(`Order ${order.order_number} updated`, async () => {
      const { error } = await supabase
        .from("orders")
        .update({ status, tracking_number: tracking || null })
        .eq("id", order.id);
      if (!error && (status !== order.status || note)) {
        // Push a timeline entry so the client sees the update history
        await supabase.from("order_updates").insert({
          order_id: order.id,
          status,
          note: note || null,
          created_by: userData.user?.id ?? null,
        });
      }
      return error;
    }, load);
    if (orderError) {
      toast({ title: "Update failed", description: orderError.message, variant: "destructive" });
      return false;
    }
    load();
    return true;
  };

  const saveOrderUpdate = async () => {
    if (!selected) return;
    setSaving(true);
    const ok = await updateOrder(selected, draftStatus, draftTracking, updateNote);
    setSaving(false);
    if (ok) setSelected(null);
  };

  // §7: issue a one-time client-portal access code tied to this order.
  // Email delivery is stubbed until Resend is wired — the code is shown
  // here so the admin can relay it manually in the meantime.
  const issueAccessCode = async () => {
    if (!selected) return;
    const client = clients.find((c) => c.id === selected.client_id);
    if (!client?.email) {
      toast({ title: "No email on file", description: "This client has no email address to issue a code for.", variant: "destructive" });
      return;
    }
    setIssuingCode(true);
    const { data, error } = await supabase.functions.invoke("issue-client-code", {
      body: { orderId: selected.id, email: client.email },
    });
    setIssuingCode(false);
    if (error || data?.error) {
      toast({ title: "Failed to issue code", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    setIssuedCode({ code: data.code, email: client.email });
  };

  return (
    <div>
      <PageHeader title="Orders" description="Client orders from pending through delivery. Open an order for batches, payments and dispatches.">
        <ToggleGroup
          type="single"
          variant="outline"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as "list" | "kanban")}
          aria-label="View"
        >
          <ToggleGroupItem value="list" className="gap-1 px-3">
            <LayoutList className="h-4 w-4" aria-hidden /> List
          </ToggleGroupItem>
          <ToggleGroupItem value="kanban" className="gap-1 px-3">
            <Kanban className="h-4 w-4" aria-hidden /> Kanban
          </ToggleGroupItem>
        </ToggleGroup>
        {can("orders.create") && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Order
          </Button>
        )}
      </PageHeader>

      <TableToolbar
        search={filters.q}
        onSearch={(q) => setFilter({ q })}
        placeholder="Search order, client, product…"
        count={loading ? undefined : visible.length}
        noun="order"
        filtersActive={filtersActive}
        onClear={() => setFilters(DEFAULT_FILTERS)}
      >
        <Select value={filters.status} onValueChange={(v) => setFilter({ status: v as OrderFilters["status"] })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">All but cancelled</SelectItem>
            <SelectItem value="all">All incl. cancelled</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.client} onValueChange={(client) => setFilter({ client })}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Client">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {orderClients.map((id) => (
              <SelectItem key={id} value={id}>{clientLabel(id)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.period} onValueChange={(v) => setFilter({ period: v as OrderFilters["period"] })}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Created">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Created any time</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </TableToolbar>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Quick filters">
        {QUICK.map((q) => {
          const on = filters.quick === q.key;
          return (
            <Button
              key={q.key}
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              title={q.hint}
              onClick={() => setFilter({ quick: on ? null : q.key })}
            >
              {q.label} <span className="tabular-nums opacity-80">{loading ? "" : quickCount(q.key)}</span>
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" aria-label="Loading orders" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders yet"
          description="Create one for a client to start tracking production."
          action={can("orders.create") && <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" /> New Order</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No orders match these filters"
          description={filters.status === "active" ? "Cancelled orders are hidden by default." : undefined}
          action={<Button variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</Button>}
        />
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          orders={visible}
          signalFor={signalFor}
          clientName={clientShort}
          onOpen={openDetail}
          onMove={can("orders.update") ? (o, s) => updateOrder(o, s, o.tracking_number ?? "", "") : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((o) => {
            const sig = signalFor(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => openDetail(o)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">#{o.order_number}</span>
                      <span className="truncate text-foreground">{clientShort(o)}</span>
                      <StatusBadge status={o.status} />
                      {isOverdue(o) && <StatusBadge status="overdue" />}
                      {sig.blocked.length > 0 && <StatusBadge tone="warning">Blocked</StatusBadge>}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {o.product_summary} · {o.quantity.toLocaleString()} pcs · {sig.stage}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Created {fmtDate(o.created_at)}
                      {o.expected_delivery && ` · Due ${fmtDate(o.expected_delivery)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span className="hidden sm:inline">Open</span>
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Order</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate(e.currentTarget);
            }}
            className="space-y-3"
          >
            <div>
              <Label className="text-xs">Client *</Label>
              <Select name="client_id" required>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex flex-col">
                        <span>
                          {c.company ? `${c.full_name ?? "—"} (${c.company})` : c.full_name ?? c.id.slice(0, 8)}
                        </span>
                        {c.email && <span className="text-xs text-muted-foreground/60">{c.email}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Order Number *" name="order_number" required maxLength={50} />
            <Field label="Product Summary *" name="product_summary" required maxLength={500} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity *" name="quantity" type="number" required />
              <Field label="Total Amount" name="total_amount" type="number" step="0.01" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency" name="currency" defaultValue="USD" />
              <Field label="Expected Delivery" name="expected_delivery" type="date" />
            </div>
            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2 pr-6">
                  Order #{selected.order_number} <StatusBadge status={selected.status} />
                </SheetTitle>
                <SheetDescription>{clientShort(selected)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <OrderDetailSections
                  order={selected}
                  clientLabel={clientLabel(selected.client_id)}
                  batches={batchesByOrder.get(selected.id) ?? []}
                />

                <section className="space-y-4 border-t border-border pt-4 text-sm">
                  <h3 className="admin-section-title text-sm">Update order</h3>
                  <div>
                    <Label className="text-xs" htmlFor="order-status">Status</Label>
                    <Select value={draftStatus} onValueChange={(v) => setDraftStatus(v as OrderStatus)} disabled={!can("orders.update")}>
                      <SelectTrigger id="order-status" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="order-tracking">Tracking Number</Label>
                    <Input
                      id="order-tracking"
                      value={draftTracking}
                      onChange={(e) => setDraftTracking(e.target.value)}
                      placeholder="e.g. DHL1234567"
                      className="mt-1"
                      disabled={!can("orders.update")}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="order-note">Update Note (optional)</Label>
                    <Textarea
                      id="order-note"
                      value={updateNote}
                      onChange={(e) => setUpdateNote(e.target.value)}
                      rows={3}
                      placeholder="Note shown to the client..."
                      className="mt-1"
                      disabled={!can("orders.update")}
                    />
                  </div>
                  {can("orders.update") && (
                    <Button className="w-full" onClick={saveOrderUpdate} disabled={saving}>
                      {saving ? "Saving..." : "Save Update"}
                    </Button>
                  )}
                  {(can("clients.create") || can("orders.create")) && (
                    <Button variant="outline" className="w-full" onClick={issueAccessCode} disabled={issuingCode}>
                      {issuingCode ? "Issuing..." : "Issue Client Access Code"}
                    </Button>
                  )}
                  {can("orders.delete") && (
                    <Button variant="outline" className="w-full text-destructive hover:text-destructive border-destructive/30" onClick={requestDeleteOrder}>
                      <Trash2 className="w-4 h-4 mr-2" /> Delete Order
                    </Button>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!issuedCode} onOpenChange={(o) => !o && setIssuedCode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Access Code Issued</DialogTitle>
          </DialogHeader>
          {issuedCode && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Email delivery isn't wired up yet — relay this code to <strong>{issuedCode.email}</strong> manually:
              </p>
              <p className="text-2xl font-mono font-bold tracking-widest text-center bg-muted rounded py-3">
                {issuedCode.code}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selected && (
        <DeleteConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={`Delete Order #${selected.order_number}`}
          confirmValue={selected.order_number}
          fieldLabel="Order Number"
          warning="This removes all its batches and history."
          onConfirm={deleteOrder}
        />
      )}
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input {...rest} className="mt-1" />
    </div>
  );
}
