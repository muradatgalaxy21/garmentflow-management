import { describe, it, expect } from "vitest";
import { dispatchableBatches, remainingPcs } from "@/lib/dispatch";
import { fmtDate } from "@/lib/format";

const batches = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
// dispatch_availability only returns completed batches; "d" (cancelled/in production) is absent.
const avail = [
  { batch_id: "a", packed_pcs: 100, dispatched_pcs: 0 },
  { batch_id: "b", packed_pcs: 100, dispatched_pcs: 100 },
  { batch_id: "c", packed_pcs: 100, dispatched_pcs: 40 },
];

describe("dispatch eligibility", () => {
  it("lists only completed batches with pieces left, with remaining qty", () => {
    expect(dispatchableBatches(batches, avail).map((b) => [b.id, b.remaining])).toEqual([["a", 100], ["c", 60]]);
  });
  it("never goes negative", () => expect(remainingPcs({ packed_pcs: 10, dispatched_pcs: 15 })).toBe(0));
});

describe("report date format", () => {
  it("uses admin format, em dash when missing", () => {
    expect(fmtDate("2026-11-02T09:00:00")).toBe("2 Nov 2026");
    expect(fmtDate(null)).toBe("—");
  });
});
