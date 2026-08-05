import { useEffect, useState } from "react";
import { Loader2, ClipboardList, Clock } from "lucide-react";
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
    <div className="space-y-4 max-w-md mx-auto">
      {/* Title Header matching Screenshot 3 */}
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="w-5 h-5 text-slate-700" />
        <h1 className="text-xl font-bold text-slate-900">My Work</h1>
      </div>

      {entries.length === 0 ? (
        <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-2">
            <ClipboardList className="w-8 h-8 text-slate-400 stroke-1" />
            <p className="text-xs text-slate-500 font-medium">
              No completed batches logged for this date.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([date, items]) => (
          <div key={date} className="space-y-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {date}
            </p>
            <div className="space-y-3">
              {items.map((entry) => (
                <Card key={entry.id} className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
                  <CardContent className="p-4 space-y-3">
                    {/* Top Row: Style name & Time stamp */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 leading-snug">
                          Style {entry.style_number}
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          Phase: {entry.phase_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400 text-xs font-normal">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {new Date(entry.created_at).toLocaleTimeString("en-US", {
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row Divider & Stats: Completed & Wasted */}
                    <div className="pt-3 border-t border-slate-300/70 flex items-center justify-around">
                      <div className="text-center">
                        <p className="text-xl font-bold text-slate-900 leading-none">
                          {entry.quantity_completed}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 mt-1">
                          Completed
                        </p>
                      </div>
                      <div className="h-8 w-px bg-slate-300/70" />
                      <div className="text-center">
                        <p className="text-xl font-bold text-slate-900 leading-none">
                          {entry.quantity_wasted}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 mt-1">
                          Wasted
                        </p>
                      </div>
                    </div>
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

