// Stock condition + list filter/sort for the admin Inventory page.

export type StockCondition = "out" | "low" | "ok";
export type StockFilter = "all" | StockCondition;
export type InventorySort = "name-asc" | "name-desc" | "qty-asc" | "qty-desc" | "status";

interface StockLike {
  name: string;
  sku: string;
  category: string | null;
  quantity_on_hand: number;
  reorder_level: number;
}

/** out = nothing left; low = at or under the reorder point; ok = above it. */
export function stockCondition(i: Pick<StockLike, "quantity_on_hand" | "reorder_level">): StockCondition {
  const qty = Number(i.quantity_on_hand);
  if (qty <= 0) return "out";
  return qty <= Number(i.reorder_level) ? "low" : "ok";
}

const SEVERITY: Record<StockCondition, number> = { out: 0, low: 1, ok: 2 };

export const NO_CATEGORY = "__none__";

export function filterAndSortItems<T extends StockLike>(
  items: T[],
  o: { search: string; category: string; stock: StockFilter; sort: InventorySort },
): T[] {
  const q = o.search.trim().toLowerCase();
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  return items
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
    .filter((i) => o.category === "all" || (i.category ?? NO_CATEGORY) === o.category)
    .filter((i) => o.stock === "all" || stockCondition(i) === o.stock)
    .sort((a, b) => {
      switch (o.sort) {
        case "name-desc": return byName(b, a);
        case "qty-asc": return Number(a.quantity_on_hand) - Number(b.quantity_on_hand) || byName(a, b);
        case "qty-desc": return Number(b.quantity_on_hand) - Number(a.quantity_on_hand) || byName(a, b);
        case "status": return SEVERITY[stockCondition(a)] - SEVERITY[stockCondition(b)] || byName(a, b);
        default: return byName(a, b);
      }
    });
}

/** One number format for every quantity on the page. */
export const fmtQty = (n: number | string) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
