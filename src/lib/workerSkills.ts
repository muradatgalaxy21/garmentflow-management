// Department → skill (phase name used by batch_phases / MultiWorkerLogModal).
// Keep in sync with public.dept_skill() in migration 20261127010000.
const DEPT_SKILL: Record<string, string> = {
  quality: "QC",
  quality_final: "QC",
};
const SUB_DEPT_SKILL: Record<string, string> = { singer: "Singer" };

const title = (s: string) =>
  s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Skills implied by a worker's department / sub-department. */
export function departmentSkills(department?: string | null, subDepartment?: string | null): string[] {
  const out: string[] = [];
  if (department) out.push(DEPT_SKILL[department] ?? title(department));
  if (department === "stitching" && subDepartment && SUB_DEPT_SKILL[subDepartment]) {
    out.push(SUB_DEPT_SKILL[subDepartment]);
  }
  return out;
}

/** Existing skills + department-derived ones, case-insensitive de-dupe, manual skills kept. */
export function mergeDepartmentSkills(
  skills: string[] | null | undefined,
  department?: string | null,
  subDepartment?: string | null,
): string[] {
  const out = [...(skills ?? [])];
  for (const s of departmentSkills(department, subDepartment)) {
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}
