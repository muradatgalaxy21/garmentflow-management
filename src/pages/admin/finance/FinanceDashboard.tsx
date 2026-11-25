import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/admin/EmptyState";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { daysBetween, inRange, label, pkr, today } from "@/lib/finance";
import { fmtDate } from "@/lib/format";
import { PERIOD_OPTIONS, periodRange, splitTotals, trailingMonths, type PeriodKey } from "@/lib/financePeriod";
import { ExportButtons, PageHeader, orderDate, useFinanceData, vendorBalance } from "./shared";
import { AccountingPeriods, PendingApprovals } from "./ApprovalsAndPeriods";

// Categorical slots 1 (blue) and 2 (orange), validated light + dark with the dataviz palette checker.
const chartConfig = {
  in: { label: "Money in", theme: { light: "#2a78d6", dark: "#3987e5" } },
  out: { label: "Money out", theme: { light: "#eb6834", dark: "#d95926" } },
} satisfies ChartConfig;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const draftNote = (d: number) => (d > 0 ? `incl. ${pkr(d)} draft` : "all posted");

function Kpi({ label: l, value, tone, definition, note }: { label: string; value: string; tone?: "bad" | "good"; definition: string; note?: ReactNode }) {
  const color = tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : "text-foreground";
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
        {note && <p className="text-xs text-foreground/80 mt-1">{note}</p>}
        <p className="text-xs text-muted-foreground mt-1">{definition}</p>
      </CardContent>
    </Card>
  );
}

