import { supabase } from "@/integrations/supabase/client";

export type Department =
  | "accessories"
  | "cutting"
  | "sticker"
  | "printing"
  | "embroidery"
  | "quality"
  | "lot_bundling"
  | "stitching"
  | "button_ops"
  | "clipping"
  | "press"
  | "quality_final"
  | "packing";
export type EntryStage = "start" | "end";
export type SubDepartment = "singer" | "overlock" | "flatlock" | "lock_stitch";
export type ButtonOperation = "button" | "buttonhole" | "eyelet" | "bartack";
export type QualityVerdict = "confirm" | "alter" | "reject";
/** Departments an "alter" verdict can route a bundle back to (stages 1-9, excluding quality_final/packing themselves). */
export type ReworkDepartment = Exclude<Department, "quality_final" | "packing">;

export const DEPARTMENT_LABELS: Record<Department, string> = {
  accessories: "Accessories",
  cutting: "Cutting",
  sticker: "Sticker",
  printing: "Printing",
  embroidery: "Embroidery",
  quality: "Quality",
  lot_bundling: "Lot Bundling",
  stitching: "Stitching Hall",
  button_ops: "Button / Buttonhole / Eyelet / Bartack",
  clipping: "Clipping",
  press: "Press",
  quality_final: "Quality (Final)",
  packing: "Packing",
};

export const QUALITY_VERDICT_LABELS: Record<QualityVerdict, string> = {
  confirm: "Confirm — Pass",
  alter: "Alter — Send Back",
  reject: "Reject",
};

export const BUTTON_OPERATION_LABELS: Record<ButtonOperation, string> = {
  button: "Button",
  buttonhole: "Buttonhole",
  eyelet: "Eyelet",
  bartack: "Bartack",
};

export const SUB_DEPARTMENT_LABELS: Record<SubDepartment, string> = {
  singer: "Singer",
  overlock: "Overlock",
  flatlock: "Flatlock",
  lock_stitch: "Lock Stitch",
};

export async function insertDepartmentEntry(params: {
  department: Department;
  batchId: string;
  workerId: string;
  stage?: EntryStage;
  payload: Record<string, unknown>;
  totalCost?: number | null;
  inventoryItemId?: string | null;
}) {
  const { error } = await supabase.from("department_entries").insert({
    department: params.department,
    batch_id: params.batchId,
    worker_id: params.workerId,
    stage: params.stage ?? "start",
    payload: params.payload,
    total_cost: params.totalCost ?? null,
    inventory_item_id: params.inventoryItemId ?? null,
  });
  if (error) throw error;
}

/** Logs a stock movement — the `apply_inventory_movement` DB trigger updates quantity_on_hand atomically. */
export async function recordInventoryMovement(
  itemId: string,
  quantity: number,
  type: "in" | "out" | "adjust",
  performedBy: string,
  reason: string
) {
  if (!itemId || quantity <= 0) return;
  const { error } = await supabase.from("inventory_movements").insert({
    item_id: itemId,
    quantity,
    type,
    performed_by: performedBy,
    reason,
  });
  if (error) throw error;
}

/** Deletes a logged work entry and, if it consumed a tracked inventory item, restocks the quantity. */
export async function deleteDepartmentEntryAndRestock(
  entry: {
    id: string;
    inventory_item_id?: string | null;
    payload?: Record<string, unknown> | null;
    batch_id?: string;
    department?: Department;
  },
  performedBy: string
) {
  const { error } = await supabase.from("department_entries").delete().eq("id", entry.id);
  if (error) throw error;

  const payload = entry.payload ?? {};
  const qty = typeof payload.quantity === "number" ? payload.quantity : 0;
  if (entry.inventory_item_id && qty > 0) {
    await recordInventoryMovement(entry.inventory_item_id, qty, "in", performedBy, "Restock — deleted work entry");
  }

  // If this was the last department_entries row for this batch+department, the
  // open/closed batch_department_status row it left behind is now stale (e.g. a
  // worker's dashboard showing "Open Batch Work" for a batch whose entries were
  // all deleted) — clear it so the department can be scanned fresh.
  if (entry.batch_id && entry.department) {
    const { count } = await supabase
      .from("department_entries")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", entry.batch_id)
      .eq("department", entry.department);
    if (!count) {
      await supabase
        .from("batch_department_status")
        .delete()
        .eq("batch_id", entry.batch_id)
        .eq("department", entry.department);
    }
  }
}

