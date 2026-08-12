import { describe, it, expect, vi } from "vitest";
import { generateBatchReport } from "@/lib/departmentEntries";

let entryRows: { department: string; payload: Record<string, unknown> }[] = [];
let checkRows: { verdict: string }[] = [];
let bundleCount = 0;

function makeQuery(data: unknown, count?: number) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    then: (resolve: any) => resolve({ data, count }),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "department_entries") return makeQuery(entryRows);
      if (table === "bundle_quality_checks") return makeQuery(checkRows);
      if (table === "production_bundles") return makeQuery(null, bundleCount);
      throw new Error(`unexpected table in test: ${table}`);
    },
  },
}));

describe("generateBatchReport — stage 13 auto-generated batch report", () => {
  it("sums known numeric payload keys per department across multiple entries", async () => {
    entryRows = [
      { department: "clipping", payload: { pcs_completed: 10, garment_type: "Shirt" } },
      { department: "clipping", payload: { pcs_completed: 15 } },
      { department: "press", payload: { pcs_pressed: 20 } },
    ];
    checkRows = [];
    bundleCount = 3;

    const report = await generateBatchReport("batch-1");

    const clipping = report.departments.find((d) => d.department === "clipping");
    expect(clipping?.entryCount).toBe(2);
    expect(clipping?.totals.pcs_completed).toBe(25);

    const press = report.departments.find((d) => d.department === "press");
    expect(press?.totals.pcs_pressed).toBe(20);
    expect(report.bundleCount).toBe(3);
  });

  it("ignores non-numeric and unlisted payload keys", async () => {
    entryRows = [
      { department: "quality", payload: { checked_qty: 50, pass_qty: 45, defect_reason: "Stitching", note: "n/a" } },
    ];
    checkRows = [];
    bundleCount = 0;

    const report = await generateBatchReport("batch-1");
    const quality = report.departments.find((d) => d.department === "quality");
    expect(quality?.totals).toEqual({ checked_qty: 50, pass_qty: 45 });
    expect(quality?.totals.defect_reason).toBeUndefined();
  });

  it("tallies quality verdicts independently of department_entries", async () => {
    entryRows = [];
    checkRows = [
      { verdict: "confirm" }, { verdict: "confirm" }, { verdict: "alter" }, { verdict: "reject" },
    ];
    bundleCount = 4;

    const report = await generateBatchReport("batch-1");
    expect(report.qualityVerdicts).toEqual({ confirm: 2, alter: 1, reject: 1 });
    expect(report.departments).toEqual([]);
  });

  it("returns zeroed verdict counts and empty departments for a batch with no entries yet", async () => {
    entryRows = [];
    checkRows = [];
    bundleCount = 0;

    const report = await generateBatchReport("batch-empty");
    expect(report).toEqual({
      departments: [],
      qualityVerdicts: { confirm: 0, alter: 0, reject: 0 },
      bundleCount: 0,
    });
  });
});
