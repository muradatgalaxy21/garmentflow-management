import { supabase } from "@/integrations/supabase/client";
import { closeDepartment, recordInventoryMovement, stampEndCost, type Department } from "./departmentEntries";

export type InboxMessageType = "batch_start_verification" | "batch_end_verification" | "entry_approval" | "office_entry" | "worker_query";
export type InboxMessageStatus = "pending" | "accepted" | "denied" | "reprocess" | "resolved";

export interface InboxMessage {
  id: string;
  type: InboxMessageType;
  status: InboxMessageStatus;
  batch_id: string | null;
  department: Department | null;
  worker_id: string;
  message: string;
  payload: Record<string, unknown> | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

// Verification messages always outrank plain worker queries in the inbox.
const TYPE_PRIORITY: Record<InboxMessageType, number> = {
  batch_start_verification: 0,
  batch_end_verification: 0,
  entry_approval: 0,
  office_entry: 0,
  worker_query: 1,
};

export function sortInboxMessages(messages: InboxMessage[]) {
  return [...messages].sort((a, b) => {
    const priorityDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function fetchInboxMessages(limit = 50) {
  const { data, error } = await supabase
    .from("worker_inbox_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return sortInboxMessages((data ?? []) as InboxMessage[]);
}

export async function fetchMyInboxMessages(workerId: string, limit = 50) {
  const { data, error } = await supabase
    .from("worker_inbox_messages")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as InboxMessage[];
}

export async function sendWorkerQuery(
  workerId: string,
  message: string,
  batchId?: string | null,
  department?: Department | null
) {
  const { error } = await supabase.from("worker_inbox_messages").insert({
    type: "worker_query",
    worker_id: workerId,
    message,
    batch_id: batchId ?? null,
    department: department ?? null,
  });
  if (error) throw error;
}

/** Admin: accept or deny a batch-start verification. Accepting enables the End QR scan. */
export async function resolveStartVerification(
  msg: InboxMessage,
  decision: "accepted" | "denied",
  adminId: string,
  note?: string
) {
  if (!msg.batch_id || !msg.department) throw new Error("Message missing batch/department");

  const { error: statusError } = await supabase
    .from("batch_department_status")
    .update({
      start_verification_status: decision,
      end_enabled: decision === "accepted",
    })
    .eq("batch_id", msg.batch_id)
    .eq("department", msg.department);
  if (statusError) throw statusError;

  const { error } = await supabase
    .from("worker_inbox_messages")
    .update({
      status: decision,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      resolution_note: note ?? null,
    })
    .eq("id", msg.id);
  if (error) throw error;
}

/** Admin: accept (close department), deny, or reprocess (send back for rework) a batch-end verification. */
export async function resolveEndVerification(
  msg: InboxMessage,
  decision: "accepted" | "denied" | "reprocess",
  adminId: string,
  note?: string
) {
  if (!msg.batch_id || !msg.department) throw new Error("Message missing batch/department");

  if (decision === "accepted") {
    await closeDepartment(msg.batch_id, msg.department, adminId);
    const { error } = await supabase
      .from("batch_department_status")
      .update({ end_verification_status: "accepted" })
      .eq("batch_id", msg.batch_id)
      .eq("department", msg.department);
    if (error) throw error;
    // Worker pay is only counted once the END is accepted (BUG-6).
    await stampEndCost(msg.batch_id, msg.department, msg.worker_id);
  } else {
    // Denied or sent back for reprocessing: department stays open, worker resubmits the end scan.
    const { error } = await supabase
      .from("batch_department_status")
      .update({ end_verification_status: "none" })
      .eq("batch_id", msg.batch_id)
      .eq("department", msg.department);
    if (error) throw error;
  }

  const { error } = await supabase
    .from("worker_inbox_messages")
    .update({
      status: decision,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      resolution_note: note ?? null,
    })
    .eq("id", msg.id);
  if (error) throw error;
}

/**
 * Admin: approve or deny a stock-consuming entry (accessories/cutting). Stock is
 * checked and deducted HERE, not when the worker saves (BUG-7) — offline scans
 * may sync after stock is gone. Insufficient stock blocks approval.
 */
export async function resolveEntryApproval(
  msg: InboxMessage,
  decision: "accepted" | "denied",
  adminId: string,
  note?: string
) {
  const entryId = msg.payload?.entry_id;
  if (typeof entryId !== "string" || !msg.batch_id || !msg.department) throw new Error("Message missing entry/batch/department");

  const { data: entry, error: entryError } = await supabase
    .from("department_entries")
    .select("id, inventory_item_id, payload")
    .eq("id", entryId)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry) throw new Error("The entry no longer exists");
  const payload = (entry.payload as Record<string, unknown>) ?? {};

  let stockStatus: string | null = null;
  if (decision === "accepted") {
    const qty = typeof payload.quantity === "number" ? payload.quantity : 0;
    if (payload.stock_status === "pending" && entry.inventory_item_id && qty > 0) {
      const { data: item, error: itemError } = await supabase
        .from("inventory_items")
        .select("name, unit, quantity_on_hand")
        .eq("id", entry.inventory_item_id)
        .maybeSingle();
      if (itemError) throw itemError;
      const onHand = Number(item?.quantity_on_hand ?? 0);
      if (qty > onHand) {
        throw new Error(`Insufficient stock for ${item?.name ?? "item"}: ${onHand} ${item?.unit ?? ""} available, ${qty} needed. Restock first.`);
      }
      await recordInventoryMovement(entry.inventory_item_id, qty, "out", msg.worker_id, `${msg.department} entry approved for batch ${msg.batch_id}`);
    }
    if (payload.stock_status === "pending") stockStatus = "deducted";

    // Accessories is a single-entry stage (no START/END): the first approval clears it for the next department.
    if (msg.department === "accessories") {
      const existing = await supabase
        .from("batch_department_status")
        .select("batch_id")
        .eq("batch_id", msg.batch_id)
        .eq("department", "accessories")
        .maybeSingle();
      const closed = {
        status: "closed",
        closed_by: adminId,
        closed_at: new Date().toISOString(),
        start_verification_status: "accepted",
        end_enabled: true,
        end_verification_status: "accepted",
      };
      const { error } = existing.data
        ? await supabase.from("batch_department_status").update(closed).eq("batch_id", msg.batch_id).eq("department", "accessories")
        : await supabase.from("batch_department_status").insert({ batch_id: msg.batch_id, department: "accessories", opened_by: msg.worker_id, ...closed });
      if (error) throw error;
    }
  } else if (payload.stock_status === "pending") {
    stockStatus = "denied";
  }

  if (stockStatus) {
    const { error } = await supabase
      .from("department_entries")
      .update({ payload: { ...payload, stock_status: stockStatus } })
      .eq("id", entryId);
    if (error) throw error;
  }

  const { error } = await supabase
    .from("worker_inbox_messages")
    .update({ status: decision, resolved_by: adminId, resolved_at: new Date().toISOString(), resolution_note: note ?? null })
    .eq("id", msg.id);
  if (error) throw error;
}

/** Admin: mark a plain worker query as resolved (optionally with a reply note). */
export async function resolveWorkerQuery(msg: InboxMessage, adminId: string, note?: string) {
  const { error } = await supabase
    .from("worker_inbox_messages")
    .update({
      status: "resolved",
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      resolution_note: note ?? null,
    })
    .eq("id", msg.id);
  if (error) throw error;
}

/** Admin: save a reply on a worker query without resolving it. */
export async function replyWorkerQuery(msg: InboxMessage, note: string) {
  const { error } = await supabase.from("worker_inbox_messages").update({ resolution_note: note }).eq("id", msg.id);
  if (error) throw error;
}

/** Admin: put a resolved worker query back to pending (keeps the earlier reply). */
export async function reopenWorkerQuery(msg: InboxMessage) {
  const { error } = await supabase
    .from("worker_inbox_messages")
    .update({ status: "pending", resolved_by: null, resolved_at: null })
    .eq("id", msg.id);
  if (error) throw error;
}
