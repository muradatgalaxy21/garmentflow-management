import { describe, expect, it } from "vitest";
import { departmentSkills, mergeDepartmentSkills } from "@/lib/workerSkills";

describe("workerSkills", () => {
  it("maps departments to phase names", () => {
    expect(departmentSkills("cutting")).toEqual(["Cutting"]);
    expect(departmentSkills("quality_final")).toEqual(["QC"]);
    expect(departmentSkills("button_ops")).toEqual(["Button Ops"]);
    expect(departmentSkills("stitching", "singer")).toEqual(["Stitching", "Singer"]);
    expect(departmentSkills(null)).toEqual([]);
  });
  it("merges without duplicating and keeps manual skills", () => {
    expect(mergeDepartmentSkills([], "cutting")).toEqual(["Cutting"]);
    expect(mergeDepartmentSkills(null, "packing")).toEqual(["Packing"]);
    expect(mergeDepartmentSkills(["cutting", "Overlock"], "cutting")).toEqual(["cutting", "Overlock"]);
    expect(mergeDepartmentSkills(["Overlock"], null)).toEqual(["Overlock"]);
  });
});
