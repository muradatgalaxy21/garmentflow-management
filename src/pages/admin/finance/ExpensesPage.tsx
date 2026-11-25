import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Loader2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { IconButton } from "@/components/admin/IconButton";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, label, monthStart, pkr, today } from "@/lib/finance";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { categoryBreakdown, expenseHistory, expenseTotals, filterExpenses, sortExpenses, type SortKey } from "@/lib/expensesView";
import { DateRange, ExportButtons, LifecycleActions, OptionSelect, PageHeader, useFinanceData, type Expense } from "./shared";
import { useConfirm } from "@/components/ConfirmDialog";
import { offerFinanceUndo } from "@/lib/undo";

const blank = { category: "misc", amount: "", spent_on: today(), method: "cash", paid_to: "", notes: "" };

// Posted, draft, voided and reversal each get a labelled badge (never colour alone).
function ExpenseStatus({ e }: { e: Expense }) {
  if (e.reverses_id) return <StatusBadge status="reversal" />;
  if (e.voided_by_id) return <StatusBadge status="voided" />;
  if (e.status === "draft") return <StatusBadge status="draft" />;
  return <StatusBadge status="posted">Posted{e.self_approved ? " (self)" : ""}</StatusBadge>;
}

const NoNotes = () => <span className="italic text-muted-foreground">No notes</span>;

type Sort = { key: SortKey; dir: "asc" | "desc" };

