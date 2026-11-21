import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Eye, Wallet, Pencil } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { offerFinanceUndo } from "@/lib/undo";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { inRange, label, monthStart, pkr, today } from "@/lib/finance";
import {
  DateRange, DocStatusBadge, ExportButtons, LifecycleActions, OptionSelect, PageHeader, PaymentDialog, statusTone, useFinanceData,
  type BillBalance, type PaymentTarget,
} from "./shared";

type Item = Pick<Tables<"inventory_items">, "id" | "name" | "unit" | "sku">;
type BillLine = Tables<"vendor_bill_items">;
interface LineDraft { description: string; inventory_item_id: string; quantity: string; unit: string; unit_price: string }
interface BillDraft { id?: string; vendor_id: string; bill_no: string; bill_date: string; due_date: string; notes: string; lines: LineDraft[] }

const blankLine: LineDraft = { description: "", inventory_item_id: "none", quantity: "1", unit: "", unit_price: "" };

export default function PurchasesPage() {
  const data = useFinanceData();
  const { can } = useAuth();
  const { toast } = useToast();
  const canCreate = can("finance.create");
  const canUpdate = can("finance.update");
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [vendorFilter, setVendorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");
  const [from, setFrom] = useState(today().slice(0, 4) + "-01-01");
  const [to, setTo] = useState(today());
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [viewing, setViewing] = useState<{ bill: BillBalance; lines: BillLine[] } | null>(null);
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("inventory_items").select("id, name, unit, sku").order("name").then(({ data: d }) => setItems(d ?? []));
  }, []);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const vendorName = new Map(data.vendors.map((v) => [v.id, v.name]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const vendorOpts = [{ value: "all", label: "All vendors" }, ...data.vendors.map((v) => ({ value: v.id, label: v.name }))];

  const bills = data.balances
    .filter((b) => vendorFilter === "all" || b.vendor_id === vendorFilter)
    .filter((b) => statusFilter === "all" || (statusFilter === "open" ? b.status !== "paid" : b.status === statusFilter))
    .filter((b) => inRange(b.bill_date!, from, to))
    .sort((a, b) => b.bill_date!.localeCompare(a.bill_date!));

  const payments = data.vendorPayments
    .filter((p) => vendorFilter === "all" || p.vendor_id === vendorFilter)
    .filter((p) => inRange(p.paid_on, from, to));
  const billById = new Map(data.bills.map((x) => [x.id, x]));
  const full = (b: BillBalance) => billById.get(b.id!);
  const billNo = new Map(data.balances.map((b) => [b.id, b.bill_no || b.bill_date]));

  const openDocs = (vendorId: string) =>
    data.balances
      .filter((b) => b.vendor_id === vendorId && Number(b.balance) > 0)
      .map((b) => ({ id: b.id!, label: `${b.bill_no || "Bill"} (${b.bill_date})`, balance: Number(b.balance) }));

  const loadLines = async (billId: string) => {
    const { data: lines, error } = await supabase.from("vendor_bill_items").select("*").eq("bill_id", billId).order("created_at");
    if (error) toast({ title: "Could not load bill lines", description: error.message, variant: "destructive" });
    return lines ?? [];
  };

  const openEdit = async (b: BillBalance) => {
    const full = data.bills.find((x) => x.id === b.id)!;
    const lines = await loadLines(b.id!);
    setDraft({
      id: full.id, vendor_id: full.vendor_id, bill_no: full.bill_no ?? "", bill_date: full.bill_date, due_date: full.due_date ?? "", notes: full.notes ?? "",
      lines: lines.map((l) => ({
        description: l.description, inventory_item_id: l.inventory_item_id ?? "none", quantity: String(l.quantity), unit: l.unit ?? "", unit_price: String(l.unit_price),
      })),
    });
  };

  const draftTotal = (d: BillDraft) => d.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  const saveBill = async () => {
    if (!draft) return;
    const lines = draft.lines.filter((l) => l.description.trim() || l.inventory_item_id !== "none");
    if (!draft.vendor_id) return toast({ title: "Pick a vendor", variant: "destructive" });
    if (lines.length === 0) return toast({ title: "Add at least one line", variant: "destructive" });
    if (lines.some((l) => !(Number(l.quantity) > 0) || !(Number(l.unit_price) >= 0) || l.unit_price === ""))
      return toast({ title: "Every line needs quantity above 0 and a price", variant: "destructive" });

    const total = draftTotal(draft);
    const stockLines = lines.filter((l) => l.inventory_item_id !== "none").length;
    const ok = await confirm({
      title: draft.id ? "Save changes to this draft bill?" : "Save this purchase bill?",
      description: "Saved as a draft. Someone with Finance > Approve must approve it before it is final."
        + (stockLines ? ` ${stockLines} line(s) add stock to inventory now.` : ""),
      details: [
        ["Vendor", vendorName.get(draft.vendor_id) ?? ""],
        ["Bill no.", draft.bill_no || "—"],
        ["Date", draft.bill_date],
        ["Lines", String(lines.length)],
        ["Total", pkr(total)],
      ],
      confirmLabel: "Yes, save draft",
    });
    if (!ok) return;
    setSaving(true);
    const header = {
      vendor_id: draft.vendor_id, bill_no: draft.bill_no || null, bill_date: draft.bill_date, due_date: draft.due_date || null, notes: draft.notes || null,
    };
    let billId = draft.id;
    const res = billId
      ? await supabase.from("vendor_bills").update(header).eq("id", billId).select("id").single()
      : await supabase.from("vendor_bills").insert(header).select("id").single();
    if (res.error) {
      setSaving(false);
      return toast({ title: "Could not save bill", description: res.error.message, variant: "destructive" });
    }
    billId = res.data.id;
    // ponytail: replace-all lines is two calls, not one transaction; move to an RPC if partial saves ever show up.
    if (draft.id) {
      const del = await supabase.from("vendor_bill_items").delete().eq("bill_id", billId);
      if (del.error) {
        setSaving(false);
        return toast({ title: "Could not update lines", description: del.error.message, variant: "destructive" });
      }
    }
    const ins = await supabase.from("vendor_bill_items").insert(
      lines.map((l) => {
        const item = l.inventory_item_id === "none" ? null : itemById.get(l.inventory_item_id);
        return {
          bill_id: billId!,
          description: l.description.trim() || item?.name || "Item",
          inventory_item_id: item?.id ?? null,
          quantity: Number(l.quantity),
          unit: item?.unit ?? (l.unit || null),
          unit_price: Number(l.unit_price),
        };
      }),
    );
    setSaving(false);
    if (ins.error) return toast({ title: "Bill saved but lines failed", description: ins.error.message, variant: "destructive" });
    if (draft.id) toast({ title: "Draft bill updated" });
    else offerFinanceUndo(`Bill draft saved: ${pkr(total)}`, "vendor_bills", billId!, data.reload);
    setDraft(null);
    data.reload();
  };

  const billExport = [
    ["Bill", "Vendor", "Date", "Due", "Total", "Paid", "Balance", "Status"],
    ...bills.map((b) => [b.bill_no || "", vendorName.get(b.vendor_id!) ?? "", b.bill_date!, b.due_date ?? "", Number(b.total_amount), Number(b.paid_amount), Number(b.balance), label(b.status!)]),
  ];
  const payExport = [
    ["Date", "Vendor", "Bill", "Method", "Reference", "Amount"],
    ...payments.map((p) => [p.paid_on, vendorName.get(p.vendor_id) ?? "", p.bill_id ? billNo.get(p.bill_id) ?? "" : "On account", label(p.method), p.reference ?? "", Number(p.amount)]),
  ];

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setDraft((d) => d && { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div>
      <PageHeader title="Purchases" subtitle="Vendor bills (kapra, accessories, services) and payments made against them.">
        {canCreate && (
          <Button size="sm" onClick={() => setDraft({ vendor_id: vendorFilter === "all" ? "" : vendorFilter, bill_no: "", bill_date: today(), due_date: "", notes: "", lines: [{ ...blankLine }] })}>
            <Plus className="w-4 h-4 mr-1" /> New bill
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="w-56"><Label className="text-xs">Vendor</Label><OptionSelect value={vendorFilter} onChange={setVendorFilter} options={vendorOpts} /></div>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Button size="sm" variant="ghost" onClick={() => { setFrom(monthStart()); setTo(today()); }}>This month</Button>
      </div>

      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills">Bills ({bills.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bills">
          <div className="flex flex-wrap items-end justify-between gap-3 my-3">
            <div className="w-44">
              <OptionSelect value={statusFilter} onChange={setStatusFilter} options={[
                { value: "open", label: "Pending (not paid)" }, { value: "overdue", label: "Overdue" }, { value: "partial", label: "Partial" },
                { value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }, { value: "all", label: "All" },
              ]} />
            </div>
            <div className="flex gap-2"><ExportButtons title="Purchase Bills" subtitle={`${from} to ${to}`} rows={billExport} /></div>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill</TableHead><TableHead>Vendor</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead><TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No bills match.</TableCell></TableRow>}
                  {bills.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.bill_no || "—"}</TableCell>
                      <TableCell className="font-medium">{vendorName.get(b.vendor_id!)}</TableCell>
                      <TableCell>{b.bill_date}</TableCell>
                      <TableCell>{b.due_date || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(Number(b.total_amount))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{pkr(Number(b.balance))}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {full(b) && <DocStatusBadge row={full(b)!} />}
                          {!b.reverses_id && !b.voided_by_id && <Badge variant="outline" className={statusTone[b.status!]}>{label(b.status!)}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" aria-label="View bill" onClick={async () => setViewing({ bill: b, lines: await loadLines(b.id!) })}><Eye className="w-4 h-4" /></Button>
                          {canCreate && Number(b.balance) > 0 && (
                            <Button size="sm" variant="outline" onClick={() => setPay({ kind: "vendor", partyId: b.vendor_id!, partyName: vendorName.get(b.vendor_id!) ?? "", docs: openDocs(b.vendor_id!), docId: b.id! })}>
                              <Wallet className="w-3.5 h-3.5 mr-1" /> Pay
                            </Button>
                          )}
                          {canUpdate && b.doc_status === "draft" && <Button size="icon" variant="ghost" aria-label="Edit bill" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>}
                          {full(b) && (
                            <LifecycleActions table="vendor_bills" row={full(b)!} onChanged={data.reload}
                              summary={[["Vendor", vendorName.get(b.vendor_id!) ?? ""], ["Bill", b.bill_no || "—"], ["Total", pkr(Number(b.total_amount))]]} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <div className="flex justify-end gap-2 my-3"><ExportButtons title="Vendor Payments" subtitle={`${from} to ${to}`} rows={payExport} /></div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Bill</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead><TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No payments in this range.</TableCell></TableRow>}
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paid_on}</TableCell>
                      <TableCell className="font-medium">{vendorName.get(p.vendor_id)}</TableCell>
                      <TableCell>{p.bill_id ? billNo.get(p.bill_id) : <span className="text-muted-foreground">On account</span>}</TableCell>
                      <TableCell>{label(p.method)}</TableCell>
                      <TableCell>{p.reference || "—"}</TableCell>
                      <TableCell><DocStatusBadge row={p} /></TableCell>
                      <TableCell className="text-right tabular-nums">{pkr(Number(p.amount))}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <LifecycleActions table="vendor_payments" row={p} onChanged={data.reload}
                            summary={[["Vendor", vendorName.get(p.vendor_id) ?? ""], ["Amount", pkr(Number(p.amount))], ["Date", p.paid_on]]} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PaymentDialog target={pay} onClose={() => setPay(null)} onSaved={data.reload} />

      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Bill {viewing.bill.bill_no || ""} — {vendorName.get(viewing.bill.vendor_id!)}</DialogTitle></DialogHeader>
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {viewing.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}{l.inventory_item_id && <Badge variant="outline" className="ml-2 text-xs">stock</Badge>}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(l.quantity)} {l.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{pkr(Number(l.unit_price))}</TableCell>
                    <TableCell className="text-right tabular-nums">{pkr(Number(l.amount))}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold"><TableCell colSpan={3}>Total · paid {pkr(Number(viewing.bill.paid_amount))}</TableCell><TableCell className="text-right">{pkr(Number(viewing.bill.total_amount))}</TableCell></TableRow>
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      )}

      {draft && (
        <Dialog open onOpenChange={(o) => !o && setDraft(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{draft.id ? "Edit bill" : "New purchase bill"}</DialogTitle></DialogHeader>
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <Label>Vendor *</Label>
                <OptionSelect value={draft.vendor_id} onChange={(v) => setDraft({ ...draft, vendor_id: v })} placeholder="Pick vendor"
                  options={data.vendors.filter((v) => v.is_active || v.id === draft.vendor_id).map((v) => ({ value: v.id, label: v.name }))} />
              </div>
              <div><Label>Bill / invoice no.</Label><Input value={draft.bill_no} onChange={(e) => setDraft({ ...draft, bill_no: e.target.value })} /></div>
              <div />
              <div><Label>Bill date</Label><Input type="date" value={draft.bill_date} onChange={(e) => setDraft({ ...draft, bill_date: e.target.value })} /></div>
              <div><Label>Due date</Label><Input type="date" value={draft.due_date} min={draft.bill_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Notes</Label><Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="hidden sm:grid grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
                <span>Inventory item (optional)</span><span>Description</span><span>Qty</span><span>Unit</span><span>Rate</span><span className="text-right">Amount</span><span />
              </div>
              {draft.lines.map((l, i) => {
                const item = l.inventory_item_id === "none" ? null : itemById.get(l.inventory_item_id);
                return (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center border sm:border-0 rounded-md p-2 sm:p-0">
                    <OptionSelect value={l.inventory_item_id} onChange={(v) => setLine(i, { inventory_item_id: v, unit: itemById.get(v)?.unit ?? l.unit })}
                      options={[{ value: "none", label: "— Not a stock item —" }, ...items.map((it) => ({ value: it.id, label: `${it.name} (${it.unit})` }))]} />
                    <Input placeholder={item?.name ?? "e.g. Cotton fabric, transport"} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    <Input type="number" min="0" step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label="Quantity" />
                    <Input value={item?.unit ?? l.unit} disabled={!!item} placeholder="pcs" onChange={(e) => setLine(i, { unit: e.target.value })} aria-label="Unit" />
                    <Input type="number" min="0" step="0.01" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} aria-label="Rate" />
                    <span className="text-right tabular-nums text-sm">{pkr((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))}</span>
                    <Button size="icon" variant="ghost" aria-label="Remove line" disabled={draft.lines.length === 1}
                      onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2">
                <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { ...blankLine }] })}><Plus className="w-4 h-4 mr-1" /> Add line</Button>
                <span className="font-semibold">Total: {pkr(draftTotal(draft))}</span>
              </div>
              <p className="text-xs text-muted-foreground">Lines linked to an inventory item add that quantity to stock automatically.{draft.id && " Editing replaces all lines (old stock reversed, new stock added)."}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={saveBill} disabled={saving}>{saving ? "Saving…" : "Save bill"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
