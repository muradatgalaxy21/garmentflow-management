import { ChevronRight } from "lucide-react";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreMenu } from "@/components/admin/MoreMenu";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ORDER_STATUSES, STATUS_LABEL, isOverdue, type FilterableOrder, type OrderSignals, type OrderStatus } from "@/lib/orderFilters";

// Orders grouped by status. Compact cards; the whole card body opens the order,
// and stage moves go through the "Move to" menu (no drag-and-drop).

interface KanbanOrder extends FilterableOrder {
  quantity: number;
}

interface Props<T extends KanbanOrder> {
  orders: T[];
  signalFor: (id: string) => OrderSignals;
  clientName: (o: T) => string;
  onOpen: (o: T) => void;
  /** Omit when the user can't update orders: the move menu is hidden. */
  onMove?: (o: T, status: OrderStatus) => void;
}

export default function KanbanBoard<T extends KanbanOrder>({ orders, signalFor, clientName, onOpen, onMove }: Props<T>) {
  const columns = ORDER_STATUSES.filter((s) => s !== "cancelled" || orders.some((o) => o.status === s));

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
      {columns.map((status) => {
        const list = orders.filter((o) => o.status === status);
        return (
          <section key={status} aria-label={STATUS_LABEL[status]} className="w-64 shrink-0 snap-start rounded-lg border border-border bg-muted/40 p-2">
            <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-foreground">
              {STATUS_LABEL[status]}
              <span className="text-xs font-normal text-muted-foreground">{list.length}</span>
            </h2>
            <div className="space-y-2">
              {list.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No orders</p>
              ) : (
                list.map((o) => {
                  const sig = signalFor(o.id);
                  return (
                    <div key={o.id} className="flex items-start rounded-md border border-border bg-card hover:border-accent">
                      <button
                        type="button"
                        onClick={() => onOpen(o)}
                        className="min-w-0 flex-1 rounded-md p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Open order #${o.order_number}`}
                      >
                        <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                          <span className="truncate">#{o.order_number}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {clientName(o)} · {o.quantity.toLocaleString()} pcs
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{sig.stage}</span>
                        {(isOverdue(o) || sig.blocked.length > 0) && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {isOverdue(o) && <StatusBadge status="overdue" />}
                            {sig.blocked.length > 0 && <StatusBadge tone="warning">Blocked</StatusBadge>}
                          </span>
                        )}
                      </button>
                      {onMove && (
                        <MoreMenu label={`Move order #${o.order_number}`}>
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {ORDER_STATUSES.filter((s) => s !== o.status).map((s) => (
                            <DropdownMenuItem key={s} onSelect={() => onMove(o, s)}>
                              {STATUS_LABEL[s]}
                            </DropdownMenuItem>
                          ))}
                        </MoreMenu>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
