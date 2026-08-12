import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

export default function PrintingForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [rates, setRates] = useState<{ label: string; rate: number }[]>([]);
  const [color, setColor] = useState("");
  const [totalQuantity, setTotalQuantity] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("department_cost_rates")
      .select("label, rate")
      .eq("department", "printing")
      .then(({ data }) => setRates(data || []));
  }, []);

  const perColorCost = useMemo(() => rates.find((r) => r.label === color)?.rate ?? null, [rates, color]);
  const totalCost = perColorCost !== null ? perColorCost * totalQuantity : null;

  const handleSubmit = async () => {
    if (!color.trim() || totalQuantity <= 0) {
      toast({ title: t("factory.forms.printing.enterColorQty"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "printing",
        batchId,
        workerId,
        payload: { color, per_color_cost: perColorCost, total_quantity: totalQuantity, style_no: styleNumber },
        totalCost,
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
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.common.color")}</Label>
          {rates.length > 0 ? (
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                <SelectValue placeholder={t("factory.forms.printing.selectColor")} />
              </SelectTrigger>
              <SelectContent>
                {rates.map((r) => <SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder={t("factory.forms.printing.colorNamePlaceholder")}
              className="bg-white border-slate-300 h-11 mt-1" />
          )}
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">{t("factory.forms.printing.perColorCost")}</span>
          <span className="text-sm font-bold text-slate-800">
            {perColorCost !== null ? `PKR ${perColorCost}` : t("factory.common.setByAdmin")}
          </span>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.printing.totalQuantity")}</Label>
          <Input type="number" min="0" value={totalQuantity}
            onChange={(e) => setTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 h-11 mt-1" />
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">{t("factory.common.styleNo")}</span>
          <span className="text-sm font-bold text-slate-800">{styleNumber}</span>
        </div>

        {totalCost !== null && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{t("factory.common.totalCost")}</span>
            <span className="text-sm font-bold text-slate-800">PKR {totalCost.toFixed(2)}</span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !color.trim() || totalQuantity <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
