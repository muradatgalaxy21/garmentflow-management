// Pure helpers for the Batches page: where a batch is in the pipeline, whether it's
// blocked, and the list filters. Kept out of the page so they can be tested.
import type { Department } from "@/lib/departmentEntries";
import { STAGE_GROUPS } from "@/lib/pipelineStatus";

// One stage list, owned by pipelineStatus.ts (STAGE_GROUPS); flattened here for the Batches page.
export const STAGES: { key: string; label: string; departments: Department[] }[] = STAGE_GROUPS.flatMap((g) =>
  g.stages.map((s) => ({ key: s.key, label: s.full, departments: s.departments })),
);

/** One batch_department_status row. */
export interface DeptRow {
  department: string;
  status: string; // open | closed
  start_verification_status: string; // pending | accepted | denied
  end_verification_status: string; // none | pending | accepted | denied | reprocess
  skip_reason?: string | null; // before_system | not_needed (opening position / stage not used)
}

export type StageStatus = "done" | "open" | "none";

/** Per-stage status, stages done, and the furthest stage reached. */
export function batchProgress(rows: DeptRow[]) {
  const byDept = new Map(rows.map((r) => [r.department, r.status]));
  const stages = STAGES.map((s) => {
    const st = s.departments.map((d) => byDept.get(d)).find(Boolean);
    return { ...s, status: (st === "closed" ? "done" : st === "open" ? "open" : "none") as StageStatus };
  });
  const lastIdx = stages.reduce((acc, s, i) => (s.status !== "none" ? i : acc), -1);
  return {
    stages,
    done: stages.filter((s) => s.status === "done").length,
    total: stages.length,
    current: lastIdx >= 0 ? stages[lastIdx] : null,
    packingDone: stages[stages.length - 1].status === "done",
  };
}

export type BatchStateKey = "not_started" | "in_progress" | "blocked" | "paused" | "ready" | "completed" | "cancelled";
export type BlockReason = "approval" | "shortfall" | "stalled";

export const STATE_LABELS: Record<BatchStateKey, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  paused: "Paused",
  ready: "Ready to complete",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Display state of a batch. Order matters: stored end states first, then
 * "packing done" (nothing left to block), then blockers, then progress.
 */
export function batchState(input: {
  status: string;
  rows: DeptRow[];
  shortfall: boolean;
  stalled: boolean;
}): { state: BatchStateKey; reasons: BlockReason[] } {
  const { status, rows } = input;
  if (status === "cancelled") return { state: "cancelled", reasons: [] };
  if (status === "completed") return { state: "completed", reasons: [] };
  if (status === "paused") return { state: "paused", reasons: [] };
  if (batchProgress(rows).packingDone) return { state: "ready", reasons: [] };
  const reasons: BlockReason[] = [];
  if (rows.some((r) => r.start_verification_status === "pending" || r.end_verification_status === "pending")) reasons.push("approval");
  if (input.shortfall) reasons.push("shortfall");
  if (input.stalled) reasons.push("stalled");
  if (reasons.length) return { state: "blocked", reasons };
  return { state: rows.length ? "in_progress" : "not_started", reasons };
}

/** Local calendar day as 'YYYY-MM-DD'. */
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type DueFilter = "all" | "overdue" | "week" | "none";

/**
 * Due-date bucket check. `due` is the order's expected_delivery ('YYYY-MM-DD' or null),
 * `today` likewise. Finished batches (`done`) are never overdue / due soon.
 */
export function matchesDue(due: string | null, filter: DueFilter, today: string, done: boolean): boolean {
  if (filter === "all") return true;
  if (filter === "none") return !due;
  if (!due || done) return false;
  if (filter === "overdue") return due < today;
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + 7);
  return due >= today && due <= isoDay(d);
}
