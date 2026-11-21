import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { daysBetween, inRange, label, monthStart, pkr, today } from "@/lib/finance";
import { ExportButtons, PageHeader, StatCard, orderDate, statusTone, useFinanceData, vendorBalance } from "./shared";

// Categorical slots 1 (blue) and 2 (orange), validated light + dark with the dataviz palette checker.
const chartConfig = {
  in: { label: "Money in", theme: { light: "#2a78d6", dark: "#3987e5" } },
  out: { label: "Money out", theme: { light: "#eb6834", dark: "#d95926" } },
} satisfies ChartConfig;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default function FinanceDashboard() {
  const data = useFinanceData();
  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const t = today();
  const ms = monthStart();
  const vendorName = new Map(data.vendors.map((v) => [v.id, v.name]));

  const payable = sum(data.vendors.map((v) => vendorBalance(v, data.bills, data.vendorPayments)));
  const overdue = data.balances.filter((b) => b.status === "overdue");
  const receivable =
    sum(data.orders.map((o) => Number(o.total_amount) || 0)) - sum(data.clientPayments.map((p) => Number(p.amount)));

  const monthIn = sum(data.clientPayments.filter((p) => p.received_on >= ms).map((p) => Number(p.amount)));
  const monthPaid = sum(data.vendorPayments.filter((p) => p.paid_on >= ms).map((p) => Number(p.amount)));
  const monthExp = sum(data.expenses.filter((e) => e.spent_on >= ms).map((e) => Number(e.amount)));
  const monthPurch = sum(data.bills.filter((b) => b.bill_date >= ms).map((b) => Number(b.total_amount)));
  const monthSales = sum(data.orders.filter((o) => orderDate(o) >= ms).map((o) => Number(o.total_amount) || 0));

  // Last 6 calendar months, cash basis.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const chart = months.map((m) => {
    const inM = (d: string) => d.startsWith(m);
    return {
      month: new Date(m + "-01T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" }),
      in: sum(data.clientPayments.filter((p) => inM(p.received_on)).map((p) => Number(p.amount))),
      out: sum([
        ...data.vendorPayments.filter((p) => inM(p.paid_on)).map((p) => Number(p.amount)),
        ...data.expenses.filter((e) => inM(e.spent_on)).map((e) => Number(e.amount)),
      ]),
    };
  });

  const dueSoon = data.balances
    .filter((b) => Number(b.balance) > 0 && b.due_date && (b.status === "overdue" || inRange(b.due_date, t) && daysBetween(t, b.due_date) <= 14))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
    .slice(0, 8);

  const topVendors = data.vendors
    .map((v) => ({ v, bal: vendorBalance(v, data.bills, data.vendorPayments) }))
    .filter((x) => x.bal > 0)
    .sort((a, b) => b.bal - a.bal)
    .slice(0, 5);

  return (
    <div>
      <PageHeader title="Finance" subtitle="Payables, receivables and cash flow at a glance." />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <StatCard label="We owe vendors" value={pkr(payable)} tone={payable > 0 ? "bad" : undefined} hint={`${overdue.length} bill(s) overdue · ${pkr(sum(overdue.map((b) => Number(b.balance))))}`} />
        <StatCard label="Clients owe us" value={pkr(receivable)} hint="Order value minus receipts" />
        <StatCard label="Received this month" value={pkr(monthIn)} tone="good" />
        <StatCard label="Net cash this month" value={pkr(monthIn - monthPaid - monthExp)} tone={monthIn - monthPaid - monthExp < 0 ? "bad" : "good"} hint={`Paid vendors ${pkr(monthPaid)} · expenses ${pkr(monthExp)}`} />
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-6">
        <StatCard label="Orders booked this month" value={pkr(monthSales)} />
        <StatCard label="Purchases this month" value={pkr(monthPurch)} />
        <StatCard label="Expenses this month" value={pkr(monthExp)} />
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Money in vs out — last 6 months</CardTitle>
          <div className="flex gap-2">
            <ExportButtons title="Monthly Cash Flow" subtitle={`${months[0]} to ${months[5]}`}
              rows={[["Month", "In", "Out", "Net"], ...chart.map((c) => [c.month, c.in, c.out, c.in - c.out])]} />
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart data={chart} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} strokeOpacity={0.4} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <ChartTooltip cursor={{ fillOpacity: 0.08 }} content={<ChartTooltipContent formatter={(v, n) => (
                <span className="flex w-full justify-between gap-4"><span className="text-muted-foreground">{chartConfig[n as "in" | "out"].label}</span><span className="tabular-nums">{pkr(Number(v))}</span></span>
              )} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="in" fill="var(--color-in)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="out" fill="var(--color-out)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Bills due (next 14 days + overdue)</CardTitle>
            <Link to="/admin/finance/purchases" className="text-sm text-accent hover:underline">All bills</Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {dueSoon.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nothing due soon.</TableCell></TableRow>}
                {dueSoon.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{vendorName.get(b.vendor_id!)} <span className="text-muted-foreground text-xs">{b.bill_no}</span></TableCell>
                    <TableCell>{b.due_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{pkr(Number(b.balance))}</TableCell>
                    <TableCell><Badge variant="outline" className={statusTone[b.status!]}>{label(b.status!)}</Badge></TableCell>
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
    </div>
  );
}
