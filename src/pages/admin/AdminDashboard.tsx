import { useEffect, useState } from "react";
import { Inbox, Package, ClipboardList, AlertTriangle, Factory, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import AnalyticsWidget from "@/components/AnalyticsWidget";

interface Stats {
  openRfqs: number;
  inProductionOrders: number;
  lowStockItems: number;
  totalInventoryItems: number;
  activeBatches: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch each KPI in parallel — count-only queries are cheap on Postgres
    const load = async () => {
      try {
        const [rfqRes, orderRes, itemsRes, lowRes, batchRes] = await Promise.all([
          supabase.from("rfqs").select("id", { count: "exact", head: true }).eq("status", "new"),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "in_production", "qc"]),
          supabase.from("inventory_items").select("id", { count: "exact", head: true }),
          supabase.from("inventory_items").select("id, quantity_on_hand, reorder_level"),
          supabase.from("production_batches").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        ]);

        const lowStock = (lowRes.data ?? []).filter(
          (i) => Number(i.quantity_on_hand) <= Number(i.reorder_level)
        ).length;

        setStats({
          openRfqs: rfqRes.count ?? 0,
          inProductionOrders: orderRes.count ?? 0,
          totalInventoryItems: itemsRes.count ?? 0,
          lowStockItems: lowStock,
          activeBatches: batchRes.count ?? 0,
        });
      } catch (err) {
        console.error("Dashboard load failed", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  const cards = [
    { title: "Open RFQs", value: stats?.openRfqs ?? 0, icon: Inbox, color: "text-accent" },
    { title: "Active Orders", value: stats?.inProductionOrders ?? 0, icon: ClipboardList, color: "text-accent" },
    { title: "Inventory Items", value: stats?.totalInventoryItems ?? 0, icon: Package, color: "text-accent" },
    { title: "Low Stock Alerts", value: stats?.lowStockItems ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { title: "Active Batches", value: stats?.activeBatches ?? 0, icon: Factory, color: "text-accent" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Operational overview of your manufacturing unit.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold font-heading">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Visit the RFQ Inbox to triage new quote requests from the website.</p>
          <p>• Add or update inventory items in the Inventory section.</p>
          <p>• Manage order status and shipping in the Orders section — clients see updates instantly.</p>
        </CardContent>
      </Card>

      {/* Production Analytics */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground mb-3">Production Analytics</h2>
        <AnalyticsWidget />
      </div>
    </div>
  );
}
