import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, AlertTriangle, CheckCircle2, CircleDot, Hourglass, Undo2, Truck, Factory, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { StatusBadge, type Tone } from "@/components/admin/StatusBadge";
import { DEPARTMENT_LABELS } from "@/lib/departmentEntries";
import { formatBatchIdentity } from "@/lib/batchIdentity";
import { STAGE_GROUPS, stageState, type StageState, type StageStatusRow } from "@/lib/pipelineStatus";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface BatchRow {
  id: string;
  style_number: string;
  order_number: string | null;
  party_name: string | null;
}

const STATE_UI: Record<Exclude<StageState, "not_started">, { tone: Tone; icon: LucideIcon; label: string }> = {
  done: { tone: "success", icon: CheckCircle2, label: "Done" },
  in_progress: { tone: "info", icon: CircleDot, label: "In progress" },
  needs_approval: { tone: "warning", icon: Hourglass, label: "Needs approval" },
  sent_back: { tone: "warning", icon: Undo2, label: "Sent back" },
};

// The "Out" group: not department stages, but read per batch the same way.
const OUT_COLUMNS = [
  { key: "qc_done", short: "QC done", full: "Quality complete: bundles that passed final QC" },
  { key: "dispatch", short: "Dispatch", full: "Dispatch" },
  { key: "stock", short: "Stock", full: "Stock: material used by this batch is at or below reorder level" },
];

const ALL_STAGES = STAGE_GROUPS.flatMap((g) => g.stages);
const ALL = "all";

/** Faint dot for "not started"; the text is for screen readers and the legend. */
const NotStarted = () => (
  <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" title="Not started">
    <span className="sr-only">Not started</span>
  </span>
);

/** Short header label; full name on hover and keyboard focus. */
function StageLabel({ short, full }: { short: string; full: string }) {
  if (short === full) return <>{short}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={full} className="cursor-help underline decoration-dotted underline-offset-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {short}
        </span>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  );
}

