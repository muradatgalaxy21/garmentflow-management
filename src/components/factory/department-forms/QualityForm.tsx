import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

export default function QualityForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [ratePerPiece, setRatePerPiece] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("department_cost_rates")
      .select("rate")
      .eq("department", "quality")
      .eq("label", "default")
      .maybeSingle()
      .then(({ data }) => setRatePerPiece(data ? Number(data.rate) : null));
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "quality",
        batchId,
        workerId,
        // Quantity and cost are recorded at END (rate x completed); START only keeps the rate.
        payload: { style_no: styleNumber, rate_per_piece: ratePerPiece },
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
