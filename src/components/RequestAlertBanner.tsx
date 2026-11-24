import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { IconButton } from "@/components/admin/IconButton";
import { fmtDateTime } from "@/lib/format";

type Alert = { kind: string; id: string; label: string; created_at: string };

// sessionStorage = this tab only: survives reloads, gone when the tab closes,
// and useAuth.signOut clears it, so the notice shows again on every new tab and login.
const DISMISS_KEY = "gf-request-alert-dismissed";
const readDismissed = () => {
  try { return sessionStorage.getItem(DISMISS_KEY); } catch { return null; }
};

// IMP-10: notice on every admin page while any RFQ is still 'new' or any
// client direct order is still 'pending'. Shown to every admin/manager/staff
// user regardless of section permissions (pending_request_alerts() is
// SECURITY DEFINER); the links only open for people who can see that page.
// Dismissing hides it until a newer request arrives.
export default function RequestAlertBanner() {
  const { can } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissedAt, setDismissedAt] = useState(readDismissed);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc("pending_request_alerts");
      setAlerts((data ?? []) as Alert[]);
    };
    load();
    const channel = supabase
      .channel("request-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "rfqs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    const poll = setInterval(load, 60_000); // realtime only delivers rows the viewer may read
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  if (alerts.length === 0) return null;
  const newest = alerts[alerts.length - 1].created_at; // RPC returns oldest first
  if (dismissedAt && newest <= dismissedAt) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, newest); } catch { /* storage blocked: hide for this render only */ }
    setDismissedAt(newest);
  };

  const rfqs = alerts.filter((a) => a.kind === "rfq");
  const orders = alerts.filter((a) => a.kind === "order");
  const part = (list: Alert[], noun: string, to: string, perm: "rfqs.view" | "orders.view") => {
    if (list.length === 0) return null;
    const count = `${list.length} new ${noun}${list.length > 1 ? "s" : ""}`;
    return (
      <span>
        {can(perm) ? <Link to={to} className="font-medium underline underline-offset-2 hover:no-underline">{count}</Link> : <span className="font-medium">{count}</span>}
        <span className="text-muted-foreground"> · oldest {list[0].label}, {fmtDateTime(list[0].created_at)}</span>
      </span>
    );
  };

  return (
    <div className="px-4 pt-3 md:px-6">
      <div role="status" className="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 py-1.5 pl-3 pr-1 text-sm text-foreground">
        <BellRing className="mt-1.5 h-4 w-4 shrink-0 text-info" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-0.5 py-1">
          {part(rfqs, "RFQ", "/admin/rfqs", "rfqs.view")}
          {part(orders, "client order", "/admin/orders", "orders.view")}
        </div>
        <IconButton label="Dismiss notice" className="shrink-0" onClick={dismiss}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}
