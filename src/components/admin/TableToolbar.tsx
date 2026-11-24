import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Search + filter slots (children) + result count + clear.
 *   <TableToolbar search={q} onSearch={setQ} count={rows.length} noun="order"
 *     filtersActive={status !== "all"} onClear={() => { setQ(""); setStatus("all"); }}>
 *     <Select ...status filter... />
 *   </TableToolbar>
 */
export function TableToolbar({ search, onSearch, placeholder = "Search…", count, noun = "result", filtersActive, onClear, children }: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  count?: number;
  noun?: string;
  filtersActive?: boolean;
  onClear?: () => void;
  children?: ReactNode;
}) {
  const canClear = !!search || !!filtersActive;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder.replace(/…$/, "")}
          className="pl-8"
        />
      </div>
      {children}
      {canClear && (
        <Button variant="ghost" size="sm" onClick={onClear ?? (() => onSearch(""))}>
          <X /> Clear
        </Button>
      )}
      {count !== undefined && (
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {count.toLocaleString()} {noun}{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
