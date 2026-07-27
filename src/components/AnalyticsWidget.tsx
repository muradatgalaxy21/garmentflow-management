import { useEffect, useState } from "react";
import { Loader2, BarChart3, AlertTriangle, Clock, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ---------------------------------------------------------------
// AnalyticsWidget
//
// Displays production analytics on the admin dashboard:
//   - Average time per phase (bar chart)
//   - Current bottleneck phase (highlight card)
//   - Wasted pieces per phase (bar chart)
// ---------------------------------------------------------------

interface PhaseStats {
  name: string;
  avgMinutes: number;
  totalWasted: number;
  backlogCount: number;
}

const CHART_COLORS = ["#f59e0b", "#3b82f6", "#a855f7", "#10b981", "#ef4444", "#6366f1"];

export default function AnalyticsWidget() {
  const [stats, setStats] = useState<PhaseStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [bottleneck, setBottleneck] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // 1. Fetch all phases
        const { data: phases } = await supabase
          .from("production_phases")
          .select("id, name, sequence_order")
          .order("sequence_order");

        if (!phases || phases.length === 0) { setLoading(false); return; }

        // 2. Fetch all tracking entries for analysis
        const { data: tracking } = await supabase
          .from("batch_tracking")
          .select("batch_id, phase_id, quantity_wasted, created_at")
          .order("created_at");

        if (!tracking) { setLoading(false); return; }

        // 3. Calculate per-phase statistics
        const phaseStats: PhaseStats[] = phases.map((phase) => {
          const phaseEntries = tracking.filter((t) => t.phase_id === phase.id);

          // Calculate average time between entries for each batch at this phase
          // Group entries by batch
          const batchGroups = new Map<string, string[]>();
          for (const entry of phaseEntries) {
            const existing = batchGroups.get(entry.batch_id) ?? [];
            existing.push(entry.created_at);
            batchGroups.set(entry.batch_id, existing);
          }

          let totalMinutes = 0;
          let batchCount = 0;
          for (const [, timestamps] of batchGroups) {
            if (timestamps.length > 0) {
              // Use time from first to last entry as processing time
              const sorted = timestamps.sort();
              const first = new Date(sorted[0]).getTime();
              const last = new Date(sorted[sorted.length - 1]).getTime();
              const diffMinutes = Math.max((last - first) / 60000, 1);
              totalMinutes += diffMinutes;
              batchCount++;
            }
          }

          const totalWasted = phaseEntries.reduce(
            (sum, e) => sum + (e.quantity_wasted ?? 0), 0
          );

          return {
            name: phase.name,
            avgMinutes: batchCount > 0 ? Math.round(totalMinutes / batchCount) : 0,
            totalWasted,
            backlogCount: phaseEntries.length,
          };
        });

        setStats(phaseStats);

        // 4. Identify the bottleneck (phase with most backlog entries)
        const maxBacklog = phaseStats.reduce(
          (prev, curr) => (curr.backlogCount > prev.backlogCount ? curr : prev),
          phaseStats[0]
        );
        if (maxBacklog && maxBacklog.backlogCount > 0) {
          setBottleneck(maxBacklog.name);
        }
      } catch (err) {
        console.error("Analytics load failed:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-accent" />
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No production data available yet. Create batches and start tracking.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bottleneck Indicator */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Current Bottleneck
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold font-heading">
            {bottleneck ?? "None"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Phase with the highest activity volume
          </p>
        </CardContent>
      </Card>

      {/* Average Time Per Phase */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            Avg. Time Per Phase (min)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={stats} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Bar dataKey="avgMinutes" radius={[4, 4, 0, 0]}>
                {stats.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Wasted Pieces Per Phase */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-500" />
            Wasted Pieces Per Phase
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={stats} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Bar dataKey="totalWasted" radius={[4, 4, 0, 0]}>
                {stats.map((_, i) => (
                  <Cell key={i} fill="#ef4444" fillOpacity={0.6 + i * 0.1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
