import { describe, it, expect } from "vitest";
import { filterEmployees, paginate, DEFAULT_EMPLOYEE_FILTERS as D, type FilterableEmployee } from "@/lib/employeeFilters";

const e = (name: string, o: Partial<FilterableEmployee> = {}): FilterableEmployee =>
  ({ full_name: name, email: null, phone: null, employee_id: null, department: null, sub_department: null, skills: null, wage_type: "piece_rate", ...o });
const roles: Record<string, string[]> = { Ann: ["admin"], Bob: ["worker"], Cy: ["worker"], Di: ["staff"] };
const list = [e("Ann"), e("Bob", { department: "cutting" }), e("Cy", { wage_type: "monthly_salary", phone: "+923001234567", skills: ["Overlock"] }), e("Di")];
const run = (f: Partial<typeof D>) => filterEmployees(list, { ...D, ...f }, (p) => roles[p.full_name!]).map((p) => p.full_name);

describe("filterEmployees", () => {
  it("filters by role, department, pay type", () => {
    expect(run({ role: "worker" })).toEqual(["Bob", "Cy"]);
    expect(run({ department: "cutting" })).toEqual(["Bob"]);
    expect(run({ department: "none" })).toEqual(["Ann", "Cy", "Di"]);
    expect(run({ pay: "monthly_salary" })).toEqual(["Cy"]);
    expect(run({ pay: "piece_rate" })).toEqual(["Bob", "Di"]); // admin Ann excluded
  });
  it("searches skills and phone digits", () => {
    expect(run({ q: "overlock" })).toEqual(["Cy"]);
    expect(run({ q: "0300 123" })).toEqual(["Cy"]);
  });
});

describe("paginate", () => {
  it("clamps page", () => {
    const r = paginate([1, 2, 3, 4, 5], 9, 2);
    expect(r).toEqual({ rows: [5], page: 3, pages: 3 });
  });
});
