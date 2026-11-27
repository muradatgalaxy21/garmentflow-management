import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { computeEndCost, entryCost, entryPieces, getEntryPieceCount } from "@/lib/departmentEntries";

describe("BUG-6: quantity counted once, at END", () => {
  it("pays rate x completed; wasted is unpaid; unknown rate gives no cost", () => {
    expect(computeEndCost(12, 20)).toBe(240);
    expect(computeEndCost(null, 20)).toBeNull();
    expect(computeEndCost(12, undefined)).toBeNull();
  });

  it("ignores stale cost on legacy START rows of END-paid departments", () => {
    expect(entryCost({ department: "printing", stage: "start", total_cost: 600 })).toBeNull();
    expect(entryCost({ department: "printing", stage: "end", total_cost: 240 })).toBe(240);
    // accessories is single-entry: its cost stays on the entry
    expect(entryCost({ department: "accessories", stage: "start", total_cost: 90 })).toBe(90);
  });

  it("START rows show no piece count; END rows and printing legacy total_quantity do", () => {
    expect(entryPieces({ department: "press", stage: "start", payload: { pcs_pressed: 50 } })).toBeNull();
    expect(entryPieces({ department: "press", stage: "end", payload: { quantity_completed: 20 } })).toBe(20);
    expect(getEntryPieceCount({ total_quantity: 50 })).toBe(50);
  });
});
