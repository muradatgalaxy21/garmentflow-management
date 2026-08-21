import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

const DEFECT_TAGS = ["Stitching", "Fabric", "Print/Embroidery", "Measurement", "Sticker", "Accessory", "Other"] as const;
const DEFECT_TAG_KEYS: Record<string, string> = {
  Stitching: "stitching",
  Fabric: "fabric",
  "Print/Embroidery": "printEmbroidery",
  Measurement: "measurement",
  Sticker: "sticker",
  Accessory: "accessory",
  Other: "other",
};

export default function QualityForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [checkedQty, setCheckedQty] = useState<number>(0);
  const [passQty, setPassQty] = useState<number>(0);
  const [defectTag, setDefectTag] = useState<string>("");
  const [defectReason, setDefectReason] = useState("");
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

  const defectQty = useMemo(() => Math.max(0, checkedQty - passQty), [checkedQty, passQty]);
  const totalCost = ratePerPiece !== null ? ratePerPiece * checkedQty : null;

  const handleSubmit = async () => {
    if (checkedQty <= 0) {
      toast({ title: t("factory.forms.quality.enterCheckedQty"), variant: "destructive" });
      return;
    }
    if (passQty > checkedQty) {
      toast({ title: t("factory.forms.quality.passExceedsChecked"), variant: "destructive" });
      return;
    }
    if (defectQty > 0 && !defectTag) {
      toast({ title: t("factory.forms.quality.selectDefectTag"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "quality",
        batchId,
        workerId,
        payload: {
          checked_qty: checkedQty,
          pass_qty: passQty,
          defect_qty: defectQty,
          defect_tag: defectQty > 0 ? defectTag : null,
          defect_reason: defectReason || null,
          style_no: styleNumber,
        },
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
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.quality.checkedQuantity")}</Label>
          <Input type="number" min="0" value={checkedQty}
            onChange={(e) => setCheckedQty(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.quality.passQuantity")}</Label>
          <Input type="number" min="0" value={passQty}
            onChange={(e) => setPassQty(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">{t("factory.forms.quality.defectQuantity")}</span>
          <span className="text-sm font-bold text-red-700">{defectQty}</span>
        </div>

        {totalCost !== null && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{t("factory.common.totalCost")}</span>
            <span className="text-sm font-bold text-slate-800">PKR {totalCost.toFixed(2)}</span>
          </div>
        )}

        {defectQty > 0 && (
          <>
            <div>
              <Label className="text-xs font-bold text-slate-700">{t("factory.forms.quality.defectReasonTag")}</Label>
              <Select value={defectTag} onValueChange={setDefectTag}>
                <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                  <SelectValue placeholder={t("factory.forms.quality.selectReason")} />
                </SelectTrigger>
                <SelectContent>
                  {DEFECT_TAGS.map((tag) => (
                    <SelectItem key={tag} value={tag}>{t(`factory.forms.quality.defectTags.${DEFECT_TAG_KEYS[tag]}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">{t("factory.entry.notes")}</Label>
              <Textarea value={defectReason} onChange={(e) => setDefectReason(e.target.value)} rows={2}
                placeholder={t("factory.forms.quality.defectDetailsPlaceholder")}
                className="mt-1 bg-white border-slate-300 text-xs" />
            </div>
          </>
        )}

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || checkedQty <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
