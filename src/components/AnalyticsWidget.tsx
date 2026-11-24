import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertTriangle, Clock, Trash2, BarChart3, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { bottleneckOf, phaseQueues } from "@/lib/dashboardMetrics";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ---------------------------------------------------------------
// AnalyticsWidget — production analytics on the admin dashboard.
//   - Current bottleneck: SNAPSHOT of in-progress batches (ignores the period)
//   - Avg time per phase, wasted pieces per phase: PERIOD totals for `days`
// ---------------------------------------------------------------

interface PhaseStats {
  name: string;
  avgMinutes: number;
  totalWasted: number;
  entries: number;
}

const CHART_COLORS = ["#f59e0b", "#3b82f6", "#a855f7", "#10b981", "#ef4444", "#6366f1"];

const summary = (stats: PhaseStats[], key: "avgMinutes" | "totalWasted") =>
  stats.map((s) => `${s.name} ${s[key]}`).join(", ");

export default function AnalyticsWidget({ days, periodLabel, canLogWork }: {
  /** null = all time */
  days: number | null;
  /** e.g. "Last 30 days" — shown on each chart */
  periodLabel: string;
  canLogWork?: boolean;
}) {
  const [stats, setStats] = useState<PhaseStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [bottleneck, setBottleneck] = useState<{ name: string; waiting: number } | null>(null);
  const [inProgressBatches, setInProgressBatches] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: phases } = await supabase
          .from("production_phases")
          .select("id, name, sequence_order")
          .order("sequence_order");
        if (!phases || phases.length === 0) return;

        // Period totals (charts)
        let q = supabase
          .from("batch_tracking")
          .select("batch_id, phase_id, quantity_wasted, created_at")
          .order("created_at");
        if (days !== null) q = q.gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
        const { data: tracking } = await q;

        const phaseStats: PhaseStats[] = phases.map((phase) => {
          const entries = (tracking ?? []).filter((t) => t.phase_id === phase.id);
          // Processing time per batch = first to last entry at this phase
          const byBatch = new Map<string, number[]>();
          for (const e of entries) {
            const list = byBatch.get(e.batch_id) ?? [];
            list.push(new Date(e.created_at).getTime());
            byBatch.set(e.batch_id, list);
          }
          let totalMinutes = 0;
          for (const times of byBatch.values()) {
            totalMinutes += Math.max((Math.max(...times) - Math.min(...times)) / 60000, 1);
          }
          return {
            name: phase.name,
            avgMinutes: byBatch.size > 0 ? Math.round(totalMinutes / byBatch.size) : 0,
            totalWasted: entries.reduce((sum, e) => sum + (e.quantity_wasted ?? 0), 0),
            entries: entries.length,
          };
        });

        // Bottleneck snapshot: in-progress batches, all their work to date
        const { data: batches } = await supabase
          .from("production_batches")
          .select("id, total_quantity")
          .eq("status", "in_progress");
        let current: { name: string; waiting: number } | null = null;
        if (batches && batches.length > 0) {
          const { data: all } = await supabase
            .from("batch_tracking")
            .select("batch_id, phase_id, quantity_completed, quantity_wasted")
            .in("batch_id", batches.map((b) => b.id));
          current = bottleneckOf(phaseQueues(phases, batches, all ?? []));
        }

        if (!cancelled) {
          setStats(phaseStats);
          setInProgressBatches(batches?.length ?? 0);
          setBottleneck(current);
        }
      } catch (err) {
        console.error("Analytics load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [days]);

  const hasActivity = useMemo(() => stats.some((s) => s.entries > 0), [stats]);
  const hasWaste = useMemo(() => stats.some((s) => s.totalWasted > 0), [stats]);
  const nextStep = canLogWork ? (
    <Button asChild variant="outline" size="sm"><Link to="/admin/batches">Open production batches</Link></Button>
  ) : undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No production phases set up"
        description="Production phases (Cutting, Stitching, QC…) have not been configured yet."
      />
    );
  }

  const chartTitle = (icon: React.ReactNode, title: string) => (
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
      <p className="admin-meta">{periodLabel} · period total</p>
    </CardHeader>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bottleneck: a snapshot, so it ignores the period selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" aria-hidden />
            Current bottleneck
          </CardTitle>
          <p className="admin-meta">Right now · in-progress batches</p>
        </CardHeader>
        <CardContent>
          {bottleneck ? (
            <>
              <p className="text-2xl font-bold">{bottleneck.name}</p>
              <p className="text-sm text-foreground mt-1">{bottleneck.waiting.toLocaleString()} pcs waiting</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-success" aria-hidden />
                {inProgressBatches === 0 ? "No batches in progress" : "No bottleneck"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {inProgressBatches === 0
                  ? "There are no in-progress batches to assess."
                  : "No pieces are waiting between phases in the in-progress batches."}
              </p>
            </>
          )}
          <p className="admin-meta mt-3">
            Rule: the phase with the most pieces waiting, meaning pieces finished at the previous phase
            but not yet finished here. The first phase and phases a batch skips are not counted.
          </p>
        </CardContent>
      </Card>

      {/* Average Time Per Phase */}
      <Card>
        {chartTitle(<Clock className="w-4 h-4 text-info" aria-hidden />, "Avg. time per phase (min)")}
        <CardContent>
          {hasActivity ? (
            <div role="img" aria-label={`Average minutes per phase, ${periodLabel}: ${summary(stats, "avgMinutes")}`}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="avgMinutes" radius={[4, 4, 0, 0]}>
                    {stats.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No production activity recorded in this period"
              description={`Nothing was logged in the ${periodLabel.toLowerCase()}.`}
              action={nextStep}
            />
          )}
        </CardContent>
      </Card>

      {/* Wasted Pieces Per Phase */}
      <Card>
        {chartTitle(<Trash2 className="w-4 h-4 text-muted-foreground" aria-hidden />, "Wasted pieces per phase")}
        <CardContent>
          {hasWaste ? (
            <div role="img" aria-label={`Wasted pieces per phase, ${periodLabel}: ${summary(stats, "totalWasted")}`}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="totalWasted" radius={[4, 4, 0, 0]}>
                    {stats.map((_, i) => (
                      <Cell key={i} fill="#ef4444" fillOpacity={0.6 + i * 0.05} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={hasActivity ? CheckCircle2 : BarChart3}
              title={hasActivity ? "No wasted pieces recorded in this period" : "No production activity recorded in this period"}
              description={`Checked the ${periodLabel.toLowerCase()}.`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
