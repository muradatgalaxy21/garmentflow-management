// Period + draft/posted helpers for the Finance Overview. Dates are 'YYYY-MM-DD'.

export type PeriodKey = "this_month" | "last_month" | "last_3" | "last_6";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3", label: "Last 3 months" },
  { value: "last_6", label: "Last 6 months" },
];

const ym = (y: number, m0: number) => {
  const d = new Date(Date.UTC(y, m0, 1));
  return d.toISOString().slice(0, 7);
};

/** Inclusive from/to for a period; "last N months" = current month plus N-1 before it. */
export function periodRange(key: PeriodKey, todayStr: string): { from: string; to: string } {
  const y = +todayStr.slice(0, 4);
  const m0 = +todayStr.slice(5, 7) - 1;
  const endOfMonth = (ymStr: string) => {
    const d = new Date(Date.UTC(+ymStr.slice(0, 4), +ymStr.slice(5, 7), 0));
    return d.toISOString().slice(0, 10);
  };
  if (key === "this_month") return { from: ym(y, m0) + "-01", to: todayStr };
  if (key === "last_month") return { from: ym(y, m0 - 1) + "-01", to: endOfMonth(ym(y, m0 - 1)) };
  const n = key === "last_3" ? 3 : 6;
  return { from: ym(y, m0 - (n - 1)) + "-01", to: todayStr };
}

/** The 6 'YYYY-MM' months ending at the month of `to`. */
export function trailingMonths(to: string, count = 6): string[] {
  const y = +to.slice(0, 4);
  const m0 = +to.slice(5, 7) - 1;
  return Array.from({ length: count }, (_, i) => ym(y, m0 - (count - 1 - i)));
}

/** Sum amounts, split by lifecycle status. `total` includes drafts. */
export function splitTotals(rows: { status: string; amount: number }[]) {
  let posted = 0;
  let draft = 0;
  for (const r of rows) {
    if (r.status === "draft") draft += r.amount;
    else posted += r.amount;
  }
  return { posted, draft, total: posted + draft };
}
