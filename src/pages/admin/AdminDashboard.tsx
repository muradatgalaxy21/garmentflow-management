import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Inbox, Package, ClipboardList, AlertTriangle, Factory, Loader2, ChevronDown, CheckCircle2,
  ArrowRight, Clock, PauseCircle, type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import AnalyticsWidget from "@/components/AnalyticsWidget";
import { useAuth } from "@/hooks/useAuth";
import { fmtDate } from "@/lib/format";
import { stallCutoff } from "@/lib/dashboardMetrics";
import { fetchUnrated } from "@/lib/unratedWork";
import type { Permission } from "@/lib/permissions";

interface Stats {
  openRfqs: number;
  rfqOldest: string | null;
  pendingClientOrders: number;
  pendingOldest: { number: string; party: string | null; at: string } | null;
  overdueOrders: number;
  overdueOldest: { number: string; party: string | null; due: string } | null;
  inProductionOrders: number;
  totalInventoryItems: number;
  lowStock: string[]; // item names, worst first
  activeBatches: number;
  stalledBatches: string[]; // style numbers
  unratedPcs: number;
  unratedBatches: number;
}

const PERIODS = [
  { value: "7", days: 7, label: "Last 7 days" },
  { value: "30", days: 30, label: "Last 30 days" },
  { value: "90", days: 90, label: "Last 90 days" },
  { value: "all", days: null, label: "All time" },
] as const;

