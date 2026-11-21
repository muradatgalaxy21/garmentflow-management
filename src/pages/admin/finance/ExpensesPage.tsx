import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, inRange, label, monthStart, pkr, today } from "@/lib/finance";
import { DateRange, ExportButtons, OptionSelect, PageHeader, useFinanceData, type Expense } from "./shared";

const blank = { category: "misc", amount: "", spent_on: today(), method: "cash", paid_to: "", notes: "" };

export default function ExpensesPage() {
  const data = useFinanceData();
  const { can, isAdmin } = useAuth();
  const { toast } = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState<{ id?: string; form: typeof blank } | null>(null);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const rows = data.expenses.filter((e) => inRange(e.spent_on, from, to) && (cat === "all" || e.category === cat));
  const byCat = new Map<string, number>();
  for (const e of rows) byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount));
  const total = rows.reduce((s, e) => s + Number(e.amount), 0);

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!(Number(f.amount) > 0)) return toast({ title: "Enter an amount above 0", variant: "destructive" });
    const row = { category: f.category, amount: Number(f.amount), spent_on: f.spent_on, method: f.method, paid_to: f.paid_to || null, notes: f.notes || null };
    const { error } = editing.id ? await supabase.from("expenses").update(row).eq("id", editing.id) : await supabase.from("expenses").insert(row);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    setEditing(null);
    data.reload();
  };

  const remove = async (e: Expense) => {
    if (!window.confirm(`Delete ${label(e.category)} expense of ${pkr(Number(e.amount))}?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) return toast({ title: "Could not delete", description: error.message, variant: "destructive" });
    data.reload();
  };

  const exportRows = [
    ["Date", "Category", "Paid to", "Method", "Notes", "Amount"],
    ...rows.map((e) => [e.spent_on, label(e.category), e.paid_to ?? "", label(e.method), e.notes ?? "", Number(e.amount)]),
    ["", "", "", "", "Total", total],
  ];

  // Categories already used that aren't in the default list stay pickable.
  const catOptions = [...new Set([...EXPENSE_CATEGORIES, ...data.expenses.map((e) => e.category)])];

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Rent, bijli, gas, transport, repairs and other running costs. Worker wages come from logged work, not here.">
        <ExportButtons title="Expenses" subtitle={`${from} to ${to}`} rows={exportRows} />
        {can("finance.edit") && <Button size="sm" onClick={() => setEditing({ form: { ...blank } })}><Plus className="w-4 h-4 mr-1" /> Add expense</Button>}
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="w-48"><Label className="text-xs">Category</Label>
          <OptionSelect value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...catOptions.map((c) => ({ value: c, label: label(c) }))]} />
        </div>
        <span className="ml-auto text-sm">Total: <b className="tabular-nums">{pkr(total)}</b></span>
      </div>

      {byCat.size > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[...byCat].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <Badge key={c} variant="secondary" className="text-sm font-normal">{label(c)}: <b className="ml-1 tabular-nums">{pkr(v)}</b></Badge>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Paid to</TableHead><TableHead>Method</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-0" /></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No expenses in this range.</TableCell></TableRow>}
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.spent_on}</TableCell><TableCell>{label(e.category)}</TableCell><TableCell>{e.paid_to || "—"}</TableCell>
                  <TableCell>{label(e.method)}</TableCell><TableCell className="max-w-xs truncate text-muted-foreground">{e.notes}</TableCell>
                  <TableCell className="text-right tabular-nums">{pkr(Number(e.amount))}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {can("finance.edit") && (
                        <Button size="icon" variant="ghost" aria-label="Edit expense" onClick={() => setEditing({ id: e.id, form: {
                          category: e.category, amount: String(e.amount), spent_on: e.spent_on, method: e.method, paid_to: e.paid_to ?? "", notes: e.notes ?? "",
                        } })}><Pencil className="w-4 h-4" /></Button>
                      )}
                      {isAdmin && <Button size="icon" variant="ghost" aria-label="Delete expense" onClick={() => remove(e)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing.id ? "Edit expense" : "Add expense"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><OptionSelect value={editing.form.category} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, category: v } })} options={catOptions} /></div>
              <div><Label>Amount (PKR)</Label><Input type="number" min="0" step="0.01" value={editing.form.amount} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, amount: e.target.value } })} /></div>
              <div><Label>Date</Label><Input type="date" value={editing.form.spent_on} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, spent_on: e.target.value } })} /></div>
              <div><Label>Method</Label><OptionSelect value={editing.form.method} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, method: v } })} options={PAYMENT_METHODS} /></div>
              <div className="col-span-2"><Label>Paid to</Label><Input value={editing.form.paid_to} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, paid_to: e.target.value } })} /></div>
              <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={editing.form.notes} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, notes: e.target.value } })} /></div>
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
