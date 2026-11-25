// Finance Reports display helpers. Negatives use accounting parentheses (user decision, Session 13).

/** 12000 → "12,000"; -12000 → "(12,000)". Currency lives in the column header (PKR). */
export const fmtAmount = (n: number) => {
  const s = Math.abs(Math.round(Number(n) || 0)).toLocaleString("en-PK", { maximumFractionDigits: 0 });
  return n < 0 && s !== "0" ? `(${s})` : s;
};

/** "Profit & Loss" + range → "profit-and-loss_2026-11-01_to_2026-11-25.csv"; as-of reports use the single date. */
export const reportFilename = (title: string, from: string, to: string, asOf = false) =>
  `${title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}_${asOf ? `as-of_${to}` : `${from}_to_${to}`}.csv`;
