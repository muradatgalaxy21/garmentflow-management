import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} })); // labels come from departmentEntries, which imports the client
import { DEFAULT_FILTERS, filterOrders, blockReason, stageText, type FilterableOrder } from "@/lib/orderFilters";

const now = new Date(2026, 10, 24, 12); // 24 Nov 2026
const order = (over: Partial<FilterableOrder>): FilterableOrder => ({
  id: "o1", order_number: "ORD-1", party_name: "Mock Apparel", product_summary: "Tees", client_id: "c1",
  status: "pending", created_at: "2026-11-20T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
  expected_delivery: null, tracking_number: null, ...over,
});
const ctx = { blocked: new Set(["o3"]), clientLabel: (id: string) => (id === "c2" ? "Retail PK" : "Mock Apparel"), now };

const orders = [
  order({ id: "o1" }),
  order({ id: "o2", status: "cancelled" }),
  order({ id: "o3", client_id: "c2", order_number: "ORD-3", expected_delivery: "2026-11-23" }),
  order({ id: "o4", status: "shipped", expected_delivery: "2026-11-01", updated_at: "2026-11-23T10:00:00Z", created_at: "2026-08-01T00:00:00Z" }),
];
const ids = (f: Partial<typeof DEFAULT_FILTERS>) => filterOrders(orders, { ...DEFAULT_FILTERS, ...f }, ctx).map((o) => o.id);

describe("filterOrders", () => {
  it("hides cancelled by default, shows them on request", () => {
    expect(ids({})).toEqual(["o1", "o3", "o4"]);
    expect(ids({ status: "all" })).toEqual(["o1", "o2", "o3", "o4"]);
    expect(ids({ status: "cancelled" })).toEqual(["o2"]);
  });
  it("filters by client, created period and search (incl. client label)", () => {
    expect(ids({ client: "c2" })).toEqual(["o3"]);
    expect(ids({ period: "30" })).toEqual(["o1", "o3"]);
    expect(ids({ q: "retail" })).toEqual(["o3"]);
  });
  it("quick filters: blocked, overdue (open orders only), recently changed", () => {
    expect(ids({ quick: "blocked" })).toEqual(["o3"]);
    expect(ids({ quick: "overdue" })).toEqual(["o3"]);
    expect(ids({ quick: "recent" })).toEqual(["o4"]);
  });
});

describe("batch signals", () => {
  const row = (over: object) => ({ batch_id: "b", department: "cutting", status: "open", start_verification_status: "accepted", end_verification_status: "none", opened_at: "2026-11-20", ...over });
  it("blockReason flags verification waits on open departments only", () => {
    expect(blockReason(row({ start_verification_status: "pending" }))).toMatch(/start awaiting/);
    expect(blockReason(row({ end_verification_status: "denied" }))).toMatch(/end denied/);
    expect(blockReason(row({ status: "closed", start_verification_status: "pending" }))).toBeNull();
    expect(blockReason(row({}))).toBeNull();
  });
  it("stageText picks latest open department, else last done", () => {
    expect(stageText([])).toBe("Not started");
    expect(stageText([row({ status: "closed" }), row({ department: "stitching", opened_at: "2026-11-22" })])).toMatch(/Stitch/);
    expect(stageText([row({ status: "closed" })])).toMatch(/done$/);
  });
});
