import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

/** "Nothing here" message with an optional next-step button in `action`. */
export function EmptyState({ icon: Icon = Inbox, title, description, action }: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
