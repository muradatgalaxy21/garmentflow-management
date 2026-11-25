// Filter / sort / total / history helpers for the Expenses page. Dates are 'YYYY-MM-DD'.
import { splitTotals } from "./financePeriod";

export interface ExpenseLike {
  id: string; category: string; amount: number | string; spent_on: string; method: string;
  paid_to: string | null; notes: string | null; status: string;
  created_by: string | null; created_at: string; modified_by: string | null; modified_at: string;
  posted_by: string | null; posted_at: string | null; self_approved: boolean;
  void_reason: string | null; voided_by_id: string | null; reverses_id: string | null;
}

export type SortKey = "spent_on" | "category" | "paid_to" | "amount";
export type Tab = "all" | "drafts";

export interface Filters { from: string; to: string; cat: string; q: string; tab: Tab }

export function filterExpenses<T extends ExpenseLike>(rows: T[], f: Filters, catLabel: (c: string) => string = (c) => c): T[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((e) =>
    e.spent_on >= f.from && e.spent_on <= f.to &&
    (f.cat === "all" || e.category === f.cat) &&
    (f.tab === "all" || e.status === "draft") &&
    (!q || [catLabel(e.category), e.paid_to, e.notes, e.method].some((s) => s?.toLowerCase().includes(q))));
}

export function sortExpenses<T extends ExpenseLike>(rows: T[], key: SortKey, dir: "asc" | "desc"): T[] {
  const val = (e: T) => key === "amount" ? Number(e.amount) : (e[key] ?? "").toString().toLowerCase();
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
}

/** Total follows the filters; drafts are included and reported separately. */
export function expenseTotals(rows: ExpenseLike[]) {
  const t = splitTotals(rows.map((r) => ({ status: r.status, amount: Number(r.amount) })));
  return { ...t, draftCount: rows.filter((r) => r.status === "draft").length };
}

export function categoryBreakdown(rows: ExpenseLike[]) {
  const m = new Map<string, number>();
  for (const e of rows) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount));
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  return [...m].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount, pct: total > 0 ? (amount / total) * 100 : 0 }));
}

export interface HistoryEvent { at: string; text: string; by: string | null }

/** Lifecycle history built from the row itself (expenses are not in change_log). */
export function expenseHistory(e: ExpenseLike): HistoryEvent[] {
  const ev: HistoryEvent[] = [{ at: e.created_at, text: e.reverses_id ? "Reversal entry created by a void" : "Draft created", by: e.created_by }];
  if (e.modified_at && e.modified_at !== e.created_at && e.modified_by && e.status === "draft")
    ev.push({ at: e.modified_at, text: "Draft edited", by: e.modified_by });
  if (e.posted_at && !e.reverses_id) ev.push({ at: e.posted_at, text: e.self_approved ? "Approved and posted (self-approved by admin)" : "Approved and posted", by: e.posted_by });
  if (e.voided_by_id) ev.push({ at: e.modified_at, text: `Voided${e.void_reason ? `: ${e.void_reason}` : ""}`, by: e.modified_by });
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}
