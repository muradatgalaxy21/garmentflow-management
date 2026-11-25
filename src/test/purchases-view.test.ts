import { describe, expect, it } from "vitest";
import { filterSortBills, isDueSoon, billHistory } from "@/pages/admin/finance/purchasesView";
import type { Bill, BillBalance } from "@/pages/admin/finance/shared";

const mk = (o: Partial<BillBalance>) =>
  ({ id: "x", vendor_id: "v1", bill_no: "B1", bill_date: "2026-11-01", due_date: null, total_amount: 100, paid_amount: 0, balance: 100, status: "unpaid", reverses_id: null, voided_by_id: null, ...o }) as BillBalance;
const names: Record<string, string> = { v1: "Alpha Fabrics", v2: "Zed Threads" };
const base = { q: "", status: "all" as const, key: "bill_date" as const, dir: "desc" as const, vendorName: (id: string) => names[id], asOf: "2026-11-25" };

describe("purchases view", () => {
  const rows = [
    mk({ id: "a", bill_no: "A-1", due_date: "2026-11-20", balance: 50 }),
    mk({ id: "b", bill_no: "B-2", vendor_id: "v2", due_date: "2026-11-30", balance: 200, status: "partial" }),
    mk({ id: "c", bill_no: "C-3", due_date: "2026-12-30", balance: 0, status: "paid" }),
  ];
  it("searches bill no. and vendor", () => {
    expect(filterSortBills(rows, { ...base, q: "zed" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterSortBills(rows, { ...base, q: "c-3" }).map((r) => r.id)).toEqual(["c"]);
  });
  it("due view keeps unpaid balances due within 7 days or late", () => {
    expect(filterSortBills(rows, { ...base, status: "due", key: "due_date", dir: "asc" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(isDueSoon(mk({ due_date: "2026-11-30", voided_by_id: "z" }), "2026-11-25")).toBe(false);
  });
  it("sorts by balance", () => {
    expect(filterSortBills(rows, { ...base, key: "balance", dir: "desc" }).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("history lists created and posted in order", () => {
    const bill = { created_at: "2026-11-01T10:00:00Z", modified_at: "2026-11-01T10:00:00Z", posted_at: "2026-11-02T10:00:00Z", reverses_id: null, voided_by_id: null, self_approved: false } as Bill;
    expect(billHistory(bill, []).map((e) => e.text)).toEqual(["Draft created", "Posted (approved)"]);
  });
});
