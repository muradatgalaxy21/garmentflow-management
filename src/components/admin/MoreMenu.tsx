import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "./IconButton";

/**
 * Row "More" menu for less-used actions. Keep the common action visible on the row.
 *   <MoreMenu label={`More actions for ${name}`}>
 *     <DropdownMenuItem onSelect={...}>Permissions</DropdownMenuItem>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem className="text-danger focus:text-danger" onSelect={askConfirm}>Delete</DropdownMenuItem>
 *   </MoreMenu>
 * Destructive items open the existing ConfirmDialog / DeleteConfirmDialog.
 */
export function MoreMenu({ label = "More actions", children }: { label?: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={label}>
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
