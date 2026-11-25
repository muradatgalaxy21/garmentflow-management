import { describe, it, expect } from "vitest";
import { vendorPayables } from "@/pages/admin/finance/vendorPayables";
import type { Bill, Vendor, VendorPayment } from "@/pages/admin/finance/shared";

const v = { id: "v1", opening_balance: 0, created_at: "2026-01-01T00:00:00Z" } as Vendor;
const bill = (total: number, bill_date: string, due_date: string | null) => ({ vendor_id: "v1", total_amount: total, bill_date, due_date }) as Bill;
const pay = (amount: number) => ({ vendor_id: "v1", amount }) as VendorPayment;

describe("vendorPayables", () => {
  it("flags overdue, applies payments to oldest first, reports next due", () => {
    const r = vendorPayables(v, [bill(1000, "2026-09-01", "2026-10-01"), bill(500, "2026-11-01", "2026-12-15")], [pay(400)], "2026-11-25");
    expect(r.balance).toBe(1100);
    expect(r.status).toBe("overdue");
    expect(r.overdueAmount).toBe(600);
    expect(r.nextDue).toBe("2026-10-01");
    expect(r.daysOverdue).toBe(55);
  });
  it("settled when paid up, due when nothing late", () => {
    expect(vendorPayables(v, [bill(100, "2026-11-01", "2026-12-01")], [pay(100)], "2026-11-25").status).toBe("settled");
    expect(vendorPayables(v, [bill(100, "2026-11-01", "2026-12-01")], [], "2026-11-25").status).toBe("due");
  });
});
