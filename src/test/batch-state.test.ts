import { describe, it, expect } from "vitest";
import { batchProgress, batchState, matchesDue, type DeptRow } from "@/lib/batchState";

const row = (department: string, status: string, start = "accepted", end = "none"): DeptRow =>
  ({ department, status, start_verification_status: start, end_verification_status: end });

describe("batchProgress", () => {
  it("counts closed stages and reports the furthest one; decoration alternatives share a stage", () => {
    const p = batchProgress([row("accessories", "closed"), row("cutting", "closed"), row("printing", "open")]);
    expect(p.done).toBe(2);
    expect(p.total).toBe(11);
    expect(p.current?.key).toBe("decoration");
    expect(p.current?.status).toBe("open");
    expect(p.packingDone).toBe(false);
  });
  it("no rows = not started", () => {
    expect(batchProgress([]).current).toBeNull();
  });
});

describe("batchState", () => {
  const base = { status: "in_progress", rows: [] as DeptRow[], shortfall: false, stalled: false };
  it("stored end states win", () => {
    expect(batchState({ ...base, status: "cancelled", stalled: true }).state).toBe("cancelled");
    expect(batchState({ ...base, status: "completed" }).state).toBe("completed");
  });
  it("packing closed = ready to complete, even if otherwise stalled", () => {
    expect(batchState({ ...base, rows: [row("packing", "closed")], stalled: true }).state).toBe("ready");
  });
  it("collects every blocking reason in order", () => {
    const s = batchState({ ...base, rows: [row("cutting", "open", "accepted", "pending")], shortfall: true, stalled: true });
    expect(s).toEqual({ state: "blocked", reasons: ["approval", "shortfall", "stalled"] });
  });
  it("pending start scan blocks", () => {
    expect(batchState({ ...base, rows: [row("accessories", "open", "pending")] }).reasons).toEqual(["approval"]);
  });
  it("not started vs in progress", () => {
    expect(batchState(base).state).toBe("not_started");
    expect(batchState({ ...base, rows: [row("cutting", "open")] }).state).toBe("in_progress");
  });
});

describe("matchesDue", () => {
  const today = "2026-11-24";
  it("buckets by expected delivery", () => {
    expect(matchesDue("2026-11-20", "overdue", today, false)).toBe(true);
    expect(matchesDue("2026-11-20", "overdue", today, true)).toBe(false); // finished batches aren't overdue
    expect(matchesDue("2026-12-01", "week", today, false)).toBe(true);
    expect(matchesDue("2026-12-02", "week", today, false)).toBe(false);
    expect(matchesDue(null, "none", today, false)).toBe(true);
    expect(matchesDue(null, "overdue", today, false)).toBe(false);
    expect(matchesDue(null, "all", today, false)).toBe(true);
  });
});
