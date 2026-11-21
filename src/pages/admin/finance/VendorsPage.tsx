import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Pencil, Wallet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
import { VENDOR_CATEGORIES, label, pkr } from "@/lib/finance";
import {
  ExportButtons, OptionSelect, PageHeader, PaymentDialog, useFinanceData, vendorBalance,
  type PaymentTarget, type Vendor,
} from "./shared";

const blank = { name: "", category: "fabric", contact_person: "", phone: "", address: "", opening_balance: "0", notes: "", is_active: true };

export default function VendorsPage() {
  const data = useFinanceData();
  const { can } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<{ id?: string; form: typeof blank } | null>(null);
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const canCreate = can("finance.create");
  const canUpdate = can("finance.update");

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const rows = data.vendors
    .filter((v) => (showInactive || v.is_active) && `${v.name} ${v.category} ${v.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .map((v) => ({ v, balance: vendorBalance(v, data.bills, data.vendorPayments) }));

  const openBills = (vendorId: string) =>
    data.balances
      .filter((b) => b.vendor_id === vendorId && Number(b.balance) > 0)
      .map((b) => ({ id: b.id!, label: `${b.bill_no || "Bill"} (${b.bill_date})`, balance: Number(b.balance) }));

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
    ["Vendor", "Category", "Contact", "Phone", "Balance payable (PKR)"],
    ...rows.map((r) => [r.v.name, label(r.v.category), r.v.contact_person ?? "", r.v.phone ?? "", r.balance]),
    ["Total", "", "", "", total],
  ];

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Suppliers of fabric, accessories and services, with what we owe each.">
        <ExportButtons title="Vendor Balances" subtitle={`As of ${new Date().toLocaleDateString()}`} rows={exportRows} />
        {canCreate && <Button size="sm" onClick={() => setEditing({ form: { ...blank } })}><Plus className="w-4 h-4 mr-1" /> Add vendor</Button>}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="relative w-full max-w-xs">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Search vendors" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive
        </label>
        <span className="ml-auto text-sm">Total payable: <b className="tabular-nums">{pkr(total)}</b></span>
      </div>

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
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No vendors yet.</TableCell></TableRow>
              )}
              {rows.map(({ v, balance }) => (
                <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/admin/finance/vendors/${v.id}`)}>
                  <TableCell className="font-medium">
                    {v.name} {!v.is_active && <Badge variant="outline" className="ml-1">Inactive</Badge>}
                  </TableCell>
                  <TableCell>{label(v.category)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{[v.contact_person, v.phone].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${balance > 0 ? "text-destructive" : ""}`}>{pkr(balance)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      {canCreate && (
                        <Button size="sm" variant="outline" onClick={() => setPay({ kind: "vendor", partyId: v.id, partyName: v.name, docs: openBills(v.id) })}>
                          <Wallet className="w-3.5 h-3.5 mr-1" /> Pay
                        </Button>
                      )}
                      {canUpdate && <Button size="icon" variant="ghost" aria-label="Edit vendor" onClick={() => edit(v)}><Pencil className="w-4 h-4" /></Button>}
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
