import { supabase } from "@/integrations/supabase/client";

export type Department = "accessories" | "cutting" | "sticker" | "printing" | "embroidery";

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
  payload: Record<string, unknown>;
  totalCost?: number | null;
  inventoryItemId?: string | null;
}) {
  const { error } = await supabase.from("department_entries").insert({
    department: params.department,
    batch_id: params.batchId,
    worker_id: params.workerId,
    payload: params.payload,
    total_cost: params.totalCost ?? null,
    inventory_item_id: params.inventoryItemId ?? null,
  });
  if (error) throw error;
}
