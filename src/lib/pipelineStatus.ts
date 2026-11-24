import type { Department } from "@/lib/departmentEntries";

export type StageState = "not_started" | "in_progress" | "needs_approval" | "sent_back" | "done";

export interface StageStatusRow {
  department: Department;
  status: "open" | "closed";
  start_verification_status: "pending" | "accepted" | "denied";
  end_verification_status: "none" | "pending" | "accepted" | "denied" | "reprocess";
}

export interface StageColumn {
  key: string;
  short: string;
  full: string;
  departments: Department[];
}

// department_sequence order: sticker/printing/embroidery share order_index 3
// as alternatives, so they're one "Decoration" column.
export const STAGE_GROUPS: { label: string; stages: StageColumn[] }[] = [
  {
    label: "Prep",
    stages: [
      { key: "accessories", short: "Accessories", full: "Accessories", departments: ["accessories"] },
      { key: "cutting", short: "Cutting", full: "Cutting", departments: ["cutting"] },
      { key: "decoration", short: "Decoration", full: "Sticker / Printing / Embroidery", departments: ["sticker", "printing", "embroidery"] },
    ],
  },
  {
    label: "Sewing",
    stages: [
      { key: "quality", short: "Quality", full: "Quality", departments: ["quality"] },
      { key: "lot_bundling", short: "Bundling", full: "Lot Bundling", departments: ["lot_bundling"] },
      { key: "stitching", short: "Stitching", full: "Stitching Hall", departments: ["stitching"] },
      { key: "button_ops", short: "Buttons", full: "Button / Buttonhole / Eyelet / Bartack", departments: ["button_ops"] },
    ],
  },
  {
    label: "Finishing",
    stages: [
      { key: "clipping", short: "Clipping", full: "Clipping", departments: ["clipping"] },
      { key: "press", short: "Press", full: "Press", departments: ["press"] },
      { key: "quality_final", short: "Final QC", full: "Quality (Final)", departments: ["quality_final"] },
      { key: "packing", short: "Packing", full: "Packing", departments: ["packing"] },
    ],
  },
];

/** One stage's state from its batch_department_status row(s); alternatives use whichever row exists. */
export function stageState(rows: StageStatusRow[] | undefined, departments: Department[]): { state: StageState; department?: Department } {
  const row = departments.map((d) => rows?.find((r) => r.department === d)).find(Boolean);
  if (!row) return { state: "not_started" };
  const department = row.department;
  if (row.status === "closed") return { state: "done", department };
  if (row.start_verification_status === "denied" || row.end_verification_status === "denied" || row.end_verification_status === "reprocess") {
    return { state: "sent_back", department };
  }
  if (row.start_verification_status === "pending" || row.end_verification_status === "pending") {
    return { state: "needs_approval", department };
  }
  return { state: "in_progress", department };
}
