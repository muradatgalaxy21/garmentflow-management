import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// plans/02 part B. Status changes: run the action, group what it changed in
// change_log, then offer Undo (server enforces same user + 10 minutes).
export async function withUndo<T>(label: string, action: () => Promise<T>, onUndone?: () => void): Promise<T> {
  const { data: since } = await supabase.rpc("server_now");
  const result = await action();
  if (since) {
    const { data: actionId } = await supabase.rpc("tag_my_changes", { _since: since, _label: label });
    if (actionId) offerUndo(label, () => undoAction(actionId), onUndone);
  }
  return result;
}

export async function undoAction(actionId: string) {
  const { error } = await supabase.rpc("undo_action", { _action_id: actionId });
  if (error) throw error;
}

export type FinanceTable = "vendor_bills" | "vendor_payments" | "client_payments" | "expenses";

// Finance drafts: undo = discard (soft delete), creator within 10 minutes.
export function offerFinanceUndo(label: string, table: FinanceTable, id: string, onUndone?: () => void) {
  offerUndo(label, async () => {
    const { error } = await supabase.rpc("discard_finance_draft", { _table: table, _id: id });
    if (error) throw error;
  }, onUndone);
}

function offerUndo(label: string, undo: () => Promise<void>, onUndone?: () => void) {
  toast.success(label, {
    description: "You can undo this for 10 minutes (also from Recent changes).",
    duration: 15000,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await undo();
          toast.success("Undone");
          onUndone?.();
        } catch (e) {
          toast.error("Could not undo", { description: (e as Error).message });
        }
      },
    },
  });
}
