import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import {
  insertDepartmentEntry,
  fetchBundleQualityStatuses,
  DEPARTMENT_LABELS,
  QUALITY_VERDICT_LABELS,
  type BundleQualityStatus,
  type QualityVerdict,
  type ReworkDepartment,
} from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

interface BundleOption {
  id: string;
  lot_no: string;
  bundle_no: number;
  pcs_count: number;
}

const ALL_VERDICTS: QualityVerdict[] = ["confirm", "alter", "reject"];
const ROUTE_TARGETS: ReworkDepartment[] = [
  "accessories", "cutting", "sticker", "printing", "embroidery",
  "quality", "lot_bundling", "stitching", "button_ops", "clipping", "press",
];

const VERDICT_BADGE: Record<QualityVerdict, string> = {
  confirm: "bg-emerald-100 text-emerald-800 border-emerald-300",
  alter: "bg-amber-100 text-amber-800 border-amber-300",
  reject: "bg-red-100 text-red-800 border-red-300",
};

export default function QualityFinalForm({ batchId, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [statuses, setStatuses] = useState<Map<string, BundleQualityStatus>>(new Map());
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundleId, setBundleId] = useState("");
  const [verdict, setVerdict] = useState<QualityVerdict | "">("");
  const [routedTo, setRoutedTo] = useState<ReworkDepartment | "">("");
  const [alterReason, setAlterReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ratePerPiece, setRatePerPiece] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("department_cost_rates")
      .select("rate")
      .eq("department", "quality_final")
      .eq("label", "default")
      .maybeSingle()
      .then(({ data }) => setRatePerPiece(data ? Number(data.rate) : null));
  }, []);

  useEffect(() => {
    Promise.all([
      supabase
        .from("production_bundles")
        .select("id, lot_no, bundle_no, pcs_count")
        .eq("batch_id", batchId)
        .order("lot_no")
        .order("bundle_no"),
      fetchBundleQualityStatuses(batchId),
    ]).then(([bundleRes, statusMap]) => {
      setBundles((bundleRes.data as BundleOption[]) ?? []);
      setStatuses(statusMap);
      setLoadingBundles(false);
    });
  }, [batchId]);

  const selectedBundle = useMemo(() => bundles.find((b) => b.id === bundleId) || null, [bundles, bundleId]);
  const selectedStatus = bundleId ? statuses.get(bundleId) : null;
  const totalCost = ratePerPiece !== null && selectedBundle ? ratePerPiece * selectedBundle.pcs_count : null;

  const canSubmit =
    !!bundleId &&
    !!verdict &&
    (verdict !== "alter" || (!!routedTo && alterReason.trim().length > 0)) &&
    (verdict !== "reject" || rejectReason.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || !verdict) {
      toast({ title: t("factory.forms.qualityFinal.selectBundleVerdict"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error: checkError } = await supabase.from("bundle_quality_checks").insert({
        bundle_id: bundleId,
        batch_id: batchId,
        verdict,
        routed_to_department: verdict === "alter" ? routedTo : null,
        alter_reason: verdict === "alter" ? alterReason.trim() : null,
        reject_reason: verdict === "reject" ? rejectReason.trim() : null,
        checked_by: workerId,
      });
      if (checkError) throw checkError;

      await insertDepartmentEntry({
        department: "quality_final",
        batchId,
        workerId,
        payload: {
          bundle_id: bundleId,
          lot_no: selectedBundle?.lot_no ?? null,
          bundle_no: selectedBundle?.bundle_no ?? null,
          pcs_count: selectedBundle?.pcs_count ?? null,
          verdict,
          routed_to_department: verdict === "alter" ? routedTo : null,
          alter_reason: verdict === "alter" ? alterReason.trim() : null,
          reject_reason: verdict === "reject" ? rejectReason.trim() : null,
        },
        totalCost,
      });
      toast({ title: t("factory.forms.qualityFinal.qualityCheckSaved") });
      onSubmitted();
    } catch (err: any) {
      toast({ title: t("factory.forms.qualityFinal.errorSavingCheck"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.common.bundle")}</Label>
          {loadingBundles ? (
            <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : bundles.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
              {t("factory.common.noBundles")}
            </p>
          ) : (
            <Select value={bundleId} onValueChange={(v) => { setBundleId(v); setVerdict(""); setRoutedTo(""); setAlterReason(""); setRejectReason(""); }}>
              <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                <SelectValue placeholder={t("factory.common.selectBundle")} />
              </SelectTrigger>
              <SelectContent>
                {bundles.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {t("factory.common.lot")} {b.lot_no} · {t("factory.common.bundleNo")}{b.bundle_no} ({b.pcs_count} {t("factory.common.pieces")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedStatus && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{t("factory.forms.qualityFinal.lastCheck")}</span>
            <Badge variant="outline" className={VERDICT_BADGE[selectedStatus.latest_verdict]}>
              {QUALITY_VERDICT_LABELS[selectedStatus.latest_verdict]}
              {selectedStatus.latest_verdict === "alter" && selectedStatus.routed_to_department
                ? ` → ${DEPARTMENT_LABELS[selectedStatus.routed_to_department]}`
                : ""}
            </Badge>
          </div>
        )}

        {bundleId && (
          <>
            <div>
              <Label className="text-xs font-bold text-slate-700">{t("factory.forms.qualityFinal.verdict")}</Label>
              <Select value={verdict} onValueChange={(v) => setVerdict(v as QualityVerdict)}>
                <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                  <SelectValue placeholder={t("factory.forms.qualityFinal.selectVerdict")} />
                </SelectTrigger>
                <SelectContent>
                  {ALL_VERDICTS.map((v) => (
                    <SelectItem key={v} value={v}>{QUALITY_VERDICT_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {verdict === "alter" && (
              <>
                <div>
                  <Label className="text-xs font-bold text-slate-700">{t("factory.forms.qualityFinal.sendBackTo")}</Label>
                  <Select value={routedTo} onValueChange={(v) => setRoutedTo(v as ReworkDepartment)}>
                    <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                      <SelectValue placeholder={t("factory.forms.qualityFinal.selectDepartment")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUTE_TARGETS.map((d) => (
                        <SelectItem key={d} value={d}>{DEPARTMENT_LABELS[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-600">{t("factory.forms.qualityFinal.reasonForAlteration")}</Label>
                  <Textarea value={alterReason} onChange={(e) => setAlterReason(e.target.value)} rows={2}
                    placeholder={t("factory.forms.qualityFinal.alterPlaceholder")}
                    className="mt-1 bg-white border-slate-300 text-xs" />
                </div>
              </>
            )}

            {verdict === "reject" && (
              <div>
                <Label className="text-xs font-medium text-slate-600">{t("factory.forms.qualityFinal.rejectReason")}</Label>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2}
                  placeholder={t("factory.forms.qualityFinal.rejectPlaceholder")}
                  className="mt-1 bg-white border-slate-300 text-xs" />
              </div>
            )}
          </>
        )}

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
          disabled={submitting || !canSubmit}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.forms.qualityFinal.saveQualityCheck")}
        </Button>
      </CardContent>
    </Card>
  );
}
