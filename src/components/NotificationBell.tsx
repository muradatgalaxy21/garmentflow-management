import { useEffect, useState } from "react";
import { Bell, Check, AlertTriangle, DollarSign, CheckCircle, Info } from "lucide-react";
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
// Notifications are populated by database triggers:
//   - high_waste: worker reported waste exceeding 5% threshold
//   - missing_rate: no rate configured for a batch/phase combo
//   - batch_completed: a batch finished all phases
// ---------------------------------------------------------------

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  batch_id: string | null;
  created_at: string;
}

// Map notification type to an icon and color scheme
const typeConfig: Record<string, { icon: typeof Bell; color: string }> = {
  high_waste: { icon: AlertTriangle, color: "text-red-500" },
  missing_rate: { icon: DollarSign, color: "text-amber-500" },
  batch_completed: { icon: CheckCircle, color: "text-emerald-500" },
  info: { icon: Info, color: "text-blue-500" },
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  // 1. Fetch notifications on mount and periodically
  const fetchNotifications = async () => {
    try {
      const { data } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      const items = (data ?? []) as Notification[];
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // 2. Mark a single notification as read
  const markAsRead = async (id: string) => {
    await supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("id", id);
    fetchNotifications();
  };

  // 3. Mark all notifications as read
  const markAllRead = async () => {
    await supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("is_read", false);
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
                  key={n.id}
                  className={`flex gap-3 p-3 border-b last:border-0 transition-colors cursor-pointer hover:bg-muted/50 ${
                    !n.is_read ? "bg-accent/5" : ""
                  }`}
                  onClick={() => markAsRead(n.id)}
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
