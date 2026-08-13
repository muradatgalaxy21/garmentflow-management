import { supabase } from "@/integrations/supabase/client";

export type ClientInboxMessageType = "client_query" | "order_question";
export type ClientInboxMessageStatus = "pending" | "resolved";

export interface ClientInboxMessage {
  id: string;
  type: ClientInboxMessageType;
  status: ClientInboxMessageStatus;
  client_id: string;
  order_id: string | null;
  message: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export async function fetchClientInboxMessages(limit = 100) {
  const { data, error } = await supabase
    .from("client_inbox_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ClientInboxMessage[];
}

export async function fetchMyClientInboxMessages(clientId: string, limit = 50) {
  const { data, error } = await supabase
    .from("client_inbox_messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ClientInboxMessage[];
}

export async function sendClientQuery(clientId: string, message: string, orderId?: string | null) {
  const { error } = await supabase.from("client_inbox_messages").insert({
    type: orderId ? "order_question" : "client_query",
    client_id: clientId,
    order_id: orderId ?? null,
    message,
  });
  if (error) throw error;
}

export async function resolveClientQuery(msg: ClientInboxMessage, adminId: string, note?: string) {
  const { error } = await supabase
    .from("client_inbox_messages")
    .update({
      status: "resolved",
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      resolution_note: note ?? null,
    })
    .eq("id", msg.id);
  if (error) throw error;
}
