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
  | "press";
export type EntryStage = "start" | "end";
export type SubDepartment = "singer" | "overlock" | "flatlock" | "lock_stitch";
export type ButtonOperation = "button" | "buttonhole" | "eyelet" | "bartack";

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
  entry: { id: string; inventory_item_id?: string | null; payload?: Record<string, unknown> | null },
  performedBy: string
) {
  const { error } = await supabase.from("department_entries").delete().eq("id", entry.id);
  if (error) throw error;

  const payload = entry.payload ?? {};
  const qty = typeof payload.quantity === "number" ? payload.quantity : 0;
  if (entry.inventory_item_id && qty > 0) {
    await recordInventoryMovement(entry.inventory_item_id, qty, "in", performedBy, "Restock — deleted work entry");
  }
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
