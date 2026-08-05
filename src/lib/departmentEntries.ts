import { supabase } from "@/integrations/supabase/client";

export type Department = "accessories" | "cutting" | "sticker" | "printing" | "embroidery";
export type EntryStage = "start" | "end";

export const DEPARTMENT_LABELS: Record<Department, string> = {
  accessories: "Accessories",
  cutting: "Cutting",
  sticker: "Sticker",
  printing: "Printing",
  embroidery: "Embroidery",
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

export async function getDepartmentStatus(batchId: string, department: Department) {
  const { data } = await supabase
    .from("batch_department_status")
    .select("status, opened_by")
    .eq("batch_id", batchId)
    .eq("department", department)
    .maybeSingle();
  return data as { status: "open" | "closed"; opened_by: string } | null;
}

export async function openDepartment(batchId: string, department: Department, workerId: string) {
  const existing = await getDepartmentStatus(batchId, department);
  if (existing) return;
  const { error } = await supabase.from("batch_department_status").insert({
    batch_id: batchId,
    department,
    status: "open",
    opened_by: workerId,
  });
  if (error) throw error;
}

export async function closeDepartment(batchId: string, department: Department, workerId: string) {
  const { error } = await supabase
    .from("batch_department_status")
    .update({ status: "closed", closed_by: workerId, closed_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("department", department);
  if (error) throw error;
}
