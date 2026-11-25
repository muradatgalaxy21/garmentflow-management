import { describe, expect, it } from "vitest";
import { periodRange, splitTotals, trailingMonths } from "@/lib/financePeriod";

describe("finance period", () => {
  it("ranges", () => {
    expect(periodRange("this_month", "2026-11-25")).toEqual({ from: "2026-11-01", to: "2026-11-25" });
    expect(periodRange("last_month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRange("last_3", "2026-02-10")).toEqual({ from: "2025-12-01", to: "2026-02-10" });
  });
  it("trailing months cross year", () => {
    expect(trailingMonths("2026-02-10")).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("splits draft vs posted", () => {
    expect(splitTotals([{ status: "draft", amount: 5 }, { status: "posted", amount: 10 }])).toEqual({ posted: 10, draft: 5, total: 15 });
  });
});
