import { useEffect, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------
// KanbanBoard
//
// Visualizes production batches as cards flowing through phases.
// Uses React Query-style polling (via setInterval) as a free-tier
// alternative to Supabase Realtime subscriptions.
//
// Columns are dynamically built from the production_phases table.
// Cards represent production_batches positioned by their latest
// batch_tracking entry's phase.
// ---------------------------------------------------------------

interface Phase {
  id: string;
  name: string;
  sequence_order: number;
}

interface BatchCard {
  id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  order_number: string;
  /** The phase this batch is currently at (latest tracking entry) */
  current_phase_id: string | null;
}

// Color palette for phase columns
const PHASE_COLORS: Record<number, string> = {
  1: "border-t-amber-500",    // Cutting
  2: "border-t-blue-500",     // Stitching
  3: "border-t-purple-500",   // QC
  4: "border-t-emerald-500",  // Packing
};

const PHASE_BG: Record<number, string> = {
  1: "bg-amber-500/5",
  2: "bg-blue-500/5",
  3: "bg-purple-500/5",
  4: "bg-emerald-500/5",
};

interface Props {
  /** Optional: filter batches to a specific order */
  orderId?: string;
  /** Polling interval in ms (default 15000 = 15 seconds) */
  pollInterval?: number;
}

export default function KanbanBoard({ orderId, pollInterval = 15000 }: Props) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [batches, setBatches] = useState<BatchCard[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch phases and batches, then poll for updates
  const fetchData = async () => {
    try {
      // Fetch all production phases for column headers
      const { data: phasesData } = await supabase
        .from("production_phases")
        .select("id, name, sequence_order")
        .order("sequence_order");

      if (phasesData) setPhases(phasesData as Phase[]);

      // Fetch active batches with optional order filter
      let batchQuery = supabase
        .from("production_batches")
        .select("id, style_number, total_quantity, status, order_id")
        .eq("status", "in_progress");

      if (orderId) {
        batchQuery = batchQuery.eq("order_id", orderId);
      }

      const { data: batchesData } = await batchQuery;

      if (!batchesData || batchesData.length === 0) {
        setBatches([]);
        setLoading(false);
        return;
      }

      // Fetch order numbers for display
      const orderIds = [...new Set(batchesData.map((b) => b.order_id))];
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number")
        .in("id", orderIds);
      const orderMap = new Map((orders ?? []).map((o) => [o.id, o.order_number]));

      // Determine each batch's current phase from latest tracking entry
      const batchIds = batchesData.map((b) => b.id);
      const { data: tracking } = await supabase
        .from("batch_tracking")
        .select("batch_id, phase_id, created_at")
        .in("batch_id", batchIds)
        .order("created_at", { ascending: false });

      // Map each batch to its latest phase
      const latestPhaseMap = new Map<string, string>();
      for (const t of tracking ?? []) {
        if (!latestPhaseMap.has(t.batch_id)) {
          latestPhaseMap.set(t.batch_id, t.phase_id);
        }
      }

      setBatches(
        batchesData.map((b) => ({
          id: b.id,
          style_number: b.style_number,
          total_quantity: b.total_quantity,
          status: b.status,
          order_number: orderMap.get(b.order_id) ?? "—",
          current_phase_id: latestPhaseMap.get(b.id) ?? null,
        }))
      );
    } catch (err) {
      console.error("Kanban fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // 2. Poll for updates at the configured interval
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [orderId, pollInterval]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  // 3. Group batches into columns by their current phase
  // Batches with no tracking entry go to a "Backlog" column
  const backlogBatches = batches.filter((b) => !b.current_phase_id);

  return (
    <div className="space-y-4">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {/* Backlog column for batches not yet started */}
        {backlogBatches.length > 0 && (
          <div className="min-w-[260px] shrink-0">
            <div className="bg-muted/50 rounded-lg p-3 border border-border border-t-4 border-t-slate-500">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Backlog ({backlogBatches.length})
              </h3>
              <div className="space-y-2">
                {backlogBatches.map((b) => (
                  <BatchCardComponent key={b.id} batch={b} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Phase columns */}
        {phases.map((phase) => {
          const phaseBatches = batches.filter(
            (b) => b.current_phase_id === phase.id
          );
          const colorClass = PHASE_COLORS[phase.sequence_order] ?? "border-t-gray-500";
          const bgClass = PHASE_BG[phase.sequence_order] ?? "";

          return (
            <div key={phase.id} className="min-w-[260px] shrink-0">
              <div className={`rounded-lg p-3 border border-border border-t-4 ${colorClass} ${bgClass}`}>
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  {phase.name} ({phaseBatches.length})
                </h3>
                <div className="space-y-2 min-h-[100px]">
                  {phaseBatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No batches
                    </p>
                  ) : (
                    phaseBatches.map((b) => (
                      <BatchCardComponent key={b.id} batch={b} />
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Individual batch card displayed on the Kanban board */
function BatchCardComponent({ batch }: { batch: BatchCard }) {
  return (
    <Card className="bg-card hover:border-accent transition-colors cursor-default">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {batch.style_number}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              #{batch.order_number}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {batch.total_quantity} pcs
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
