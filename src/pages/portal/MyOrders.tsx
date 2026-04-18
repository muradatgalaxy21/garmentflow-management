import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

type OrderStatus = "pending" | "in_production" | "qc" | "shipped" | "delivered" | "cancelled";

interface Order {
  id: string;
  order_number: string;
  product_summary: string;
  quantity: number;
  status: OrderStatus;
  expected_delivery: string | null;
  created_at: string;
}

const statusColors: Record<OrderStatus, string> = {
  pending: "bg-slate-500/15 text-slate-600",
  in_production: "bg-blue-500/15 text-blue-600",
  qc: "bg-purple-500/15 text-purple-600",
  shipped: "bg-amber-500/15 text-amber-600",
  delivered: "bg-emerald-500/15 text-emerald-600",
  cancelled: "bg-red-500/15 text-red-600",
};

export default function MyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id, order_number, product_summary, quantity, status, expected_delivery, created_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data ?? []) as Order[]);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">My Orders</h1>
        <p className="text-sm text-muted-foreground">All orders linked to your account.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No orders yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link key={o.id} to={`/portal/orders/${o.id}`}>
              <Card className="hover:border-accent transition-colors">
                <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">#{o.order_number}</h3>
                      <Badge variant="outline" className={statusColors[o.status]}>
                        {o.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {o.product_summary} • {o.quantity} pcs
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground self-start">
                    {o.expected_delivery
                      ? `ETA ${new Date(o.expected_delivery).toLocaleDateString()}`
                      : new Date(o.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