export interface BundleQualityStatus {
  bundle_id: string;
  latest_verdict: QualityVerdict;
  routed_to_department: ReworkDepartment | null;
  is_quality_complete: boolean;
}

/** Latest quality_final verdict per bundle for this batch — stage 11's computed "quality complete" status. */
export async function fetchBundleQualityStatuses(batchId: string): Promise<Map<string, BundleQualityStatus>> {
  const { data } = await supabase
    .from("bundle_quality_status")
    .select("bundle_id, latest_verdict, routed_to_department, is_quality_complete")
    .eq("batch_id", batchId);
  const rows = (data as unknown as BundleQualityStatus[]) ?? [];
  return new Map(rows.map((r) => [r.bundle_id, r]));
}

interface SequenceRow {
  department: Department;
  order_index: number;
  parallel_group: number;
}

interface StatusRow {
  department: Department;
  status: "open" | "closed";
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
  blockedByDepartment?: Department;
}

/** Departments that must be closed before `department` can be worked, per department_sequence. */
export async function checkDepartmentGate(batchId: string, department: Department): Promise<GateResult> {
  const { data: sequence } = await supabase
    .from("department_sequence")
    .select("department, order_index, parallel_group")
    .order("order_index");

  const rows = (sequence ?? []) as SequenceRow[];
  const current = rows.find((r) => r.department === department);
  if (!current) return { allowed: true };

  const earlier = rows.filter((r) => r.order_index < current.order_index);
  if (earlier.length === 0) return { allowed: true };

  const { data: statuses } = await supabase
    .from("batch_department_status")
    .select("department, status")
    .eq("batch_id", batchId);

  const statusMap = new Map(((statuses ?? []) as StatusRow[]).map((s) => [s.department, s.status]));

  // Group earlier stages by order_index: a stage is "cleared" once ANY department
  // sharing that order_index is closed (sticker/printing/embroidery are alternatives).
  const earlierByOrder = new Map<number, SequenceRow[]>();
  for (const row of earlier) {
    const list = earlierByOrder.get(row.order_index) ?? [];
    list.push(row);
    earlierByOrder.set(row.order_index, list);
  }

  for (const [, group] of earlierByOrder) {
    const cleared = group.some((r) => statusMap.get(r.department) === "closed");
    if (!cleared) {
      const blocker = group[0];
      return {
        allowed: false,
        blockedByDepartment: blocker.department,
        reason: `Previous department "${DEPARTMENT_LABELS[blocker.department]}" hasn't finished this batch yet.`,
      };
    }
  }

  return { allowed: true };
}

export interface DepartmentStatusRow {
  status: "open" | "closed";
  opened_by: string;
  start_verification_status: "pending" | "accepted" | "denied";
  end_enabled: boolean;
  end_verification_status: "none" | "pending" | "accepted" | "denied" | "reprocess";
}

export async function getDepartmentStatus(batchId: string, department: Department) {
  const { data } = await supabase
    .from("batch_department_status")
    .select("status, opened_by, start_verification_status, end_enabled, end_verification_status")
    .eq("batch_id", batchId)
    .eq("department", department)
    .maybeSingle();
  return data as DepartmentStatusRow | null;
}

/** Start scan: opens the department and files a start-verification message in the admin inbox. */
export async function openDepartment(
  batchId: string,
  department: Department,
  workerId: string,
  styleNumber?: string
) {
  const existing = await getDepartmentStatus(batchId, department);
  if (existing) return;
  const { error } = await supabase.from("batch_department_status").insert({
    batch_id: batchId,
    department,
    status: "open",
    opened_by: workerId,
  });
  if (error) throw error;

  const { error: msgError } = await supabase.from("worker_inbox_messages").insert({
    type: "batch_start_verification",
    worker_id: workerId,
    batch_id: batchId,
    department,
    message: `Batch ${styleNumber ?? batchId} started in ${DEPARTMENT_LABELS[department]}. Accept to enable the End QR scan.`,
  });
  if (msgError) throw msgError;
}

