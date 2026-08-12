import { useState } from "react";
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

export default function LotBundlingForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [lotNo, setLotNo] = useState("");
  const [bundleSize, setBundleSize] = useState<number>(0);
  const [pcsPerBundle, setPcsPerBundle] = useState<number>(0);
  const [totalBundles, setTotalBundles] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!lotNo.trim() || pcsPerBundle <= 0 || totalBundles <= 0) {
      toast({ title: t("factory.forms.lotBundling.enterLotPcsBundles"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const bundles = Array.from({ length: totalBundles }, (_, i) => ({
        batch_id: batchId,
        lot_no: lotNo.trim(),
        bundle_no: i + 1,
        pcs_count: pcsPerBundle,
        created_by: workerId,
      }));
      const { error: bundlesError } = await supabase.from("production_bundles").insert(bundles);
      if (bundlesError) throw bundlesError;

      await insertDepartmentEntry({
        department: "lot_bundling",
        batchId,
        workerId,
        payload: {
          lot_no: lotNo.trim(),
          bundle_size: bundleSize,
          pcs_per_bundle: pcsPerBundle,
          total_bundles: totalBundles,
          total_pcs: pcsPerBundle * totalBundles,
          style_no: styleNumber,
        },
      });
      toast({ title: t("factory.forms.lotBundling.bundlesCreated").replace("{n}", String(totalBundles)) });
      onSubmitted();
    } catch (err: any) {
      toast({ title: t("factory.forms.lotBundling.errorSavingBundles"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.lotBundling.lotNumber")}</Label>
          <Input value={lotNo} onChange={(e) => setLotNo(e.target.value)} className="bg-white border-slate-300 h-11 mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.lotBundling.bundleSizeTarget")}</Label>
          <Input type="number" min="0" value={bundleSize}
            onChange={(e) => setBundleSize(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 h-11 mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.lotBundling.piecesPerBundle")}</Label>
          <Input type="number" min="0" value={pcsPerBundle}
            onChange={(e) => setPcsPerBundle(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 h-11 mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.lotBundling.totalBundles")}</Label>
          <Input type="number" min="0" value={totalBundles}
            onChange={(e) => setTotalBundles(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 h-11 mt-1" />
        </div>

        {pcsPerBundle > 0 && totalBundles > 0 && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{t("factory.forms.lotBundling.totalPieces")}</span>
            <span className="text-sm font-bold text-slate-800">{pcsPerBundle * totalBundles}</span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !lotNo.trim() || pcsPerBundle <= 0 || totalBundles <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.forms.lotBundling.createBundles")}
        </Button>
      </CardContent>
    </Card>
  );
}
