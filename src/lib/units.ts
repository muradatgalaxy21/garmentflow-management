export const UNITS = ["pcs", "yards", "meters", "kg"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  pcs: "Pieces (pcs)",
  yards: "Yards (yd)",
  meters: "Meters (m)",
  kg: "Kilograms (kg)",
};

// Length units convert to each other; pcs and kg each stand alone.
const LENGTH_TO_METERS: Partial<Record<Unit, number>> = { yards: 0.9144, meters: 1 };

export function unitsAreConvertible(a: Unit, b: Unit): boolean {
  return a === b || (a in LENGTH_TO_METERS && b in LENGTH_TO_METERS);
}

export function convertUnit(quantity: number, from: Unit, to: Unit): number {
  if (from === to) return quantity;
  const fromFactor = LENGTH_TO_METERS[from];
  const toFactor = LENGTH_TO_METERS[to];
  if (fromFactor === undefined || toFactor === undefined) {
    throw new Error(`Cannot convert ${from} to ${to}`);
  }
  return (quantity * fromFactor) / toFactor;
}
