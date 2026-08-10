import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, CheckCircle2, Clock, Sparkles, Layers, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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
  color_breakdown: { color: string; quantity: number }[] | null;
  created_at: string;
}

interface Update {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

interface BatchProgress {
  id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  phases: {
    name: string;
    sequence: number;
    completed: number;
    wasted: number;
    percent: number;
  }[];
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [batches, setBatches] = useState<BatchProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const loadData = async () => {
      try {
        const [oRes, uRes, phasesRes, batchRes] = await Promise.all([
          supabase.from("orders").select("*").eq("id", id).maybeSingle(),
          supabase.from("order_updates").select("id, status, note, created_at").eq("order_id", id).order("created_at", { ascending: false }),
          supabase.from("production_phases").select("id, name, sequence_order").order("sequence_order"),
          supabase.from("production_batches").select("id, style_number, total_quantity, status").eq("order_id", id),
        ]);

        if (oRes.data) setOrder(oRes.data as Order);
        if (uRes.data) setUpdates(uRes.data as Update[]);

        const phaseList = (phasesRes.data ?? []) as { id: string; name: string; sequence_order: number }[];
        const batchList = (batchRes.data ?? []) as { id: string; style_number: string; total_quantity: number; status: string }[];

        if (batchList.length > 0) {
          const batchIds = batchList.map((b) => b.id);
          const { data: trackingData } = await supabase
            .from("batch_tracking")
            .select("batch_id, phase_id, quantity_completed, quantity_wasted")
            .in("batch_id", batchIds);

          const formattedBatches: BatchProgress[] = batchList.map((b) => {
            const bTracking = trackingData?.filter((t) => t.batch_id === b.id) ?? [];
            const phaseProgress = phaseList.map((p) => {
              const pEntries = bTracking.filter((t) => t.phase_id === p.id);
              const completed = pEntries.reduce((sum, e) => sum + (e.quantity_completed || 0), 0);
              const wasted = pEntries.reduce((sum, e) => sum + (e.quantity_wasted || 0), 0);
              const percent = Math.min(100, Math.round((completed / (b.total_quantity || 1)) * 100));
              return {
                name: p.name,
                sequence: p.sequence_order,
                completed,
                wasted,
                percent,
              };
            });

            return {
              id: b.id,
              style_number: b.style_number,
              total_quantity: b.total_quantity,
              status: b.status,
              phases: phaseProgress,
            };
          });

          setBatches(formattedBatches);
        }
      } catch (err) {
        console.error("Order detail error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
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
        <Link to="/client-portal/orders" className="text-accent text-sm mt-3 inline-block">
          ← Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/client-portal/orders" className="text-sm text-muted-foreground hover:text-accent inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> All orders
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-xl">Order #{order.order_number}</CardTitle>
              <CardDescription className="mt-1">{order.product_summary}</CardDescription>
            </div>
            <Badge variant="outline" className="capitalize text-sm font-semibold px-3 py-1">
              {order.status.replace("_", " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Target Quantity" value={`${order.quantity} pcs`} />
          {order.total_amount !== null && (
            <Row label="Total Value" value={`${order.currency ?? "USD"} ${order.total_amount}`} />
          )}
          {order.expected_delivery && (
            <Row label="Expected Delivery" value={new Date(order.expected_delivery).toLocaleDateString()} />
          )}
          {order.tracking_number && <Row label="Tracking #" value={order.tracking_number} />}
          <Row label="Order Date" value={new Date(order.created_at).toLocaleString()} />

          {order.color_breakdown && order.color_breakdown.length > 0 && (
            <div className="pt-2 border-t">
              <span className="text-muted-foreground">Color Breakdown</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {order.color_breakdown.map((c) => (
                  <Badge key={c.color} variant="outline" className="capitalize text-xs">
                    {c.color}: {c.quantity} pcs
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LIVE FACTORY BATCH PROGRESS SECTION */}
      <Card className="border-accent/30 shadow-md">
        <CardHeader className="py-4 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" /> Live Factory Batch Progress
          </CardTitle>
          <CardDescription>Real-time updates directly from our factory floor production lines.</CardDescription>
        </CardHeader>
        <CardContent className="py-5 space-y-6">
          {batches.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Batch creation is in progress by our production manager. Updates will appear here shortly.
            </div>
          ) : (
            batches.map((b) => (
              <div key={b.id} className="space-y-4 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-accent" />
                    <h3 className="font-bold text-foreground">Style #{b.style_number}</h3>
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs">
                    Target: {b.total_quantity} pcs
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {b.phases.map((p) => (
                    <div key={p.name} className="space-y-1.5 bg-background p-3 rounded-lg border">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-foreground">{p.name}</span>
                        <span className="text-accent">{p.percent}% ({p.completed}/{b.total_quantity} pcs)</span>
                      </div>
                      <Progress value={p.percent} className="h-2 bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Status Audit Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status updates logged yet.</p>
          ) : (
            <ul className="space-y-4">
              {updates.map((u) => (
                <li key={u.id} className="flex gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground capitalize">{u.status.replace("_", " ")}</p>
                    {u.note && <p className="text-sm text-muted-foreground mt-0.5">{u.note}</p>}
                    <p className="text-xs text-muted-foreground/70 mt-1">
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

