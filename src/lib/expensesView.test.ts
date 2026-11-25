import { describe, expect, it } from "vitest";
import { categoryBreakdown, expenseHistory, expenseTotals, filterExpenses, sortExpenses, type ExpenseLike } from "./expensesView";

const mk = (o: Partial<ExpenseLike>): ExpenseLike => ({
  id: "1", category: "rent", amount: 100, spent_on: "2026-11-10", method: "cash", paid_to: null, notes: null, status: "posted",
  created_by: "u1", created_at: "2026-11-10T08:00:00Z", modified_by: null, modified_at: "2026-11-10T08:00:00Z",
  posted_by: null, posted_at: null, self_approved: false, void_reason: null, voided_by_id: null, reverses_id: null, ...o,
});
const rows = [mk({ id: "a", amount: 500 }), mk({ id: "b", category: "gas", amount: 200, status: "draft", paid_to: "Sui Gas" }), mk({ id: "c", spent_on: "2026-10-01", amount: 50 })];
const f = { from: "2026-11-01", to: "2026-11-30", cat: "all", q: "", tab: "all" as const };

describe("expensesView", () => {
  it("filters by range, search and drafts tab", () => {
    expect(filterExpenses(rows, f).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterExpenses(rows, { ...f, q: "sui" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterExpenses(rows, { ...f, tab: "drafts" }).map((r) => r.id)).toEqual(["b"]);
  });
  it("totals include drafts and report them", () => {
    expect(expenseTotals(filterExpenses(rows, f))).toMatchObject({ total: 700, posted: 500, draft: 200, draftCount: 1 });
  });
  it("sorts by amount", () => {
    expect(sortExpenses(rows, "amount", "asc").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
  it("breakdown percentages", () => {
    expect(categoryBreakdown(filterExpenses(rows, f))[0]).toMatchObject({ category: "rent", pct: expect.closeTo(71.43, 1) });
  });
  it("history orders events", () => {
    const h = expenseHistory(mk({ posted_at: "2026-11-11T08:00:00Z", posted_by: "u2" }));
    expect(h.map((x) => x.text)).toEqual(["Draft created", "Approved and posted"]);
  });
});
