import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, PlayCircle, CheckCircle2, ClipboardList, Package, Loader2, Sparkles } from "lucide-react";
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
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        setUserName(profile?.full_name ?? user.email ?? "");

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
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-10">
      {/* High-Contrast Greeting Header */}
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" /> Factory Floor Portal
            </span>
            <h1 className="text-2xl font-black text-white mt-2">
              Khush Amdeed / Welcome, {userName || "Worker"}!
            </h1>
          </div>
        </div>
      </div>

      {/* Active Work Banner if worker has a session running */}
      {stats?.activeSession && (
        <Card className="bg-emerald-950/80 border-2 border-emerald-500 shadow-2xl animate-pulse">
          <CardContent className="p-5 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500 text-slate-950 mb-3">
              <PlayCircle className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-xl font-black text-emerald-300">
              Kaam Chal Raha Hai / Batch Work Active!
            </h2>
            <p className="text-sm font-semibold text-emerald-100 mt-1">
              Style: <span className="underline font-bold">{stats.activeSession.style_number}</span> • Phase: <span className="font-bold">{stats.activeSession.phase_name}</span>
            </p>
            <Button
              size="lg"
              className="mt-4 w-full h-14 text-lg font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg"
              onClick={() => navigate(`/factory/batch/${stats.activeSession?.batch_id}`)}
            >
              <CheckCircle2 className="w-6 h-6 mr-2" /> Complete &amp; Log End Count
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Giant Touch Buttons Designed for Non-Tech Workers */}
      <div className="grid grid-cols-1 gap-4">
        {/* START BATCH WORK CARD */}
        <Card
          className="bg-emerald-600 hover:bg-emerald-500 border-0 cursor-pointer shadow-2xl transition-all transform active:scale-95"
          onClick={() => navigate("/factory/scan?mode=start")}
        >
          <CardContent className="p-6 flex items-center justify-between text-white">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-200">
                PEEHLA STEP / STEP 1
              </span>
              <h2 className="text-2xl font-black mt-1">🟢 Batch Shuru Scan</h2>
              <p className="text-xs text-emerald-100 font-semibold mt-1">
                Kaam shuru karne se pehle QR code scan karen
              </p>
            </div>
            <div className="p-4 bg-emerald-500 rounded-2xl shadow-inner">
              <QrCode className="w-10 h-10 text-white" />
            </div>
          </CardContent>
        </Card>

        {/* END BATCH WORK CARD */}
        <Card
          className="bg-amber-600 hover:bg-amber-500 border-0 cursor-pointer shadow-2xl transition-all transform active:scale-95"
          onClick={() => navigate("/factory/scan?mode=end")}
        >
          <CardContent className="p-6 flex items-center justify-between text-white">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-amber-200">
                DUSRA STEP / STEP 2
              </span>
              <h2 className="text-2xl font-black mt-1">🔴 Batch Khatam Scan</h2>
              <p className="text-xs text-amber-100 font-semibold mt-1">
                Kaam mukammal hone par End QR scan karke pcs likhen
              </p>
            </div>
            <div className="p-4 bg-amber-500 rounded-2xl shadow-inner">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <ClipboardList className="w-7 h-7 text-emerald-400 mx-auto mb-1" />
            <p className="text-3xl font-black text-white">
              {stats?.piecesToday ?? 0}
            </p>
            <p className="text-xs font-bold text-slate-400 mt-1">
              Aaj Ke Pieces / Today's Pcs
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 text-center">
            <Package className="w-7 h-7 text-blue-400 mx-auto mb-1" />
            <p className="text-3xl font-black text-white">
              {stats?.activeBatches ?? 0}
            </p>
            <p className="text-xs font-bold text-slate-400 mt-1">
              Chalte Batches / Active Batches
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Batches List */}
      <div>
        <h2 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wide">
          Haal Hi Ke Batches / Recent Work
        </h2>
        {recentBatches.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-8 text-center text-slate-500 text-sm">
              Koi haaliya batch nahi mila
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
                      <p className="text-base font-bold text-white">
                        Style: {batch.style_number}
                      </p>
                      <p className="text-xs font-semibold text-slate-400 mt-0.5">
                        Order #{batch.order_number} • Total {batch.total_quantity} pcs
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        batch.status === "completed"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs px-3 py-1 font-bold"
                          : "bg-blue-500/20 text-blue-300 border-blue-500/40 text-xs px-3 py-1 font-bold"
                      }
                    >
                      {batch.status === "completed" ? "Khatam" : "Jari Hai"}
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

