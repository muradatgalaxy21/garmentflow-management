import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Lock, LockOpen } from "lucide-react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { fmtDate } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { label, pkr, today } from "@/lib/finance";
import type { FinanceTable } from "@/lib/undo";
import { LifecycleActions, useFinanceData, type LifecycleRow } from "./shared";

type Data = ReturnType<typeof useFinanceData>;

// Drafts waiting for a checker (plans/02 part A, maker-checker).
const KIND_LINK: Record<FinanceTable, string> = {
  vendor_bills: "/admin/finance/purchases",
  vendor_payments: "/admin/finance/vendors",
  client_payments: "/admin/finance/receivables",
  expenses: "/admin/finance/expenses",
};

export function PendingApprovals({ data }: { data: Data }) {
  const vendorName = new Map(data.vendors.map((v) => [v.id, v.name]));
  const client = (id: string) => data.clientNames.get(id) ?? "Client";
  const rows: { table: FinanceTable; kind: string; party: string; date: string; amount: number; row: LifecycleRow }[] = [
    ...data.bills.filter((b) => b.status === "draft").map((b) => ({ table: "vendor_bills" as const, kind: "Bill", party: vendorName.get(b.vendor_id) ?? "", date: b.bill_date, amount: Number(b.total_amount), row: b })),
    ...data.vendorPayments.filter((p) => p.status === "draft").map((p) => ({ table: "vendor_payments" as const, kind: "Vendor payment", party: vendorName.get(p.vendor_id) ?? "", date: p.paid_on, amount: Number(p.amount), row: p })),
    ...data.clientPayments.filter((p) => p.status === "draft").map((p) => ({ table: "client_payments" as const, kind: "Client receipt", party: client(p.client_id), date: p.received_on, amount: Number(p.amount), row: p })),
    ...data.expenses.filter((e) => e.status === "draft").map((e) => ({ table: "expenses" as const, kind: "Expense", party: label(e.category), date: e.spent_on, amount: Number(e.amount), row: e })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card className="mb-6 border-warning/40 border-l-4 border-l-warning" aria-labelledby="approvals-h">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle id="approvals-h" className="text-base flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-warning" aria-hidden /> Needs your approval</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Action area: drafts are counted in totals but are not final until approved. You cannot approve an entry you created or edited (admins can; it is logged as self-approved).</p>
        </div>
        <StatusBadge tone="warning">{rows.length} draft{rows.length === 1 ? "" : "s"} · {pkr(rows.reduce((s, r) => s + r.amount, 0))}</StatusBadge>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Party</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-0"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nothing waiting for approval.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.table + r.row.id}>
                <TableCell><Link to={KIND_LINK[r.table]} className="hover:underline">{r.kind}</Link></TableCell>
                <TableCell className="font-medium">{r.party}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                <TableCell className="text-right tabular-nums">{pkr(r.amount)}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <LifecycleActions table={r.table} row={r.row} onChanged={data.reload}
                      toastDetail={`${r.kind} · ${r.party} · ${pkr(r.amount)}`}
                      summary={[["Type", r.kind], ["Party", r.party], ["Date", fmtDate(r.date)], ["Amount", pkr(r.amount)]]} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Admin-only month close / re-open (plans/02 part A).
export function AccountingPeriods({ data }: { data: Data }) {
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [month, setMonth] = useState(today().slice(0, 7));

  const closed = data.periods.filter((p) => p.closed_at).sort((a, b) => b.period_month.localeCompare(a.period_month));
  const isClosed = closed.some((p) => p.period_month.startsWith(month));
  const draftsIn = [...data.bills.map((b) => [b.status, b.bill_date]), ...data.vendorPayments.map((p) => [p.status, p.paid_on]),
    ...data.clientPayments.map((p) => [p.status, p.received_on]), ...data.expenses.map((e) => [e.status, e.spent_on])]
    .filter(([s, d]) => s === "draft" && d.startsWith(month)).length;

  const act = async () => {
    const ok = await confirm(isClosed
      ? { title: `Re-open ${month}?`, description: "Entries dated in this month become editable again. The re-open is logged.", requireReason: "Reason (required)", confirmLabel: "Re-open", destructive: true }
      : { title: `Close ${month}?`, description: draftsIn ? `${draftsIn} draft(s) are still dated in this month and will be frozen as drafts until it is re-opened.` : "No entry dated in this month can be added, edited, approved or voided after closing.", confirmLabel: "Close month", destructive: true });
    if (!ok) return;
    const { error } = isClosed
      ? await supabase.rpc("reopen_period", { _month: month + "-01", _note: ok.reason! })
      : await supabase.rpc("close_period", { _month: month + "-01" });
    if (error) return toast({ title: "Could not complete", description: error.message, variant: "destructive" });
    toast({ title: isClosed ? "Month re-opened" : "Month closed" });
    data.reload();
  };

  return (
    <Card className="mt-6">
      <CardHeader><CardTitle className="text-base">Accounting periods</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Closed months are locked: corrections go into an open month as adjustment or void entries.
        </p>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" aria-label="Month" />
            <Button size="sm" variant={isClosed ? "outline" : "default"} onClick={act} disabled={!month}>
              {isClosed ? <><LockOpen className="w-4 h-4 mr-1" /> Re-open</> : <><Lock className="w-4 h-4 mr-1" /> Close month</>}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {closed.length === 0 && <span className="text-muted-foreground">No closed months yet.</span>}
          {closed.map((p) => <Badge key={p.period_month} variant="secondary"><Lock className="w-3 h-3 mr-1" />{p.period_month.slice(0, 7)}</Badge>)}
        </div>
      </CardContent>
    </Card>
  );
}
