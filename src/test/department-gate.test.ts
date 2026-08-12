import { describe, it, expect, vi } from "vitest";
import { checkDepartmentGate, type Department } from "@/lib/departmentEntries";

// Real seeded order — accessories(1) -> cutting(2) -> [sticker|printing|embroidery](3)
// -> quality(4) -> lot_bundling(5) -> stitching(6) -> button_ops(7) -> clipping(8) -> press(9)
// -> quality_final(10) -> packing(11).
const SEQUENCE = [
  { department: "accessories", order_index: 1, parallel_group: 1 },
  { department: "cutting", order_index: 2, parallel_group: 1 },
  { department: "sticker", order_index: 3, parallel_group: 1 },
  { department: "printing", order_index: 3, parallel_group: 1 },
  { department: "embroidery", order_index: 3, parallel_group: 1 },
  { department: "quality", order_index: 4, parallel_group: 2 },
  { department: "lot_bundling", order_index: 5, parallel_group: 3 },
  { department: "stitching", order_index: 6, parallel_group: 4 },
  { department: "button_ops", order_index: 7, parallel_group: 5 },
  { department: "clipping", order_index: 8, parallel_group: 6 },
  { department: "press", order_index: 9, parallel_group: 7 },
  { department: "quality_final", order_index: 10, parallel_group: 8 },
  { department: "packing", order_index: 11, parallel_group: 9 },
];

let statusRows: { department: string; status: "open" | "closed" }[] = [];

function makeQuery(data: unknown) {
  const builder: any = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    then: (resolve: any) => resolve({ data }),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "department_sequence") return makeQuery(SEQUENCE);
      if (table === "batch_department_status") return makeQuery(statusRows);
      throw new Error(`unexpected table in test: ${table}`);
    },
  },
}));

function closedThrough(...departments: Department[]) {
  statusRows = departments.map((department) => ({ department, status: "closed" as const }));
}

describe("checkDepartmentGate — stages 7-9 (button_ops, clipping, press)", () => {
  it("blocks button_ops until stitching is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling");
    const result = await checkDepartmentGate("batch-1", "button_ops");
    expect(result.allowed).toBe(false);
    expect(result.blockedByDepartment).toBe("stitching");
  });

  it("allows button_ops once stitching is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching");
    const result = await checkDepartmentGate("batch-1", "button_ops");
    expect(result.allowed).toBe(true);
  });

  it("blocks clipping until button_ops is closed, even though stitching is done", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching");
    const result = await checkDepartmentGate("batch-1", "clipping");
    expect(result.allowed).toBe(false);
    expect(result.blockedByDepartment).toBe("button_ops");
  });

  it("allows clipping once button_ops is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops");
    const result = await checkDepartmentGate("batch-1", "clipping");
    expect(result.allowed).toBe(true);
  });

  it("blocks press until clipping is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops");
    const result = await checkDepartmentGate("batch-1", "press");
    expect(result.allowed).toBe(false);
    expect(result.blockedByDepartment).toBe("clipping");
  });

  it("allows press once the full chain through clipping is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops", "clipping");
    const result = await checkDepartmentGate("batch-1", "press");
    expect(result.allowed).toBe(true);
  });

  it("accepts any one of the parallel stage-3 alternatives (printing) ahead of button_ops chain", async () => {
    closedThrough("accessories", "cutting", "printing", "quality", "lot_bundling", "stitching");
    const result = await checkDepartmentGate("batch-1", "button_ops");
    expect(result.allowed).toBe(true);
  });
});

describe("checkDepartmentGate — stages 10-11 (quality_final, packing)", () => {
  it("blocks quality_final until press is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops", "clipping");
    const result = await checkDepartmentGate("batch-1", "quality_final");
    expect(result.allowed).toBe(false);
    expect(result.blockedByDepartment).toBe("press");
  });

  it("allows quality_final once press is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops", "clipping", "press");
    const result = await checkDepartmentGate("batch-1", "quality_final");
    expect(result.allowed).toBe(true);
  });

  it("blocks packing until quality_final is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops", "clipping", "press");
    const result = await checkDepartmentGate("batch-1", "packing");
    expect(result.allowed).toBe(false);
    expect(result.blockedByDepartment).toBe("quality_final");
  });

  it("allows packing once the full chain through quality_final is closed", async () => {
    closedThrough("accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops", "clipping", "press", "quality_final");
    const result = await checkDepartmentGate("batch-1", "packing");
    expect(result.allowed).toBe(true);
  });
});
