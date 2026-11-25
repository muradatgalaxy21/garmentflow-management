import { describe, expect, it } from "vitest";
import { fmtAmount, reportFilename } from "@/lib/reportFormat";

describe("reportFormat", () => {
  it("formats negatives in parentheses", () => {
    expect(fmtAmount(12000)).toBe("12,000");
    expect(fmtAmount(-12000)).toBe("(12,000)");
    expect(fmtAmount(-0.2)).toBe("0");
  });
  it("puts the range in the filename", () => {
    expect(reportFilename("Profit & Loss", "2026-11-01", "2026-11-25")).toBe("profit-and-loss_2026-11-01_to_2026-11-25.csv");
    expect(reportFilename("Payables Aging", "2026-11-01", "2026-11-25", true)).toBe("payables-aging_as-of_2026-11-25.csv");
  });
});
