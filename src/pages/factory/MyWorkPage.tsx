import { useEffect, useState } from "react";
import { Loader2, ClipboardList, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DEPARTMENT_LABELS, deleteDepartmentEntryAndRestock, type Department, type EntryStage } from "@/lib/departmentEntries";
import DepartmentEntryDetailDialog, { type DepartmentEntryDetail } from "@/components/factory/DepartmentEntryDetailDialog";

// ---------------------------------------------------------------
// MyWorkPage - Worker history at /factory/my-work
// Shows all department_entries for the current worker, grouped by
// date. Read-only: tapping an entry opens a detail dialog, no edits.
// ---------------------------------------------------------------

interface HistoryEntry {
  id: string;
  batch_id: string;
  style_number: string;
  department: Department;
  stage: EntryStage;
  payload: Record<string, unknown>;
  total_cost: number | null;
  inventory_item_id: string | null;
  created_at: string;
}

export default function MyWorkPage() {
  const { isRtl } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailEntry, setDetailEntry] = useState<DepartmentEntryDetail | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: tracking } = await supabase
          .from("department_entries")
          .select("id, batch_id, department, stage, payload, total_cost, inventory_item_id, created_at")
          .eq("worker_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (!tracking || tracking.length === 0) {
          setEntries([]);
          setLoading(false);
          return;
        }

        const batchIds = [...new Set(tracking.map((t) => t.batch_id))];
        const { data: batches } = await supabase
          .from("production_batches")
          .select("id, style_number")
          .in("id", batchIds);
        const batchMap = new Map((batches ?? []).map((b) => [b.id, b.style_number]));

        setEntries(
          tracking.map((t) => ({
            id: t.id,
            batch_id: t.batch_id,
            style_number: batchMap.get(t.batch_id) ?? "—",
            department: t.department as Department,
            stage: t.stage as EntryStage,
            payload: (t.payload as Record<string, unknown>) ?? {},
            total_cost: t.total_cost,
            inventory_item_id: t.inventory_item_id,
            created_at: t.created_at,
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

  const deleteEntry = async (entry: DepartmentEntryDetail) => {
    if (!window.confirm("Delete this work entry? This cannot be undone.")) return;
    const full = entries.find((e) => e.id === entry.id);
    try {
      await deleteDepartmentEntryAndRestock(
        { id: entry.id, inventory_item_id: full?.inventory_item_id, payload: full?.payload },
        user!.id
      );
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setDetailEntry(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const grouped = entries.reduce<Record<string, HistoryEntry[]>>((acc, entry) => {
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
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="w-5 h-5 text-slate-700" />
        <h1 className="text-xl font-bold text-slate-900">My Work</h1>
      </div>

      {entries.length === 0 ? (
        <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center gap-2">
            <ClipboardList className="w-8 h-8 text-slate-400 stroke-1" />
            <p className="text-xs text-slate-500 font-medium">
              No entries logged yet.
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
                <Card
                  key={entry.id}
                  className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs cursor-pointer hover:border-slate-400 transition-all"
                  onClick={() => setDetailEntry(entry)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 leading-snug">
                          Style {entry.style_number}
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5 capitalize">
                          {DEPARTMENT_LABELS[entry.department]} · {entry.stage}
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

                    <div className="pt-3 border-t border-slate-300/70 flex items-center justify-around">
                      <div className="text-center">
                        <p className="text-xl font-bold text-slate-900 leading-none">
                          {typeof entry.payload.quantity_completed === "number" ? entry.payload.quantity_completed : "—"}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500 mt-1">
                          Completed
                        </p>
                      </div>
                      <div className="h-8 w-px bg-slate-300/70" />
                      <div className="text-center">
                        <p className="text-xl font-bold text-slate-900 leading-none">
                          {typeof entry.payload.quantity_wasted === "number" ? entry.payload.quantity_wasted : "—"}
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

      <DepartmentEntryDetailDialog entry={detailEntry} onClose={() => setDetailEntry(null)} onDelete={deleteEntry} />
    </div>
  );
}
