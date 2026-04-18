import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Package, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

interface OrderRow {
  id: string;
  order_number: string;
  product_summary: string;
  status: string;
  created_at: string;
}

export default function PortalHome() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id, order_number, product_summary, status, created_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setOrders((data ?? []) as OrderRow[]);
        setLoading(false);
      });
  }, [user]);

  const active = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Here is a quick overview of your account.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Active Orders</CardTitle>
            <Package className="w-5 h-5 text-accent" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-heading">{active}</p>
            <Link to="/portal/orders" className="text-xs text-accent hover:underline">
              View all orders →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Orders</CardTitle>
            <Clock className="w-5 h-5 text-accent" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-heading">{orders.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no orders yet. Submit a quote on the website to get started.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id} className="py-3">
                  <Link
                    to={`/portal/orders/${o.id}`}
                    className="flex items-center justify-between hover:text-accent"
                  >
                    <span className="text-sm font-medium">#{o.order_number}</span>
                    <span className="text-xs text-muted-foreground">{o.status.replace("_", " ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
