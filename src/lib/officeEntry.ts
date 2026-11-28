// Office-only entry (docs/PRODUCTION-ROLLOUT.md 6.1): owner/manager type supervisors'
// paper slips into department_entries. Writes and pricing happen in the DB functions
// submit_office_entry / resolve_office_entry (migration 20261128000000); this file holds
// the thin wrappers plus the pure rules the screen uses (tested in office-entry.test.ts).
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENT_LABELS, type Department } from "./departmentEntries";

/** Departments the Manager Entry screen covers: everything except Accessories (a stock issue, not worker pieces). */
export const OFFICE_DEPARTMENTS = (Object.keys(DEPARTMENT_LABELS) as Department[]).filter((d) => d !== "accessories");

export type SkipReason = "before_system" | "not_needed";
export const SKIP_LABELS: Record<SkipReason, string> = {
  before_system: "Done before system",
  not_needed: "Not needed",
};

export interface OfficeRow {
  worker_id: string;
  completed: number;
  wasted: number;
  panel_rate_id?: string | null;
}

/** How the rate is chosen for a slip: per-row panel (cutting), worker's machine (stitching), none, or one label per slip. */
export function rateMode(department: Department): "panel" | "machine" | "none" | "slip" {
  if (department === "cutting") return "panel";
  if (department === "stitching") return "machine";
  if (department === "lot_bundling") return "none";
  return "slip";
}

/** Default slip rate label: 'default' when present, else the only label, else none (user must pick). */
export function defaultRateLabel(labels: string[]): string | null {
  if (labels.includes("default")) return "default";
  return labels.length === 1 ? labels[0] : null;
}

/** First problem with a slip, or null when it can be saved. Mirrors the checks in submit_office_entry. */
export function validateOfficeSlip(input: {
  department: Department | null;
  workDate: string;
  today: string;
  rows: OfficeRow[];
  hasPanelRates: boolean;
}): string | null {
  const { department, workDate, today, rows, hasPanelRates } = input;
  if (!department) return "Pick a department";
  if (department === "accessories") return "Accessories is not entered here";
  if (!workDate) return "Pick the work date";
  if (workDate > today) return "Work date cannot be in the future";
  if (rows.length === 0) return "Add at least one worker row";
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const n = i + 1;
    if (!r.worker_id) return `Row ${n}: pick the worker`;
    if (!Number.isInteger(r.completed) || !Number.isInteger(r.wasted) || r.completed < 0 || r.wasted < 0) {
      return `Row ${n}: pieces must be whole numbers, 0 or more`;
    }
    if (r.completed + r.wasted === 0) return `Row ${n}: enter pieces done or wasted`;
    if (department === "cutting" && hasPanelRates && !r.panel_rate_id) return `Row ${n}: pick the panel`;
    // Cutting may list one worker once per panel; elsewhere one row per worker.
    const key = department === "cutting" ? `${r.worker_id}|${r.panel_rate_id ?? ""}` : r.worker_id;
    if (seen.has(key)) return `Row ${n}: this worker is already on the slip`;
    seen.add(key);
  }
  return null;
}

export function slipTotals(rows: OfficeRow[]) {
  return rows.reduce((t, r) => ({ completed: t.completed + r.completed, wasted: t.wasted + r.wasted }), { completed: 0, wasted: 0 });
}

export async function submitOfficeEntry(params: {
  batchId: string;
  department: Department;
  workDate: string;
  rateLabel: string | null;
  finished: boolean;
  notes: string;
  rows: OfficeRow[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_office_entry", {
    _batch_id: params.batchId,
    _department: params.department,
    _work_date: params.workDate,
    _rate_label: params.rateLabel ?? "",
    _finished: params.finished,
    _notes: params.notes,
    _rows: params.rows.map((r) => ({ ...r, panel_rate_id: r.panel_rate_id || null })),
  });
  if (error) throw error;
  return data as string;
}

/** Admin only (enforced in the DB): accept stamps pay (and closes if the slip said finished); deny deletes the slip's rows. */
export async function resolveOfficeEntry(messageId: string, decision: "accepted" | "denied", note?: string) {
  const { error } = await supabase.rpc("resolve_office_entry", { _msg_id: messageId, _decision: decision, _note: note ?? "" });
  if (error) throw error;
}

export async function setStageSkip(batchId: string, department: Department, reason: SkipReason, note?: string) {
  const { error } = await supabase.rpc("set_stage_skip", { _batch_id: batchId, _department: department, _reason: reason, _note: note ?? "" });
  if (error) throw error;
}

export async function undoStageSkip(batchId: string, department: Department, note?: string) {
  const { error } = await supabase.rpc("undo_stage_skip", { _batch_id: batchId, _department: department, _note: note ?? "" });
  if (error) throw error;
}
