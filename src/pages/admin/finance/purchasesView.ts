import { daysBetween } from "@/lib/finance";
import type { Bill, BillBalance, VendorPayment } from "./shared";

export type BillSortKey = "bill_date" | "due_date" | "vendor" | "total" | "balance";
export type BillStatusFilter = "open" | "due" | "overdue" | "partial" | "unpaid" | "paid" | "all";

export const DUE_SOON_DAYS = 7;

/** Voided bills and their credit-note reversals have no payment state. */
export const isLiveBill = (b: Pick<BillBalance, "reverses_id" | "voided_by_id">) => !b.reverses_id && !b.voided_by_id;

/** Unpaid balance due within DUE_SOON_DAYS (or already late). */
export const isDueSoon = (b: BillBalance, asOf: string) =>
  isLiveBill(b) && Number(b.balance) > 0 && !!b.due_date && daysBetween(asOf, b.due_date) <= DUE_SOON_DAYS;

/** Whole days until due (negative = late); null when no due date. */
export const daysToDue = (due: string | null, asOf: string) => (due ? daysBetween(asOf, due) : null);

export function filterSortBills(
  rows: BillBalance[],
  o: { q: string; status: BillStatusFilter; key: BillSortKey; dir: "asc" | "desc"; vendorName: (id: string) => string; asOf: string },
) {
  const q = o.q.trim().toLowerCase();
  const val = (b: BillBalance): string | number =>
    o.key === "vendor" ? o.vendorName(b.vendor_id!).toLowerCase()
    : o.key === "total" ? Number(b.total_amount)
    : o.key === "balance" ? Number(b.balance)
    : (b[o.key] ?? ""); // bills without a due date sort first ascending / last descending
  const sign = o.dir === "asc" ? 1 : -1;
  return rows
    .filter((b) => !q || (b.bill_no ?? "").toLowerCase().includes(q) || o.vendorName(b.vendor_id!).toLowerCase().includes(q))
    .filter((b) =>
      o.status === "all" ? true
      : o.status === "open" ? b.status !== "paid"
      : o.status === "due" ? isDueSoon(b, o.asOf)
      : b.status === o.status)
    .sort((a, b) => {
      const x = val(a), y = val(b);
      return sign * (typeof x === "number" ? x - (y as number) : x.localeCompare(y as string));
    });
}

export interface HistoryEvent { at: string; text: string }

/** Timeline from the bill's own stored audit fields + its payments (vendor_bills isn't in change_log). */
export function billHistory(bill: Bill, payments: VendorPayment[], reversal?: Bill): HistoryEvent[] {
  const ev: HistoryEvent[] = [{ at: bill.created_at, text: bill.reverses_id ? "Credit note created (void)" : "Draft created" }];
  const edited = bill.modified_at && new Date(bill.modified_at).getTime() - new Date(bill.created_at).getTime() > 60_000;
  if (edited && !bill.posted_at) ev.push({ at: bill.modified_at, text: "Draft edited" });
  if (bill.posted_at) ev.push({ at: bill.posted_at, text: bill.self_approved ? "Posted (approved by its creator)" : "Posted (approved)" });
  for (const p of payments) {
    ev.push({ at: p.posted_at ?? p.paid_on, text: `${Number(p.amount) < 0 ? "Payment reversed" : "Payment"} ${p.status === "draft" ? "(draft) " : ""}of ${Math.abs(Number(p.amount)).toLocaleString("en-PK")} on ${p.paid_on}` });
  }
  if (bill.voided_by_id) ev.push({ at: reversal?.created_at ?? bill.modified_at, text: `Voided${bill.void_reason ? `: ${bill.void_reason}` : ""}` });
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}
