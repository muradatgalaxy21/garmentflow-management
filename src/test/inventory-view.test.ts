import { describe, it, expect } from "vitest";
import { stockCondition, filterAndSortItems, NO_CATEGORY } from "@/lib/inventoryView";

const item = (name: string, qty: number, reorder: number, category: string | null = "fabric") =>
  ({ name, sku: name.toUpperCase(), category, quantity_on_hand: qty, reorder_level: reorder });

const items = [
  item("Cotton", 100, 20),
  item("Zip", 20, 20, "accessory"), // exactly at reorder point = low
  item("Thread", 0, 5, "accessory"),
  item("Box", 3, 0, null), // reorder 0 and stock left = ok
];
const base = { search: "", category: "all", stock: "all", sort: "name-asc" } as const;

describe("stockCondition", () => {
  it("out / low / ok boundaries", () => {
    expect(stockCondition({ quantity_on_hand: 0, reorder_level: 0 })).toBe("out");
    expect(stockCondition({ quantity_on_hand: 20, reorder_level: 20 })).toBe("low");
    expect(stockCondition({ quantity_on_hand: 21, reorder_level: 20 })).toBe("ok");
    expect(stockCondition({ quantity_on_hand: 3, reorder_level: 0 })).toBe("ok");
  });
});

describe("filterAndSortItems", () => {
  it("filters by stock condition and category together", () => {
    expect(filterAndSortItems(items, { ...base, stock: "low" }).map((i) => i.name)).toEqual(["Zip"]);
    expect(filterAndSortItems(items, { ...base, category: "accessory" }).map((i) => i.name)).toEqual(["Thread", "Zip"]);
    expect(filterAndSortItems(items, { ...base, category: NO_CATEGORY }).map((i) => i.name)).toEqual(["Box"]);
  });
  it("sorts by reorder status (out, low, ok) then name", () => {
    expect(filterAndSortItems(items, { ...base, sort: "status" }).map((i) => i.name)).toEqual(["Thread", "Zip", "Box", "Cotton"]);
  });
  it("sorts by quantity and searches name/sku", () => {
    expect(filterAndSortItems(items, { ...base, sort: "qty-desc" })[0].name).toBe("Cotton");
    expect(filterAndSortItems(items, { ...base, sort: "qty-asc" })[0].name).toBe("Thread");
    expect(filterAndSortItems(items, { ...base, search: "zip" }).map((i) => i.name)).toEqual(["Zip"]);
  });
});
