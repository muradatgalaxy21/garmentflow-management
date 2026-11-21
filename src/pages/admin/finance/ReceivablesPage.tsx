import { useState } from "react";
import { AlertTriangle, HandCoins, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { buildLedger, fifoOutstanding, inRange, label, pkr, today, type LedgerEntry } from "@/lib/finance";
import { DateRange, ExportButtons, OptionSelect, PageHeader, PaymentDialog, StatCard, orderDate, useFinanceData, type PaymentTarget } from "./shared";

export default function ReceivablesPage() {
  const data = useFinanceData();
  const { can } = useAuth();
  const { toast } = useToast();
  const [client, setClient] = useState("");
  const [from, setFrom] = useState(today().slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today());
  const [pay, setPay] = useState<PaymentTarget | null>(null);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const name = (id: string) => data.clientNames.get(id) ?? "Unknown client";
  const priced = data.orders.filter((o) => o.total_amount != null);
  const unpriced = data.orders.length - priced.length;
  const clientIds = [...new Set([...priced.map((o) => o.client_id), ...data.clientPayments.map((p) => p.client_id)])];

  // Orders still owing per client, after receipts applied oldest-first (FIFO).
  const openOrders = (id: string) => {
    const received = data.clientPayments.filter((p) => p.client_id === id).reduce((s, p) => s + Number(p.amount), 0);
    return fifoOutstanding(
      priced.filter((o) => o.client_id === id).map((o) => ({ id: o.id, label: o.order_number, date: orderDate(o), amount: Number(o.total_amount) })),
      received,
    );
  };

  const summary = clientIds
    .map((id) => {
      const billed = priced.filter((o) => o.client_id === id).reduce((s, o) => s + Number(o.total_amount), 0);
      const received = data.clientPayments.filter((p) => p.client_id === id).reduce((s, p) => s + Number(p.amount), 0);
      return { id, name: name(id), billed, received, due: billed - received };
    })
    .sort((a, b) => b.due - a.due);
  const totals = summary.reduce((t, r) => ({ billed: t.billed + r.billed, received: t.received + r.received, due: t.due + r.due }), { billed: 0, received: 0, due: 0 });

  const startReceive = (id: string, docId?: string) =>
    setPay({ kind: "client", partyId: id, partyName: name(id), docs: openOrders(id).map((o) => ({ id: o.id, label: o.label, balance: o.outstanding })), docId });

  const orderNo = new Map(data.orders.map((o) => [o.id, o.order_number]));
  const ledger = client
    ? buildLedger(0, [
        ...priced.filter((o) => o.client_id === client).map<LedgerEntry>((o) => ({ date: orderDate(o), ref: o.order_number, description: o.product_summary, plus: Number(o.total_amount), minus: 0 })),
        ...data.clientPayments.filter((p) => p.client_id === client).map<LedgerEntry>((p) => ({
          date: p.received_on, ref: p.reference || "—", description: `Receipt (${label(p.method)})${p.order_id ? ` — ${orderNo.get(p.order_id) ?? "order"}` : ""}`, plus: 0, minus: Number(p.amount),
        })),
      ], from, to)
    : null;

  const receipts = data.clientPayments.filter((p) => inRange(p.received_on, from, to));

  const deleteReceipt = async (id: string) => {
    if (!window.confirm("Delete this receipt? The client's due goes back up.")) return;
    const { error } = await supabase.from("client_payments").delete().eq("id", id);
    if (error) return toast({ title: "Could not delete", description: error.message, variant: "destructive" });
    data.reload();
  };

  const summaryExport = [["Client", "Billed", "Received", "Due"], ...summary.map((r) => [r.name, r.billed, r.received, r.due]), ["Total", totals.billed, totals.received, totals.due]];
  const ledgerExport = ledger
    ? [["Date", "Ref", "Description", "Billed (+)", "Received (−)", "Balance"], [from, "", "Opening balance", "", "", ledger.opening],
       ...ledger.rows.map((r) => [r.date, r.ref, r.description, r.plus || "", r.minus || "", r.balance]), [to, "", "Closing balance", "", "", ledger.closing]]
    : [];
  const receiptExport = [["Date", "Client", "Order", "Method", "Reference", "Amount"],
    ...receipts.map((p) => [p.received_on, name(p.client_id), p.order_id ? orderNo.get(p.order_id) ?? "" : "On account", label(p.method), p.reference ?? "", Number(p.amount)])];

  return (
    <div>
      <PageHeader title="Receivables" subtitle="What clients owe us: order value minus payments received." />

      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <StatCard label="Total billed (orders)" value={pkr(totals.billed)} />
        <StatCard label="Received" value={pkr(totals.received)} tone="good" />
        <StatCard label="Outstanding" value={pkr(totals.due)} tone={totals.due > 0 ? "bad" : undefined} />
      </div>
      {unpriced > 0 && (
        <p className="flex items-center gap-2 text-sm text-amber-600 mb-4">
          <AlertTriangle className="w-4 h-4" /> {unpriced} order(s) have no total amount set, so they aren't counted. Set amounts on the Orders page.
        </p>
      )}

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">By client</TabsTrigger>
          <TabsTrigger value="ledger">Client ledger</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <div className="flex justify-end gap-2 my-3"><ExportButtons title="Receivables by Client" subtitle={`As of ${today()}`} rows={summaryExport} /></div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Client</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Due</TableHead><TableHead className="w-0" /></TableRow></TableHeader>
                <TableBody>
                  {summary.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No priced orders yet.</TableCell></TableRow>}
                  {summary.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(r.billed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(r.received)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${r.due > 0 ? "text-destructive" : ""}`}>{pkr(r.due)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setClient(r.id)}>Ledger</Button>
                          {can("finance.create") && <Button size="sm" variant="outline" onClick={() => startReceive(r.id)}><HandCoins className="w-3.5 h-3.5 mr-1" /> Receive</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card className="mt-3">
            <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
              <div className="w-64"><Label className="text-xs">Client</Label><OptionSelect value={client} onChange={setClient} placeholder="Pick client" options={summary.map((r) => ({ value: r.id, label: r.name }))} /></div>
              <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
              {ledger && <div className="flex gap-2"><ExportButtons title={`Client Ledger — ${name(client)}`} subtitle={`${from} to ${to}`} rows={ledgerExport} /></div>}
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {!ledger ? <p className="text-center text-muted-foreground py-10">Pick a client to see their ledger.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Ref</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Billed (+)</TableHead><TableHead className="text-right">Received (−)</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/40"><TableCell colSpan={5}>Opening balance</TableCell><TableCell className="text-right tabular-nums">{pkr(ledger.opening)}</TableCell></TableRow>
                    {ledger.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.date}</TableCell><TableCell>{r.ref}</TableCell><TableCell className="max-w-xs truncate">{r.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.plus ? pkr(r.plus) : ""}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.minus ? pkr(r.minus) : ""}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{pkr(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold"><TableCell colSpan={5}>Closing balance</TableCell><TableCell className="text-right tabular-nums">{pkr(ledger.closing)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts">
          <div className="flex flex-wrap items-end justify-between gap-3 my-3">
            <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
            <div className="flex gap-2"><ExportButtons title="Client Receipts" subtitle={`${from} to ${to}`} rows={receiptExport} /></div>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Order</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-0" /></TableRow></TableHeader>
                <TableBody>
                  {receipts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No receipts in this range.</TableCell></TableRow>}
                  {receipts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.received_on}</TableCell><TableCell className="font-medium">{name(p.client_id)}</TableCell>
                      <TableCell>{p.order_id ? orderNo.get(p.order_id) : <span className="text-muted-foreground">On account</span>}</TableCell>
                      <TableCell>{label(p.method)}</TableCell><TableCell>{p.reference || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(Number(p.amount))}</TableCell>
                      <TableCell>{can("finance.delete") && <Button size="icon" variant="ghost" aria-label="Delete receipt" onClick={() => deleteReceipt(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PaymentDialog target={pay} onClose={() => setPay(null)} onSaved={data.reload} />
    </div>
  );
}
