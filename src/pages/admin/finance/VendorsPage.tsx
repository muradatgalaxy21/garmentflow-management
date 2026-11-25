import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Loader2, Plus, Pencil, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconButton } from "@/components/admin/IconButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_CATEGORIES, label, pkr, today } from "@/lib/finance";
import {
  ExportButtons, OptionSelect, PageHeader, PaymentDialog, useFinanceData,
  type PaymentTarget, type Vendor,
} from "./shared";
import { vendorPayables, type PayableStatus } from "./vendorPayables";

const blank = { name: "", category: "fabric", contact_person: "", phone: "", address: "", opening_balance: "0", notes: "", is_active: true };

export default function VendorsPage() {
  const data = useFinanceData();
  const { can } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ id?: string; form: typeof blank } | null>(null);
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [category, setCategory] = useState("all");
  const [payStatus, setPayStatus] = useState<"all" | PayableStatus>("all");
  const canCreate = can("finance_vendors.create");
  const canUpdate = can("finance_vendors.update");

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const asOf = today();
  const all = data.vendors.map((v) => ({ v, p: vendorPayables(v, data.bills, data.vendorPayments, asOf) }));
  const hiddenInactive = all.filter((r) => !r.v.is_active).length;
  const rows = all
    .filter(({ v, p }) =>
      (showInactive || v.is_active) &&
      (category === "all" || v.category === category) &&
      (payStatus === "all" || p.status === payStatus) &&
      `${v.name} ${v.category} ${v.phone ?? ""} ${v.contact_person ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .map(({ v, p }) => ({ v, p, balance: p.balance }));

  const openBills = (vendorId: string) =>
    data.balances
      .filter((b) => b.vendor_id === vendorId && Number(b.balance) > 0)
      .map((b) => ({ id: b.id!, label: `${b.bill_no || "Bill"} (${fmtDate(b.bill_date)}${b.due_date ? `, due ${fmtDate(b.due_date)}` : ""})`, balance: Number(b.balance) }));

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) return toast({ title: "Vendor name is required", variant: "destructive" });
    const row = {
      name: f.name.trim(), category: f.category, contact_person: f.contact_person || null, phone: f.phone || null,
      address: f.address || null, opening_balance: Number(f.opening_balance) || 0, notes: f.notes || null, is_active: f.is_active,
    };
    const { error } = editing.id
      ? await supabase.from("vendors").update(row).eq("id", editing.id)
      : await supabase.from("vendors").insert(row);
    if (error) return toast({ title: "Could not save vendor", description: error.message, variant: "destructive" });
    setEditing(null);
    data.reload();
  };

  const edit = (v: Vendor) =>
    setEditing({
      id: v.id,
      form: {
        name: v.name, category: v.category, contact_person: v.contact_person ?? "", phone: v.phone ?? "",
        address: v.address ?? "", opening_balance: String(v.opening_balance), notes: v.notes ?? "", is_active: v.is_active,
      },
    });

  const total = rows.reduce((s, r) => s + r.balance, 0);
  const exportRows = [
    ["Vendor", "Category", "Contact", "Phone", "Balance payable (PKR)", "Overdue (PKR)", "Next due"],
    ...rows.map((r) => [r.v.name, label(r.v.category), r.v.contact_person ?? "", r.v.phone ?? "", r.balance, r.p.overdueAmount, r.p.nextDue ?? ""]),
    ["Total", "", "", "", total, rows.reduce((s, r) => s + r.p.overdueAmount, 0), ""],
  ];

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Suppliers of fabric, accessories and services, with what we owe each.">
        <ExportButtons title="Vendor Balances" subtitle={`As of ${new Date().toLocaleDateString()}`} rows={exportRows} />
        {canCreate && <Button size="sm" onClick={() => setEditing({ form: { ...blank } })}><Plus className="w-4 h-4 mr-1" /> Add vendor</Button>}
      </PageHeader>

      <TableToolbar
        search={q} onSearch={setQ} placeholder="Search vendors" count={rows.length} noun="vendor"
        filtersActive={category !== "all" || payStatus !== "all" || showInactive}
        onClear={() => { setQ(""); setCategory("all"); setPayStatus("all"); setShowInactive(false); }}
      >
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40" aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {VENDOR_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{label(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={payStatus} onValueChange={(v) => setPayStatus(v as typeof payStatus)}>
          <SelectTrigger className="w-44" aria-label="Payable status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payable status</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="due">Owed, not overdue</SelectItem>
            <SelectItem value="settled">Nothing owed</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          {showInactive ? "Inactive vendors shown" : `Inactive vendors hidden${hiddenInactive ? ` (${hiddenInactive})` : ""}`}
        </label>
      </TableToolbar>
      <p className="mb-3 text-sm">Total payable{rows.length !== all.length ? " (filtered)" : ""}: <b className="tabular-nums">{pkr(total)}</b></p>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">{all.length === 0 ? "No vendors yet." : "No vendors match these filters."}</TableCell></TableRow>
              )}
              {rows.map(({ v, p, balance }) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    <Link to={`/admin/finance/vendors/${v.id}`} className="hover:underline underline-offset-2">{v.name}</Link>
                    {!v.is_active && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                  </TableCell>
                  <TableCell>{label(v.category)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{[v.contact_person, v.phone].filter(Boolean).join(" · ") || "No contact added"}</TableCell>
                  <TableCell className="text-right">
                    <div className={`tabular-nums font-semibold ${balance > 0 ? "text-destructive" : ""}`}>{pkr(balance)}</div>
                    <div className="mt-1 flex justify-end">
                      {p.status === "overdue" ? (
                        <StatusBadge tone="danger" icon={AlertTriangle}>Overdue {p.daysOverdue} {p.daysOverdue === 1 ? "day" : "days"}</StatusBadge>
                      ) : p.status === "due" ? (
                        <StatusBadge tone="neutral" icon={CalendarClock}>{p.nextDue ? `Due ${fmtDate(p.nextDue)}` : "Owed"}</StatusBadge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{balance < 0 ? "In credit" : "Nothing owed"}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {canCreate && (
                        balance > 0 ? (
                          <Button size="sm" variant="outline" onClick={() => setPay({ kind: "vendor", partyId: v.id, partyName: v.name, docs: openBills(v.id), summary: `Owed: ${pkr(balance)}${p.overdueAmount > 0 ? ` · ${pkr(p.overdueAmount)} overdue` : ""}` })}>
                            <Wallet className="w-3.5 h-3.5 mr-1" /> Pay
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground px-2">No payment due</span>
                        )
                      )}
                      {canUpdate && <IconButton label={`Edit ${v.name}`} onClick={() => edit(v)}><Pencil className="w-4 h-4" /></IconButton>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PaymentDialog target={pay} onClose={() => setPay(null)} onSaved={data.reload} />

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing.id ? "Edit vendor" : "Add vendor"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["name", "Name *"], ["contact_person", "Contact person"], ["phone", "Phone"], ["opening_balance", "Opening balance (we owe)"],
              ] as const).map(([k, l]) => (
                <div key={k}>
                  <Label>{l}</Label>
                  <Input
                    type={k === "opening_balance" ? "number" : "text"}
                    value={editing.form[k]}
                    onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [k]: e.target.value } })}
                  />
                </div>
              ))}
              <div>
                <Label>Category</Label>
                <OptionSelect value={editing.form.category} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, category: v } })} options={VENDOR_CATEGORIES} />
              </div>
              <label className="flex items-center gap-2 text-sm mt-6">
                <Switch checked={editing.form.is_active} onCheckedChange={(c) => setEditing({ ...editing, form: { ...editing.form, is_active: c } })} /> Active
              </label>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input value={editing.form.address} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, address: e.target.value } })} />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={editing.form.notes} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, notes: e.target.value } })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
