import { useEffect, useState } from "react";
import { Plus, Loader2, LayoutList, Kanban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import KanbanBoard from "@/components/KanbanBoard";

type OrderStatus = "pending" | "in_production" | "qc" | "shipped" | "delivered" | "cancelled";

interface Order {
  id: string;
  client_id: string;
  order_number: string;
  product_summary: string;
  quantity: number;
  total_amount: number | null;
  currency: string | null;
  status: OrderStatus;
  expected_delivery: string | null;
  tracking_number: string | null;
  created_at: string;
}

interface ClientUser {
  id: string;
  full_name: string | null;
  company: string | null;
  email: string | null;
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

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-slate-500/15 text-slate-600",
  in_production: "bg-blue-500/15 text-blue-600",
  qc: "bg-purple-500/15 text-purple-600",
  shipped: "bg-amber-500/15 text-amber-600",
  delivered: "bg-emerald-500/15 text-emerald-600",
  cancelled: "bg-red-500/15 text-red-600",
};

export default function OrdersAdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [draftStatus, setDraftStatus] = useState<OrderStatus>("pending");
  const [draftTracking, setDraftTracking] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  const load = async () => {
    setLoading(true);
    const [ordersRes, profilesRes, rolesRes] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, company, email"),
      supabase.from("user_roles").select("user_id, role").eq("role", "client"),
    ]);
    if (ordersRes.error) {
      toast({ title: "Failed to load orders", description: ordersRes.error.message, variant: "destructive" });
    } else {
      setOrders((ordersRes.data ?? []) as Order[]);
    }
    if (!profilesRes.error && !rolesRes.error) {
      const clientIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      setClients((profilesRes.data ?? []).filter((p) => clientIds.has(p.id)) as ClientUser[]);
    }
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
    const { error } = await supabase.from("orders").insert({
      client_id: parsed.data.client_id,
      order_number: parsed.data.order_number,
      product_summary: parsed.data.product_summary,
      quantity: parsed.data.quantity,
      total_amount: parsed.data.total_amount ?? null,
      currency: parsed.data.currency ?? "USD",
      expected_delivery: parsed.data.expected_delivery || null,
    });
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order created" });
    setCreating(false);
    load();
  };

  const openDetail = (o: Order) => {
    setSelected(o);
    setDraftStatus(o.status);
    setDraftTracking(o.tracking_number ?? "");
    setUpdateNote("");
  };

  const saveOrderUpdate = async () => {
    if (!selected) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    // Update the order itself
    const { error: orderError } = await supabase
      .from("orders")
      .update({ status: draftStatus, tracking_number: draftTracking || null })
      .eq("id", selected.id);

    if (!orderError && (draftStatus !== selected.status || updateNote)) {
      // Push a timeline entry so the client sees the update history
      await supabase.from("order_updates").insert({
        order_id: selected.id,
        status: draftStatus,
        note: updateNote || null,
        created_by: userData.user?.id ?? null,
      });
    }
    setSaving(false);
    if (orderError) {
      toast({ title: "Update failed", description: orderError.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order updated" });
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">Manage active production and shipping.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <LayoutList className="w-4 h-4 mr-1" /> List
          </Button>
          <Button
            variant={viewMode === "kanban" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("kanban")}
          >
            <Kanban className="w-4 h-4 mr-1" /> Kanban
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Order
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard />
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No orders yet. Create one for a client to start tracking production.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Card key={o.id} className="cursor-pointer hover:border-accent" onClick={() => openDetail(o)}>
              <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">#{o.order_number}</h3>
                    <Badge variant="outline" className={statusColors[o.status]}>
                      {o.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {o.product_summary} • {o.quantity} pcs • Client: {clientLabel(o.client_id)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground self-start">
                  {new Date(o.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
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
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Order #{selected.order_number}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6 text-sm">
                <p className="text-foreground">{selected.product_summary}</p>
                <p className="text-muted-foreground">
                  {selected.quantity} pcs • {selected.currency} {selected.total_amount ?? "—"}
                </p>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={draftStatus} onValueChange={(v) => setDraftStatus(v as OrderStatus)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_production">In Production</SelectItem>
                      <SelectItem value="qc">Quality Check</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Tracking Number</Label>
                  <Input
                    value={draftTracking}
                    onChange={(e) => setDraftTracking(e.target.value)}
                    placeholder="e.g. DHL1234567"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Update Note (optional)</Label>
                  <Textarea
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e.target.value)}
                    rows={3}
                    placeholder="Note shown to the client..."
                    className="mt-1"
                  />
                </div>
                <Button className="w-full" onClick={saveOrderUpdate} disabled={saving}>
                  {saving ? "Saving..." : "Save Update"}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
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
