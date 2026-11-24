import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Alert = { kind: string; id: string; label: string; created_at: string };

// IMP-10: red bar on every admin page while any RFQ is still 'new' or any
// client direct order is still 'pending'. Shown to every admin/manager/staff
// user regardless of section permissions (pending_request_alerts() is
// SECURITY DEFINER); the links only open for people who can see that page.
export default function RequestAlertBanner() {
  const { can } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);

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
  const rfqs = alerts.filter((a) => a.kind === "rfq");
  const orders = alerts.filter((a) => a.kind === "order");
  const part = (list: Alert[], noun: string, to: string, perm: "rfqs.view" | "orders.view") => {
    if (list.length === 0) return null;
    const text = `${list.length} new ${noun}${list.length > 1 ? "s" : ""} waiting (oldest: ${list[0].label}, ${new Date(list[0].created_at).toLocaleString()})`;
    return can(perm) ? <Link to={to} className="underline underline-offset-2 hover:no-underline">{text}</Link> : <span>{text}</span>;
  };

  return (
    <div role="alert" className="bg-red-600 text-white text-sm px-4 py-2 flex items-center gap-2 flex-wrap">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {part(rfqs, "RFQ", "/admin/rfqs", "rfqs.view")}
      {rfqs.length > 0 && orders.length > 0 && <span aria-hidden>·</span>}
      {part(orders, "client order", "/admin/orders", "orders.view")}
    </div>
  );
}
