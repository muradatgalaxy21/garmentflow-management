import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { buildLedger, label, pkr, today, type LedgerEntry } from "@/lib/finance";
import { DateRange, ExportButtons, PageHeader, PaymentDialog, StatCard, statusTone, useFinanceData, type PaymentTarget } from "./shared";

export default function VendorLedgerPage() {
  const { id } = useParams();
  const data = useFinanceData();
  const { can } = useAuth();
  const [from, setFrom] = useState(today().slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today());
  const [pay, setPay] = useState<PaymentTarget | null>(null);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;
  const vendor = data.vendors.find((v) => v.id === id);
  if (!vendor) return <p className="text-muted-foreground">Vendor not found.</p>;

  const bills = data.balances.filter((b) => b.vendor_id === id);
  const billNo = new Map(bills.map((b) => [b.id, b.bill_no || "Bill"]));
  const entries: LedgerEntry[] = [
    ...bills.map((b) => ({ date: b.bill_date!, ref: b.bill_no || "—", description: (b.reverses_id ? "Credit note (void)" : "Purchase bill") + (b.doc_status === "draft" ? " — DRAFT" : ""), plus: Number(b.total_amount), minus: 0 })),
    ...data.vendorPayments
      .filter((p) => p.vendor_id === id)
      .map((p) => ({
        date: p.paid_on,
        ref: p.reference || "—",
        description: `${p.reverses_id ? "Payment reversal" : "Payment"} (${label(p.method)})${p.bill_id ? ` — ${billNo.get(p.bill_id) ?? "bill"}` : " — on account"}${p.status === "draft" ? " — DRAFT" : ""}`,
        plus: 0,
        minus: Number(p.amount),
      })),
  ];
  const ledger = buildLedger(Number(vendor.opening_balance), entries, from, to);
  const openDocs = bills
    .filter((b) => Number(b.balance) > 0)
    .map((b) => ({ id: b.id!, label: `${b.bill_no || "Bill"} (${b.bill_date})`, balance: Number(b.balance) }));

  const exportRows = [
    ["Date", "Ref", "Description", "Bill (+)", "Paid (−)", "Balance"],
    [from, "", "Opening balance", "", "", ledger.opening],
    ...ledger.rows.map((r) => [r.date, r.ref, r.description, r.plus || "", r.minus || "", r.balance]),
    [to, "", "Closing balance", "", "", ledger.closing],
  ];

  return (
    <div>
      <Link to="/admin/finance/vendors" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-3 hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Vendors
      </Link>
      <PageHeader title={vendor.name} subtitle={[label(vendor.category), vendor.contact_person, vendor.phone, vendor.address].filter(Boolean).join(" · ")}>
        <ExportButtons title={`Vendor Ledger — ${vendor.name}`} subtitle={`${from} to ${to}`} rows={exportRows} />
        {can("finance_purchases.create") && (
          <Button size="sm" onClick={() => setPay({ kind: "vendor", partyId: vendor.id, partyName: vendor.name, docs: openDocs })}>
            <Wallet className="w-4 h-4 mr-1" /> Pay
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Opening (period)" value={pkr(ledger.opening)} />
        <StatCard label="Closing balance" value={pkr(ledger.closing)} tone={ledger.closing > 0 ? "bad" : undefined} />
        <StatCard label="Open bills" value={String(openDocs.length)} hint={pkr(openDocs.reduce((s, d) => s + d.balance, 0))} />
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
          <CardTitle className="text-base">Ledger</CardTitle>
          <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Ref</TableHead><TableHead>Description</TableHead>
                <TableHead className="text-right">Bill (+)</TableHead><TableHead className="text-right">Paid (−)</TableHead><TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40"><TableCell colSpan={5}>Opening balance</TableCell><TableCell className="text-right tabular-nums">{pkr(ledger.opening)}</TableCell></TableRow>
              {ledger.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.date}</TableCell><TableCell>{r.ref}</TableCell><TableCell>{r.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.plus ? pkr(r.plus) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.minus ? pkr(r.minus) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{pkr(r.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold"><TableCell colSpan={5}>Closing balance</TableCell><TableCell className="text-right tabular-nums">{pkr(ledger.closing)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bills</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No bills.</TableCell></TableRow>}
              {bills.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.bill_no || "—"}</TableCell><TableCell>{b.bill_date}</TableCell><TableCell>{b.due_date || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{pkr(Number(b.total_amount))}</TableCell>
                  <TableCell className="text-right tabular-nums">{pkr(Number(b.paid_amount))}</TableCell>
                  <TableCell className="text-right tabular-nums">{pkr(Number(b.balance))}</TableCell>
                  <TableCell><Badge variant="outline" className={statusTone[b.status!]}>{label(b.status!)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PaymentDialog target={pay} onClose={() => setPay(null)} onSaved={data.reload} />
    </div>
  );
}
