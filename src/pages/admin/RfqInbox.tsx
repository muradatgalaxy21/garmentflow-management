import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { HelpCircle, Inbox, Loader2, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { StatusBadge, STATUSES } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  filterRfqs,
  matchesFilter,
  matchesSearch,
  RFQ_STATUSES,
  RFQ_STATUS_HELP,
  type RfqFilter,
  type RfqSort,
  type RfqStatus,
} from "@/lib/rfqInbox";

interface Rfq {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  product_type: string | null;
  quantity: string | null;
  message: string;
  status: RfqStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const FILTERS: [RfqFilter, string][] = [
  ["needs", "Needs response"],
  ...RFQ_STATUSES.map((s): [RfqFilter, string] => [s, STATUSES[s][1]]),
  ["all", "All requests"],
];
const DEFAULT_FILTER: RfqFilter = "needs";

const age = (d: string) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });
const summary = (r: Rfq) => [r.product_type, r.quantity && `Qty ${r.quantity}`].filter(Boolean).join(" · ");

export default function RfqInbox() {
  const { can } = useAuth();
  const canEdit = can("rfqs.update");
  const [params] = useSearchParams();
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RfqFilter>(() => {
    const p = params.get("status") as RfqFilter | null;
    return p && FILTERS.some(([v]) => v === p) ? p : DEFAULT_FILTER;
  });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RfqSort>("newest");
  const [selected, setSelected] = useState<Rfq | null>(null);
  const [draftStatus, setDraftStatus] = useState<RfqStatus>("new");
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rfqs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load RFQs", description: error.message, variant: "destructive" });
    } else {
      setRfqs((data ?? []) as Rfq[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => filterRfqs(rfqs, filter, search, sort), [rfqs, filter, search, sort]);
  // Counts follow the search so each option shows what picking it would give.
  const counts = useMemo(() => {
    const searched = rfqs.filter((r) => matchesSearch(r, search));
    return Object.fromEntries(FILTERS.map(([f]) => [f, searched.filter((r) => matchesFilter(r, f)).length]));
  }, [rfqs, search]);

  const clear = () => {
    setSearch("");
    setFilter(DEFAULT_FILTER);
  };

  const openDetail = (rfq: Rfq) => {
    setSelected(rfq);
    setDraftStatus(rfq.status);
    setDraftNotes(rfq.notes ?? "");
  };

  const saveChanges = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("rfqs")
      .update({ status: draftStatus, notes: draftNotes || null })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "RFQ updated" });
    setSelected(null);
    load();
  };

  const convert = async (rfq: Rfq) => {
    setSaving(true);
    try {
      // 1. Create Order
      const { data: newOrder, error: oErr } = await supabase
        .from("orders")
        .insert({
          client_id: rfq.id, // linked or fallback
          product_summary: `${rfq.product_type || "Garments"} - ${rfq.name}`,
          quantity: parseInt(rfq.quantity || "100") || 100,
          status: "in_production",
          party_name: rfq.company || rfq.name,
        })
        .select()
        .single();

      if (oErr) throw oErr;

      // 2. Create Batch
      const styleNum = `STYLE-${rfq.product_type ? rfq.product_type.slice(0, 3).toUpperCase() : "GAR"}-${Date.now().toString().slice(-4)}`;
      const { error: bErr } = await supabase.from("production_batches").insert({
        order_id: newOrder.id,
        style_number: styleNum,
        total_quantity: newOrder.quantity,
        status: "in_progress",
      });

      if (bErr) throw bErr;

      toast({ title: "Order & Batch Created!", description: `Created Order #${newOrder.order_number} & Batch #${styleNum}` });
      setSelected(null);
      load();
    } catch (err: any) {
      toast({ title: "Conversion failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="RFQ Inbox" description="Quote requests from the public website." />

      <TableToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search requests…"
        count={visible.length}
        noun="request"
        filtersActive={filter !== DEFAULT_FILTER}
        onClear={clear}
      >
        <Select value={filter} onValueChange={(v) => setFilter(v as RfqFilter)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label} ({counts[v] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as RfqSort)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first (waiting longest)</SelectItem>
          </SelectContent>
        </Select>
      </TableToolbar>

      <details className="mb-4 text-sm">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <HelpCircle className="h-4 w-4" aria-hidden /> What do the statuses mean?
        </summary>
        <dl className="mt-2 grid gap-1.5 rounded-lg border bg-card p-3 sm:grid-cols-[auto_1fr] sm:gap-x-3">
          {RFQ_STATUSES.map((s) => (
            <div key={s} className="contents">
              <dt><StatusBadge status={s} /></dt>
              <dd className="mb-1 text-muted-foreground sm:mb-0">{RFQ_STATUS_HELP[s]}</dd>
            </div>
          ))}
        </dl>
      </details>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" aria-label="Loading" />
        </div>
      ) : visible.length === 0 ? (
        search || filter !== DEFAULT_FILTER ? (
          <EmptyState
            title="No requests match"
            description="Try another status or search."
            action={<Button variant="outline" size="sm" onClick={clear}>Clear search and filter</Button>}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="Nothing waiting for a reply"
            description="New quote requests from the website show up here."
            action={<Button variant="outline" size="sm" onClick={() => setFilter("all")}>Show all requests</Button>}
          />
        )
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="hidden md:grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8.5rem_6.5rem_4.5rem] gap-4 border-b px-4 py-2 admin-label text-muted-foreground">
            <span>Company / contact</span>
            <span>Request</span>
            <span>Received</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y">
            {visible.map((rfq) => (
              <li
                key={rfq.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8.5rem_6.5rem_4.5rem] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{rfq.company || rfq.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rfq.company ? `${rfq.name} · ` : ""}{rfq.email}
                  </p>
                </div>
                <div className="row-start-1 col-start-2 md:row-auto md:col-auto md:order-4">
                  <StatusBadge status={rfq.status} />
                </div>
                <div className="col-span-2 min-w-0 md:col-span-1 md:order-2">
                  {summary(rfq) && <p className="truncate text-sm text-foreground">{summary(rfq)}</p>}
                  <p className="truncate text-sm text-muted-foreground">{rfq.message}</p>
                </div>
                <p className="text-xs text-muted-foreground md:order-3">
                  <span className="text-foreground md:block">{fmtDate(rfq.created_at)}</span>
                  <span className="md:hidden"> · </span>
                  <span>{age(rfq.created_at)}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-end md:order-5"
                  onClick={() => openDetail(rfq)}
                  aria-label={`Open request from ${rfq.company || rfq.name}`}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.company || selected.name}</SheetTitle>
                <SheetDescription>
                  Received {fmtDateTime(selected.created_at)} ({age(selected.created_at)})
                  {selected.updated_at !== selected.created_at && <> · Last updated {fmtDateTime(selected.updated_at)}</>}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 mt-6 text-sm">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Contact</h3>
                  <Detail label="Name" value={selected.name} />
                  {selected.company && <Detail label="Company" value={selected.company} />}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={`mailto:${selected.email}`}><Mail /> {selected.email}</a>
                    </Button>
                    {selected.phone && (
                      <Button asChild variant="outline" size="sm">
                        <a href={`tel:${selected.phone}`}><Phone /> {selected.phone}</a>
                      </Button>
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Request</h3>
                  <Detail label="Product type" value={selected.product_type || "—"} />
                  <Detail label="Quantity" value={selected.quantity || "—"} />
                  <div>
                    <p className="admin-label text-muted-foreground mb-1">Message</p>
                    <p className="text-foreground whitespace-pre-wrap break-words">{selected.message}</p>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Status</h3>
                  <div>
                    <Label htmlFor="rfq-status" className="sr-only">Status</Label>
                    <Select value={draftStatus} onValueChange={(v) => setDraftStatus(v as RfqStatus)} disabled={!canEdit}>
                      <SelectTrigger id="rfq-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RFQ_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUSES[s][1]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">{RFQ_STATUS_HELP[draftStatus]}</p>
                  </div>

                  <div>
                    <Label htmlFor="rfq-notes" className="admin-label text-muted-foreground">Internal notes</Label>
                    <Textarea
                      id="rfq-notes"
                      className="mt-1"
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      rows={4}
                      placeholder="Add notes for the team..."
                      disabled={!canEdit}
                    />
                  </div>

                  {canEdit && (
                    <Button className="w-full" onClick={saveChanges} disabled={saving}>
                      {saving ? "Saving..." : "Save changes"}
                    </Button>
                  )}
                </section>

                {draftStatus === "won" && can("orders.create") && can("batches.create") && (
                  <section className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-semibold text-foreground">Next step</h3>
                    <Button
                      variant="secondary"
                      className="w-full bg-success hover:bg-success/90 text-white font-semibold"
                      onClick={() => convert(selected)}
                      disabled={saving}
                    >
                      Convert to Production Order &amp; Batch
                    </Button>
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="admin-label text-muted-foreground">{label}</p>
      <p className="text-foreground break-words">{value}</p>
    </div>
  );
}
