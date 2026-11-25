// Employees page: filter + paginate the directory (pure, unit-tested).
export interface FilterableEmployee {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  employee_id: string | null;
  department: string | null;
  sub_department: string | null;
  skills: string[] | null;
  wage_type: "piece_rate" | "monthly_salary" | null;
}

export interface EmployeeFilters {
  q: string;
  role: string; // "all" | admin | manager | staff | worker | "none"
  department: string; // "all" | "none" | department key
  pay: "all" | "piece_rate" | "monthly_salary";
}
export const DEFAULT_EMPLOYEE_FILTERS: EmployeeFilters = { q: "", role: "all", department: "all", pay: "all" };
export const PAGE_SIZE = 25;

export function filterEmployees<T extends FilterableEmployee>(list: T[], f: EmployeeFilters, rolesOf: (p: T) => string[]): T[] {
  const q = f.q.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  return list.filter((p) => {
    const roles = rolesOf(p);
    if (f.role === "none" ? roles.length > 0 : f.role !== "all" && !roles.includes(f.role)) return false;
    if (f.department === "none" ? !!p.department : f.department !== "all" && p.department !== f.department) return false;
    // Admins have no pay type, so any pay filter hides them.
    if (f.pay !== "all" && (roles.includes("admin") || (p.wage_type ?? "piece_rate") !== f.pay)) return false;
    if (!q) return true;
    const digits = p.phone?.replace(/\D/g, "") ?? "";
    return [p.full_name, p.email, p.employee_id, p.department?.replace("_", " "), p.sub_department?.replace("_", " "), ...(p.skills ?? []), ...roles]
      .some((v) => v?.toLowerCase().includes(q))
      || (qDigits.length >= 3 && (digits.includes(qDigits) || digits.includes(qDigits.replace(/^0/, "92"))));
  });
}

export function paginate<T>(list: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(Math.max(1, page), pages);
  return { rows: list.slice((cur - 1) * size, cur * size), page: cur, pages };
}
