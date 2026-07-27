import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ClipboardList, Package, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------
// FactoryDashboard
//
// Landing page for factory workers at /factory.
// Displays:
//   - Personalized greeting with today's date
//   - Summary KPI cards (pieces completed today, active batches)
//   - Large QR scan call-to-action
//   - List of recently worked-on batches
// ---------------------------------------------------------------

interface DashboardStats {
  piecesToday: number;
  activeBatches: number;
}

interface RecentBatch {
  id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  order_number: string;
}

export default function FactoryDashboard() {
  const { t, isRtl } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBatches, setRecentBatches] = useState<RecentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        // 1. Fetch the worker's display name from profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        setUserName(profile?.full_name ?? user.email ?? "");

        // 2. Get today's start timestamp for filtering
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 3. Count pieces completed today by this worker
        const { data: todayEntries } = await supabase
          .from("batch_tracking")
          .select("quantity_completed")
          .eq("worker_id", user.id)
          .gte("created_at", todayStart.toISOString());

        const piecesToday = (todayEntries ?? []).reduce(
          (sum, e) => sum + (e.quantity_completed ?? 0),
          0
        );

        // 4. Count active batches (in_progress)
        const { count: activeBatches } = await supabase
          .from("production_batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress");

        setStats({
          piecesToday,
          activeBatches: activeBatches ?? 0,
        });

        // 5. Get recent batches this worker has worked on
        const { data: recentTracking } = await supabase
          .from("batch_tracking")
          .select("batch_id")
          .eq("worker_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (recentTracking && recentTracking.length > 0) {
          // Get unique batch IDs preserving order
          const uniqueBatchIds = [
            ...new Set(recentTracking.map((t) => t.batch_id)),
          ].slice(0, 5);

          const { data: batches } = await supabase
            .from("production_batches")
            .select("id, style_number, total_quantity, status, order_id")
            .in("id", uniqueBatchIds);

          if (batches) {
            // Fetch associated order numbers for display
            const orderIds = [...new Set(batches.map((b) => b.order_id))];
            const { data: orders } = await supabase
              .from("orders")
              .select("id, order_number")
              .in("id", orderIds);
            const orderMap = new Map(
              (orders ?? []).map((o) => [o.id, o.order_number])
            );

            setRecentBatches(
              batches.map((b) => ({
                id: b.id,
                style_number: b.style_number,
                total_quantity: b.total_quantity,
                status: b.status,
                order_number: orderMap.get(b.order_id) ?? "—",
              }))
            );
          }
        }
      } catch (err) {
        console.error("Dashboard load failed:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  // Format today's date in a user-friendly way
  const today = new Date().toLocaleDateString(isRtl ? "ur-PK" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-white">
          {t("factory.dashboard.welcome")}, {userName || "Worker"}
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {t("factory.dashboard.today")}: {today}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <ClipboardList className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              {stats?.piecesToday ?? 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {t("factory.dashboard.piecesToday")}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <Package className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              {stats?.activeBatches ?? 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {t("factory.dashboard.activeBatches")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* QR Scan CTA */}
      <Button
        size="lg"
        className="w-full h-16 text-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
        onClick={() => navigate("/factory/scan")}
      >
        <QrCode className="w-6 h-6 mr-3" />
        {t("factory.dashboard.scanQr")}
      </Button>

      {/* Recent Batches */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          {t("factory.dashboard.recentBatches")}
        </h2>
        {recentBatches.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-8 text-center text-slate-500 text-sm">
              {t("factory.dashboard.noBatches")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentBatches.map((batch) => (
              <Card
                key={batch.id}
                className="bg-slate-800 border-slate-700 cursor-pointer hover:border-emerald-500/50 transition-colors"
                onClick={() => navigate(`/factory/batch/${batch.id}`)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {t("factory.dashboard.style")}: {batch.style_number}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        #{batch.order_number} • {batch.total_quantity}{" "}
                        {t("factory.common.pieces")}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        batch.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                      }
                    >
                      {batch.status === "completed"
                        ? t("factory.common.completed")
                        : t("factory.common.inProgress")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
