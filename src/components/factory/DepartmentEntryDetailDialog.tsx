import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/i18n/useTranslation";
import { DEPARTMENT_LABELS, type Department, type EntryStage } from "@/lib/departmentEntries";

export interface DepartmentEntryDetail {
  id: string;
  department: Department;
  stage: EntryStage;
  style_number: string;
  payload: Record<string, unknown>;
  total_cost: number | null;
  created_at: string;
}

function labelize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DepartmentEntryDetailDialog({
  entry,
  onClose,
  onDelete,
}: {
  entry: DepartmentEntryDetail | null;
  onClose: () => void;
  onDelete?: (entry: DepartmentEntryDetail) => void;
}) {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {t("factory.dashboard.style")} {entry.style_number}
                <Badge variant="outline" className="capitalize text-xs">
                  {DEPARTMENT_LABELS[entry.department]} · {entry.stage === "end" ? t("factory.detailDialog.endLabel") : t("factory.detailDialog.startLabel")}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </p>
              <div className="rounded-lg border border-slate-200 divide-y">
                {Object.entries(entry.payload ?? {}).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-slate-500">{labelize(key)}</span>
                    <span className="font-semibold text-slate-800">
                      {value === null || value === undefined || value === ""
                        ? "—"
                        : typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
                {entry.total_cost !== null && (
                  <div className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-slate-500">{t("factory.detailDialog.totalCost")}</span>
                    <span className="font-semibold text-slate-800">PKR {entry.total_cost}</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400 pt-1">{t("factory.detailDialog.readOnlyNote")}</p>
            </div>
            {isAdmin && onDelete && (
              <DialogFooter>
                <Button
                  variant="outline"
                  className="w-full text-red-500 hover:text-red-600 border-red-500/30"
                  onClick={() => onDelete(entry)}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> {t("factory.detailDialog.deleteEntry")}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
