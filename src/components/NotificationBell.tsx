import { useEffect, useState } from "react";
import { Bell, Check, AlertTriangle, DollarSign, CheckCircle, Info, Inbox, ShoppingBag, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------
// NotificationBell
//
// Admin header component that displays a bell icon with an
// unread notification count. Clicking opens a popover with
// recent notifications from the admin_notifications table.
//
// Two sources: admin_notifications (shared, production events) and
// user_notifications (per person: new RFQ / client order, permission changes).
// Notifications are populated by database triggers:
//   - high_waste: worker reported waste exceeding 5% threshold
//   - missing_rate: no rate configured for a batch/phase combo
//   - batch_completed: a batch finished all phases
// ---------------------------------------------------------------

interface Notification {
  id: string;
  source: "admin" | "user";
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

// Map notification type to an icon and color scheme
const typeConfig: Record<string, { icon: typeof Bell; color: string }> = {
  high_waste: { icon: AlertTriangle, color: "text-red-500" },
  missing_rate: { icon: DollarSign, color: "text-amber-500" },
  batch_completed: { icon: CheckCircle, color: "text-emerald-500" },
  info: { icon: Info, color: "text-blue-500" },
  new_rfq: { icon: Inbox, color: "text-red-500" },
  new_order: { icon: ShoppingBag, color: "text-red-500" },
  permission_change: { icon: KeyRound, color: "text-purple-500" },
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // 1. Fetch notifications on mount and periodically
  const fetchNotifications = async () => {
    try {
      const [{ data: shared }, { data: mine }] = await Promise.all([
        supabase.from("admin_notifications").select("id, type, title, message, is_read, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("user_notifications").select("id, kind, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(30),
      ]);
      const items: Notification[] = [
        ...(shared ?? []).map((n) => ({ ...n, source: "admin" as const, link: null })),
        ...(mine ?? []).map((n) => ({ id: n.id, source: "user" as const, type: n.kind, title: n.title, message: n.body, is_read: !!n.read_at, link: n.link, created_at: n.created_at })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const channel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, fetchNotifications)
      .subscribe();
    const poll = setInterval(fetchNotifications, 60_000); // user_notifications is not in realtime
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. Mark a single notification as read
  const markAsRead = async (n: Notification) => {
    await (n.source === "admin"
      ? supabase.from("admin_notifications").update({ is_read: true }).eq("id", n.id)
      : supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id));
    fetchNotifications();
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  // 3. Mark all notifications as read
  const markAllRead = async () => {
    await Promise.all([
      supabase.from("admin_notifications").update({ is_read: true }).eq("is_read", false),
      supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null),
    ]);
    fetchNotifications();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] bg-red-500 text-white border-0"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={markAllRead}
            >
              <Check className="w-3 h-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[350px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((n) => {
              const config = typeConfig[n.type] ?? typeConfig.info;
              const Icon = config.icon;
              return (
                <div
                  key={n.source + n.id}
                  className={`flex gap-3 p-3 border-b last:border-0 transition-colors cursor-pointer hover:bg-muted/50 ${
                    !n.is_read ? "bg-accent/5" : ""
                  }`}
                  onClick={() => markAsRead(n)}
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                      {n.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
