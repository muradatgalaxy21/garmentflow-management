import { AGING_BUCKETS, agingSummary, daysBetween, fifoOutstanding, type AgingBucket } from "@/lib/finance";

export interface RecvOrder { id: string; label: string; date: string; amount: number }

export interface ClientReceivable {
  billed: number;
  received: number;
  due: number;
  aging: Record<AgingBucket, number>;
  overdueAmount: number;
  /** Open orders after FIFO receipts, oldest first. */
  open: (RecvOrder & { outstanding: number; bucket: AgingBucket; days: number })[];
  /** Whole days the oldest open order has been outstanding (0 if none). */
  oldestDays: number;
}

// Same basis as the Reports "Receivables Aging": orders have no due date, so age runs from the
// order date, and all receipts (tied to an order or on account) reduce the oldest orders first.
export function clientReceivable(orders: RecvOrder[], received: number, asOf: string): ClientReceivable {
  const billed = orders.reduce((s, o) => s + o.amount, 0);
  const docs = orders.map((o) => ({ ...o, due: o.date }));
  const aging = agingSummary(docs, received, asOf);
  const open = fifoOutstanding(orders, received).map((o) => {
    const days = Math.max(0, daysBetween(o.date, asOf));
    return { ...o, days, bucket: (days <= 0 ? "current" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+") as AgingBucket };
  });
  return {
    billed, received, due: billed - received, aging,
    overdueAmount: AGING_BUCKETS.filter((k) => k !== "current").reduce((s, k) => s + aging[k], 0),
    open,
    oldestDays: open[0]?.days ?? 0,
  };
}