const Section = ({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) => (
  <section aria-labelledby={id} className="mb-6">
    <h2 id={id} className="admin-section-title">{title}</h2>
    {hint ? <p className="admin-meta mb-3">{hint}</p> : <div className="mb-3" />}
    {children}
  </section>
);

export default function FinanceDashboard() {
  const data = useFinanceData();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_month");
  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const t = today();
  const { from, to } = periodRange(periodKey, t);
  const periodLabel = `${PERIOD_OPTIONS.find((p) => p.value === periodKey)!.label.toLowerCase()} (${fmtDate(from)} – ${fmtDate(to)})`;
  const vendorName = new Map(data.vendors.map((v) => [v.id, v.name]));
  const inP = (d: string) => inRange(d, from, to);

  // As of today (not affected by the period).
  const payable = sum(data.vendors.map((v) => vendorBalance(v, data.bills, data.vendorPayments)));
  const draftBills = splitTotals(data.bills.map((b) => ({ status: b.status, amount: Number(b.total_amount) }))).draft;
  const draftVPay = splitTotals(data.vendorPayments.map((p) => ({ status: p.status, amount: Number(p.amount) }))).draft;
  const overdue = data.balances.filter((b) => b.status === "overdue");
  const overdueTotal = sum(overdue.map((b) => Number(b.balance)));
  const orderTotal = sum(data.orders.map((o) => Number(o.total_amount) || 0));
  const receiptsAll = splitTotals(data.clientPayments.map((p) => ({ status: p.status, amount: Number(p.amount) })));
  const receivable = orderTotal - receiptsAll.total;

  // Selected period, split draft vs posted.
  const rec = splitTotals(data.clientPayments.filter((p) => inP(p.received_on)).map((p) => ({ status: p.status, amount: Number(p.amount) })));
  const paid = splitTotals(data.vendorPayments.filter((p) => inP(p.paid_on)).map((p) => ({ status: p.status, amount: Number(p.amount) })));
  const exp = splitTotals(data.expenses.filter((e) => inP(e.spent_on)).map((e) => ({ status: e.status, amount: Number(e.amount) })));
  const purch = splitTotals(data.bills.filter((b) => inP(b.bill_date)).map((b) => ({ status: b.status, amount: Number(b.total_amount) })));
  const sales = sum(data.orders.filter((o) => inP(orderDate(o))).map((o) => Number(o.total_amount) || 0));
  const net = rec.total - paid.total - exp.total;
  const netDraft = rec.draft - paid.draft - exp.draft;

  // Trailing 6 months ending at the period end, cash basis (drafts included).
  const months = trailingMonths(to);
  const chart = months.map((m) => {
    const inM = (d: string) => d.startsWith(m);
    const mi = data.clientPayments.filter((p) => inM(p.received_on)).map((p) => Number(p.amount));
    const mo = [...data.vendorPayments.filter((p) => inM(p.paid_on)).map((p) => Number(p.amount)), ...data.expenses.filter((e) => inM(e.spent_on)).map((e) => Number(e.amount))];
    return {
      month: new Date(m + "-01T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" }),
      in: sum(mi),
      out: sum(mo),
      idle: mi.length + mo.length === 0,
    };
  });
  const idleMonths = new Set(chart.filter((c) => c.idle).map((c) => c.month));
  const chartEmpty = idleMonths.size === chart.length;

  const dueSoon = data.balances
    .filter((b) => Number(b.balance) > 0 && b.due_date && (b.status === "overdue" || (inRange(b.due_date, t) && daysBetween(t, b.due_date) <= 14)))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
    .slice(0, 8);

  const topVendors = data.vendors
    .map((v) => ({ v, bal: vendorBalance(v, data.bills, data.vendorPayments) }))
    .filter((x) => x.bal > 0)
    .sort((a, b) => b.bal - a.bal)
    .slice(0, 5);

  const recent = [
    ...data.clientPayments.map((p) => ({ id: "c" + p.id, dir: "in" as const, date: p.received_on, what: `Receipt · ${data.clientNames.get(p.client_id) ?? "Client"}`, amount: Number(p.amount), status: p.status, to: "/admin/finance/receivables" })),
    ...data.vendorPayments.map((p) => ({ id: "v" + p.id, dir: "out" as const, date: p.paid_on, what: `Vendor payment · ${vendorName.get(p.vendor_id) ?? ""}`, amount: Number(p.amount), status: p.status, to: `/admin/finance/vendors/${p.vendor_id}` })),
    ...data.expenses.map((e) => ({ id: "e" + e.id, dir: "out" as const, date: e.spent_on, what: `Expense · ${label(e.category)}`, amount: Number(e.amount), status: e.status, to: "/admin/finance/expenses" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div>
      <PageHeader title="Finance" subtitle="Cash position, what is overdue, what needs approval, and recent movement. Totals include drafts; the draft part is shown next to each figure.">
        <div className="flex items-center gap-2">
          <label htmlFor="fin-period" className="admin-label">Period</label>
          <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as PeriodKey)}>
            <SelectTrigger id="fin-period" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIOD_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </PageHeader>

      <Section id="cash-h" title="Cash position" hint={`Money received and paid out in ${periodLabel}. Drafts are included and shown separately.`}>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Net cash" value={pkr(net)} tone={net < 0 ? "bad" : "good"} note={netDraft !== 0 ? `incl. ${pkr(netDraft)} from drafts` : "all posted"} definition="Received minus vendor payments minus expenses." />
          <Kpi label="Received" value={pkr(rec.total)} tone="good" note={draftNote(rec.draft)} definition="Client receipts dated in the period." />
          <Kpi label="Paid to vendors" value={pkr(paid.total)} note={draftNote(paid.draft)} definition="Vendor payments dated in the period." />
          <Kpi label="Expenses" value={pkr(exp.total)} note={draftNote(exp.draft)} definition="Running costs (rent, power, transport…) dated in the period." />
        </div>
      </Section>

      <Section id="owed-h" title="Owed and overdue" hint="As of today. Not affected by the period.">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Kpi label="We owe vendors" value={pkr(payable)} note={draftBills || draftVPay ? `incl. drafts: ${[draftBills && `${pkr(draftBills)} bills`, draftVPay && `${pkr(draftVPay)} payments`].filter(Boolean).join(", ")}` : "all posted"} definition="Opening balances plus bills minus payments, all vendors." />
          <Kpi label="Clients owe us" value={pkr(receivable)} note={`${draftNote(receiptsAll.draft)} receipts`} definition="Order value minus receipts. Client due dates are not tracked, so no overdue split." />
          <Card className={overdue.length ? "border-destructive/40" : undefined}>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Overdue bills</p>
              <p className="text-2xl font-bold tabular-nums mt-1 flex items-center gap-2">
                {overdue.length > 0 && <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden />}
                {overdue.length} <span className="text-base font-medium text-muted-foreground">bill{overdue.length === 1 ? "" : "s"}</span>
              </p>
              <p className="text-xs text-foreground/80 mt-1">{overdue.length ? `${pkr(overdueTotal)} past due date` : "Nothing past due"}</p>
              <p className="text-xs text-muted-foreground mt-1">Unpaid vendor bills whose due date has passed. <Link to="/admin/finance/purchases" className="text-accent hover:underline">See bills</Link></p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <PendingApprovals data={data} />

      <Section id="move-h" title="Recent movement" hint={`Orders booked ${pkr(sales)} and purchases billed ${pkr(purch.total)}${purch.draft ? ` (incl. ${pkr(purch.draft)} draft)` : ""} in ${periodLabel}.`}>
        <Card className="mb-4">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Money in vs out — 6 months to {fmtDate(to)}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Cash basis, drafts included. A month marked “No activity” has no receipts, vendor payments or expenses recorded.</p>
            </div>
            <div className="flex gap-2">
              <ExportButtons title="Monthly Cash Flow (includes drafts)" subtitle={`${months[0]} to ${months[5]}`}
                rows={[["Month", "In", "Out", "Net"], ...chart.map((c) => [c.month, c.in, c.out, c.in - c.out])]} />
            </div>
          </CardHeader>
          <CardContent>
            {chartEmpty ? (
              <EmptyState title="No money movement in these 6 months" description="Receipts, vendor payments and expenses will appear here once recorded." />
            ) : (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={chart} barGap={2} barCategoryGap="28%">
                  <CartesianGrid vertical={false} strokeOpacity={0.4} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} height={40}
                    tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                      <text x={x} y={y + 12} textAnchor="middle" className="fill-muted-foreground text-xs">
                        <tspan x={x}>{payload.value}</tspan>
                        {idleMonths.has(payload.value) && <tspan x={x} dy={14} fontSize={10}>No activity</tspan>}
                      </text>
                    )} />
                  <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={<ChartTooltipContent formatter={(v, n) => (
                    <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{chartConfig[n as "in" | "out"].label}</span><span className="tabular-nums">{pkr(Number(v))}</span></span>
                  )} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="in" fill="var(--color-in)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="out" fill="var(--color-out)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ChartContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2">Money out = vendor payments + expenses.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Latest entries</CardTitle>
            <Link to="/admin/finance/reports" className="text-sm text-accent hover:underline">Reports</Link>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableBody>
                {recent.length === 0 && <TableRow><TableCell className="text-center text-muted-foreground py-8">No entries yet.</TableCell></TableRow>}
                {recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                    <TableCell><Link to={r.to} className="hover:underline">{r.what}</Link></TableCell>
                    <TableCell>{r.status === "draft" ? <StatusBadge status="draft" /> : null}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {r.dir === "in" ? <ArrowDownLeft className="w-3.5 h-3.5 text-success" aria-label="Money in" /> : <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" aria-label="Money out" />}
                        {r.dir === "in" ? "+" : "−"}{pkr(r.amount)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Bills due (next 14 days + overdue)</CardTitle>
            <Link to="/admin/finance/purchases" className="text-sm text-accent hover:underline">All bills</Link>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {dueSoon.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nothing due soon.</TableCell></TableRow>}
                {dueSoon.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{vendorName.get(b.vendor_id!)} <span className="text-muted-foreground text-xs">{b.bill_no}</span></TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(b.due_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pkr(Number(b.balance))}</TableCell>
                    <TableCell>
                      {b.status === "overdue"
                        ? <StatusBadge status="overdue" icon={AlertTriangle}>{`Overdue ${daysBetween(b.due_date!, t)}d`}</StatusBadge>
                        : <StatusBadge status={b.status!} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Biggest vendor dues</CardTitle>
            <Link to="/admin/finance/vendors" className="text-sm text-accent hover:underline">All vendors</Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {topVendors.length === 0 && <TableRow><TableCell className="text-center text-muted-foreground py-8">No pending vendor dues.</TableCell></TableRow>}
                {topVendors.map(({ v, bal }) => (
                  <TableRow key={v.id}>
                    <TableCell><Link to={`/admin/finance/vendors/${v.id}`} className="font-medium hover:underline">{v.name}</Link> <span className="text-xs text-muted-foreground">{label(v.category)}</span></TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{pkr(bal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <AccountingPeriods data={data} />
    </div>
  );
}
