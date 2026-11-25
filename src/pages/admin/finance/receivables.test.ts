import { describe, expect, it } from "vitest";
import { clientReceivable } from "./receivables";

describe("clientReceivable", () => {
  it("applies receipts oldest-first and ages the rest from order date", () => {
    const r = clientReceivable(
      [{ id: "a", label: "A", date: "2026-01-01", amount: 100 }, { id: "b", label: "B", date: "2026-03-01", amount: 200 }],
      150, "2026-03-11",
    );
    expect(r.due).toBe(150);
    expect(r.open.map((o) => [o.id, o.outstanding, o.bucket])).toEqual([["b", 150, "1-30"]]);
    expect(r.aging["1-30"]).toBe(150);
    expect(r.overdueAmount).toBe(150);
    expect(r.oldestDays).toBe(10);
  });
});