/** Admin-only: finalizes an accepted end verification by closing the department. */
export async function closeDepartment(batchId: string, department: Department, adminId: string) {
  const { error } = await supabase
    .from("batch_department_status")
    .update({ status: "closed", closed_by: adminId, closed_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("department", department);
  if (error) throw error;
}

/** End scan: does NOT close the department — files an end-verification message and waits for admin. */
export async function submitEndForVerification(params: {
  batchId: string;
  department: Department;
  workerId: string;
  styleNumber?: string;
  quantityCompleted: number;
  quantityWasted: number;
  notes?: string | null;
}) {
  const { batchId, department, workerId, styleNumber, quantityCompleted, quantityWasted, notes } = params;

  const { error: statusError } = await supabase
    .from("batch_department_status")
    .update({ end_verification_status: "pending" })
    .eq("batch_id", batchId)
    .eq("department", department);
  if (statusError) throw statusError;

  const { error: msgError } = await supabase.from("worker_inbox_messages").insert({
    type: "batch_end_verification",
    worker_id: workerId,
    batch_id: batchId,
    department,
    message: `Batch ${styleNumber ?? batchId} end scan confirmed in ${DEPARTMENT_LABELS[department]}: ${quantityCompleted} completed, ${quantityWasted} wasted.`,
    payload: {
      quantity_completed: quantityCompleted,
      quantity_wasted: quantityWasted,
      notes: notes || null,
    },
  });
  if (msgError) throw msgError;
}

/** Numeric payload keys worth rolling up into the stage-13 auto-generated batch report. */
const REPORT_NUMERIC_KEYS = [
  "quantity", "checked_qty", "pass_qty", "defect_qty",
  "pcs_completed", "pcs", "pcs_pressed", "cartons_packed", "waste",
] as const;

/** Priority order for picking the single "pieces done" number out of a department_entries payload — field names differ per department form. */
const PIECE_COUNT_KEYS = [
  "quantity_completed", "total_pcs", "pcs_completed", "pcs_pressed", "pcs", "quantity", "checked_qty",
] as const;

/** Best-effort "pieces" figure for a work entry, across every department's payload shape. Packing counts as cartons x pcs/carton. */
export function getEntryPieceCount(payload: Record<string, unknown>): number | null {
  const cartons = payload.cartons_packed;
  const perCarton = payload.pcs_per_carton;
  if (typeof cartons === "number" && typeof perCarton === "number") return cartons * perCarton;
  for (const key of PIECE_COUNT_KEYS) {
    const value = payload[key];
    if (typeof value === "number") return value;
  }
  return null;
}

export interface DepartmentReportRow {
  department: Department;
  entryCount: number;
  totals: Record<string, number>;
}

export interface BatchReport {
  departments: DepartmentReportRow[];
  qualityVerdicts: Record<QualityVerdict, number>;
  bundleCount: number;
}

/** Rolls up pass/waste/reject numbers per stage for a batch — stage 13's "auto-generated batch report". */
export async function generateBatchReport(batchId: string): Promise<BatchReport> {
  const [{ data: entries }, { data: checks }, { count: bundleCount }] = await Promise.all([
    supabase.from("department_entries").select("department, payload").eq("batch_id", batchId),
    // Latest verdict per bundle (same view BatchPipelineStatusPage uses) — querying
    // bundle_quality_checks directly would double-count bundles re-checked after "alter".
    supabase.from("bundle_quality_status").select("latest_verdict").eq("batch_id", batchId),
    supabase.from("production_bundles").select("id", { count: "exact", head: true }).eq("batch_id", batchId),
  ]);

  const byDept = new Map<Department, DepartmentReportRow>();
  for (const row of entries ?? []) {
    const dept = row.department as Department;
    const payload = (row.payload as Record<string, unknown>) ?? {};
    let entry = byDept.get(dept);
    if (!entry) {
      entry = { department: dept, entryCount: 0, totals: {} };
      byDept.set(dept, entry);
    }
    entry.entryCount += 1;
    for (const key of REPORT_NUMERIC_KEYS) {
      const val = payload[key];
      if (typeof val === "number") {
        entry.totals[key] = (entry.totals[key] ?? 0) + val;
      }
    }
  }

  const qualityVerdicts: Record<QualityVerdict, number> = { confirm: 0, alter: 0, reject: 0 };
  for (const c of checks ?? []) {
    const v = c.latest_verdict as QualityVerdict;
    qualityVerdicts[v] = (qualityVerdicts[v] ?? 0) + 1;
  }

  return {
    departments: [...byDept.values()].sort((a, b) => DEPARTMENT_LABELS[a.department].localeCompare(DEPARTMENT_LABELS[b.department])),
    qualityVerdicts,
    bundleCount: bundleCount ?? 0,
  };
}
