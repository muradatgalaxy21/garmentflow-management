import { describe, it, expect } from "vitest";
import { agingBucket, agingSummary, buildLedger, fifoOutstanding, proratedSalary } from "@/lib/finance";
import { hasPermission } from "@/lib/permissions";
import { csvCell } from "@/lib/export";

describe("finance helpers", () => {
  it("ledger rolls pre-range entries into opening and keeps running balance", () => {
    const l = buildLedger(
      1000,
      [
        { date: "2026-10-05", ref: "B1", description: "bill", plus: 5000, minus: 0 },
        { date: "2026-11-02", ref: "P1", description: "pay", plus: 0, minus: 2000 },
        { date: "2026-11-10", ref: "B2", description: "bill", plus: 300, minus: 0 },
        { date: "2026-12-01", ref: "B3", description: "later", plus: 999, minus: 0 },
      ],
      "2026-11-01",
      "2026-11-30",
    );
    expect(l.opening).toBe(6000);
    expect(l.rows.map((r) => r.balance)).toEqual([4000, 4300]);
    expect(l.closing).toBe(4300);
  });

  it("aging buckets by days past due", () => {
    expect(agingBucket("2026-11-21", "2026-11-21")).toBe("current");
    expect(agingBucket("2026-11-01", "2026-11-21")).toBe("1-30");
    expect(agingBucket("2026-08-01", "2026-11-21")).toBe("90+");
  });

  it("fifo applies payments to oldest docs first", () => {
    const out = fifoOutstanding(
      [{ date: "2026-11-01", amount: 100 }, { date: "2026-10-01", amount: 50 }],
      70,
    );
    expect(out).toEqual([{ date: "2026-11-01", amount: 100, outstanding: 80 }]);
    const s = agingSummary(
      [{ date: "2026-10-01", due: "2026-10-01", amount: 50 }, { date: "2026-11-20", due: "2026-12-20", amount: 100 }],
      20,
      "2026-11-21",
    );
    expect(s["31-60"]).toBe(30);
    expect(s.current).toBe(100);
  });

  it("prorates monthly salary by inclusive days", () => {
    expect(proratedSalary(30000, "2026-11-01", "2026-11-30")).toBe(30000);
    expect(proratedSalary(30000, "2026-11-01", "2026-11-15")).toBe(15000);
  });

  it("permission rules match SQL has_permission", () => {
    expect(hasPermission(true, [], "finance.edit")).toBe(true);
    expect(hasPermission(false, ["finance.edit"], "finance.view")).toBe(true);
    expect(hasPermission(false, ["finance.view"], "finance.edit")).toBe(false);
    expect(hasPermission(false, ["orders"], "inventory")).toBe(false);
  });

  it("csv neutralises formula-looking text but keeps numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell(-500)).toBe(`"-500"`);
    expect(csvCell('Ali "Kapra"')).toBe(`"Ali ""Kapra"""`);
  });
});