export default function BatchPipelineStatusPage() {
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [statusByBatch, setStatusByBatch] = useState<Map<string, StageStatusRow[]>>(new Map());
  const [bundleCounts, setBundleCounts] = useState<Map<string, number>>(new Map());
  const [qualityCompleteCounts, setQualityCompleteCounts] = useState<Map<string, number>>(new Map());
  const [dispatchedBatches, setDispatchedBatches] = useState<Set<string>>(new Set());
  const [shortfallBatches, setShortfallBatches] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState(ALL);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: batchData } = await supabase
        .from("production_batches")
        .select("id, style_number, material_item_id, orders(order_number, party_name)")
        .in("status", ["in_progress", "paused"])
        .order("created_at", { ascending: false });

      const rows: BatchRow[] = ((batchData as any[]) ?? []).map((b) => ({
        id: b.id,
        style_number: b.style_number,
        order_number: b.orders?.order_number ?? null,
        party_name: b.orders?.party_name ?? null,
      }));
      setBatches(rows);

      const batchIds = rows.map((b) => b.id);
      if (batchIds.length === 0) {
        setStatusByBatch(new Map());
        setBundleCounts(new Map());
        setQualityCompleteCounts(new Map());
        setDispatchedBatches(new Set());
        setShortfallBatches(new Set());
        setLoading(false);
        return;
      }

      const [statusRes, bundleRes, qualityRes, dispatchRes, deptEntriesRes] = await Promise.all([
        supabase
          .from("batch_department_status")
          .select("batch_id, department, status, start_verification_status, end_verification_status")
          .in("batch_id", batchIds),
        supabase.from("production_bundles").select("id, batch_id").in("batch_id", batchIds),
        supabase.from("bundle_quality_status").select("batch_id, is_quality_complete").in("batch_id", batchIds),
        supabase.from("batch_dispatches").select("batch_id").in("batch_id", batchIds),
        supabase.from("department_entries").select("batch_id, inventory_item_id").in("batch_id", batchIds).not("inventory_item_id", "is", null),
      ]);

      const statusMap = new Map<string, StageStatusRow[]>();
      for (const row of (statusRes.data ?? []) as (StageStatusRow & { batch_id: string })[]) {
        statusMap.set(row.batch_id, [...(statusMap.get(row.batch_id) ?? []), row]);
      }
      setStatusByBatch(statusMap);

      const bundleMap = new Map<string, number>();
      for (const row of bundleRes.data ?? []) {
        bundleMap.set(row.batch_id, (bundleMap.get(row.batch_id) ?? 0) + 1);
      }
      setBundleCounts(bundleMap);

      const qcMap = new Map<string, number>();
      for (const row of qualityRes.data ?? []) {
        if (row.is_quality_complete) qcMap.set(row.batch_id, (qcMap.get(row.batch_id) ?? 0) + 1);
      }
      setQualityCompleteCounts(qcMap);

      setDispatchedBatches(new Set((dispatchRes.data ?? []).map((d) => d.batch_id)));

      // Inventory shortfall: any tracked item consumed by this batch (worker entries or
      // its assigned fabric) that's now at/below reorder level.
      const itemIds = new Set<string>();
      const batchToItems = new Map<string, Set<string>>();
      for (const row of deptEntriesRes.data ?? []) {
        if (!row.inventory_item_id) continue;
        itemIds.add(row.inventory_item_id);
        const set = batchToItems.get(row.batch_id) ?? new Set<string>();
        set.add(row.inventory_item_id);
        batchToItems.set(row.batch_id, set);
      }
      for (const b of batchData ?? []) {
        if ((b as any).material_item_id) {
          itemIds.add((b as any).material_item_id);
          const set = batchToItems.get((b as any).id) ?? new Set<string>();
          set.add((b as any).material_item_id);
          batchToItems.set((b as any).id, set);
        }
      }
      let lowItemIds = new Set<string>();
      if (itemIds.size > 0) {
        const { data: items } = await supabase
          .from("inventory_items")
          .select("id, quantity_on_hand, reorder_level")
          .in("id", [...itemIds]);
        lowItemIds = new Set(
          (items ?? []).filter((i) => Number(i.quantity_on_hand) <= Number(i.reorder_level)).map((i) => i.id)
        );
      }
      const shortfall = new Set<string>();
      for (const [batchId, items] of batchToItems) {
        if ([...items].some((id) => lowItemIds.has(id))) shortfall.add(batchId);
      }
      setShortfallBatches(shortfall);

      setLoading(false);
    };
    load();
  }, []);

  const orders = useMemo(
    () => [...new Set(batches.map((b) => b.order_number).filter((o): o is string => !!o))].sort(),
    [batches]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return batches.filter(
      (b) =>
        (order === ALL || b.order_number === order) &&
        (!q || [b.style_number, b.order_number, b.party_name].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [batches, search, order]);

  // Horizontal scroll cue: fade + hint while more stages sit off to the right.
  const scroller = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const checkScroll = () => {
    const el = scroller.current;
    setMoreRight(!!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    checkScroll();
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, visible.length]);

  /** Where an unfinished stage leads: approvals live in the Inbox, everything else on the batch. */
  const actionFor = (batchId: string, state: StageState) => {
    if (state === "needs_approval" && can("inbox.view")) return { to: "/admin/inbox", verb: "open the Inbox to approve" };
    if ((state === "in_progress" || state === "sent_back" || state === "needs_approval") && can("batches.view")) {
      return { to: `/admin/batches?batch=${batchId}`, verb: "open the batch" };
    }
    return null;
  };

  const stageCell = (b: BatchRow, stage: (typeof ALL_STAGES)[number]) => {
    const { state, department } = stageState(statusByBatch.get(b.id), stage.departments);
    if (state === "not_started") return <NotStarted />;
    const ui = STATE_UI[state];
    // Decoration has three alternatives; name the one this batch used.
    const which = stage.departments.length > 1 && department ? ` (${DEPARTMENT_LABELS[department]})` : "";
    const badge = <StatusBadge tone={ui.tone} icon={ui.icon}>{ui.label}</StatusBadge>;
    const action = actionFor(b.id, state);
    const title = `${stage.full}${which}: ${ui.label}`;
    if (!action) return <span title={title}>{badge}</span>;
    return (
      <Link
        to={action.to}
        title={`${title}. Click to ${action.verb}.`}
        aria-label={`${b.style_number}, ${stage.full}${which}: ${ui.label}. ${action.verb}`}
        className="inline-block rounded-full hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {badge}
      </Link>
    );
  };

  const outCells = (b: BatchRow): Record<string, ReactNode> => {
    const total = bundleCounts.get(b.id) ?? 0;
    const complete = qualityCompleteCounts.get(b.id) ?? 0;
    const lowStock = shortfallBatches.has(b.id);
    const lowBadge = <StatusBadge tone="warning" icon={AlertTriangle}>Low stock</StatusBadge>;
    return {
      qc_done: total === 0 ? <NotStarted /> : (
        <StatusBadge tone={complete === total ? "success" : "info"} icon={complete === total ? CheckCircle2 : CircleDot}>
          {complete} / {total} bundles
        </StatusBadge>
      ),
      dispatch: dispatchedBatches.has(b.id) ? <StatusBadge tone="success" icon={Truck}>Dispatched</StatusBadge> : <NotStarted />,
      stock: !lowStock ? <span className="sr-only">No shortfall</span> : can("inventory.view") ? (
        <Link to="/admin/inventory" title="Material at or below reorder level. Click to open Inventory." className="inline-block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {lowBadge}
        </Link>
      ) : lowBadge,
    };
  };

  const batchLink = (b: BatchRow) =>
    can("batches.view") ? (
      <Link to={`/admin/batches?batch=${b.id}`} className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        {b.style_number}
      </Link>
    ) : (
      <span className="font-medium text-foreground">{b.style_number}</span>
    );

  return (
    <div>
      <PageHeader
        title="Batch Pipeline Status"
        description={'Every active batch across all 13 pipeline stages: one place to answer "where is order X right now."'}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : batches.length === 0 ? (
        <EmptyState icon={Factory} title="No active batches" description="Batches show here once they are in progress." />
      ) : (
        <>
          <TableToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search batch, order or client…"
            count={visible.length}
            noun="batch"
            filtersActive={order !== ALL}
            onClear={() => { setSearch(""); setOrder(ALL); }}
          >
            <Select value={order} onValueChange={setOrder}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter by order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All orders</SelectItem>
                {orders.map((o) => <SelectItem key={o} value={o}>Order #{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </TableToolbar>

          {/* Legend */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
            {Object.values(STATE_UI).map((s) => <StatusBadge key={s.label} tone={s.tone} icon={s.icon}>{s.label}</StatusBadge>)}
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" aria-hidden />Not started</span>
            <span>Click an unfinished stage to open its batch.</span>
          </div>

          {visible.length === 0 ? (
            <EmptyState title="No batches match" description="Try another search or order." />
          ) : (
            <>
              {/* Narrow screens: one stage timeline per batch */}
              <ul className="space-y-3 md:hidden">
                {visible.map((b) => {
                  const out = outCells(b);
                  return (
                    <li key={b.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {batchLink(b)}
                          <p className="text-xs text-muted-foreground">{formatBatchIdentity(b.order_number, null, b.party_name)}</p>
                        </div>
                        {out.stock}
                      </div>
                      {STAGE_GROUPS.map((g) => (
                        <div key={g.label} className="border-t border-border pt-2 mt-2">
                          <p className="admin-label mb-1 text-xs uppercase tracking-wide text-muted-foreground">{g.label}</p>
                          <ol className="space-y-1">
                            {g.stages.map((s) => (
                              <li key={s.key} className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-foreground">{s.full}</span>
                                {stageCell(b, s)}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                      <div className="border-t border-border pt-2 mt-2 space-y-1 text-sm">
                        <div className="flex items-center justify-between gap-2"><span>Quality complete</span>{out.qc_done}</div>
                        <div className="flex items-center justify-between gap-2"><span>Dispatch</span>{out.dispatch}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Wider screens: stage matrix, batch column frozen */}
              <div className="hidden md:block">
                <div className="relative">
                <div ref={scroller} onScroll={checkScroll} className="relative overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th rowSpan={2} scope="col" className="sticky left-0 z-20 bg-muted p-3 text-left font-semibold text-foreground whitespace-nowrap shadow-[inset_-1px_0_0_hsl(var(--border))]">
                          Batch
                        </th>
                        {[...STAGE_GROUPS.map((g) => ({ label: g.label, span: g.stages.length })), { label: "Out", span: OUT_COLUMNS.length }].map((g) => (
                          <th key={g.label} colSpan={g.span} scope="colgroup" className="border-l border-border px-3 pt-2 pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {g.label}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-muted">
                        {[...STAGE_GROUPS.flatMap((g) => g.stages.map((s, i) => ({ ...s, first: i === 0 }))),
                          ...OUT_COLUMNS.map((s, i) => ({ ...s, first: i === 0 }))].map((s) => (
                          <th key={s.key} scope="col" className={cn("px-3 pb-2 pt-1 text-center font-semibold text-foreground whitespace-nowrap", s.first && "border-l border-border")}>
                            <StageLabel short={s.short} full={s.full} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((b) => {
                        const out = outCells(b);
                        return (
                          <tr key={b.id} className="group border-t border-border">
                            <th scope="row" className="sticky left-0 z-10 bg-card p-3 text-left font-normal whitespace-nowrap shadow-[inset_-1px_0_0_hsl(var(--border))] group-hover:bg-muted">
                              {batchLink(b)}
                              <p className="text-xs text-muted-foreground">{formatBatchIdentity(b.order_number, null, b.party_name)}</p>
                            </th>
                            {STAGE_GROUPS.flatMap((g) => g.stages.map((s, i) => (
                              <td key={s.key} className={cn("p-3 text-center group-hover:bg-muted/40", i === 0 && "border-l border-border")}>
                                {stageCell(b, s)}
                              </td>
                            )))}
                            {OUT_COLUMNS.map((c, i) => (
                              <td key={c.key} className={cn("p-3 text-center group-hover:bg-muted/40", i === 0 && "border-l border-border")}>
                                {out[c.key]}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {moreRight && <div className="pointer-events-none absolute inset-y-px right-px w-12 rounded-r-lg bg-gradient-to-l from-card to-transparent" aria-hidden />}
                </div>
                {moreRight && (
                  <>
                    <p className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      Scroll sideways for more stages <ArrowRight className="h-3 w-3" aria-hidden />
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
