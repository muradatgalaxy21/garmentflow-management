import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Package, ArrowRight } from "lucide-react";
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

// Human-readable status labels
const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  in_production: "In Production",
  qc: "Quality Check",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

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
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">My Orders</h1>
        <p className="text-base text-muted-foreground mt-1">All orders linked to your account.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : orders.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-20 text-center">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-base font-medium text-foreground mb-1">No orders yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Once you submit a quote request and it is accepted, your orders will appear here.
            </p>
            <Link
              to="/contact?rfq=true"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline font-medium"
            >
              Request a Quote <ArrowRight className="w-4 h-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o.id} to={`/client-portal/orders/${o.id}`}>
              <Card className="hover:border-accent hover:shadow-md transition-all duration-200 cursor-pointer">
                <CardContent className="py-5 px-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    {/* Order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1.5">
                        <h3 className="font-semibold text-base text-foreground">#{o.order_number}</h3>
                        <Badge variant="outline" className={`text-xs font-medium ${statusColors[o.status]}`}>
                          {statusLabel[o.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {o.product_summary} &bull; <strong>{o.quantity.toLocaleString()}</strong> pcs
                      </p>
                    </div>

                    {/* Date / ETA */}
                    <div className="shrink-0 text-right">
                      {o.expected_delivery ? (
                        <>
                          <p className="text-xs text-muted-foreground">Expected delivery</p>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(o.expected_delivery).toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">Order placed</p>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(o.created_at).toLocaleDateString(undefined, {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
