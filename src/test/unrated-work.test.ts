import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { unratedPcs } from "@/lib/unratedWork";

const end = (payload: Record<string, unknown>, department = "stitching", stage = "end") => ({ stage, department, payload });

describe("unratedPcs", () => {
  it("flags END with completed pcs and null rate", () => {
    expect(unratedPcs(end({ quantity_completed: 800, rate_per_piece: null }))).toBe(800);
    expect(unratedPcs(end({ quantity_completed: 800 }))).toBe(800);
  });
  it("is not unrated when a rate exists, even 0", () => {
    expect(unratedPcs(end({ quantity_completed: 800, rate_per_piece: 5 }))).toBe(0);
    expect(unratedPcs(end({ quantity_completed: 800, rate_per_piece: 0 }))).toBe(0);
  });
  it("ignores START rows, zero pcs and non-END-paid departments", () => {
    expect(unratedPcs(end({ quantity_completed: 800 }, "stitching", "start"))).toBe(0);
    expect(unratedPcs(end({ quantity_completed: 0, quantity_wasted: 5 }))).toBe(0);
    expect(unratedPcs(end({ quantity_completed: 800 }, "cutting"))).toBe(0);
  });
});
