import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/admin/EmptyState";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { fmtDate } from "@/lib/format";
import { pkr } from "@/lib/finance";
import { clientReceivable } from "@/pages/admin/finance/receivables";

interface Profile {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
}
interface OrderRow { id: string; order_number: string; client_id: string; status: string; total_amount: number | null; created_at: string; product_summary: string | null }
interface MsgRow { id: string; client_id: string; type: string; status: string; message: string; created_at: string }
interface RfqRow { id: string; email: string; status: string; product_type: string | null; quantity: string | null; created_at: string }
interface PayRow { id: string; client_id: string; amount: number; method: string; received_on: string; status: string; created_at: string }

type Sort = "name" | "active" | "recent";
const SORT_LABEL: Record<Sort, string> = { name: "Name (A–Z)", active: "Most active orders", recent: "Latest activity" };

// Orders in these states need no more work from us.
const isActive = (s: string) => s !== "delivered" && s !== "cancelled";
const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export default function ClientsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientIds, setClientIds] = useState<Set<string>>(new Set());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [msgs, setMsgs] = useState<MsgRow[]>([]);
  const [rfqs, setRfqs] = useState<RfqRow[]>([]);
  const [pays, setPays] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [p, r, o, m, q, cp] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id, role").eq("role", "client"),
        supabase.from("orders").select("id, order_number, client_id, status, total_amount, created_at, product_summary").order("created_at", { ascending: false }),
        supabase.from("client_inbox_messages").select("id, client_id, type, status, message, created_at").order("created_at", { ascending: false }),
        supabase.from("rfqs").select("id, email, status, product_type, quantity, created_at").order("created_at", { ascending: false }),
        supabase.from("client_payments").select("id, client_id, amount, method, received_on, status, created_at").neq("status", "discarded").order("received_on", { ascending: false }),
      ]);
      setProfiles((p.data ?? []) as Profile[]);
      setClientIds(new Set((r.data ?? []).map((x) => x.user_id)));
      setOrders((o.data ?? []) as OrderRow[]);
      setMsgs((m.data ?? []) as MsgRow[]);
      setRfqs((q.data ?? []) as RfqRow[]);
      setPays((cp.data ?? []) as PayRow[]);
      setLoading(false);
    })();
  }, []);

  const rows = useMemo(() => {
    const needle = lc(search);
    return profiles
      .filter((p) => clientIds.has(p.id))
      .map((p) => {
        const mine = orders.filter((o) => o.client_id === p.id);
        const dates = [
          ...mine.map((o) => o.created_at),
          ...msgs.filter((x) => x.client_id === p.id).map((x) => x.created_at),
          ...pays.filter((x) => x.client_id === p.id).map((x) => x.created_at),
        ];
        return { p, active: mine.filter((o) => isActive(o.status)).length, last: dates.sort().pop() ?? null };
      })
      .filter(({ p }) => !needle || [p.full_name, p.company, p.email, p.phone].some((v) => lc(v).includes(needle)))
      .sort((a, b) =>
        sort === "active" ? b.active - a.active || lc(a.p.full_name).localeCompare(lc(b.p.full_name))
        : sort === "recent" ? (b.last ?? "").localeCompare(a.last ?? "")
        : lc(a.p.full_name || "~").localeCompare(lc(b.p.full_name || "~")));
  }, [profiles, clientIds, orders, msgs, pays, search, sort]);

  const total = clientIds.size;
  const open = profiles.find((p) => p.id === openId) ?? null;

  return (
    <div>
      <PageHeader title="Client Center" description="Registered client accounts and their activity." />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : total === 0 ? (
        <EmptyState icon={Users} title="No clients registered yet" description="Accounts appear here once a client signs up." />
      ) : (
        <>
          <TableToolbar search={search} onSearch={setSearch} placeholder="Search name, company, email…" count={rows.length} noun="client">
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Sort clients">
                <SelectValue>Sort: {SORT_LABEL[sort]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as Sort[]).map((k) => <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </TableToolbar>

          {rows.length === 0 ? (
            <EmptyState title="No clients match" description="Try a different name, company or email." />
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Active orders</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ p, active, last }) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => setOpenId(p.id)}>
                      <TableCell className="py-2">
                        <div className="font-medium text-foreground">{p.full_name ?? "Unnamed client"}</div>
                        <div className="text-xs text-muted-foreground">{p.company || "No company"}</div>
                      </TableCell>
                      <TableCell className="py-2 text-sm">{p.email || p.phone || "No contact"}</TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground">Client</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{active}</TableCell>
                      <TableCell className="py-2 whitespace-nowrap text-sm">{fmtDate(last)}</TableCell>
                      <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setOpenId(p.id)} aria-label={`View ${p.full_name ?? "client"}`}>
                          <Eye /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {open && <ClientDetail p={open} orders={orders.filter((o) => o.client_id === open.id)} msgs={msgs.filter((m) => m.client_id === open.id)}
            rfqs={rfqs.filter((r) => !!open.email && lc(r.email) === lc(open.email))} pays={pays.filter((x) => x.client_id === open.id)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title} <span className="font-normal text-muted-foreground">({count})</span></h3>
      {count === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : <ul className="divide-y divide-border rounded-md border border-border">{children}</ul>}
    </section>
  );
}

