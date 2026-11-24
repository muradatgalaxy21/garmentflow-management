// Orders page: filters, quick filters (blocked / overdue / recently changed) and
// per-batch production signals derived from batch_department_status.
import { DEPARTMENT_LABELS, type Department } from "@/lib/departmentEntries";

export type OrderStatus = "pending" | "in_production" | "qc" | "shipped" | "delivered" | "cancelled";
export const ORDER_STATUSES: OrderStatus[] = ["pending", "in_production", "qc", "shipped", "delivered", "cancelled"];
export type QuickFilter = "blocked" | "overdue" | "recent";

export interface FilterableOrder {
  id: string;
  order_number: string;
  party_name: string | null;
  product_summary: string;
  client_id: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  expected_delivery: string | null;
  tracking_number: string | null;
}

export interface OrderFilters {
  q: string;
  /** "active" = everything except cancelled (default view). */
  status: "active" | "all" | OrderStatus;
  client: string; // "all" or client_id
  period: "any" | "7" | "30" | "90"; // created within N days
  quick: QuickFilter | null;
}

export const DEFAULT_FILTERS: OrderFilters = { q: "", status: "active", client: "all", period: "any", quick: null };

const DAY = 86_400_000;
export const RECENT_DAYS = 7;
const DONE: OrderStatus[] = ["shipped", "delivered", "cancelled"];

const localDate = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD

export function isOverdue(o: Pick<FilterableOrder, "expected_delivery" | "status">, now = new Date()) {
  return !!o.expected_delivery && !DONE.includes(o.status) && o.expected_delivery < localDate(now);
}

export function isRecent(o: Pick<FilterableOrder, "updated_at">, now = new Date()) {
  return now.getTime() - new Date(o.updated_at).getTime() < RECENT_DAYS * DAY;
}

export function matchesQuick(o: FilterableOrder, quick: QuickFilter, blocked: Set<string>, now = new Date()) {
  if (quick === "blocked") return blocked.has(o.id);
  if (quick === "overdue") return isOverdue(o, now);
  return isRecent(o, now);
}

export function filterOrders<T extends FilterableOrder>(
  orders: T[],
  f: OrderFilters,
  ctx: { blocked: Set<string>; clientLabel: (id: string) => string; now?: Date },
): T[] {
  const now = ctx.now ?? new Date();
  const q = f.q.trim().toLowerCase();
  return orders.filter((o) => {
    if (f.status === "active" ? o.status === "cancelled" : f.status !== "all" && o.status !== f.status) return false;
    if (f.client !== "all" && o.client_id !== f.client) return false;
    if (f.period !== "any" && now.getTime() - new Date(o.created_at).getTime() > Number(f.period) * DAY) return false;
    if (f.quick && !matchesQuick(o, f.quick, ctx.blocked, now)) return false;
    if (!q) return true;
    return [o.order_number, o.party_name, o.product_summary, o.tracking_number, ctx.clientLabel(o.client_id)]
      .some((s) => s?.toLowerCase().includes(q));
  });
}

export interface DeptStatusRow {
  batch_id: string;
  department: string;
  status: string;
  start_verification_status: string;
  end_verification_status: string;
  opened_at: string;
}

/** Per-order production context shown in list rows, Kanban cards and the detail view. */
export interface OrderSignals {
  /** e.g. "Batch ST-01 · Cutting", "2 batches · Stitching Hall", "No batch yet" */
  stage: string;
  blocked: string[];
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending", in_production: "In production", qc: "Quality check",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled",
};

const deptLabel =(d: string) => DEPARTMENT_LABELS[d as Department] ?? d;

/** Why an open department can't move on until a supervisor acts, or null. */
export function blockReason(r: DeptStatusRow): string | null {
  if (r.status !== "open") return null;
  const d = deptLabel(r.department);
  if (r.start_verification_status === "denied") return `${d}: start denied`;
  if (r.start_verification_status === "pending") return `${d}: start awaiting verification`;
  if (r.end_verification_status === "pending") return `${d}: end awaiting verification`;
  if (r.end_verification_status === "denied") return `${d}: end denied`;
  return null;
}

/** Stage text for one batch: latest open department, else last closed one. */
export function stageText(rows: DeptStatusRow[]): string {
  const latest = (list: DeptStatusRow[]) => list.reduce<DeptStatusRow | null>((a, r) => (!a || r.opened_at > a.opened_at ? r : a), null);
  const open = latest(rows.filter((r) => r.status === "open"));
  if (open) return deptLabel(open.department);
  const last = latest(rows);
  return last ? `${deptLabel(last.department)} done` : "Not started";
}
