import { describe, expect, it } from "vitest";
import { filterRfqs, type RfqLike } from "@/lib/rfqInbox";

const row = (name: string, status: RfqLike["status"], created_at: string, extra: Partial<RfqLike> = {}): RfqLike => ({
  name, email: `${name.toLowerCase()}@x.test`, company: null, phone: null, product_type: null,
  message: "hello", status, created_at, ...extra,
});

const rows = [
  row("A", "new", "2026-11-20T10:00:00Z"),
  row("B", "contacted", "2026-11-22T10:00:00Z", { company: "Acme Ltd" }),
  row("C", "quoted", "2026-11-21T10:00:00Z"),
  row("D", "lost", "2026-11-23T10:00:00Z", { product_type: "Hoodies" }),
];
const names = (r: RfqLike[]) => r.map((x) => x.name);

describe("filterRfqs", () => {
  it("default 'needs' view keeps new + contacted, newest first", () => {
    expect(names(filterRfqs(rows, "needs", "", "newest"))).toEqual(["B", "A"]);
  });
  it("sorts oldest first", () => {
    expect(names(filterRfqs(rows, "all", "", "oldest"))).toEqual(["A", "C", "B", "D"]);
  });
  it("filters by one status", () => {
    expect(names(filterRfqs(rows, "lost", "", "newest"))).toEqual(["D"]);
  });
  it("searches company, product and email case-insensitively", () => {
    expect(names(filterRfqs(rows, "all", "acme", "newest"))).toEqual(["B"]);
    expect(names(filterRfqs(rows, "all", " HOODIES ", "newest"))).toEqual(["D"]);
    expect(names(filterRfqs(rows, "all", "c@x.test", "newest"))).toEqual(["C"]);
  });
});
