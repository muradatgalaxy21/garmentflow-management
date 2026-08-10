import { supabase } from "@/integrations/supabase/client";
import { closeDepartment, type Department } from "./departmentEntries";

export type InboxMessageType = "batch_start_verification" | "batch_end_verification" | "worker_query";
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
