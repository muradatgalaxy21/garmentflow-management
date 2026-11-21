// Client-side exports: CSV (opens in Excel, BOM so Urdu/PKR text survives) and a
// print window the browser can save as PDF. No dependency.

export type Cell = string | number;

// Text starting with = + - @ tab/CR runs as a formula in Excel; prefix ' to keep it text.
export const csvCell = (cell: Cell) => {
  const s = typeof cell === "string" && /^[=+\-@\t\r]/.test(cell) ? "'" + cell : String(cell);
  return `"${s.replace(/"/g, '""')}"`;
};

export function downloadCsv(filename: string, rows: Cell[][]) {
  const csv = rows
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const esc = (v: Cell) =>
  String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function printTable(title: string, subtitle: string, rows: Cell[][]) {
  const [head, ...body] = rows;
  const w = window.open("", "_blank");
  if (!w) return;
  const num = (v: Cell) => (typeof v === "number" ? ' class="n"' : "");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#111}
h1{font-size:18px;margin:0}p{margin:4px 0 16px;color:#555;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f3f3}
td.n{text-align:right;font-variant-numeric:tabular-nums}
</style></head><body>
<h1>En En Garments — ${esc(title)}</h1><p>${esc(subtitle)}</p>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${body.map((r) => `<tr>${r.map((c) => `<td${num(c)}>${esc(typeof c === "number" ? c.toLocaleString("en-PK", { maximumFractionDigits: 2 }) : c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
