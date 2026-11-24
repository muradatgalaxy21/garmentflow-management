import { describe, it, expect } from "vitest";
import { hasPermission } from "@/lib/permissions";

// Must match SQL has_any_permission() in 20261124010000_permission_catalogue_v3.sql.
describe("hasPermission", () => {
  it("admin passes everything", () => {
    expect(hasPermission(true, [], "finance_purchases.approve")).toBe(true);
  });
  it("any action implies view of the same section only", () => {
    expect(hasPermission(false, ["batches.update"], "batches.view")).toBe(true);
    expect(hasPermission(false, ["batches.update"], "batches.delete")).toBe(false);
    expect(hasPermission(false, ["batches.update"], "pipeline.view")).toBe(false);
  });
  it("finance / inbox group aliases match any area", () => {
    expect(hasPermission(false, ["finance_expenses.create"], "finance.view")).toBe(true);
    expect(hasPermission(false, ["finance_expenses.create"], "finance.create")).toBe(true);
    expect(hasPermission(false, ["finance_expenses.create"], "finance_purchases.view")).toBe(false);
    expect(hasPermission(false, ["inbox_clients.view"], "inbox.view")).toBe(true);
    expect(hasPermission(false, ["inbox_clients.view"], "inbox_workers.view")).toBe(false);
  });
});
