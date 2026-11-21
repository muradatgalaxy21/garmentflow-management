import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Cell } from "@/lib/export";
import {
  AGING_BUCKETS, PAYMENT_METHODS, WAGE_BEARING_DEPARTMENTS, agingSummary, inRange, label, monthStart, pkr, proratedSalary, today,
} from "@/lib/finance";
import { DateRange, ExportButtons, PageHeader, orderDate, useFinanceData } from "./shared";

const REPORTS = [
  ["pnl", "Profit & Loss"],
  ["cash", "Cash / Bank Book"],
  ["payables", "Payables Aging"],
  ["receivables", "Receivables Aging"],
  ["purchases", "Purchases by Vendor"],
  ["expenses", "Expenses by Category"],
] as const;
type ReportKey = (typeof REPORTS)[number][0];

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
    (async () => {
      const [entries, salaried] = await Promise.all([
        supabase.from("department_entries").select("total_cost").in("department", WAGE_BEARING_DEPARTMENTS)
          .gte("created_at", from).lt("created_at", nextDay(to)),
        supabase.from("profiles").select("base_salary").eq("wage_type", "monthly_salary"),
      ]);
      setWages({
        piece: sum((entries.data ?? []).map((e) => Number(e.total_cost) || 0)),
        salary: sum((salaried.data ?? []).map((p) => proratedSalary(Number(p.base_salary) || 0, from, to))),
      });
    })();
  }, [from, to]);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const vendorName = new Map(data.vendors.map((v) => [v.id, v.name]));
  const clientName = (id: string) => data.clientNames.get(id) ?? "Unknown client";
  const bills = data.bills.filter((b) => inRange(b.bill_date, from, to));
  const expenses = data.expenses.filter((e) => inRange(e.spent_on, from, to));

  function build(): Cell[][] {
    switch (report) {
      case "pnl": {
        const revenue = sum(data.orders.filter((o) => inRange(orderDate(o), from, to)).map((o) => Number(o.total_amount) || 0));
        const purchases = sum(bills.map((b) => Number(b.total_amount)));
        const exp = sum(expenses.map((e) => Number(e.amount)));
        const w = wages ?? { piece: 0, salary: 0 };
        const net = revenue - purchases - w.piece - w.salary - exp;
        return [
          ["Line", "Amount (PKR)"],
          ["Revenue — orders booked", revenue],
          ["Purchases — vendor bills", -purchases],
          ["Wages — piece-rate (logged work)", -w.piece],
          ["Wages — monthly salaries (pro-rated)", -w.salary],
          ["Other expenses", -exp],
          [net >= 0 ? "Net profit" : "Net loss", net],
        ];
      }
      case "cash": {
        const moves = [
          ...data.clientPayments.map((p) => ({ date: p.received_on, method: p.method, desc: `Receipt — ${clientName(p.client_id)}`, inn: Number(p.amount), out: 0 })),
          ...data.vendorPayments.map((p) => ({ date: p.paid_on, method: p.method, desc: `Payment — ${vendorName.get(p.vendor_id) ?? ""}`, inn: 0, out: Number(p.amount) })),
          ...data.expenses.map((e) => ({ date: e.spent_on, method: e.method, desc: `Expense — ${label(e.category)}${e.paid_to ? ` (${e.paid_to})` : ""}`, inn: 0, out: Number(e.amount) })),
        ].filter((m) => inRange(m.date, from, to)).sort((a, b) => a.date.localeCompare(b.date));
        const byMethod = PAYMENT_METHODS.map((m) => {
          const ms = moves.filter((x) => x.method === m);
          return [`Total ${label(m)}`, "", "", sum(ms.map((x) => x.inn)), sum(ms.map((x) => x.out))] as Cell[];
        }).filter((r) => r[3] || r[4]);
        const tin = sum(moves.map((m) => m.inn));
        const tout = sum(moves.map((m) => m.out));
        return [
          ["Date", "Method", "Description", "In", "Out"],
          ...moves.map((m) => [m.date, label(m.method), m.desc, m.inn || "", m.out || ""]),
          ...byMethod,
          ["Net cash flow", "", "", tin - tout, ""],
        ];
      }
      case "payables": {
        const rows = data.vendors.map((v) => {
          const docs = [
            ...(Number(v.opening_balance) > 0 ? [{ date: v.created_at.slice(0, 10), due: v.created_at.slice(0, 10), amount: Number(v.opening_balance) }] : []),
            ...data.bills.filter((b) => b.vendor_id === v.id && b.bill_date <= to)
              .map((b) => ({ date: b.bill_date, due: b.due_date ?? b.bill_date, amount: Number(b.total_amount) })),
          ];
          const paid = sum(data.vendorPayments.filter((p) => p.vendor_id === v.id && p.paid_on <= to).map((p) => Number(p.amount)));
          const a = agingSummary(docs, paid, to);
          return [v.name, ...AGING_BUCKETS.map((k) => a[k]), sum(AGING_BUCKETS.map((k) => a[k]))] as Cell[];
        }).filter((r) => (r[6] as number) > 0);
        const head = ["Vendor", "Not due", "1–30 days", "31–60", "61–90", "90+", "Total"];
        return [head, ...rows, totalRow(head, rows, 1)];
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
        const head = ["Client", "Today", "1–30 days", "31–60", "61–90", "90+", "Total"];
        return [head, ...rows, totalRow(head, rows, 1)];
      }
      case "purchases": {
        const rows = data.vendors.map((v) => {
          const vb = bills.filter((b) => b.vendor_id === v.id);
          const paid = sum(data.vendorPayments.filter((p) => p.vendor_id === v.id && inRange(p.paid_on, from, to)).map((p) => Number(p.amount)));
          return [v.name, label(v.category), vb.length, sum(vb.map((b) => Number(b.total_amount))), paid] as Cell[];
        }).filter((r) => r[2] || r[4]).sort((a, b) => (b[3] as number) - (a[3] as number));
        const head = ["Vendor", "Category", "Bills", "Purchased", "Paid"];
        return [head, ...rows, totalRow(head, rows, 2)];
      }
      case "expenses": {
        const cats = [...new Set(expenses.map((e) => e.category))];
        const rows = cats.map((c) => {
          const es = expenses.filter((e) => e.category === c);
          return [label(c), es.length, sum(es.map((e) => Number(e.amount)))] as Cell[];
        }).sort((a, b) => (b[2] as number) - (a[2] as number));
        const head = ["Category", "Entries", "Amount"];
        return [head, ...rows, totalRow(head, rows, 1)];
      }
    }
  }

  const rows = build();
  const title = REPORTS.find((r) => r[0] === report)![1];
  const asOf = report === "payables" || report === "receivables";
  const subtitle = asOf ? `As of ${to}` : `${from} to ${to}`;
  const [head, ...body] = rows;

  return (
    <div>
      <PageHeader title="Finance Reports" subtitle="Pick a report and date range. Every report exports to CSV or prints to PDF.">
        <ExportButtons title={title} subtitle={subtitle} rows={rows} />
      </PageHeader>

      <div className="flex flex-wrap gap-2 mb-4">
        {REPORTS.map(([k, l]) => (
          <Button key={k} size="sm" variant={report === k ? "default" : "outline"} onClick={() => setReport(k)}>{l}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Button size="sm" variant="ghost" onClick={() => { setFrom(monthStart()); setTo(today()); }}>This month</Button>
        <Button size="sm" variant="ghost" onClick={() => { setFrom(today().slice(0, 4) + "-01-01"); setTo(today()); }}>This year</Button>
        {asOf && <span className="text-xs text-muted-foreground">Aging uses the "To" date; payments are applied to the oldest dues first.</span>}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {report === "pnl" && !wages ? <Loader2 className="w-5 h-5 animate-spin mx-auto my-10" /> : (
            <Table>
              <TableHeader><TableRow>{head.map((h, i) => <TableHead key={i} className={i > 0 && typeof body[0]?.[i] === "number" ? "text-right" : ""}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {body.length === 0 && <TableRow><TableCell colSpan={head.length} className="text-center text-muted-foreground py-10">Nothing in this range.</TableCell></TableRow>}
                {body.map((r, i) => {
                  const isTotal = /^(Total|Net)/.test(String(r[0]));
                  return (
                    <TableRow key={i} className={isTotal ? "bg-muted/40 font-semibold" : ""}>
                      {r.map((c, j) => (
                        <TableCell key={j} className={typeof c === "number" ? `text-right tabular-nums ${c < 0 ? "text-destructive" : ""}` : ""}>
                          {typeof c === "number" ? (head[j] === "Bills" || head[j] === "Entries" ? c : pkr(c)) : c}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {report === "pnl" && (
        <p className="text-xs text-muted-foreground mt-3">
          Accrual basis: revenue = non-cancelled orders by order date; purchases = bills by bill date; piece-rate wages from logged work in wage-bearing departments; salaries pro-rated at 30 days/month.
        </p>
      )}
    </div>
  );
}

function nextDay(d: string) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

// Sums every numeric column from `start` onward.
function totalRow(head: Cell[], rows: Cell[][], start: number): Cell[] {
  return Array.from({ length: head.length }, (_, i) =>
    i === 0 ? "Total" : i < start ? "" : sum(rows.map((r) => (typeof r[i] === "number" ? (r[i] as number) : 0))),
  );
}
