import { useState } from "react";
import { History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConfirm } from "@/components/ConfirmDialog";
import { undoAction } from "@/lib/undo";

type Action = { action_id: string; label: string; changed_at: string; changes: number };

// plans/02 part B: my undoable status changes from the last 10 minutes.
// Finance drafts are undone from their own rows (Undo button), not here.
export default function RecentChanges() {
  const [items, setItems] = useState<Action[] | null>(null);
  const confirm = useConfirm();

  const load = async () => {
    const { data, error } = await supabase.rpc("my_recent_actions");
    if (error) toast.error("Could not load recent changes", { description: error.message });
    setItems(data ?? []);
  };

  const undo = async (a: Action) => {
    if (!(await confirm({ title: `Undo "${a.label}"?`, description: "Restores the values from before your change." }))) return;
    try {
      await undoAction(a.action_id);
      toast.success("Undone. Refresh the page to see it.");
    } catch (e) {
      toast.error("Could not undo", { description: (e as Error).message });
    }
    load();
  };

  return (
    <Popover onOpenChange={(o) => o && load()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Recent changes (undo)">
          <History className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-medium">Recent changes</p>
        <p className="text-xs text-muted-foreground mb-2">Your status changes from the last 10 minutes.</p>
        {items === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {items?.length === 0 && <p className="text-sm text-muted-foreground">Nothing to undo.</p>}
        <ul className="space-y-2">
          {items?.map((a) => (
            <li key={a.action_id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate">{a.label}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.changed_at).toLocaleTimeString()}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => undo(a)}><Undo2 className="w-3.5 h-3.5 mr-1" /> Undo</Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