function ClientDetail({ p, orders, msgs, rfqs, pays }: { p: Profile; orders: OrderRow[]; msgs: MsgRow[]; rfqs: RfqRow[]; pays: PayRow[] }) {
  // Same basis as the Receivables page: priced, non-cancelled orders minus non-discarded receipts.
  const priced = orders.filter((o) => o.total_amount != null && o.status !== "cancelled")
    .map((o) => ({ id: o.id, label: o.order_number, date: o.created_at.slice(0, 10), amount: Number(o.total_amount) }));
  const bal = clientReceivable(priced, pays.reduce((s, x) => s + Number(x.amount), 0), new Date().toISOString().slice(0, 10));
  const li = "flex items-center justify-between gap-3 px-3 py-2 text-sm";

  return (
    <>
      <SheetHeader>
        <SheetTitle>{p.full_name ?? "Unnamed client"}</SheetTitle>
        <SheetDescription>{[p.company, p.email, p.phone].filter(Boolean).join(" • ") || "No contact details"}</SheetDescription>
      </SheetHeader>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {([["Billed", bal.billed], ["Received", bal.received], ["Balance due", bal.due]] as const).map(([l, v]) => (
          <div key={l} className="rounded-md border border-border p-2">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-sm font-semibold tabular-nums">{pkr(v)}</div>
          </div>
        ))}
      </div>

      <Section title="Orders" count={orders.length}>
        {orders.map((o) => (
          <li key={o.id} className={li}>
            <div className="min-w-0">
              <div className="font-medium">{o.order_number} <span className="font-normal text-muted-foreground">· {fmtDate(o.created_at)}</span></div>
              <div className="truncate text-xs text-muted-foreground">{o.product_summary || "—"}{o.total_amount != null && ` · ${pkr(Number(o.total_amount))}`}</div>
            </div>
            <StatusBadge status={o.status} />
          </li>
        ))}
      </Section>

      <Section title="RFQs (matched by email)" count={rfqs.length}>
        {rfqs.map((r) => (
          <li key={r.id} className={li}>
            <div className="min-w-0">
              <div className="font-medium">{r.product_type || "RFQ"}{r.quantity && <span className="font-normal text-muted-foreground"> · {r.quantity}</span>}</div>
              <div className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</div>
            </div>
            <StatusBadge status={r.status} />
          </li>
        ))}
      </Section>

      <Section title="Inbox messages" count={msgs.length}>
        {msgs.map((m) => (
          <li key={m.id} className={li}>
            <div className="min-w-0">
              <div className="truncate">{m.message}</div>
              <div className="text-xs text-muted-foreground">{m.type.replace(/_/g, " ")} · {fmtDate(m.created_at)}</div>
            </div>
            <StatusBadge status={m.status} />
          </li>
        ))}
      </Section>

      <Section title="Receipts" count={pays.length}>
        {pays.map((x) => (
          <li key={x.id} className={li}>
            <div>
              <div className="font-medium tabular-nums">{pkr(Number(x.amount))}</div>
              <div className="text-xs text-muted-foreground">{fmtDate(x.received_on)} · {x.method.replace(/_/g, " ")}</div>
            </div>
            <StatusBadge status={x.status} />
          </li>
        ))}
      </Section>
    </>
  );
}
