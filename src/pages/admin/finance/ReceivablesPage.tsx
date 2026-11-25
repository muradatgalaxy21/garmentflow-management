import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, HandCoins, Loader2 } from "lucide-react";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { AGING_BUCKETS, buildLedger, inRange, label, pkr, today, type AgingBucket, type LedgerEntry } from "@/lib/finance";
import { splitTotals } from "@/lib/financePeriod";
import {
  DateRange, DocStatusBadge, ExportButtons, LifecycleActions, OptionSelect, PageHeader, PaymentDialog, StatCard, orderDate, useFinanceData,
  type PaymentTarget,
} from "./shared";
import { clientReceivable } from "./receivables";

const TAB_HELP: Record<string, string> = {
  clients: "One row per client: billed, received and what is still due. Open the ledger for the detail.",
  aging: "Open order balances grouped by how long ago the order was placed. Click a bucket to list its orders.",
  ledger: "Order-by-order and receipt-by-receipt history for one client, with a running balance.",
  receipts: "Every receipt, tied to its client and order, with what is still left on that order.",
};
const bucketName = (k: AgingBucket) => (k === "current" ? "Today" : `${k} days`);

export default function ReceivablesPage() {
  const data = useFinanceData();
  const { can } = useAuth();
  const [client, setClient] = useState("");
  const [from, setFrom] = useState(today().slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today());
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const [tab, setTab] = useState("clients");
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<AgingBucket | null>(null);
  const [showUnpriced, setShowUnpriced] = useState(false);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const name = (id: string) => data.clientNames.get(id) ?? "Unknown client";
  const asOf = today();
  const priced = data.orders.filter((o) => o.total_amount != null);
  const unpricedOrders = data.orders.filter((o) => o.total_amount == null);
  const unpriced = unpricedOrders.length;
  const clientIds = [...new Set([...priced.map((o) => o.client_id), ...data.clientPayments.map((p) => p.client_id)])];

  // Same basis as Finance Overview ("Clients owe us") and the Reports receivables aging:
  // all non-cancelled priced orders minus all non-discarded receipts (drafts included, split out in the Received hint).
  const summary = clientIds
    .map((id) => {
      const received = data.clientPayments.filter((p) => p.client_id === id).reduce((s, p) => s + Number(p.amount), 0);
      const orders = priced.filter((o) => o.client_id === id).map((o) => ({ id: o.id, label: o.order_number, date: orderDate(o), amount: Number(o.total_amount) }));
      return { id, name: name(id), ...clientReceivable(orders, received, asOf) };
    })
    .sort((a, b) => b.due - a.due);
  const totals = summary.reduce((t, r) => ({ billed: t.billed + r.billed, received: t.received + r.received, due: t.due + r.due }), { billed: 0, received: 0, due: 0 });
  const draftReceipts = splitTotals(data.clientPayments.map((p) => ({ status: p.status, amount: Number(p.amount) }))).draft;
  const agingTotals = Object.fromEntries(AGING_BUCKETS.map((k) => [k, summary.reduce((s, r) => s + r.aging[k], 0)])) as Record<AgingBucket, number>;
  const openAll = summary.flatMap((r) => r.open.map((o) => ({ ...o, clientId: r.id, client: r.name }))).sort((a, b) => b.days - a.days);
  const bucketRows = bucket ? openAll.filter((o) => o.bucket === bucket) : openAll;
  const over30 = (r: { aging: Record<AgingBucket, number> }) => r.aging["31-60"] + r.aging["61-90"] + r.aging["90+"];

  const needle = q.trim().toLowerCase();
  const shownClients = needle ? summary.filter((r) => r.name.toLowerCase().includes(needle)) : summary;

  const startReceive = (id: string, docId?: string) => {
    const r = summary.find((x) => x.id === id);
    setPay({
      kind: "client", partyId: id, partyName: name(id), docId,
      docs: (r?.open ?? []).map((o) => ({ id: o.id, label: o.label, balance: o.outstanding })),
      summary: r
        ? `Client owes ${pkr(r.due)} across ${r.open.length} open order${r.open.length === 1 ? "" : "s"}${r.oldestDays > 0 ? `; oldest is ${r.oldestDays} days old` : ""}. Pick an order or record on account.`
        : undefined,
    });
  };
  const openLedger = (id: string) => { setClient(id); setTab("ledger"); setQ(""); };

  const orderNo = new Map(data.orders.map((o) => [o.id, o.order_number]));
  const ledger = client
    ? buildLedger(0, [
        ...priced.filter((o) => o.client_id === client).map<LedgerEntry>((o) => ({ date: orderDate(o), ref: o.order_number, description: o.product_summary, plus: Number(o.total_amount), minus: 0 })),
        ...data.clientPayments.filter((p) => p.client_id === client).map<LedgerEntry>((p) => ({
          date: p.received_on, ref: p.reference || "—", description: `${p.reverses_id ? "Receipt reversal" : "Receipt"} (${label(p.method)})${p.order_id ? ` — ${orderNo.get(p.order_id) ?? "order"}` : ""}${p.status === "draft" ? " — DRAFT" : ""}`, plus: 0, minus: Number(p.amount),
        })),
      ], from, to)
    : null;

  // Remaining on the order itself (receipts tied to it only; on-account receipts are applied oldest-first elsewhere).
  const orderTotal = new Map(priced.map((o) => [o.id, Number(o.total_amount)]));
  const orderReceived = new Map<string, number>();
  for (const p of data.clientPayments) if (p.order_id) orderReceived.set(p.order_id, (orderReceived.get(p.order_id) ?? 0) + Number(p.amount));
  const orderLeft = (id: string | null) => (id && orderTotal.has(id) ? orderTotal.get(id)! - (orderReceived.get(id) ?? 0) : null);
  const receipts = data.clientPayments.filter((p) => inRange(p.received_on, from, to) && (!needle ||
    [name(p.client_id), p.order_id ? orderNo.get(p.order_id) ?? "" : "", p.reference ?? ""].some((x) => x.toLowerCase().includes(needle))));

  const summaryExport = [["Client", "Billed", "Received", "Due", "Past 30 days", "Oldest (days)"],
    ...summary.map((r) => [r.name, r.billed, r.received, r.due, over30(r), r.open.length ? r.oldestDays : ""]), ["Total", totals.billed, totals.received, totals.due, "", ""]];
  const ledgerExport = ledger
    ? [["Date", "Ref", "Description", "Billed (+)", "Received (−)", "Balance"], [from, "", "Opening balance", "", "", ledger.opening],
       ...ledger.rows.map((r) => [r.date, r.ref, r.description, r.plus || "", r.minus || "", r.balance]), [to, "", "Closing balance", "", "", ledger.closing]]
    : [];
  const receiptExport = [["Date", "Client", "Order", "Method", "Reference", "Amount", "Order balance"],
    ...receipts.map((p) => [p.received_on, name(p.client_id), p.order_id ? orderNo.get(p.order_id) ?? "" : "On account", label(p.method), p.reference ?? "", Number(p.amount), orderLeft(p.order_id) ?? ""])];

  return (
    <div>
      <PageHeader title="Receivables" subtitle="What clients owe us: order value minus payments received." />

      <div className="grid gap-4 sm:grid-cols-3 mb-4">
        <StatCard label="Total billed (orders)" value={pkr(totals.billed)} hint={`${priced.length} priced order${priced.length === 1 ? "" : "s"}, excl. cancelled`} />
        <StatCard label="Received" value={pkr(totals.received)} tone="good" hint={draftReceipts ? `incl. ${pkr(draftReceipts)} in draft receipts` : "all posted"} />
        <StatCard label="Outstanding" value={pkr(totals.due)} tone={totals.due > 0 ? "bad" : undefined} hint="Same basis as Finance Overview and the Reports aging total" />
      </div>
      {unpriced > 0 && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{unpriced} order{unpriced === 1 ? " has" : "s have"} no total amount, so billed and outstanding above leave {unpriced === 1 ? "it" : "them"} out. Outstanding will rise once {unpriced === 1 ? "it is" : "they are"} priced.</span>
            <button type="button" className="underline underline-offset-2 font-medium" onClick={() => setShowUnpriced((v) => !v)} aria-expanded={showUnpriced}>
              {showUnpriced ? "Hide orders" : "Show orders"}
            </button>
          </p>
          {showUnpriced && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {unpricedOrders.map((o) => (
                <li key={o.id}>
                  <Link className="underline underline-offset-2" to={`/admin/orders?status=all&q=${encodeURIComponent(o.order_number)}`}>{o.order_number}</Link>
                  <span className="text-muted-foreground"> — {name(o.client_id)}, {orderDate(o)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setQ(""); }}>
        <TabsList>
          <TabsTrigger value="clients">By client</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="ledger">Client ledger</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>
        <p className="text-sm text-muted-foreground mt-2">{TAB_HELP[tab]}</p>

        <TabsContent value="clients">
          <div className="mt-3">
            <TableToolbar search={q} onSearch={setQ} placeholder="Search clients…" count={shownClients.length} noun="client">
              <div className="ml-auto flex gap-2"><ExportButtons title="Receivables by Client" subtitle={`As of ${today()}`} rows={summaryExport} /></div>
            </TableToolbar>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Client</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Due</TableHead><TableHead className="text-right">Past 30 days</TableHead><TableHead className="text-right">Oldest</TableHead><TableHead className="w-0" /></TableRow></TableHeader>
                <TableBody>
                  {shownClients.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">{summary.length === 0 ? "No priced orders yet." : "No clients match your search."}</TableCell></TableRow>}
                  {shownClients.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(r.billed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(r.received)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${r.due > 0 ? "text-danger" : ""}`}>{pkr(r.due)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${over30(r) > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{pkr(over30(r))}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.open.length ? `${r.oldestDays}d` : "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openLedger(r.id)}>Ledger</Button>
                          {can("finance_receivables.create") && <Button size="sm" variant="outline" onClick={() => startReceive(r.id)}><HandCoins className="w-3.5 h-3.5 mr-1" /> Receive</Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging">
          <p className="text-xs text-muted-foreground mt-3">Orders have no payment due date yet, so age counts from the order date. Receipts (including on-account ones) are applied to the oldest orders first, as in Reports.</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5 my-3">
            {AGING_BUCKETS.map((k) => (
              <button key={k} type="button" aria-pressed={bucket === k} onClick={() => setBucket(bucket === k ? null : k)}
                className={`rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 ${bucket === k ? "ring-2 ring-primary" : ""}`}>
                <span className="block text-xs uppercase tracking-wide text-muted-foreground">{bucketName(k)}</span>
                <span className={`block text-lg font-bold tabular-nums ${k === "90+" && agingTotals[k] > 0 ? "text-danger" : ""}`}>{pkr(agingTotals[k])}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mb-2" aria-live="polite">
            {bucketRows.length} open order{bucketRows.length === 1 ? "" : "s"}{bucket ? ` in ${bucketName(bucket)}` : ""} · {pkr(bucketRows.reduce((s, o) => s + o.outstanding, 0))} outstanding
          </p>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Client</TableHead><TableHead>Order date</TableHead><TableHead className="text-right">Age</TableHead><TableHead className="text-right">Order total</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="w-0" /></TableRow></TableHeader>
                <TableBody>
                  {bucketRows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Nothing outstanding here.</TableCell></TableRow>}
                  {bucketRows.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.label}</TableCell>
                      <TableCell>{o.client}</TableCell>
                      <TableCell>{o.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.days}d</TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(o.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{pkr(o.outstanding)}{o.outstanding < o.amount && <span className="block text-xs font-normal text-muted-foreground">part-paid</span>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openLedger(o.clientId)}>History</Button>
                          {can("finance_receivables.create") && <Button size="sm" variant="outline" onClick={() => startReceive(o.clientId, o.id)}><HandCoins className="w-3.5 h-3.5 mr-1" /> Receive</Button>}
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
          <div className="flex flex-wrap items-end justify-between gap-3 mt-3 mb-4">
            <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
            <div className="flex gap-2"><ExportButtons title="Client Receipts" subtitle={`${from} to ${to}`} rows={receiptExport} /></div>
          </div>
          <TableToolbar search={q} onSearch={setQ} placeholder="Search client, order or reference…" count={receipts.length} noun="receipt" />
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Order</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Order balance</TableHead><TableHead className="w-0" /></TableRow></TableHeader>
                <TableBody>
                  {receipts.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">No receipts in this range.</TableCell></TableRow>}
                  {receipts.map((p) => {
                    const left = orderLeft(p.order_id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{p.received_on}</TableCell><TableCell className="font-medium">{name(p.client_id)}</TableCell>
                        <TableCell>{p.order_id ? orderNo.get(p.order_id) : <span className="text-muted-foreground">On account</span>}</TableCell>
                        <TableCell>{label(p.method)}</TableCell><TableCell>{p.reference || "—"}</TableCell>
                        <TableCell><DocStatusBadge row={p} /></TableCell>
                        <TableCell className="text-right tabular-nums">{pkr(Number(p.amount))}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {left == null ? <span className="text-muted-foreground">—</span>
                            : left > 0 ? <>{pkr(left)}<span className="block text-xs text-muted-foreground">partial</span></>
                            : <span className="text-emerald-600 dark:text-emerald-400">Settled</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <LifecycleActions table="client_payments" row={p} onChanged={data.reload}
                              summary={[["Client", name(p.client_id)], ["Amount", pkr(Number(p.amount))], ["Date", p.received_on]]} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
