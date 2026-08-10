import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Package, Clock, ArrowRight, PlusCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface OrderRow {
  id: string;
  order_number: string;
  product_summary: string;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  in_production: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  qc: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  shipped: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  delivered: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-600 border-red-500/30",
};

export default function PortalHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    <div className="space-y-8">
      {/* Page heading with Place Direct Order CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-accent/5 p-6 rounded-2xl border border-accent/20">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Client Portal
          </span>
          <h1 className="font-heading text-3xl font-bold text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track ongoing garment batches or place a new direct production order.
          </p>
        </div>
        <Button
          size="lg"
          className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-md whitespace-nowrap shrink-0"
          onClick={() => navigate("/client-portal/direct-order")}
        >
          <PlusCircle className="w-5 h-5 mr-2" /> Place Direct Production Order
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active Orders</CardTitle>
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-accent" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold font-heading text-foreground">{active}</p>
            <Link
              to="/client-portal/orders"
              className="inline-flex items-center gap-1 mt-2 text-sm text-accent hover:underline font-medium"
            >
              View all orders <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Orders</CardTitle>
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-accent" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold font-heading text-foreground">{orders.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">Across all statuses</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent orders card */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Orders</CardTitle>
          <Link to="/client-portal/orders" className="text-sm text-accent hover:underline font-medium">
            See all
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10">
              <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                You have no orders yet. Click above to place your first direct production order!
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/client-portal/orders/${o.id}`}
                    className="flex items-center justify-between py-4 hover:text-accent transition-colors gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">#{o.order_number}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{o.product_summary}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="outline" className={`text-xs ${statusColors[o.status] ?? ""}`}>
                        {o.status.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {new Date(o.created_at).toLocaleDateString()}
                      </span>
                    </div>
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