const TIPS_KEY = "gf-dashboard-tips-open";
const readTipsOpen = () => {
  try { return localStorage.getItem(TIPS_KEY) !== "0"; } catch { return true; }
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (list: string[]) => list.slice(0, 3).join(", ") + (list.length > 3 ? ` +${list.length - 3} more` : "");

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function AdminDashboard() {
  const { can } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[1]);
  const [tipsOpen, setTipsOpen] = useState(readTipsOpen);

  useEffect(() => {
    const load = async () => {
      try {
        const cutoff = stallCutoff();
        const [rfqRes, pendingRes, overdueRes, orderRes, itemsRes, lowRes, batchRes] = await Promise.all([
          supabase.from("rfqs").select("created_at", { count: "exact" }).eq("status", "new").order("created_at").limit(1),
          supabase
            .from("orders")
            .select("order_number, party_name, created_at", { count: "exact" })
            .eq("placed_by_client", true).eq("status", "pending").order("created_at").limit(1),
          supabase
            .from("orders")
            .select("order_number, party_name, expected_delivery", { count: "exact" })
            .lt("expected_delivery", todayISO()).in("status", ["pending", "in_production", "qc"])
            .order("expected_delivery").limit(1),
          supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "in_production", "qc"]),
          supabase.from("inventory_items").select("id", { count: "exact", head: true }),
          supabase.from("inventory_items").select("name, quantity_on_hand, reorder_level"),
          supabase.from("production_batches").select("id, style_number, created_at").eq("status", "in_progress"),
        ]);

        const lowStock = (lowRes.data ?? [])
          .filter((i) => Number(i.quantity_on_hand) <= Number(i.reorder_level))
          .map((i) => i.name);

        // Stalled = in progress, older than the window, and no worker log since the cutoff
        const batches = batchRes.data ?? [];
        let stalled: string[] = [];
        if (batches.length > 0) {
          const ids = batches.map((b) => b.id);
          const since = cutoff.toISOString();
          const [trk, dept] = await Promise.all([
            supabase.from("batch_tracking").select("batch_id").in("batch_id", ids).gte("created_at", since),
            supabase.from("department_entries").select("batch_id").in("batch_id", ids).gte("created_at", since),
          ]);
          const active = new Set([...(trk.data ?? []), ...(dept.data ?? [])].map((r) => r.batch_id));
          stalled = batches
            .filter((b) => !active.has(b.id) && new Date(b.created_at) < cutoff)
            .map((b) => b.style_number);
        }

        const unrated = await fetchUnrated().catch(() => []);

        const p = pendingRes.data?.[0];
        const o = overdueRes.data?.[0];
        setStats({
          openRfqs: rfqRes.count ?? 0,
          rfqOldest: rfqRes.data?.[0]?.created_at ?? null,
          pendingClientOrders: pendingRes.count ?? 0,
          pendingOldest: p ? { number: p.order_number, party: p.party_name, at: p.created_at } : null,
          overdueOrders: overdueRes.count ?? 0,
          overdueOldest: o && o.expected_delivery ? { number: o.order_number, party: o.party_name, due: o.expected_delivery } : null,
          inProductionOrders: orderRes.count ?? 0,
          totalInventoryItems: itemsRes.count ?? 0,
          lowStock,
          activeBatches: batches.length,
          stalledBatches: stalled,
          unratedPcs: unrated.reduce((n, e) => n + e.pcs, 0),
          unratedBatches: new Set(unrated.map((e) => e.batch_id)).size,
        });
      } catch (err) {
        console.error("Dashboard load failed", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleTips = (open: boolean) => {
    setTipsOpen(open);
    try { localStorage.setItem(TIPS_KEY, open ? "1" : "0"); } catch { /* storage blocked: choice lasts until reload */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  const s = stats;

  // Needs attention — each row shows only to people who can open its page.
  type Item = { key: string; icon: LucideIcon; title: string; detail: ReactNode; to: string; cta: string; badge?: ReactNode };
  const items: Item[] = [];
  if (s && can("rfqs.view") && s.openRfqs > 0) {
    items.push({
      key: "rfqs", icon: Inbox, to: "/admin/rfqs", cta: "Open RFQ Inbox",
      title: `${plural(s.openRfqs, "new RFQ")} waiting for a reply`,
      detail: s.rfqOldest ? `Oldest received ${fmtDate(s.rfqOldest)}` : null,
    });
  }
  if (s && can("orders.view") && s.pendingClientOrders > 0) {
    const o = s.pendingOldest;
    items.push({
      key: "pending", icon: ClipboardList, to: "/admin/orders", cta: "Open Orders",
      title: `${plural(s.pendingClientOrders, "client order")} waiting to be accepted`,
      detail: o ? `Oldest: ${o.number}${o.party ? ` · ${o.party}` : ""}, placed ${fmtDate(o.at)}` : null,
    });
  }
  if (s && can("orders.view") && s.overdueOrders > 0) {
    const o = s.overdueOldest;
    items.push({
      key: "overdue", icon: Clock, to: "/admin/orders", cta: "Open Orders",
      title: `${plural(s.overdueOrders, "order")} past expected delivery`,
      detail: o ? `Most overdue: ${o.number}${o.party ? ` · ${o.party}` : ""}, was due ${fmtDate(o.due)}` : null,
      badge: <StatusBadge status="overdue" />,
    });
  }
  if (s && can("inventory.view") && s.lowStock.length > 0) {
    items.push({
      key: "low", icon: AlertTriangle, to: "/admin/inventory", cta: "Open Inventory",
      title: `${plural(s.lowStock.length, "item")} at or below reorder level`,
      detail: names(s.lowStock),
    });
  }
  if (s && can("batches.view") && s.stalledBatches.length > 0) {
    items.push({
      key: "stalled", icon: PauseCircle, to: "/admin/batches", cta: "Open Batches",
      title: `${plural(s.stalledBatches.length, "in-progress batch", "in-progress batches")} with no work logged in 24 hours`,
      detail: `${names(s.stalledBatches)} · Sundays not counted`,
    });
  }

  if (s && can("rates.manage") && s.unratedPcs > 0) {
    items.push({
      key: "unrated", icon: AlertTriangle, to: "/admin/batches?rates=1", cta: "Set rates",
      title: `${s.unratedPcs.toLocaleString()} pcs of worker output have no rate set`,
      detail: `${plural(s.unratedBatches, "batch", "batches")} affected. Pay stays pending until a rate is set.`,
      badge: <span className="rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Rate missing</span>,
    });
  }

  // Tiles: current snapshots. Every tile opens its section, so every tile is a link.
  const tiles: { title: string; hint: string; value: number; icon: LucideIcon; to: string; perm: Permission }[] = [
    { title: "Open RFQs", hint: "New, not yet answered", value: s?.openRfqs ?? 0, icon: Inbox, to: "/admin/rfqs", perm: "rfqs.view" },
    { title: "Active orders", hint: "Pending, in production or QC", value: s?.inProductionOrders ?? 0, icon: ClipboardList, to: "/admin/orders", perm: "orders.view" },
    { title: "Inventory items", hint: "Items in the stock list", value: s?.totalInventoryItems ?? 0, icon: Package, to: "/admin/inventory", perm: "inventory.view" },
    { title: "Low stock", hint: "At or below reorder level", value: s?.lowStock.length ?? 0, icon: AlertTriangle, to: "/admin/inventory", perm: "inventory.view" },
    { title: "Active batches", hint: "Status: in progress", value: s?.activeBatches ?? 0, icon: Factory, to: "/admin/batches", perm: "batches.view" },
  ];
  const visibleTiles = tiles.filter((t) => can(t.perm));
  const canSeeAnything = visibleTiles.length > 0 || can("batches.view");

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="What needs action now, then the current numbers and production trends." />

      {canSeeAnything && (
        <section aria-labelledby="attention-h" className="space-y-3">
          <h2 id="attention-h" className="admin-section-title">Needs attention</h2>
          {items.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing needs attention right now" description="No new requests, overdue orders, low stock or stalled batches." />
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.key}>
                  <Link
                    to={it.to}
                    className={`group flex items-start gap-3 rounded-lg border bg-card p-3 sm:p-4 transition-colors hover:bg-muted/50 ${focusRing}`}
                  >
                    <it.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        {it.title}
                        {it.badge}
                      </span>
                      {it.detail && <span className="mt-0.5 block text-sm text-muted-foreground">{it.detail}</span>}
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 self-center text-sm font-medium text-foreground group-hover:underline sm:flex">
                      {it.cta} <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {visibleTiles.length > 0 && (
        <section aria-labelledby="now-h" className="space-y-3">
          <div>
            <h2 id="now-h" className="admin-section-title">Right now</h2>
            <p className="admin-meta">Current counts as of when this page opened. They do not use the period below.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {visibleTiles.map((t) => (
              <Link key={t.title} to={t.to} className={`group rounded-lg ${focusRing}`}>
                <Card className="h-full transition-colors group-hover:bg-muted/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{t.title}</CardTitle>
                    <t.icon className="w-5 h-5 text-accent" aria-hidden />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{t.value}</p>
                    <p className="admin-meta mt-1">{t.hint}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!canSeeAnything && (
        <p className="text-sm text-muted-foreground">Use the sidebar to open the sections you have access to.</p>
      )}

      {can("batches.view") && (
        <section aria-labelledby="analytics-h" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="analytics-h" className="admin-section-title">Production analytics</h2>
              <p className="admin-meta">Charts show totals for the selected period.</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="period" className="admin-label">Period</label>
              <Select value={period.value} onValueChange={(v) => setPeriod(PERIODS.find((p) => p.value === v) ?? PERIODS[1])}>
                <SelectTrigger id="period" className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AnalyticsWidget days={period.days} periodLabel={period.label} canLogWork={can("batches.view")} />
        </section>
      )}

      <Collapsible open={tipsOpen} onOpenChange={toggleTips}>
        <CollapsibleTrigger className={`flex items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground ${focusRing}`}>
          <ChevronDown className={`h-4 w-4 transition-transform ${tipsOpen ? "" : "-rotate-90"}`} aria-hidden />
          Quick tips
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p>• Visit the RFQ Inbox to triage new quote requests from the website.</p>
          <p>• Add or update inventory items in the Inventory section.</p>
          <p>• Manage order status and shipping in the Orders section — clients see updates instantly.</p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
