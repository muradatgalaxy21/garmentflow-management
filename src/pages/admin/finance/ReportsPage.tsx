import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, FileText, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, printTable, type Cell } from "@/lib/export";
import { fmtDate } from "@/lib/format";
import { fmtAmount, reportFilename } from "@/lib/reportFormat";
import { EmptyState } from "@/components/admin/EmptyState";
import {
  AGING_BUCKETS, PAYMENT_METHODS, agingSummary, inRange, label, monthStart, proratedSalary, today,
} from "@/lib/finance";
import { DateRange, PageHeader, orderDate, useFinanceData } from "./shared";

const REPORTS = [
  ["pnl", "Profit & Loss"],
  ["cash", "Cash / Bank Book"],
  ["payables", "Payables Aging"],
  ["receivables", "Receivables Aging"],
  ["purchases", "Purchases by Vendor"],
  ["expenses", "Expenses by Category"],
] as const;
type ReportKey = (typeof REPORTS)[number][0];

// Per report: column holding the headline total, its label, empty-state text, and how it is calculated.
const META: Record<ReportKey, { keyCol: number; keyLabel: string; empty: string; how: string[] }> = {
  pnl: {
    keyCol: 1, keyLabel: "Net result", empty: "No orders, bills, wages or expenses fall in this date range.",
    how: [
      "Accrual basis: figures count when the work or bill happened, not when cash moved.",
      "Revenue = non-cancelled orders, by order date.",
      "Purchases = vendor bills, by bill date.",
      "Piece-rate wages = logged work in wage-bearing departments. Salaries = monthly pay pro-rated at 30 days a month.",
      "Other expenses = recorded expenses, by spent-on date.",
    ],
  },
  cash: {
    keyCol: 3, keyLabel: "Net cash flow", empty: "No client receipts, vendor payments or expenses were recorded in this date range.",
    how: ["Money in = client receipts. Money out = vendor payments plus expenses.", "Each line is dated by when the money moved. Totals are split by payment method."],
  },
  payables: {
    keyCol: 6, keyLabel: "Total payable", empty: "Nothing is owed to vendors as of this date.",
    how: ["Opening balances and vendor bills up to the \"To\" date, minus payments up to that date.", "Payments are applied to the oldest dues first. Buckets count days past the bill's due date."],
  },
  receivables: {
    keyCol: 6, keyLabel: "Total receivable", empty: "No client owes money as of this date.",
    how: ["Non-cancelled orders with a total, up to the \"To\" date, minus client receipts up to that date.", "Receipts are applied to the oldest orders first. Buckets count days since the order date."],
  },
  purchases: {
    keyCol: 3, keyLabel: "Total purchased", empty: "No vendor bills or payments fall in this date range.",
    how: ["Purchased = vendor bills by bill date. Paid = vendor payments by paid-on date, in the same range."],
  },
  expenses: {
    keyCol: 2, keyLabel: "Total expenses", empty: "No expenses were recorded in this date range.",
    how: ["Recorded expenses by spent-on date, grouped by category."],
  },
};
const AGING_HEAD = (first: string) => [first, "Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days", "Total"];
const COUNT_HEADS = ["Bills", "Entries"];
const isTotalRow = (r: Cell[]) => /^(Total|Net)/.test(String(r[0]));

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default function ReportsPage() {
  const data = useFinanceData();
  const [report, setReport] = useState<ReportKey>("pnl");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [wages, setWages] = useState<{ piece: number; salary: number } | null>(null);

  // Wages: piece-rate cost logged in range + monthly salaries pro-rated to the range.
  useEffect(() => {
    if (!from || !to) return;
    setWages(null);
    supabase.rpc("finance_wage_totals", { _from: from, _to: to }).then(({ data: rows }) => {
      const w = rows?.[0];
      setWages({
        piece: Number(w?.piece_rate) || 0,
        salary: proratedSalary(Number(w?.monthly_salaries) || 0, from, to),
      });
    });
  }, [from, to]);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const vendorName = new Map(data.vendors.map((v) => [v.id, v.name]));
  const clientName = (id: string) => data.clientNames.get(id) ?? "Unknown client";
  const bills = data.bills.filter((b) => inRange(b.bill_date, from, to));
  const expenses = data.expenses.filter((e) => inRange(e.spent_on, from, to));
  const fin = "/admin/finance";

  // Returns the table plus, per row, the source page that row's label links to.
  function build(): { rows: Cell[][]; links: (string | undefined)[] } {
    switch (report) {
      case "pnl": {
        const revenue = sum(data.orders.filter((o) => inRange(orderDate(o), from, to)).map((o) => Number(o.total_amount) || 0));
        const purchases = sum(bills.map((b) => Number(b.total_amount)));
        const exp = sum(expenses.map((e) => Number(e.amount)));
        const w = wages ?? { piece: 0, salary: 0 };
        const net = revenue - purchases - w.piece - w.salary - exp;
        return {
          rows: [
            ["Line", "Amount"],
            ["Revenue — orders booked", revenue],
            ["Purchases — vendor bills", -purchases],
            ["Wages — piece-rate (logged work)", -w.piece],
            ["Wages — monthly salaries (pro-rated)", -w.salary],
            ["Other expenses", -exp],
            [net >= 0 ? "Net profit" : "Net loss", net],
          ],
          links: [undefined, "/admin/orders", `${fin}/purchases`, "/admin/employees", "/admin/employees", `${fin}/expenses`, undefined],
        };
      }
      case "cash": {
        const moves = [
          ...data.clientPayments.map((p) => ({ date: p.received_on, method: p.method, href: `${fin}/receivables`, desc: `Receipt — ${clientName(p.client_id)}`, inn: Number(p.amount), out: 0 })),
          ...data.vendorPayments.map((p) => ({ date: p.paid_on, method: p.method, href: `${fin}/vendors/${p.vendor_id}`, desc: `Payment — ${vendorName.get(p.vendor_id) ?? ""}`, inn: 0, out: Number(p.amount) })),
          ...data.expenses.map((e) => ({ date: e.spent_on, method: e.method, href: `${fin}/expenses`, desc: `Expense — ${label(e.category)}${e.paid_to ? ` (${e.paid_to})` : ""}`, inn: 0, out: Number(e.amount) })),
        ].filter((m) => inRange(m.date, from, to)).sort((a, b) => a.date.localeCompare(b.date));
        const byMethod = PAYMENT_METHODS.map((m) => {
          const ms = moves.filter((x) => x.method === m);
          return [`Total ${label(m)}`, "", "", sum(ms.map((x) => x.inn)), sum(ms.map((x) => x.out))] as Cell[];
        }).filter((r) => r[3] || r[4]);
        const tin = sum(moves.map((m) => m.inn));
        const tout = sum(moves.map((m) => m.out));
        return {
          rows: [
            ["Date", "Method", "Description", "In", "Out"],
            ...moves.map((m) => [m.date, label(m.method), m.desc, m.inn || "", m.out || ""]),
            ...byMethod,
            ["Net cash flow", "", "", tin - tout, ""],
          ],
          links: [undefined, ...moves.map((m) => m.href), ...byMethod.map(() => undefined), undefined],
        };
      }
      case "payables": {
        const found = data.vendors.map((v) => {
          const docs = [
            ...(Number(v.opening_balance) > 0 ? [{ date: v.created_at.slice(0, 10), due: v.created_at.slice(0, 10), amount: Number(v.opening_balance) }] : []),
            ...data.bills.filter((b) => b.vendor_id === v.id && b.bill_date <= to)
              .map((b) => ({ date: b.bill_date, due: b.due_date ?? b.bill_date, amount: Number(b.total_amount) })),
          ];
          const paid = sum(data.vendorPayments.filter((p) => p.vendor_id === v.id && p.paid_on <= to).map((p) => Number(p.amount)));
          const a = agingSummary(docs, paid, to);
          return { id: v.id, row: [v.name, ...AGING_BUCKETS.map((k) => a[k]), sum(AGING_BUCKETS.map((k) => a[k]))] as Cell[] };
        }).filter((x) => (x.row[6] as number) > 0);
        const head = AGING_HEAD("Vendor");
        const rows = found.map((x) => x.row);
        return { rows: [head, ...rows, totalRow(head, rows, 1)], links: [undefined, ...found.map((x) => `${fin}/vendors/${x.id}`), undefined] };
      }
      case "receivables": {
        const ids = [...new Set(data.orders.map((o) => o.client_id))];
        const rows = ids.map((id) => {
          const docs = data.orders.filter((o) => o.client_id === id && o.total_amount != null && orderDate(o) <= to)
            .map((o) => ({ date: orderDate(o), due: orderDate(o), amount: Number(o.total_amount) }));
          const paid = sum(data.clientPayments.filter((p) => p.client_id === id && p.received_on <= to).map((p) => Number(p.amount)));
          const a = agingSummary(docs, paid, to);
          return [clientName(id), ...AGING_BUCKETS.map((k) => a[k]), sum(AGING_BUCKETS.map((k) => a[k]))] as Cell[];
        }).filter((r) => (r[6] as number) > 0);
        const head = AGING_HEAD("Client");
        return { rows: [head, ...rows, totalRow(head, rows, 1)], links: [undefined, ...rows.map(() => `${fin}/receivables`), undefined] };
      }
      case "purchases": {
        const found = data.vendors.map((v) => {
          const vb = bills.filter((b) => b.vendor_id === v.id);
          const paid = sum(data.vendorPayments.filter((p) => p.vendor_id === v.id && inRange(p.paid_on, from, to)).map((p) => Number(p.amount)));
          return { id: v.id, row: [v.name, label(v.category), vb.length, sum(vb.map((b) => Number(b.total_amount))), paid] as Cell[] };
        }).filter((x) => x.row[2] || x.row[4]).sort((a, b) => (b.row[3] as number) - (a.row[3] as number));
        const head = ["Vendor", "Category", "Bills", "Purchased", "Paid"];
        const rows = found.map((x) => x.row);
        return { rows: [head, ...rows, totalRow(head, rows, 2)], links: [undefined, ...found.map((x) => `${fin}/vendors/${x.id}`), undefined] };
      }
      case "expenses": {
        const cats = [...new Set(expenses.map((e) => e.category))];
        const rows = cats.map((c) => {
          const es = expenses.filter((e) => e.category === c);
          return [label(c), es.length, sum(es.map((e) => Number(e.amount)))] as Cell[];
        }).sort((a, b) => (b[2] as number) - (a[2] as number));
        const head = ["Category", "Entries", "Amount"];
        return { rows: [head, ...rows, totalRow(head, rows, 1)], links: [undefined, ...rows.map(() => `${fin}/expenses`), undefined] };
      }
    }
  }

  // Drafts count in totals (accrual view) but are called out so nobody mistakes them for posted figures.
  function draftCount() {
    const d = (xs: { status: string }[]) => xs.filter((x) => x.status === "draft").length;
    const vp = data.vendorPayments.filter((p) => inRange(p.paid_on, from, to));
    const cp = data.clientPayments.filter((p) => inRange(p.received_on, from, to));
    switch (report) {
      case "pnl": return d(bills) + d(expenses);
      case "cash": return d(vp) + d(cp) + d(expenses);
      case "payables": return d(data.bills.filter((b) => b.bill_date <= to)) + d(data.vendorPayments.filter((p) => p.paid_on <= to));
      case "receivables": return d(data.clientPayments.filter((p) => p.received_on <= to));
      case "purchases": return d(bills) + d(vp);
      case "expenses": return d(expenses);
    }
  }

  const { rows, links } = build();
  const title = REPORTS.find((r) => r[0] === report)![1];
  const meta = META[report];
  const asOf = report === "payables" || report === "receivables";
  const period = asOf ? `As of ${fmtDate(to)}` : `${fmtDate(from)} to ${fmtDate(to)}`;
  const [rawHead, ...body] = rows;
  // Money columns say PKR in the header, so cells carry no currency symbol.
  const isCount = (j: number) => COUNT_HEADS.includes(String(rawHead[j]));
  const isMoney = (j: number) => j > 0 && !isCount(j) && body.some((r) => typeof r[j] === "number");
  const head = rawHead.map((h, j) => (isMoney(j) ? `${h} (PKR)` : h));
  const isEmpty = report === "pnl" ? body.every((r) => !r[1]) : body.every(isTotalRow);
  const totalCell = body[body.length - 1]?.[meta.keyCol];
  const keyTotal = typeof totalCell === "number" ? totalCell : 0;
  const drafts = draftCount();
  const file = reportFilename(title, from, to, asOf);
  const caption = `${period} · Amounts in PKR`;
  // Cash book links sit on the Description column; every other report links its first column.
  const linkCol = report === "cash" ? 2 : 0;

  return (
    <div>
      <PageHeader title="Finance Reports" subtitle="Pick a report and date range. Every report exports to CSV or prints to PDF." />

      <div role="group" aria-label="Report type" className="flex flex-wrap gap-2 mb-4">
        {REPORTS.map(([k, l]) => (
          <Button key={k} size="sm" variant={report === k ? "default" : "outline"} aria-pressed={report === k} onClick={() => setReport(k)}>
            {report === k && <Check className="w-4 h-4 mr-1" />}{l}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Button size="sm" variant="ghost" onClick={() => { setFrom(monthStart()); setTo(today()); }}>This month</Button>
        <Button size="sm" variant="ghost" onClick={() => { setFrom(today().slice(0, 4) + "-01-01"); setTo(today()); }}>This year</Button>
        {asOf && <span className="text-xs text-muted-foreground">Aging uses the "To" date; the "From" date is ignored.</span>}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 border-b">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{caption}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{meta.keyLabel}</p>
              <p className={`text-2xl font-bold tabular-nums ${keyTotal < 0 ? "text-destructive" : ""}`}>{fmtAmount(keyTotal)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30">
            <span className="flex items-center gap-1 text-xs text-muted-foreground mr-auto break-all"><FileText className="w-3.5 h-3.5 shrink-0" /> {file}</span>
            <Button size="sm" variant="outline" disabled={isEmpty}
              onClick={() => downloadCsv(file, [["En En Garments — " + title], ["Period: " + period], ["Currency: PKR"], [], head, ...body])}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" disabled={isEmpty} onClick={() => printTable(title, caption, [head, ...body], fmtAmount)}>
              <Printer className="w-4 h-4 mr-1" /> Print / PDF
            </Button>
          </div>
          {drafts > 0 && (
            <p className="px-4 py-2 text-xs border-b text-amber-700 dark:text-amber-400">
              Includes {drafts} draft {drafts === 1 ? "entry" : "entries"} not yet posted.
            </p>
          )}
          {report === "pnl" && !wages ? <Loader2 className="w-5 h-5 animate-spin mx-auto my-10" /> : isEmpty ? (
            <div className="p-4"><EmptyState title={`No ${title} data`} description={meta.empty} /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>{head.map((h, j) => <TableHead key={j} className={isMoney(j) || isCount(j) ? "text-right" : ""}>{h}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {body.map((r, i) => (
                    <TableRow key={i} className={isTotalRow(r) ? "bg-muted/40 font-semibold" : ""}>
                      {r.map((c, j) => (
                        <TableCell key={j} className={typeof c === "number" ? `text-right tabular-nums ${c < 0 ? "text-destructive" : ""}` : ""}>
                          {typeof c !== "number"
                            ? (j === linkCol && links[i + 1] ? <Link to={links[i + 1]!} className="text-primary underline-offset-2 hover:underline">{c}</Link> : c)
                            : isCount(j) ? c : fmtAmount(c)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <details className="mt-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">How this report is calculated</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">{meta.how.map((t) => <li key={t}>{t}</li>)}</ul>
      </details>
    </div>
  );
}

// Sums every numeric column from `start` onward.
function totalRow(head: Cell[], rows: Cell[][], start: number): Cell[] {
  return Array.from({ length: head.length }, (_, i) =>
    i === 0 ? "Total" : i < start ? "" : sum(rows.map((r) => (typeof r[i] === "number" ? (r[i] as number) : 0))),
  );
}
