import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, PlayCircle, CheckCircle2, MessageSquare, RotateCcw, Inbox, ClipboardPenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EmptyState } from "@/components/admin/EmptyState";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { withUndo } from "@/lib/undo";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENT_LABELS } from "@/lib/departmentEntries";
import { unratedPcs } from "@/lib/unratedWork";
import { resolveOfficeEntry } from "@/lib/officeEntry";
import {
  fetchInboxMessages,
  replyWorkerQuery,
  reopenWorkerQuery,
  resolveEndVerification,
  resolveEntryApproval,
  resolveStartVerification,
  resolveWorkerQuery,
  type InboxMessage,
} from "@/lib/workerInbox";
import {
  fetchClientInboxMessages,
  replyClientQuery,
  reopenClientQuery,
  resolveClientQuery,
  type ClientInboxMessage,
} from "@/lib/clientInbox";

const typeConfig: Record<InboxMessage["type"], { label: string; icon: typeof PlayCircle }> = {
  batch_start_verification: { label: "Batch start", icon: PlayCircle },
  batch_end_verification: { label: "Batch end", icon: CheckCircle2 },
  entry_approval: { label: "Entry approval", icon: CheckCircle2 },
  office_entry: { label: "Office entry", icon: ClipboardPenLine },
  worker_query: { label: "Query", icon: MessageSquare },
};

const DAY = 86_400_000;
// No read-tracking column exists, so "New" = still pending and under 24h old.
const isNew = (status: string, createdAt: string) => status === "pending" && Date.now() - new Date(createdAt).getTime() < DAY;

/** One queue row, whichever tab it came from. */
interface Row {
  id: string;
  label: string;
  icon: typeof PlayCircle;
  status: string;
  sender: string;
  context: { label: string; value: string }[];
  message: string;
  reply: string | null;
  created_at: string;
  updated_at: string;
  open: boolean;
}

type Status = "open" | "closed" | "all";
type Age = "any" | "1" | "7" | "30";

