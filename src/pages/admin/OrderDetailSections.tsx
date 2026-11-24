import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { pkr } from "@/lib/finance";
import { isOverdue, type OrderStatus } from "@/lib/orderFilters";

// Read-only part of the order detail panel: everything we already store about
// one order (items, pricing, batches + progress, payments, dispatches, timeline).

export interface DetailBatch {
  id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  stage: string;
  done: string[];
  blocked: string[];
}

interface DetailOrder {
  id: string;
  status: OrderStatus;
  product_summary: string;
  quantity: number;
  total_amount: number | null;
  currency: string | null;
  expected_delivery: string | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
  color_breakdown: unknown;
}

interface Extra {
  updates: { id: string; status: string; note: string | null; created_at: string }[];
  payments: { id: string; amount: number; method: string; received_on: string; status: string; reference: string | null }[];
  dispatches: { id: string; batch_id: string; dispatch_date: string; carton_count: number; carrier: string | null; dispatch_note: string | null }[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="admin-section-title text-sm">{title}</h3>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="text-muted-foreground">{children}</p>;

export default function OrderDetailSections({ order, clientLabel, batches }: { order: DetailOrder; clientLabel: string; batches: DetailBatch[] }) {
  const [extra, setExtra] = useState<Extra | null>(null);
  const batchKey = batches.map((b) => b.id).join(",");

  useEffect(() => {
    let live = true;
    setExtra(null);
    const batchIds = batchKey ? batchKey.split(",") : [];
    Promise.all([
      supabase.from("order_updates").select("id, status, note, created_at").eq("order_id", order.id).order("created_at", { ascending: false }),
      supabase.from("client_payments").select("id, amount, method, received_on, status, reference").eq("order_id", order.id).is("discarded_at", null).order("received_on", { ascending: false }),
      batchIds.length
        ? supabase.from("batch_dispatches").select("id, batch_id, dispatch_date, carton_count, carrier, dispatch_note").in("batch_id", batchIds).order("dispatch_date", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]).then(([u, p, d]) => {
      if (!live) return;
      setExtra({ updates: u.data ?? [], payments: (p.data ?? []) as Extra["payments"], dispatches: (d.data ?? []) as Extra["dispatches"] });
    });
    return () => { live = false; };
  }, [order.id, order.updated_at, batchKey]);

  const colors = Array.isArray(order.color_breakdown) ? (order.color_breakdown as { color: string; quantity: number }[]) : [];
  const received = (extra?.payments ?? []).filter((p) => p.status === "posted").reduce((s, p) => s + Number(p.amount), 0);
  const styleOf = new Map(batches.map((b) => [b.id, b.style_number]));
  const money = (n: number) => `${order.currency ?? ""} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();

  return (
    <div className="space-y-6 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div><dt className="admin-meta">Client</dt><dd className="text-foreground">{clientLabel}</dd></div>
        <div><dt className="admin-meta">Created</dt><dd className="text-foreground">{fmtDate(order.created_at)}</dd></div>
        <div>
          <dt className="admin-meta">Expected delivery</dt>
          <dd className="flex flex-wrap items-center gap-1 text-foreground">
            {fmtDate(order.expected_delivery)} {isOverdue(order) && <StatusBadge status="overdue" />}
          </dd>
        </div>
        <div><dt className="admin-meta">Tracking</dt><dd className="text-foreground break-all">{order.tracking_number || "—"}</dd></div>
      </dl>

      <Section title="Items">
        <p className="text-foreground">{order.product_summary}</p>
        <p className="text-muted-foreground">{order.quantity.toLocaleString()} pcs total</p>
        {colors.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {colors.map((c, i) => (
              <li key={i} className="flex justify-between px-3 py-1.5">
                <span>{c.color}</span><span className="tabular-nums">{Number(c.quantity).toLocaleString()} pcs</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pricing">
        {order.total_amount == null ? (
          <Muted>Not priced yet.</Muted>
        ) : (
          <p className="text-foreground">
            {money(Number(order.total_amount))}
            {order.quantity > 0 && <span className="text-muted-foreground"> · {money(Number(order.total_amount) / order.quantity)} per piece</span>}
          </p>
        )}
      </Section>

      <Section title="Batches & production">
        {batches.length === 0 ? (
          <Muted>No batch yet. Create one on the <Link to="/admin/batches" className="underline underline-offset-2">Batches</Link> page.</Muted>
        ) : (
          <ul className="space-y-2">
            {batches.map((b) => (
              <li key={b.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">Batch #{b.style_number} · {b.total_quantity.toLocaleString()} pcs</span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="mt-1 text-muted-foreground">Current stage: <span className="text-foreground">{b.stage}</span></p>
                {b.done.length > 0 && <p className="text-muted-foreground">Done: {b.done.join(", ")}</p>}
                {b.blocked.map((r) => (
                  <p key={r} className="mt-1"><StatusBadge tone="warning">Blocked</StatusBadge> <span className="text-foreground">{r}</span></p>
                ))}
              </li>
            ))}
            <li className="flex gap-3 text-xs">
              <Link to="/admin/batches" className="underline underline-offset-2">Open Batches</Link>
              <Link to="/admin/pipeline-status" className="underline underline-offset-2">Open Pipeline Status</Link>
            </li>
          </ul>
        )}
      </Section>

      {!extra ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-accent" aria-label="Loading order history" /></div>
      ) : (
        <>
          <Section title="Payments">
            {extra.payments.length === 0 ? (
              <Muted>No payments recorded against this order.</Muted>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {extra.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                      <span>{fmtDate(p.received_on)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                      <span className="flex items-center gap-2"><span className="tabular-nums">{pkr(Number(p.amount))}</span><StatusBadge status={p.status} /></span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground">Posted total: <span className="text-foreground">{pkr(received)}</span></p>
              </>
            )}
          </Section>

          <Section title="Dispatches">
            {extra.dispatches.length === 0 ? (
              <Muted>Nothing dispatched yet.</Muted>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {extra.dispatches.map((d) => (
                  <li key={d.id} className="px-3 py-1.5">
                    <span className="text-foreground">{fmtDate(d.dispatch_date)} · {d.carton_count} cartons</span>
                    <span className="text-muted-foreground"> · Batch #{styleOf.get(d.batch_id) ?? "—"}{d.carrier ? ` · ${d.carrier}` : ""}</span>
                    {d.dispatch_note && <p className="text-muted-foreground">{d.dispatch_note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Client timeline">
            {extra.updates.length === 0 ? (
              <Muted>No updates sent to the client yet.</Muted>
            ) : (
              <ol className="space-y-2">
                {extra.updates.map((u) => (
                  <li key={u.id}>
                    <span className="flex flex-wrap items-center gap-2"><StatusBadge status={u.status} /><span className="admin-meta">{fmtDateTime(u.created_at)}</span></span>
                    {u.note && <p className="mt-0.5 text-foreground">{u.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
