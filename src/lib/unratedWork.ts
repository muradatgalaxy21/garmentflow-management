import { supabase } from "@/integrations/supabase/client";
import { END_PAID_DEPARTMENTS, computeEndCost, type Department } from "./departmentEntries";

/** Minimal department_entries row needed to decide if work is unrated. */
export interface RateCheckRow {
  stage: string;
  department: string;
  payload: unknown;
}

const payloadOf = (p: unknown) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {});

/**
 * IMP-15: pieces an END entry completed with no rate (null — never 0). These must
 * show as "Rate missing", not Rs 0. Wasted pieces are unpaid so they don't count.
 */
export function unratedPcs(e: RateCheckRow): number {
  if (e.stage !== "end" || !END_PAID_DEPARTMENTS.includes(e.department as Department)) return 0;
  const p = payloadOf(e.payload);
  if (typeof p.rate_per_piece === "number") return 0;
  const done = Number(p.quantity_completed);
  return Number.isFinite(done) && done > 0 ? done : 0;
}

export interface UnratedEntry extends RateCheckRow {
  id: string;
  batch_id: string;
  worker_id: string;
  pcs: number;
}

/** All END entries with completed work and no rate. */
export async function fetchUnrated(): Promise<UnratedEntry[]> {
  const { data, error } = await supabase
    .from("department_entries")
    .select("id, batch_id, worker_id, department, stage, payload")
    .eq("stage", "end")
    .in("department", [...END_PAID_DEPARTMENTS]);
  if (error) throw error;
  const out: UnratedEntry[] = [];
  for (const r of data ?? []) {
    const pcs = unratedPcs(r);
    if (pcs > 0) out.push({ ...r, pcs });
  }
  return out;
}

/**
 * After a rate is saved for department+label, fill in null-rate entries of that
 * department. Stitching rates are per sub-department (matched on the worker's
 * profile); other departments only when this is the department's single rate,
 * otherwise we can't tell which label a worker used, so they stay flagged.
 * Only null rates are touched; each row gets repriced_at/repriced_by as audit.
 * total_cost is stamped only for already-accepted ENDs (BUG-6: pay counts on accept).
 */
export async function repriceUnrated(department: Department, label: string, rate: number, rateCountInDept: number, adminId: string) {
  const all = (await fetchUnrated()).filter((e) => e.department === department);
  let rows = all;
  if (department === "stitching") {
    const { data } = await supabase.from("profiles").select("id").eq("sub_department", label);
    const ids = new Set((data ?? []).map((p) => p.id));
    rows = all.filter((e) => ids.has(e.worker_id));
  } else if (rateCountInDept !== 1) {
    // Office slips store the label they were priced with, so those can still be matched.
    rows = all.filter((e) => payloadOf(e.payload).rate_label === label);
  }
  if (rows.length === 0) return { repriced: 0, skipped: all.length - rows.length };

  const { data: st } = await supabase
    .from("batch_department_status")
    .select("batch_id, end_verification_status")
    .eq("department", department)
    .in("batch_id", [...new Set(rows.map((r) => r.batch_id))]);
  const accepted = new Set((st ?? []).filter((s) => s.end_verification_status === "accepted").map((s) => s.batch_id));

  const audit = { repriced_at: new Date().toISOString(), repriced_by: adminId, repriced_label: label };
  for (const r of rows) {
    const payload = { ...payloadOf(r.payload), rate_per_piece: rate, ...audit };
    const upd: { payload: typeof payload; total_cost?: number | null } = { payload };
    // Office slips are accepted one by one (payload.accepted) while the department stays open.
    if (accepted.has(r.batch_id) || payloadOf(r.payload).accepted === true) upd.total_cost = computeEndCost(rate, payload.quantity_completed);
    const { error } = await supabase.from("department_entries").update(upd as never).eq("id", r.id);
    if (error) throw error;
  }
  // START rows too, so later ENDs by these workers pick the rate up via getStartRate.
  const workerIds = [...new Set(rows.map((r) => r.worker_id))];
  const { data: starts } = await supabase
    .from("department_entries")
    .select("id, payload")
    .eq("stage", "start")
    .eq("department", department)
    .in("worker_id", workerIds);
  for (const s of starts ?? []) {
    const p = payloadOf(s.payload);
    if (typeof p.rate_per_piece === "number") continue;
    await supabase.from("department_entries").update({ payload: { ...p, rate_per_piece: rate } } as never).eq("id", s.id);
  }
  return { repriced: rows.length, skipped: all.length - rows.length };
}
