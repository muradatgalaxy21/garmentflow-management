import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { groupRecentEntries } = await import("@/pages/factory/FactoryDashboard");

type Entry = Parameters<typeof groupRecentEntries>[0][number];
const e = (id: string, batch_id: string, department: string, stage: "start" | "end"): Entry => ({
  id, batch_id, department: department as Entry["department"], stage, style_number: "S", payload: {}, total_cost: null,
  created_at: "", done: stage === "end",
});

describe("groupRecentEntries (IMP-9)", () => {
  it("merges start+end of one batch+department into one done card", () => {
    // newest first: END then START
    const out = groupRecentEntries([e("2", "b1", "cutting", "end"), e("1", "b1", "cutting", "start")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "2", done: true });
  });

  it("start only stays in progress; other batch/department kept separate", () => {
    const out = groupRecentEntries([e("3", "b2", "cutting", "start"), e("2", "b1", "stitching", "start"), e("1", "b1", "cutting", "end")]);
    expect(out.map((c) => [c.id, c.done])).toEqual([["3", false], ["2", false], ["1", true]]);
  });

  it("caps at 5 cards", () => {
    const many = Array.from({ length: 8 }, (_, i) => e(String(i), `b${i}`, "cutting", "start"));
    expect(groupRecentEntries(many)).toHaveLength(5);
  });
});
