import { useEffect, useState } from "react";
import { Loader2, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------
// MyWorkPage - Worker history at /factory/my-work
// Shows all batch_tracking entries for the current worker,
// grouped by date, with phase and batch info.
// ---------------------------------------------------------------

interface TrackingEntry {
  id: string;
  batch_id: string;
  phase_id: string;
  quantity_completed: number;
  quantity_wasted: number;
  notes: string | null;
  created_at: string;
  phase_name: string;
  style_number: string;
}

export default function MyWorkPage() {
  const { t, isRtl } = useTranslation();
  const { user } = useAuth();
  const [entries, setEntries] = useState<TrackingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        // 1. Fetch this worker's tracking entries ordered by date
        const { data: tracking } = await supabase
          .from("batch_tracking")
          .select("id, batch_id, phase_id, quantity_completed, quantity_wasted, notes, created_at")
          .eq("worker_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (!tracking || tracking.length === 0) {
          setEntries([]);
          setLoading(false);
          return;
        }

        // 2. Fetch phase names for display
        const phaseIds = [...new Set(tracking.map((t) => t.phase_id))];
        const { data: phases } = await supabase
          .from("production_phases")
          .select("id, name")
          .in("id", phaseIds);
        const phaseMap = new Map((phases ?? []).map((p) => [p.id, p.name]));

        // 3. Fetch batch style numbers for display
        const batchIds = [...new Set(tracking.map((t) => t.batch_id))];
        const { data: batches } = await supabase
          .from("production_batches")
          .select("id, style_number")
          .in("id", batchIds);
        const batchMap = new Map((batches ?? []).map((b) => [b.id, b.style_number]));

        // 4. Combine data for display
        setEntries(
          tracking.map((t) => ({
            ...t,
            phase_name: phaseMap.get(t.phase_id) ?? "—",
            style_number: batchMap.get(t.batch_id) ?? "—",
          }))
        );
      } catch (err) {
        console.error("Failed to load work history:", err);
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

  // Group entries by date for display
  const grouped = entries.reduce<Record<string, TrackingEntry[]>>((acc, entry) => {
    const dateKey = new Date(entry.created_at).toLocaleDateString(
      isRtl ? "ur-PK" : "en-US",
      { year: "numeric", month: "short", day: "numeric" }
    );
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-5 h-5 text-emerald-400" />
        <h1 className="text-xl font-bold text-white">{t("factory.myWork.title")}</h1>
      </div>

      {entries.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center text-slate-500 text-sm">
            {t("factory.myWork.noEntries")}
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              {date}
            </p>
            <div className="space-y-2">
              {items.map((entry) => (
                <Card key={entry.id} className="bg-slate-800 border-slate-700">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {entry.style_number}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {t("factory.myWork.phase")}: {entry.phase_name}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-slate-500 mt-1 italic truncate">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">
                          {t("factory.myWork.completed")}: {entry.quantity_completed}
                        </Badge>
                        {entry.quantity_wasted > 0 && (
                          <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-xs">
                            {t("factory.myWork.wasted")}: {entry.quantity_wasted}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2">
                      {new Date(entry.created_at).toLocaleTimeString(isRtl ? "ur-PK" : "en-US", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
