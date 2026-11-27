import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

export default function EmbroideryForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [costPerPiece, setCostPerPiece] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("department_cost_rates")
      .select("rate")
      .eq("department", "embroidery")
      .eq("label", "default")
      .maybeSingle()
      .then(({ data }) => setCostPerPiece(data?.rate ?? null));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "embroidery",
        batchId,
        workerId,
        // Quantity and cost are recorded at END (rate x completed); START only keeps the rate.
        payload: { rate_per_piece: costPerPiece, style_no: styleNumber },
      });
      toast({ title: t("factory.common.entrySaved") });
      onSubmitted();
    } catch (err: any) {
      toast({ title: t("factory.common.errorSavingEntry"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">{t("factory.forms.embroidery.costPerPiece")}</span>
          <span className="text-sm font-bold text-slate-800">
            {costPerPiece !== null ? `PKR ${costPerPiece}` : t("factory.common.setByAdmin")}
          </span>
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">{t("factory.common.styleNo")}</span>
          <span className="text-sm font-bold text-slate-800">{styleNumber}</span>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
