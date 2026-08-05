import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, CheckCircle2, Calendar, Package, Loader2, ChevronRight, PlayCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENT_LABELS, type Department, type EntryStage } from "@/lib/departmentEntries";
import DepartmentEntryDetailDialog, { type DepartmentEntryDetail } from "@/components/factory/DepartmentEntryDetailDialog";

interface DashboardStats {
  piecesToday: number;
  activeBatches: number;
  openDepartment: {
    batch_id: string;
    style_number: string;
    department: Department;
  } | null;
}

interface RecentEntry {
  id: string;
  batch_id: string;
  style_number: string;
  department: Department;
  stage: EntryStage;
  payload: Record<string, unknown>;
  total_cost: number | null;
  created_at: string;
}

export default function FactoryDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [detailEntry, setDetailEntry] = useState<DepartmentEntryDetail | null>(null);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, department")
          .eq("id", user.id)
          .single();
        setUserName(profile?.full_name ?? user.email?.split("@")[0] ?? "Worker");
        const myDepartment = profile?.department as Department | null;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: todayEntries } = await supabase
          .from("department_entries")
          .select("payload")
          .eq("worker_id", user.id)
          .gte("created_at", todayStart.toISOString());

        const piecesToday = (todayEntries ?? []).reduce((sum, e) => {
          const qty = (e.payload as Record<string, unknown>)?.quantity_completed;
          return sum + (typeof qty === "number" ? qty : 0);
        }, 0);

        const { count: activeBatches } = await supabase
          .from("production_batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress");

        // Check if this worker currently has an open department on some batch
        let openDepartment: DashboardStats["openDepartment"] = null;
        if (myDepartment) {
          const { data: openStatus } = await supabase
            .from("batch_department_status")
            .select("batch_id, production_batches(style_number)")
            .eq("department", myDepartment)
            .eq("opened_by", user.id)
            .eq("status", "open")
            .order("opened_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (openStatus) {
            openDepartment = {
              batch_id: openStatus.batch_id,
              style_number: (openStatus as any).production_batches?.style_number || "Batch",
              department: myDepartment,
            };
          }
        }

        setStats({ piecesToday, activeBatches: activeBatches ?? 0, openDepartment });

        const { data: recentTracking } = await supabase
          .from("department_entries")
          .select("id, batch_id, department, stage, payload, total_cost, created_at")
          .eq("worker_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (recentTracking && recentTracking.length > 0) {
          const batchIds = [...new Set(recentTracking.map((t) => t.batch_id))];
          const { data: batches } = await supabase
            .from("production_batches")
            .select("id, style_number")
            .in("id", batchIds);
          const batchMap = new Map((batches ?? []).map((b) => [b.id, b.style_number]));

          setRecentEntries(
            recentTracking.map((t) => ({
              id: t.id,
              batch_id: t.batch_id,
              style_number: batchMap.get(t.batch_id) ?? "—",
              department: t.department as Department,
              stage: t.stage as EntryStage,
              payload: (t.payload as Record<string, unknown>) ?? {},
              total_cost: t.total_cost,
              created_at: t.created_at,
            }))
          );
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
      {/* Header Greeting Banner */}
      <div className="bg-[#e9ecef]/80 border border-slate-200/80 rounded-xl p-5 text-center shadow-xs">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium text-slate-600 border border-slate-300 bg-white/70">
          Factory Floor Portal
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-3 font-sans">
          Welcome, {userName || "Worker"}
        </h1>
      </div>

      {/* Open Department Banner if worker has an open batch for their department */}
      {stats?.openDepartment && (
        <Card className="bg-blue-50 border-2 border-blue-400 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between text-slate-800">
            <div className="flex items-center gap-3">
              <PlayCircle className="w-6 h-6 text-blue-600 animate-spin shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Open Batch Work</p>
                <p className="text-sm font-bold text-slate-900">
                  {stats.openDepartment.style_number} • {DEPARTMENT_LABELS[stats.openDepartment.department]}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs"
              onClick={() => navigate("/factory/log?mode=end")}
            >
              End & Confirm
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 1 & STEP 2 Action Cards */}
      <div className="space-y-3">
        {/* STEP 1: Batch Start Scan */}
        <Card
          className="bg-[#e9ecef]/70 hover:bg-[#e2e6ea] border-2 border-blue-400/80 cursor-pointer shadow-xs transition-all rounded-xl"
          onClick={() => navigate("/factory/log?mode=start")}
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
                  Scan the QR code and log your department's start details
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </CardContent>
        </Card>

        {/* STEP 2: Batch End Scan */}
        <Card
          className="bg-[#e9ecef]/70 hover:bg-[#e2e6ea] border border-slate-300/80 cursor-pointer shadow-xs transition-all rounded-xl"
          onClick={() => navigate("/factory/log?mode=end")}
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
                  Scan again to confirm completed/wasted pieces and close the phase
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </CardContent>
        </Card>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
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

      {/* RECENT WORK Section — read-only detail on click */}
      <div className="pt-2">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          RECENT WORK
        </h2>
        {recentEntries.length === 0 ? (
          <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
            <CardContent className="p-4 text-center text-slate-500 text-xs font-medium">
              No recent entries found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentEntries.map((entry) => (
              <Card
                key={entry.id}
                className="bg-[#e9ecef]/60 border border-slate-300/70 hover:border-slate-400 cursor-pointer rounded-xl transition-all"
                onClick={() => setDetailEntry(entry)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Style {entry.style_number}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 font-normal capitalize">
                        {DEPARTMENT_LABELS[entry.department]} · {entry.stage}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        entry.stage === "end"
                          ? "bg-white text-slate-700 border-slate-300 text-xs px-3 py-1 font-medium rounded-full"
                          : "bg-blue-50 text-blue-700 border-blue-200 text-xs px-3 py-1 font-medium rounded-full"
                      }
                    >
                      {entry.stage === "end" ? "Closed" : "In Progress"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <DepartmentEntryDetailDialog entry={detailEntry} onClose={() => setDetailEntry(null)} />
    </div>
  );
}
