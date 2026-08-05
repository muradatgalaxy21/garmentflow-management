import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, CheckCircle2, Calendar, Package, Loader2, ChevronRight, PlayCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface DashboardStats {
  piecesToday: number;
  activeBatches: number;
  activeSession: {
    id: string;
    batch_id: string;
    style_number: string;
    phase_name: string;
    start_time: string;
  } | null;
}

interface RecentBatch {
  id: string;
  style_number: string;
  total_quantity: number;
  status: string;
  order_number: string;
}

export default function FactoryDashboard() {
  const { t } = useTranslation();
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
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        setUserName(profile?.full_name ?? user.email?.split("@")[0] ?? "Worker");

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: todayEntries } = await supabase
          .from("batch_tracking")
          .select("quantity_completed")
          .eq("worker_id", user.id)
          .gte("created_at", todayStart.toISOString());

        const piecesToday = (todayEntries ?? []).reduce(
          (sum, e) => sum + (e.quantity_completed ?? 0),
          0
        );

        const { count: activeBatches } = await supabase
          .from("production_batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress");

        // Check if this worker has an ongoing active session
        const { data: activeSessionData } = await supabase
          .from("batch_worker_sessions")
          .select("id, batch_id, phase_id, start_time, production_batches(style_number), production_phases(name)")
          .eq("worker_id", user.id)
          .eq("status", "active")
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        let activeSession = null;
        if (activeSessionData) {
          activeSession = {
            id: activeSessionData.id,
            batch_id: activeSessionData.batch_id,
            style_number: (activeSessionData as any).production_batches?.style_number || "Batch",
            phase_name: (activeSessionData as any).production_phases?.name || "Phase",
            start_time: activeSessionData.start_time,
          };
        }

        setStats({
          piecesToday,
          activeBatches: activeBatches ?? 0,
          activeSession,
        });

        const { data: recentTracking } = await supabase
          .from("batch_tracking")
          .select("batch_id")
          .eq("worker_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (recentTracking && recentTracking.length > 0) {
          const uniqueBatchIds = [
            ...new Set(recentTracking.map((t) => t.batch_id)),
          ].slice(0, 5);

          const { data: batches } = await supabase
            .from("production_batches")
            .select("id, style_number, total_quantity, status, order_id")
            .in("id", uniqueBatchIds);

          if (batches) {
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
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* Header Greeting Banner matching Screenshot 1 */}
      <div className="bg-[#e9ecef]/80 border border-slate-200/80 rounded-xl p-5 text-center shadow-xs">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium text-slate-600 border border-slate-300 bg-white/70">
          Factory Floor Portal
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-3 font-sans">
          Welcome, {userName || "Firas Ahmad"}
        </h1>
      </div>

      {/* Active Work Session Banner if worker has a session active */}
      {stats?.activeSession && (
        <Card className="bg-blue-50 border-2 border-blue-400 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between text-slate-800">
            <div className="flex items-center gap-3">
              <PlayCircle className="w-6 h-6 text-blue-600 animate-spin shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Active Batch Work</p>
                <p className="text-sm font-bold text-slate-900">
                  {stats.activeSession.style_number} • {stats.activeSession.phase_name}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs"
              onClick={() => navigate(`/factory/batch/${stats.activeSession?.batch_id}`)}
            >
              Complete Work
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 1 & STEP 2 Action Cards */}
      <div className="space-y-3">
        {/* STEP 1: Batch Start Scan */}
        <Card
          className="bg-[#e9ecef]/70 hover:bg-[#e2e6ea] border-2 border-blue-400/80 cursor-pointer shadow-xs transition-all rounded-xl"
          onClick={() => navigate("/factory/scan?mode=start")}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-lg bg-[#4675a8] flex items-center justify-center text-white shrink-0">
                <LayoutGrid className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  STEP 1
                </span>
                <h2 className="text-base font-bold text-slate-900 leading-snug">
                  Batch Start Scan
                </h2>
                <p className="text-xs text-slate-500 font-normal">
                  Scan the QR code before starting work
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </CardContent>
        </Card>

        {/* STEP 2: Batch End Scan */}
        <Card
          className="bg-[#e9ecef]/70 hover:bg-[#e2e6ea] border border-slate-300/80 cursor-pointer shadow-xs transition-all rounded-xl"
          onClick={() => navigate("/factory/scan?mode=end")}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 shrink-0">
                <CheckCircle2 className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  STEP 2
                </span>
                <h2 className="text-base font-bold text-slate-900 leading-snug">
                  Batch End Scan
                </h2>
                <p className="text-xs text-slate-500 font-normal">
                  Scan the end QR code after finishing work and log pieces
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </CardContent>
        </Card>
      </div>

      {/* KPI Stats Grid matching Screenshot 1 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Today's Pcs */}
        <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">
                {stats?.piecesToday ?? 0}
              </p>
              <p className="text-xs font-normal text-slate-500 mt-1">
                Today's Pcs
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Active Batches */}
        <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">
                {stats?.activeBatches ?? 0}
              </p>
              <p className="text-xs font-normal text-slate-500 mt-1">
                Active Batches
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RECENT WORK Section matching Screenshot 1 */}
      <div className="pt-2">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          RECENT WORK
        </h2>
        {recentBatches.length === 0 ? (
          <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
            <CardContent className="p-4 text-center text-slate-500 text-xs font-medium">
              No recent batches found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentBatches.map((batch) => (
              <Card
                key={batch.id}
                className="bg-[#e9ecef]/60 border border-slate-300/70 hover:border-slate-400 cursor-pointer rounded-xl transition-all"
                onClick={() => navigate(`/factory/batch/${batch.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Style {batch.style_number}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 font-normal">
                        Order #{batch.order_number} • Total {batch.total_quantity} pcs
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        batch.status === "completed"
                          ? "bg-white text-slate-700 border-slate-300 text-xs px-3 py-1 font-medium rounded-full"
                          : "bg-blue-50 text-blue-700 border-blue-200 text-xs px-3 py-1 font-medium rounded-full"
                      }
                    >
                      {batch.status === "completed" ? "Completed" : "In Progress"}
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


