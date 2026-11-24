import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime } from "@/lib/format";

describe("fmtDate", () => {
  it("formats calendar dates without timezone shift", () => {
    expect(fmtDate("2026-11-24")).toBe("24 Nov 2026");
    expect(fmtDate("2026-01-01")).toBe("1 Jan 2026");
  });
  it("returns a dash for empty or bad input", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("not a date")).toBe("—");
  });
  it("formats time in 12h", () => {
    expect(fmtDateTime(new Date(2026, 10, 24, 15, 7))).toBe("24 Nov 2026, 3:07 PM");
    expect(fmtDateTime(new Date(2026, 10, 24, 0, 30))).toBe("24 Nov 2026, 12:30 AM");
  });
});
