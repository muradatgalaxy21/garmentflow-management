import { AGING_BUCKETS, agingSummary, daysBetween, fifoOutstanding, type AgingBucket } from "@/lib/finance";
import type { Bill, Vendor, VendorPayment } from "./shared";

export type PayableStatus = "overdue" | "due" | "settled";

export interface VendorPayables {
  balance: number;
  aging: Record<AgingBucket, number>;
  overdueAmount: number;
  /** Earliest due date among still-outstanding documents (null when nothing owed). */
  nextDue: string | null;
  /** Whole days the oldest outstanding document is past due (0 if none). */
  daysOverdue: number;
  status: PayableStatus;
}

// Same document model as the Reports payables aging: opening balance is due on creation,
// each bill is due on due_date (or bill_date), and all payments reduce the oldest dues first.
export function vendorPayables(v: Vendor, bills: Bill[], payments: VendorPayment[], asOf: string): VendorPayables {
  const docs = [
    ...(Number(v.opening_balance) > 0 ? [{ date: v.created_at.slice(0, 10), due: v.created_at.slice(0, 10), amount: Number(v.opening_balance) }] : []),
    ...bills.filter((b) => b.vendor_id === v.id).map((b) => ({ date: b.bill_date, due: b.due_date ?? b.bill_date, amount: Number(b.total_amount) })),
  ];
  const paid = payments.filter((p) => p.vendor_id === v.id).reduce((s, p) => s + Number(p.amount), 0);
  const aging = agingSummary(docs, paid, asOf);
  const open = fifoOutstanding(docs, paid);
  const balance = Number(v.opening_balance) + bills.filter((b) => b.vendor_id === v.id).reduce((s, b) => s + Number(b.total_amount), 0) - paid;
  const dues = open.map((d) => d.due).sort();
  const overdueAmount = AGING_BUCKETS.filter((k) => k !== "current").reduce((s, k) => s + aging[k], 0);
  return {
    balance,
    aging,
    overdueAmount,
    nextDue: dues[0] ?? null,
    daysOverdue: dues[0] && dues[0] < asOf ? daysBetween(dues[0], asOf) : 0,
    status: balance <= 0 ? "settled" : overdueAmount > 0 ? "overdue" : "due",
  };
}
