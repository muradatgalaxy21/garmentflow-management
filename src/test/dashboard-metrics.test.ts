import { describe, it, expect } from "vitest";
import { stallCutoff, phaseQueues, bottleneckOf } from "@/lib/dashboardMetrics";

const H = 3_600_000;

describe("stallCutoff (24h, Sunday doesn't count)", () => {
  it("plain weekday = 24h back", () => {
    const now = new Date(2026, 10, 25, 10, 0); // Wed 25 Nov 2026
    expect(now.getTime() - stallCutoff(now).getTime()).toBe(24 * H);
  });
  it("Monday 10:00 reaches back over Sunday to Saturday 10:00 minus the Sunday gap", () => {
    const now = new Date(2026, 10, 23, 10, 0); // Mon 23 Nov 2026
    // 24h of work time = Mon 0-10h (10h) + Sat 10h..24h (14h): cutoff = Sat 10:00
    expect(stallCutoff(now)).toEqual(new Date(2026, 10, 21, 10, 0));
  });
});

describe("phaseQueues / bottleneckOf", () => {
  const phases = [
    { id: "cut", name: "Cutting", sequence_order: 1 },
    { id: "sew", name: "Stitching", sequence_order: 2 },
    { id: "print", name: "Printing", sequence_order: 3 },
    { id: "qc", name: "QC", sequence_order: 4 },
  ];
  const batch = [{ id: "b1", total_quantity: 100 }];
  const t = (phase_id: string, done: number, wasted = 0) => ({ batch_id: "b1", phase_id, quantity_completed: done, quantity_wasted: wasted });

  it("counts pieces done before a phase but not yet through it", () => {
    const q = phaseQueues(phases, batch, [t("cut", 100), t("sew", 60, 10)]);
    expect(q.find((x) => x.name === "Stitching")?.waiting).toBe(30);
    expect(q.find((x) => x.name === "Printing")?.waiting).toBe(60); // next phase, not started
    expect(bottleneckOf(q)?.name).toBe("Printing");
  });
  it("skips an optional phase that later phases already passed", () => {
    const q = phaseQueues(phases, batch, [t("cut", 100), t("sew", 100), t("qc", 50)]);
    expect(q.find((x) => x.name === "Printing")?.waiting).toBe(0);
    expect(q.find((x) => x.name === "QC")?.waiting).toBe(50);
  });
  it("no logs -> no bottleneck", () => {
    expect(bottleneckOf(phaseQueues(phases, batch, []))).toBeNull();
  });
});
