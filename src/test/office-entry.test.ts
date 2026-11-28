import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { OFFICE_DEPARTMENTS, defaultRateLabel, rateMode, slipTotals, validateOfficeSlip, type OfficeRow } from "@/lib/officeEntry";

const base = { department: "press" as const, workDate: "2026-11-27", today: "2026-11-28", hasPanelRates: false };
const row = (p: Partial<OfficeRow> = {}): OfficeRow => ({ worker_id: "w1", completed: 10, wasted: 0, panel_rate_id: null, ...p });

describe("office entry (Manager Entry)", () => {
  it("covers every department except accessories", () => {
    expect(OFFICE_DEPARTMENTS).not.toContain("accessories");
    expect(OFFICE_DEPARTMENTS).toContain("cutting");
    expect(OFFICE_DEPARTMENTS).toContain("packing");
    expect(OFFICE_DEPARTMENTS).toHaveLength(12);
  });

  it("picks the rate source per department", () => {
    expect(rateMode("cutting")).toBe("panel");
    expect(rateMode("stitching")).toBe("machine");
    expect(rateMode("lot_bundling")).toBe("none");
    expect(rateMode("printing")).toBe("slip");
    expect(rateMode("press")).toBe("slip");
  });

  it("defaults the slip rate to 'default' or the only label", () => {
    expect(defaultRateLabel(["red", "default"])).toBe("default");
    expect(defaultRateLabel(["button"])).toBe("button");
    expect(defaultRateLabel(["red", "blue"])).toBeNull();
    expect(defaultRateLabel([])).toBeNull();
  });

  it("accepts a valid slip, including past dates", () => {
    expect(validateOfficeSlip({ ...base, rows: [row(), row({ worker_id: "w2", completed: 0, wasted: 3 })] })).toBeNull();
    expect(validateOfficeSlip({ ...base, workDate: "2026-10-01", rows: [row()] })).toBeNull();
  });

  it("rejects future dates, empty slips and accessories", () => {
    expect(validateOfficeSlip({ ...base, workDate: "2026-11-29", rows: [row()] })).toMatch(/future/);
    expect(validateOfficeSlip({ ...base, rows: [] })).toMatch(/at least one/);
    expect(validateOfficeSlip({ ...base, department: null, rows: [row()] })).toMatch(/department/);
    expect(validateOfficeSlip({ ...base, department: "accessories", rows: [row()] })).toMatch(/Accessories/);
  });

  it("rejects bad rows with the row number", () => {
    expect(validateOfficeSlip({ ...base, rows: [row(), row({ worker_id: "" })] })).toBe("Row 2: pick the worker");
    expect(validateOfficeSlip({ ...base, rows: [row({ completed: 0, wasted: 0 })] })).toMatch(/Row 1: enter pieces/);
    expect(validateOfficeSlip({ ...base, rows: [row({ completed: -1 })] })).toMatch(/whole numbers/);
    expect(validateOfficeSlip({ ...base, rows: [row({ completed: 2.5 })] })).toMatch(/whole numbers/);
    expect(validateOfficeSlip({ ...base, rows: [row(), row()] })).toMatch(/already on the slip/);
  });

  it("cutting: panel required when the batch has panel rates; same worker allowed once per panel", () => {
    const cut = { ...base, department: "cutting" as const, hasPanelRates: true };
    expect(validateOfficeSlip({ ...cut, rows: [row()] })).toBe("Row 1: pick the panel");
    expect(validateOfficeSlip({ ...cut, rows: [row({ panel_rate_id: "front" }), row({ panel_rate_id: "back" })] })).toBeNull();
    expect(validateOfficeSlip({ ...cut, rows: [row({ panel_rate_id: "front" }), row({ panel_rate_id: "front" })] })).toMatch(/already/);
    expect(validateOfficeSlip({ ...cut, hasPanelRates: false, rows: [row()] })).toBeNull();
  });

  it("totals done and wasted", () => {
    expect(slipTotals([row({ completed: 5, wasted: 1 }), row({ completed: 7, wasted: 2 })])).toEqual({ completed: 12, wasted: 3 });
  });
});

import { entryPieces, isPendingOfficeRow } from "@/lib/departmentEntries";

describe("pending office rows count for nothing until accepted", () => {
  it("detects pending office rows", () => {
    expect(isPendingOfficeRow({ office_entry: true })).toBe(true);
    expect(isPendingOfficeRow({ office_entry: true, accepted: true })).toBe(false);
    expect(isPendingOfficeRow({ quantity_completed: 5 })).toBe(false);
    expect(isPendingOfficeRow(null)).toBe(false);
  });

  it("entryPieces ignores pending office ENDs, counts accepted ones and worker ENDs", () => {
    const end = (payload: Record<string, unknown>) => entryPieces({ department: "press", stage: "end", payload });
    expect(end({ office_entry: true, quantity_completed: 40 })).toBeNull();
    expect(end({ office_entry: true, accepted: true, quantity_completed: 40 })).toBe(40);
    expect(end({ quantity_completed: 12 })).toBe(12);
  });
});
