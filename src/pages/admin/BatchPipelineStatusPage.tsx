import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DEPARTMENT_LABELS, type Department } from "@/lib/departmentEntries";
import { formatBatchIdentity } from "@/lib/batchIdentity";

// department_sequence order_index groups — sticker/printing/embroidery share
// order_index 3 as alternatives, so they're collapsed into one column.
const STAGE_COLUMNS: { key: string; label: string; departments: Department[] }[] = [
  { key: "accessories", label: "Accessories", departments: ["accessories"] },
  { key: "cutting", label: "Cutting", departments: ["cutting"] },
  { key: "decoration", label: "Sticker/Print/Embroidery", departments: ["sticker", "printing", "embroidery"] },
  { key: "quality", label: "Quality", departments: ["quality"] },
  { key: "lot_bundling", label: "Lot Bundling", departments: ["lot_bundling"] },
  { key: "stitching", label: "Stitching Hall", departments: ["stitching"] },
  { key: "button_ops", label: "Button Ops", departments: ["button_ops"] },
  { key: "clipping", label: "Clipping", departments: ["clipping"] },
  { key: "press", label: "Press", departments: ["press"] },
  { key: "quality_final", label: "Quality (Final)", departments: ["quality_final"] },
  { key: "packing", label: "Packing", departments: ["packing"] },
];

interface BatchRow {
  id: string;
  style_number: string;
  order_number: string | null;
  party_name: string | null;
}

type DeptStatus = "open" | "closed";

export default function BatchPipelineStatusPage() {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [statusByBatch, setStatusByBatch] = useState<Map<string, Map<Department, DeptStatus>>>(new Map());
  const [bundleCounts, setBundleCounts] = useState<Map<string, number>>(new Map());
  const [qualityCompleteCounts, setQualityCompleteCounts] = useState<Map<string, number>>(new Map());
  const [dispatchedBatches, setDispatchedBatches] = useState<Set<string>>(new Set());
  const [shortfallBatches, setShortfallBatches] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: batchData } = await supabase
        .from("production_batches")
        .select("id, style_number, material_item_id, orders(order_number, party_name)")
        .eq("status", "in_progress")
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
        supabase.from("batch_department_status").select("batch_id, department, status").in("batch_id", batchIds),
        supabase.from("production_bundles").select("id, batch_id").in("batch_id", batchIds),
        supabase.from("bundle_quality_status").select("batch_id, is_quality_complete").in("batch_id", batchIds),
        supabase.from("batch_dispatches").select("batch_id").in("batch_id", batchIds),
        supabase.from("department_entries").select("batch_id, inventory_item_id").in("batch_id", batchIds).not("inventory_item_id", "is", null),
      ]);

      const statusMap = new Map<string, Map<Department, DeptStatus>>();
      for (const row of statusRes.data ?? []) {
        const inner = statusMap.get(row.batch_id) ?? new Map<Department, DeptStatus>();
        inner.set(row.department as Department, row.status as DeptStatus);
        statusMap.set(row.batch_id, inner);
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

  const cellFor = (batchId: string, departments: Department[]): DeptStatus | "none" => {
    const inner = statusByBatch.get(batchId);
    if (!inner) return "none";
    for (const dept of departments) {
      const status = inner.get(dept);
      if (status) return status;
    }
    return "none";
  };

  const cellBadge = (status: DeptStatus | "none") => {
    if (status === "closed") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Done</Badge>;
    if (status === "open") return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">In Progress</Badge>;
    return <span className="text-muted-foreground text-xs">—</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Batch Pipeline Status</h1>
        <p className="text-sm text-muted-foreground">
          Every active batch across all 13 pipeline stages — one place to answer "where is order X right now."
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No active batches.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-3 font-semibold text-foreground sticky left-0 bg-muted/50 whitespace-nowrap">Batch</th>
                {STAGE_COLUMNS.map((col) => (
                  <th key={col.key} className="text-center p-3 font-semibold text-foreground whitespace-nowrap">{col.label}</th>
                ))}
                <th className="text-center p-3 font-semibold text-foreground whitespace-nowrap">Quality Complete</th>
                <th className="text-center p-3 font-semibold text-foreground whitespace-nowrap">Dispatch</th>
                <th className="text-center p-3 font-semibold text-foreground whitespace-nowrap">Stock</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const totalBundles = bundleCounts.get(b.id) ?? 0;
                const completeBundles = qualityCompleteCounts.get(b.id) ?? 0;
                return (
                  <tr key={b.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 sticky left-0 bg-card whitespace-nowrap">
                      <p className="font-medium text-foreground">{b.style_number}</p>
                      <p className="text-xs text-muted-foreground">{formatBatchIdentity(b.order_number, null, b.party_name)}</p>
                    </td>
                    {STAGE_COLUMNS.map((col) => (
                      <td key={col.key} className="p-3 text-center">
                        {cellBadge(cellFor(b.id, col.departments))}
                      </td>
                    ))}
                    <td className="p-3 text-center text-xs text-muted-foreground">
                      {totalBundles > 0 ? `${completeBundles} / ${totalBundles} bundles` : "—"}
                    </td>
                    <td className="p-3 text-center">
                      {dispatchedBatches.has(b.id)
                        ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Dispatched</Badge>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      {shortfallBatches.has(b.id) && (
                        <AlertTriangle className="w-4 h-4 text-red-500 inline" aria-label="Inventory shortfall" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
