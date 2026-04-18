import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Order {
  id: string;
  order_number: string;
  product_summary: string;
  quantity: number;
  total_amount: number | null;
  currency: string | null;
  status: string;
  expected_delivery: string | null;
  tracking_number: string | null;
  created_at: string;
}

interface Update {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from("orders").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("order_updates")
        .select("id, status, note, created_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
    ]).then(([oRes, uRes]) => {
      if (oRes.data) setOrder(oRes.data as Order);
      if (uRes.data) setUpdates(uRes.data as Update[]);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Order not found.</p>
        <Link to="/portal/orders" className="text-accent text-sm mt-3 inline-block">
          ← Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/portal/orders" className="text-sm text-muted-foreground hover:text-accent inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> All orders
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Order #{order.order_number}</CardTitle>
            <Badge variant="outline">{order.status.replace("_", " ")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Product" value={order.product_summary} />
          <Row label="Quantity" value={`${order.quantity} pcs`} />
          {order.total_amount !== null && (
            <Row label="Total" value={`${order.currency ?? "USD"} ${order.total_amount}`} />
          )}
          {order.expected_delivery && (
            <Row label="Expected Delivery" value={new Date(order.expected_delivery).toLocaleDateString()} />
          )}
          {order.tracking_number && <Row label="Tracking #" value={order.tracking_number} />}
          <Row label="Created" value={new Date(order.created_at).toLocaleString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status updates yet.</p>
          ) : (
            <ul className="space-y-4">
              {updates.map((u) => (
                <li key={u.id} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.status.replace("_", " ")}</p>
                    {u.note && <p className="text-sm text-muted-foreground">{u.note}</p>}
                    <p className="text-xs text-muted-foreground/70">
                      {new Date(u.created_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}
