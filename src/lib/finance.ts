// Pure finance helpers (plans/01-finance-and-permissions.md). Dates are
// 'YYYY-MM-DD' strings, compared lexicographically.

export const PAYMENT_METHODS = ["cash", "bank", "cheque", "jazzcash", "easypaisa", "other"] as const;
export const VENDOR_CATEGORIES = ["fabric", "accessories", "printing", "embroidery", "packaging", "transport", "services", "other"] as const;
export const EXPENSE_CATEGORIES = ["rent", "electricity", "gas", "water", "transport", "maintenance", "repairs", "office", "food", "taxes", "misc"] as const;

// Departments where department_entries.total_cost is the worker's per-piece
// wage. Shared with EmployeesPage payout ledger — confirmed with user 2026-08-21.
export const WAGE_BEARING_DEPARTMENTS = [
  "sticker", "quality", "stitching", "button_ops", "clipping", "press", "quality_final", "packing",
] as const;

export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const pkr = (n: number) =>
  "Rs " + (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 0 });

export const today = () => new Date().toISOString().slice(0, 10);

export const monthStart = (d = today()) => d.slice(0, 8) + "01";

export function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export const inRange = (d: string, from?: string, to?: string) =>
  (!from || d >= from) && (!to || d <= to);

export interface LedgerEntry {
  date: string;
  ref: string;
  description: string;
  plus: number; // increases balance (bill for vendor, order for client)
  minus: number; // decreases balance (payment / receipt)
}

export interface LedgerRow extends LedgerEntry {
  balance: number;
}

// Running-balance ledger for a date range. Entries before `from` roll into the
// opening balance, entries after `to` are dropped.
export function buildLedger(opening: number, entries: LedgerEntry[], from?: string, to?: string) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let bal = opening;
  for (const e of sorted) if (from && e.date < from) bal += e.plus - e.minus;
  const openingForRange = bal;
  const rows: LedgerRow[] = [];
  for (const e of sorted) {
    if (!inRange(e.date, from, to)) continue;
    bal += e.plus - e.minus;
    rows.push({ ...e, balance: bal });
  }
  return { opening: openingForRange, rows, closing: bal };
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const late = daysBetween(dueDate, asOf);
  if (late <= 0) return "current";
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  if (late <= 90) return "61-90";
  return "90+";
}

// Apply a party's total payments to its oldest documents first; returns what
// is still outstanding per document. Used for aging, where on-account payments
// (not tied to a bill/order) must still reduce the oldest dues.
export function fifoOutstanding<T extends { date: string; amount: number }>(docs: T[], paid: number) {
  let left = paid;
  return [...docs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const used = Math.min(left, d.amount);
      left -= used;
      return { ...d, outstanding: d.amount - used };
    })
    .filter((d) => d.outstanding > 0);
}

export function agingSummary(docs: { date: string; due: string; amount: number }[], paid: number, asOf: string) {
  const out: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const d of fifoOutstanding(docs, paid)) out[agingBucket(d.due, asOf)] += d.outstanding;
  return out;
}

// ponytail: 30-day month for salary pro-rating; switch to calendar-month split if payroll needs exact figures.
export const proratedSalary = (monthly: number, from: string, to: string) =>
  Math.round((monthly * (daysBetween(from, to) + 1)) / 30);