/** Queue list + selected-message panel; stacks on narrow screens. */
function InboxLayout({ rows, noun, loading, renderDetail }: {
  rows: Row[];
  noun: string;
  loading: boolean;
  renderDetail: (id: string) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("open");
  const [age, setAge] = useState<Age>("any");
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && !r.open) return false;
      if (status === "closed" && r.open) return false;
      if (age !== "any" && Date.now() - new Date(r.created_at).getTime() > Number(age) * DAY) return false;
      if (!q) return true;
      return [r.sender, r.message, r.label, ...r.context.map((c) => c.value)].some((s) => s.toLowerCase().includes(q));
    });
  }, [rows, search, status, age]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const current = rows.find((r) => r.id === selected) ?? null;
  const filtersActive = status !== "open" || age !== "any";

  return (
    <div>
      <TableToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search sender, message, order…"
        count={visible.length}
        noun={noun}
        filtersActive={filtersActive}
        onClear={() => { setSearch(""); setStatus("open"); setAge("any"); }}
      >
        <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
          <SelectTrigger className="w-[130px]" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Needs action</SelectItem>
            <SelectItem value="closed">Done</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={age} onValueChange={(v) => setAge(v as Age)}>
          <SelectTrigger className="w-[140px]" aria-label="Age"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any age</SelectItem>
            <SelectItem value="1">Last 24 hours</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </TableToolbar>

      {visible.length === 0 && !current ? (
        <EmptyState
          icon={Inbox}
          title={rows.length === 0 ? "No messages yet" : "No messages match"}
          description={rows.length === 0 ? undefined : "Try clearing the search or filters."}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
          <ul className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1" aria-label={`${noun} queue`}>
            {visible.length === 0 && <li className="p-3 text-sm text-muted-foreground">No messages match.</li>}
            {visible.map((r) => {
              const Icon = r.icon;
              const sel = r.id === current?.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-current={sel ? "true" : undefined}
                    onClick={() => setSelected(r.id)}
                    className={cn(
                      "w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      sel && "border-primary bg-primary/5 ring-1 ring-primary",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{r.sender}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {isNew(r.status, r.created_at) && <StatusBadge tone="info">New</StatusBadge>}
                        <StatusBadge status={r.status} />
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.label} · Updated {fmtDateTime(r.updated_at)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0 rounded-lg border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
            {current ? (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{current.sender}</h2>
                    <StatusBadge status={current.status} />
                    {isNew(current.status, current.created_at) && <StatusBadge tone="info">New</StatusBadge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {current.label} · Received {fmtDateTime(current.created_at)} · Updated {fmtDateTime(current.updated_at)}
                  </p>
                </div>
                {current.context.length > 0 && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {current.context.map((c) => (
                      <div key={c.label} className="contents">
                        <dt className="text-muted-foreground">{c.label}</dt>
                        <dd>{c.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{current.message}</p>
                {current.reply && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Reply sent</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{current.reply}</p>
                  </div>
                )}
                {renderDetail(current.id)}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Select a message to read and act on it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type Names = Record<string, string>;

/** Look up display names for the ids found in messages. */
async function lookupNames(table: "profiles" | "orders" | "production_batches", ids: string[]): Promise<Names> {
  if (ids.length === 0) return {};
  const col = table === "profiles" ? "id, full_name, company, email" : table === "orders" ? "id, order_number" : "id, style_number";
  const { data } = await supabase.from(table).select(col).in("id", ids);
  const out: Names = {};
  for (const r of (data ?? []) as any[]) {
    out[r.id] = table === "profiles" ? r.full_name || r.company || r.email || "Unknown" : table === "orders" ? r.order_number : r.style_number;
  }
  return out;
}

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

/** Reply / resolve / reopen controls shared by worker queries and client questions. */
function QueryActions({ open, canAct, busy, draft, setDraft, onReply, onResolve, onReopen, replyHint }: {
  open: boolean;
  canAct: boolean;
  busy: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onReply: () => void;
  onResolve: () => void;
  onReopen: () => void;
  replyHint: string;
}) {
  if (!canAct) return null;
  if (!open) {
    return (
      <div className="border-t pt-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={onReopen}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
        </Button>
      </div>
    );
  }
  const hasText = draft.trim().length > 0;
  return (
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor="inbox-reply">Reply</Label>
      <Textarea id="inbox-reply" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Type your reply…" />
      <p className="text-xs text-muted-foreground">{replyHint}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !hasText} onClick={onReply}>Send reply</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onResolve}>
          {hasText ? "Resolve & send reply" : "Mark resolved"}
        </Button>
      </div>
    </div>
  );
}

interface OfficeSlipRow { worker_id: string; completed: number; wasted: number; rate: number | null; rate_label: string | null }
const officeRows = (m: InboxMessage): OfficeSlipRow[] =>
  m.type === "office_entry" && Array.isArray(m.payload?.rows) ? (m.payload.rows as OfficeSlipRow[]) : [];

function WorkerInboxTab() {
  const { user, can, isAdmin } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [names, setNames] = useState<{ p: Names; b: Names }>({ p: {}, b: {} });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await fetchInboxMessages(100);
      setMessages(data);
      const [p, b] = await Promise.all([
        lookupNames("profiles", uniq(data.flatMap((m) => [m.worker_id, ...officeRows(m).map((r) => r.worker_id)]))),
        lookupNames("production_batches", uniq(data.map((m) => m.batch_id))),
      ]);
      setNames({ p, b });
    } catch (err: any) {
      toast({ title: "Failed to load inbox", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("worker-inbox-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_inbox_messages" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const run = async (id: string, label: string, fn: () => Promise<void>, ask?: { title: string; description: string }) => {
    if (!user) return;
    if (ask && !(await confirm(ask))) return;
    setBusyId(id);
    try {
      await withUndo(label, fn, load);
      setNotes((s) => ({ ...s, [id]: "" }));
      await load();
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const rows: Row[] = messages.map((m) => {
    const cfg = typeConfig[m.type];
    const context = [];
    if (m.batch_id) context.push({ label: "Batch", value: names.b[m.batch_id] ?? "—" });
    if (m.department) context.push({ label: "Department", value: DEPARTMENT_LABELS[m.department] });
    return {
      id: m.id,
      label: cfg.label,
      icon: cfg.icon,
      status: m.status,
      sender: names.p[m.worker_id] ?? (m.type === "office_entry" ? "Office" : "Worker"),
      context,
      message: m.message,
      reply: m.resolution_note,
      created_at: m.created_at,
      updated_at: m.resolved_at ?? m.created_at,
      open: m.status === "pending",
    };
  });

  const detail = (id: string) => {
    const m = messages.find((x) => x.id === id);
    if (!m || !user) return null;
    const busy = busyId === m.id;
    const note = notes[m.id] ?? "";
    const canAct = can("inbox_workers.update");
    if (m.type === "worker_query") {
      return (
        <QueryActions
          open={m.status === "pending"}
          canAct={canAct}
          busy={busy}
          draft={note}
          setDraft={(v) => setNotes((s) => ({ ...s, [m.id]: v }))}
          replyHint="Send reply saves your answer and keeps the query pending. Mark resolved closes it."
          onReply={() => run(m.id, "Reply saved", () => replyWorkerQuery(m, note.trim()))}
          onResolve={() =>
            run(m.id, "Worker query resolved", () => resolveWorkerQuery(m, user.id, note.trim() || m.resolution_note || undefined), {
              title: "Mark this query resolved?",
              description: "The worker is notified. You can undo it for 10 minutes.",
            })
          }
          onReopen={() => run(m.id, "Worker query reopened", () => reopenWorkerQuery(m))}
        />
      );
    }
    if (m.type === "office_entry") {
      const rows = officeRows(m);
      const finishedSlip = m.payload?.department_finished === true;
      const n = note.trim() || undefined;
      const decideOffice = (decision: "accepted" | "denied") =>
        run(m.id, decision === "accepted" ? "Office entry accepted" : "Office entry denied", () => resolveOfficeEntry(m.id, decision, n), {
          title: decision === "accepted" ? "Accept this slip?" : "Deny this slip?",
          description: decision === "accepted"
            ? `Pay is counted for these rows${finishedSlip ? " and the department closes" : ""}. This cannot be undone here.`
            : "The slip's rows are deleted so they never count. The manager re-enters it correctly. This cannot be undone.",
        });
      return (
        <div className="space-y-3 border-t pt-3">
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5">
                <span className="text-foreground">{names.p[r.worker_id] ?? "Worker"}{r.rate_label && r.rate_label !== "default" ? <span className="text-muted-foreground"> · {r.rate_label}</span> : null}</span>
                <span className="text-muted-foreground">{r.completed} done · {r.wasted} wasted{typeof r.rate === "number" ? ` · Rs ${(r.rate * r.completed).toLocaleString()}` : " · no rate"}</span>
              </li>
            ))}
          </ul>
          {typeof m.payload?.notes === "string" && <p className="text-sm text-muted-foreground">Note: {m.payload.notes}</p>}
          {finishedSlip && <p className="text-sm text-foreground">Manager marked the department finished: accepting closes it.</p>}
          {m.status === "pending" && (isAdmin ? (
            <>
              <Label htmlFor="inbox-note">Note (optional)</Label>
              <Textarea id="inbox-note" value={note} onChange={(e) => setNotes((s) => ({ ...s, [m.id]: e.target.value }))} rows={2} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => decideOffice("accepted")}>{finishedSlip ? "Accept & Close" : "Accept"}</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => decideOffice("denied")}>Deny</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Waiting for the owner to accept.</p>
          ))}
        </div>
      );
    }
    if (m.status !== "pending" || !canAct) return null;
    const decide = (fn: () => Promise<void>, ask?: { title: string; description: string }) =>
      run(m.id, "Inbox decision applied", fn, ask ?? { title: "Apply this decision?", description: "The worker is notified. You can undo it for 10 minutes." });
    // IMP-15: accepting an END with no rate would leave the worker's pay pending — warn, but allow.
    const acceptEnd = async () => {
      let unrated = 0;
      try {
        const { data } = await supabase
          .from("department_entries").select("stage, department, payload")
          .eq("batch_id", m.batch_id!).eq("department", m.department!).eq("worker_id", m.worker_id).eq("stage", "end");
        unrated = (data ?? []).reduce((s, e) => s + unratedPcs(e), 0);
      } catch { /* warn only; never block accept */ }
      decide(
        () => resolveEndVerification(m, "accepted", user!.id, n),
        unrated > 0
          ? {
              title: "No rate set for this work",
              description: `${unrated.toLocaleString()} pcs in ${DEPARTMENT_LABELS[m.department!]} have no rate, so this worker's pay stays pending until a rate is set (Batches > Department Rates). Accept anyway?`,
            }
          : undefined,
      );
    };
    const n = note.trim() || undefined;
    return (
      <div className="space-y-2 border-t pt-3">
        <Label htmlFor="inbox-note">Note to worker (optional)</Label>
        <Textarea id="inbox-note" value={note} onChange={(e) => setNotes((s) => ({ ...s, [m.id]: e.target.value }))} rows={2} />
        <div className="flex flex-wrap gap-2">
          {m.type === "batch_start_verification" ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => decide(() => resolveStartVerification(m, "accepted", user.id, n))}>
                Accept (enable End QR)
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(() => resolveStartVerification(m, "denied", user.id, n))}>
                Deny
              </Button>
            </>
          ) : m.type === "entry_approval" ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => decide(() => resolveEntryApproval(m, "accepted", user.id, n))}>
                Accept (deduct stock)
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(() => resolveEntryApproval(m, "denied", user.id, n))}>
                Deny
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={acceptEnd}>
                Accept & Close
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(() => resolveEndVerification(m, "reprocess", user.id, n))}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reprocess
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(() => resolveEndVerification(m, "denied", user.id, n))}>
                Deny
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return <InboxLayout rows={rows} noun="message" loading={loading} renderDetail={detail} />;
}

function ClientInboxTab() {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [messages, setMessages] = useState<ClientInboxMessage[]>([]);
  const [names, setNames] = useState<{ p: Names; o: Names }>({ p: {}, o: {} });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await fetchClientInboxMessages(100);
      setMessages(data);
      const [p, o] = await Promise.all([
        lookupNames("profiles", uniq(data.map((m) => m.client_id))),
        lookupNames("orders", uniq(data.map((m) => m.order_id))),
      ]);
      setNames({ p, o });
    } catch (err: any) {
      toast({ title: "Failed to load inbox", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("client-inbox-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_inbox_messages" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const run = async (id: string, label: string, fn: () => Promise<void>, ask?: { title: string; description: string }) => {
    if (!user) return;
    if (ask && !(await confirm(ask))) return;
    setBusyId(id);
    try {
      await withUndo(label, fn, load);
      setNotes((s) => ({ ...s, [id]: "" }));
      await load();
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const rows: Row[] = messages.map((m) => ({
    id: m.id,
    label: m.type === "order_question" ? "Order question" : "Query",
    icon: MessageSquare,
    status: m.status,
    sender: names.p[m.client_id] ?? "Client",
    context: m.order_id ? [{ label: "Order", value: names.o[m.order_id] ?? "—" }] : [],
    message: m.message,
    reply: m.resolution_note,
    created_at: m.created_at,
    updated_at: m.resolved_at ?? m.created_at,
    open: m.status === "pending",
  }));

  const detail = (id: string) => {
    const m = messages.find((x) => x.id === id);
    if (!m || !user) return null;
    const note = notes[m.id] ?? "";
    return (
      <QueryActions
        open={m.status === "pending"}
        canAct={can("inbox_clients.update")}
        busy={busyId === m.id}
        draft={note}
        setDraft={(v) => setNotes((s) => ({ ...s, [m.id]: v }))}
        replyHint="The client sees your reply. Send reply keeps the question pending; Mark resolved closes it."
        onReply={() => run(m.id, "Reply sent", () => replyClientQuery(m, note.trim()))}
        onResolve={() =>
          run(m.id, "Client query resolved", () => resolveClientQuery(m, user.id, note.trim() || m.resolution_note || undefined), {
            title: "Mark this query resolved?",
            description: "The client sees your reply. You can undo it for 10 minutes.",
          })
        }
        onReopen={() => run(m.id, "Client query reopened", () => reopenClientQuery(m))}
      />
    );
  };

  return <InboxLayout rows={rows} noun="message" loading={loading} renderDetail={detail} />;
}

export default function InboxPage() {
  const { can } = useAuth();
  const showWorkers = can("inbox_workers.view");
  const showClients = can("inbox_clients.view");
  return (
    <div>
      <PageHeader title="Inbox" description="Worker batch verifications and queries, and client questions." />
      <Tabs defaultValue={showWorkers ? "worker" : "client"}>
        <TabsList>
          {showWorkers && <TabsTrigger value="worker">Worker</TabsTrigger>}
          {showClients && <TabsTrigger value="client">Client</TabsTrigger>}
        </TabsList>
        {showWorkers && (
          <TabsContent value="worker" className="mt-4">
            <WorkerInboxTab />
          </TabsContent>
        )}
        {showClients && (
          <TabsContent value="client" className="mt-4">
            <ClientInboxTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