function SortHead({ k, sort, onSort, children, right }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; children: string; right?: boolean }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={right ? "text-right" : ""} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${right ? "flex-row-reverse" : ""}`}>
        {children}<Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} aria-hidden />
      </button>
    </TableHead>
  );
}

export default function ExpensesPage() {
  const data = useFinanceData();
  const { can } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "drafts">("all");
  const [sort, setSort] = useState<Sort>({ key: "spent_on", dir: "desc" });
  const [editing, setEditing] = useState<{ id?: string; form: typeof blank } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const inScope = useMemo(() => filterExpenses(data.expenses, { from, to, cat, q, tab: "all" }, label), [data.expenses, from, to, cat, q]);
  const draftCount = inScope.filter((e) => e.status === "draft").length;
  const rows = useMemo(() => sortExpenses(tab === "drafts" ? inScope.filter((e) => e.status === "draft") : inScope, sort.key, sort.dir), [inScope, tab, sort]);
  const totals = expenseTotals(rows);
  const breakdown = useMemo(() => categoryBreakdown(rows), [rows]);
  const viewing = data.expenses.find((e) => e.id === viewId) ?? null;

  // Names for the history of the opened expense (needs finance.view; falls back to "a team member").
  useEffect(() => {
    if (!viewing) return;
    const ids = [viewing.created_by, viewing.modified_by, viewing.posted_by].filter((x): x is string => !!x && !names.has(x));
    if (!ids.length) return;
    supabase.rpc("finance_party_names", { _ids: ids }).then(({ data: n }) => {
      if (n?.length) setNames((m) => new Map([...m, ...n.map((r) => [r.id, r.name] as [string, string])]));
    });
  }, [viewing, names]);

  if (data.loading) return <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mt-24" />;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "spent_on" || key === "amount" ? "desc" : "asc" }));
  const startEdit = (e: Expense) =>
    setEditing({ id: e.id, form: { category: e.category, amount: String(e.amount), spent_on: e.spent_on, method: e.method, paid_to: e.paid_to ?? "", notes: e.notes ?? "" } });
  const filtersActive = cat !== "all" || from !== monthStart() || to !== today();

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!(Number(f.amount) > 0)) return toast({ title: "Enter an amount above 0", variant: "destructive" });
    const row = { category: f.category, amount: Number(f.amount), spent_on: f.spent_on, method: f.method, paid_to: f.paid_to || null, notes: f.notes || null };
    const ok = await confirm({
      title: editing.id ? "Save changes to this draft expense?" : "Record this expense?",
      description: "Saved as a draft. Someone with Finance > Approve must approve it before it is final.",
      details: [["Category", label(row.category)], ["Amount", pkr(row.amount)], ["Date", fmtDate(row.spent_on)], ["Method", label(row.method)], ["Paid to", row.paid_to ?? "—"]],
      confirmLabel: "Yes, save draft",
    });
    if (!ok) return;
    const res = editing.id
      ? await supabase.from("expenses").update(row).eq("id", editing.id).select("id").single()
      : await supabase.from("expenses").insert(row).select("id").single();
    if (res.error) return toast({ title: "Could not save", description: res.error.message, variant: "destructive" });
    if (!editing.id) offerFinanceUndo(`Expense draft saved: ${pkr(row.amount)}`, "expenses", res.data.id, data.reload);
    setEditing(null);
    data.reload();
  };

  const exportRows = [
    ["Date", "Category", "Paid to", "Method", "Notes", "Status", "Amount"],
    ...rows.map((e) => [e.spent_on, label(e.category), e.paid_to ?? "", label(e.method), e.notes ?? "", e.status, Number(e.amount)]),
    ["", "", "", "", "", "Total (incl. drafts)", totals.total],
  ];

  // Categories already used that aren't in the default list stay pickable.
  const catOptions = [...new Set([...EXPENSE_CATEGORIES, ...data.expenses.map((e) => e.category)])];
  const summaryOf = (e: Expense): [string, string][] => [["Category", label(e.category)], ["Amount", pkr(Number(e.amount))], ["Date", fmtDate(e.spent_on)]];
  const who = (id: string | null) => (id ? names.get(id) ?? "a team member" : "unknown");
  const setForm = (patch: Partial<typeof blank>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Rent, bijli, gas, transport, repairs and other running costs. Worker wages come from logged work, not here.">
        <ExportButtons title="Expenses" subtitle={`${fmtDate(from)} to ${fmtDate(to)}`} rows={exportRows} />
        {can("finance_expenses.create") && <Button size="sm" onClick={() => setEditing({ form: { ...blank } })}><Plus className="w-4 h-4 mr-1" /> Add expense</Button>}
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "drafts")} className="mb-3">
        <TabsList>
          <TabsTrigger value="all">All expenses</TabsTrigger>
          <TabsTrigger value="drafts">Drafts to review ({draftCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="w-48"><Label className="text-xs">Category</Label>
          <OptionSelect value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...catOptions.map((c) => ({ value: c, label: label(c) }))]} />
        </div>
      </div>
      <TableToolbar search={q} onSearch={setQ} placeholder="Search paid to, notes, category" count={rows.length} noun="expense"
        filtersActive={filtersActive} onClear={() => { setQ(""); setCat("all"); setFrom(monthStart()); setTo(today()); }} />

      <div className="mb-3 text-sm">
        <p>
          {tab === "drafts" ? "Drafts" : "Total"}, {fmtDate(from)} – {fmtDate(to)}{cat !== "all" ? `, ${label(cat)}` : ""}: <b className="tabular-nums">{pkr(totals.total)}</b>{" "}
          <span className="text-muted-foreground">
            {totals.draftCount > 0
              ? `(includes ${pkr(totals.draft)} in ${totals.draftCount} draft${totals.draftCount === 1 ? "" : "s"}; posted ${pkr(totals.posted)})`
              : "(no drafts included)"}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          <b>Draft</b> = saved, waiting for approval by someone else; counted in totals, can still be edited or undone. <b>Posted</b> = approved and final; a mistake needs a Void.
        </p>
      </div>

      {breakdown.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium mb-2">By category, {fmtDate(from)} – {fmtDate(to)}</h2>
            <ul className="space-y-1.5">
              {breakdown.map((b) => (
                <li key={b.category} className="grid grid-cols-[6rem_1fr_auto] sm:grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate">{label(b.category)}</span>
                  <span className="h-2 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-primary" style={{ width: `${Math.max(b.pct, 1)}%` }} /></span>
                  <span className="tabular-nums text-right">{pkr(b.amount)} <span className="text-muted-foreground">· {Math.round(b.pct)}%</span></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead k="spent_on" sort={sort} onSort={toggleSort}>Date</SortHead>
                <SortHead k="category" sort={sort} onSort={toggleSort}>Category</SortHead>
                <SortHead k="paid_to" sort={sort} onSort={toggleSort}>Paid to</SortHead>
                <TableHead>Method</TableHead><TableHead>Notes</TableHead><TableHead>Status</TableHead>
                <SortHead k="amount" sort={sort} onSort={toggleSort} right>Amount</SortHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  {tab === "drafts" ? "No drafts waiting for review in this range." : "No expenses match these filters."}
                </TableCell></TableRow>
              )}
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(e.spent_on)}</TableCell><TableCell>{label(e.category)}</TableCell>
                  <TableCell>{e.paid_to || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{label(e.method)}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{e.notes || <NoNotes />}</TableCell>
                  <TableCell><ExpenseStatus e={e} /></TableCell>
                  <TableCell className="text-right tabular-nums">{pkr(Number(e.amount))}</TableCell>
                  <TableCell>
                    {/* Same order every row: View, Edit (drafts), then Approve / Undo (drafts) or Void (posted). */}
                    <div className="flex items-center gap-1 justify-end">
                      <IconButton label="View details and history" onClick={() => setViewId(e.id)}><Eye className="w-4 h-4" /></IconButton>
                      {can("finance_expenses.update") && e.status === "draft" && <IconButton label="Edit expense" onClick={() => startEdit(e)}><Pencil className="w-4 h-4" /></IconButton>}
                      <LifecycleActions table="expenses" row={e} onChanged={data.reload} summary={summaryOf(e)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{label(viewing.category)}: {pkr(Number(viewing.amount))}</DialogTitle></DialogHeader>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Status</dt><dd><ExpenseStatus e={viewing} /></dd>
              <dt className="text-muted-foreground">Date</dt><dd>{fmtDate(viewing.spent_on)}</dd>
              <dt className="text-muted-foreground">Method</dt><dd>{label(viewing.method)}</dd>
              <dt className="text-muted-foreground">Paid to</dt><dd>{viewing.paid_to || "—"}</dd>
              <dt className="text-muted-foreground">Notes</dt><dd>{viewing.notes || <NoNotes />}</dd>
            </dl>
            <div>
              <h3 className="text-sm font-medium mb-1">History</h3>
              <ol className="space-y-1 text-sm border-l pl-3">
                {expenseHistory(viewing).map((h, i) => (
                  <li key={i}>{h.text} <span className="text-muted-foreground">by {who(h.by)}, {fmtDateTime(h.at)}</span></li>
                ))}
              </ol>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              {can("finance_expenses.update") && viewing.status === "draft" && (
                <Button variant="outline" size="sm" onClick={() => { setViewId(null); startEdit(viewing); }}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>
              )}
              <LifecycleActions table="expenses" row={viewing} onChanged={() => { setViewId(null); data.reload(); }} summary={summaryOf(viewing)} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing.id ? "Edit expense" : "Add expense"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label><OptionSelect value={editing.form.category} onChange={(v) => setForm({ category: v })} options={catOptions} /></div>
              <div><Label>Amount (PKR)</Label><Input type="number" min="0" step="0.01" value={editing.form.amount} onChange={(e) => setForm({ amount: e.target.value })} /></div>
              <div><Label>Date</Label><Input type="date" value={editing.form.spent_on} onChange={(e) => setForm({ spent_on: e.target.value })} /></div>
              <div><Label>Method</Label><OptionSelect value={editing.form.method} onChange={(v) => setForm({ method: v })} options={PAYMENT_METHODS} /></div>
              <div className="col-span-2"><Label>Paid to</Label><Input value={editing.form.paid_to} onChange={(e) => setForm({ paid_to: e.target.value })} /></div>
              <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={editing.form.notes} onChange={(e) => setForm({ notes: e.target.value })} /></div>
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
