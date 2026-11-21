import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { downloadCsv, printTable, type Cell } from "@/lib/export";
import { PAYMENT_METHODS, label, pkr, today } from "@/lib/finance";

export type Vendor = Tables<"vendors">;
export type Bill = Tables<"vendor_bills">;
export type BillBalance = Tables<"vendor_bill_balances">;
export type VendorPayment = Tables<"vendor_payments">;
export type ClientPayment = Tables<"client_payments">;
export type Expense = Tables<"expenses">;
export type Order = Pick<Tables<"orders">, "id" | "order_number" | "client_id" | "party_name" | "total_amount" | "status" | "created_at" | "product_summary">;

// ponytail: loads all finance rows client-side; fine for one factory's volume, move totals to SQL views if it gets slow.
export function useFinanceData() {
  const [state, setState] = useState({
    loading: true,
    vendors: [] as Vendor[],
    bills: [] as Bill[],
    balances: [] as BillBalance[],
    vendorPayments: [] as VendorPayment[],
    clientPayments: [] as ClientPayment[],
    expenses: [] as Expense[],
    orders: [] as Order[],
    clientNames: new Map<string, string>(),
  });
  const { toast } = useToast();

  const reload = useCallback(async () => {
    const [v, b, bb, vp, cp, ex, o] = await Promise.all([
      supabase.from("vendors").select("*").order("name"),
      supabase.from("vendor_bills").select("*").order("bill_date", { ascending: false }),
      supabase.from("vendor_bill_balances").select("*"),
      supabase.from("vendor_payments").select("*").order("paid_on", { ascending: false }),
      supabase.from("client_payments").select("*").order("received_on", { ascending: false }),
      supabase.from("expenses").select("*").order("spent_on", { ascending: false }),
      supabase
        .from("orders")
        .select("id, order_number, client_id, party_name, total_amount, status, created_at, product_summary")
        .neq("status", "cancelled"),
    ]);
    const err = [v, b, bb, vp, cp, ex, o].find((r) => r.error)?.error;
    if (err) toast({ title: "Failed to load finance data", description: err.message, variant: "destructive" });

    const orders = (o.data ?? []) as Order[];
    const clientIds = [...new Set([...orders.map((x) => x.client_id), ...(cp.data ?? []).map((x) => x.client_id)])];
    const { data: names } = clientIds.length ? await supabase.rpc("finance_party_names", { _ids: clientIds }) : { data: [] };
    const clientNames = new Map<string, string>();
    for (const n of names ?? []) clientNames.set(n.id, n.name);
    // Offline parties entered on the order itself win over a blank profile.
    for (const ord of orders) if (!clientNames.has(ord.client_id) && ord.party_name) clientNames.set(ord.client_id, ord.party_name);

    setState({
      loading: false,
      vendors: v.data ?? [],
      bills: b.data ?? [],
      balances: bb.data ?? [],
      vendorPayments: vp.data ?? [],
      clientPayments: cp.data ?? [],
      expenses: ex.data ?? [],
      orders,
      clientNames,
    });
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

export function vendorBalance(v: Vendor, bills: Bill[], payments: VendorPayment[]) {
  const billed = bills.filter((b) => b.vendor_id === v.id).reduce((s, b) => s + Number(b.total_amount), 0);
  const paid = payments.filter((p) => p.vendor_id === v.id).reduce((s, p) => s + Number(p.amount), 0);
  return Number(v.opening_balance) + billed - paid;
}

export const orderDate = (o: Order) => o.created_at.slice(0, 10);

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function StatCard({ label: l, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" | "good" }) {
  const color = tone === "bad" ? "text-destructive" : tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground";
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ExportButtons({ title, subtitle, rows }: { title: string; subtitle: string; rows: Cell[][] }) {
  const file = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${today()}.csv`;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => downloadCsv(file, rows)} disabled={rows.length < 2}>
        <Download className="w-4 h-4 mr-1" /> CSV
      </Button>
      <Button size="sm" variant="outline" onClick={() => printTable(title, subtitle, rows)} disabled={rows.length < 2}>
        <Printer className="w-4 h-4 mr-1" /> Print / PDF
      </Button>
    </>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label className="text-xs">From</Label>
        <Input type="date" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} className="h-9 w-40" />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input type="date" value={to} min={from} onChange={(e) => onChange(from, e.target.value)} className="h-9 w-40" />
      </div>
    </div>
  );
}

export function OptionSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[] | { value: string; label: string }[];
  placeholder?: string;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: label(o) } : o));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// One dialog for both vendor payments and client receipts — same shape.
export interface PaymentTarget {
  kind: "vendor" | "client";
  partyId: string;
  partyName: string;
  docs: { id: string; label: string; balance: number }[]; // bills or orders still open
  docId?: string;
}

export function PaymentDialog({ target, onClose, onSaved }: { target: PaymentTarget | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ docId: "none", amount: "", date: today(), method: "cash", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    const doc = target.docs.find((d) => d.id === target.docId);
    setForm({ docId: doc?.id ?? "none", amount: doc ? String(doc.balance) : "", date: today(), method: "cash", reference: "", notes: "" });
  }, [target]);

  if (!target) return null;
  const isVendor = target.kind === "vendor";

  const save = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) return toast({ title: "Enter an amount above 0", variant: "destructive" });
    setSaving(true);
    const docId = form.docId === "none" ? null : form.docId;
    const common = { amount, method: form.method, reference: form.reference || null, notes: form.notes || null };
    const { error } = isVendor
      ? await supabase.from("vendor_payments").insert({ ...common, vendor_id: target.partyId, bill_id: docId, paid_on: form.date })
      : await supabase.from("client_payments").insert({ ...common, client_id: target.partyId, order_id: docId, received_on: form.date });
    setSaving(false);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    toast({ title: isVendor ? "Payment recorded" : "Receipt recorded" });
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isVendor ? "Pay vendor" : "Receive payment"} — {target.partyName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{isVendor ? "Against bill" : "Against order"}</Label>
            <OptionSelect
              value={form.docId}
              onChange={(v) => {
                const d = target.docs.find((x) => x.id === v);
                setForm((f) => ({ ...f, docId: v, amount: d ? String(d.balance) : f.amount }));
              }}
              options={[
                { value: "none", label: isVendor ? "On account / advance (no specific bill)" : "On account (no specific order)" },
                ...target.docs.map((d) => ({ value: d.id, label: `${d.label} — due ${pkr(d.balance)}` })),
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (PKR)</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Method</Label>
              <OptionSelect value={form.method} onChange={(v) => setForm({ ...form, method: v })} options={PAYMENT_METHODS} />
            </div>
            <div>
              <Label>Reference</Label>
              <Input placeholder="Cheque / txn no." value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const statusTone: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  partial: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  unpaid: "bg-muted text-muted-foreground",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
};
