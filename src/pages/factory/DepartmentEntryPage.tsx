import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import QrScanBox from "@/components/factory/QrScanBox";
import type { Department } from "@/lib/departmentEntries";
import { checkDepartmentGate, DEPARTMENT_LABELS, getDepartmentStatus, openDepartment } from "@/lib/departmentEntries";
import AccessoriesForm from "@/components/factory/department-forms/AccessoriesForm";
import CuttingForm from "@/components/factory/department-forms/CuttingForm";
import StickerForm from "@/components/factory/department-forms/StickerForm";
import PrintingForm from "@/components/factory/department-forms/PrintingForm";
import EmbroideryForm from "@/components/factory/department-forms/EmbroideryForm";
import QualityForm from "@/components/factory/department-forms/QualityForm";
import LotBundlingForm from "@/components/factory/department-forms/LotBundlingForm";
import StitchingForm from "@/components/factory/department-forms/StitchingForm";
import ButtonOpsForm from "@/components/factory/department-forms/ButtonOpsForm";
import ClippingForm from "@/components/factory/department-forms/ClippingForm";
import PressForm from "@/components/factory/department-forms/PressForm";
import QualityFinalForm from "@/components/factory/department-forms/QualityFinalForm";
import PackingForm from "@/components/factory/department-forms/PackingForm";
import EndConfirmationForm from "@/components/factory/department-forms/EndConfirmationForm";

interface BatchInfo {
  id: string;
  style_number: string;
}

export default function DepartmentEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get("mode") === "end" ? "end" : "start") as "start" | "end";

  const [lookingUp, setLookingUp] = useState(false);
  const [loadingDept, setLoadingDept] = useState(false);
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [department, setDepartment] = useState<Department | null | undefined>(undefined);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const lookupBatch = useCallback(
    async (qrHash: string) => {
      if (!qrHash.trim() || !user) return;
      setLookingUp(true);
      setBlockedReason(null);
      try {
        const { data: batchData, error } = await supabase
          .from("production_batches")
          .select("id, style_number")
          .eq("qr_code_hash", qrHash.trim())
          .single();

        if (error || !batchData) {
          toast({ title: t("factory.departmentEntry.invalidQr"), variant: "destructive" });
          setLookingUp(false);
          return;
        }

        setLoadingDept(true);
        const { data: profile } = await supabase
          .from("profiles")
          .select("department")
          .eq("id", user.id)
          .maybeSingle();

        let dept = (profile?.department as Department | null) ?? null;

        // Lot Bundling is cutting workers' second pass on a batch, not a
        // separately assignable department: once their own Cutting stage
        // is closed for this batch, route them to the bundling step instead.
        if (dept === "cutting") {
          const cuttingStatus = await getDepartmentStatus(batchData.id, "cutting");
          if (cuttingStatus?.status === "closed") {
            dept = "lot_bundling";
          }
        }

        if (dept) {
          const gate = await checkDepartmentGate(batchData.id, dept);
          if (!gate.allowed) {
            setBlockedReason(gate.reason ?? t("factory.departmentEntry.blockedGeneric"));
            setLoadingDept(false);
            setLookingUp(false);
            setBatch(batchData);
            setDepartment(dept);
            return;
          }

          const status = await getDepartmentStatus(batchData.id, dept);
          if (mode === "start") {
            if (status?.status === "closed") {
              setBlockedReason(t("factory.departmentEntry.alreadyClosed"));
            }
          } else {
            if (!status || status.status !== "open") {
              setBlockedReason(t("factory.departmentEntry.notStartedYet"));
            } else if (status.end_verification_status === "pending") {
              setBlockedReason(t("factory.departmentEntry.pendingVerification"));
            } else if (!status.end_enabled) {
              setBlockedReason(
                status.start_verification_status === "denied"
                  ? t("factory.departmentEntry.startDenied")
                  : t("factory.departmentEntry.waitingStartVerify")
              );
            }
          }
        }

        setBatch(batchData);
        setDepartment(dept);
      } catch (err: any) {
        toast({ title: t("factory.departmentEntry.lookupError"), description: err.message, variant: "destructive" });
      } finally {
        setLookingUp(false);
        setLoadingDept(false);
      }
    },
    [toast, user, mode, t]
  );

  if (!user) return null;

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 max-w-md mx-auto text-center px-4">
        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-300">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">
          {mode === "end" ? t("factory.departmentEntry.batchEndConfirmed") : t("factory.departmentEntry.entryLogged")}
        </h2>
        <p className="text-xs text-slate-600 font-normal">
          {mode === "end"
            ? t("factory.departmentEntry.deptClosedMsg")
            : t("factory.departmentEntry.entryRecordedMsg")}
        </p>
        <div className="flex flex-col w-full gap-3 mt-3">
          <Button
            size="lg"
            className="w-full h-12 text-sm font-semibold bg-[#4675a8] hover:bg-[#38608b] text-white rounded-xl"
            onClick={() => {
              setBatch(null);
              setDepartment(undefined);
              setBlockedReason(null);
              setSubmitted(false);
            }}
          >
            {t("factory.departmentEntry.logAnotherEntry")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full h-12 text-sm border-slate-300 text-slate-700 rounded-xl"
            onClick={() => navigate("/factory")}
          >
            {t("factory.departmentEntry.returnToHome")}
          </Button>
        </div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="space-y-4 max-w-md mx-auto">
        <div className="bg-[#e9ecef]/80 border border-slate-200/80 rounded-xl p-5 text-center shadow-xs">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium text-slate-600 border border-slate-300 bg-white/70">
            {mode === "end" ? t("factory.dashboard.batchEndScan") : t("factory.dashboard.batchStartScan")}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-3 font-sans">{t("factory.departmentEntry.scanBatchTitle")}</h1>
        </div>
        <QrScanBox onDecoded={lookupBatch} busy={lookingUp || loadingDept} />
      </div>
    );
  }

  if (department === undefined || loadingDept) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!department) {
    return (
      <div className="text-center py-20 space-y-4 max-w-md mx-auto px-4">
        <p className="text-slate-700 text-sm font-medium">
          {t("factory.departmentEntry.noDepartmentAssigned")}
        </p>
        <Button variant="ghost" className="text-blue-600 font-semibold" onClick={() => setBatch(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> {t("factory.departmentEntry.backToScanner")}
        </Button>
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="text-center py-20 space-y-4 max-w-md mx-auto px-4">
        <p className="text-red-700 text-sm font-medium bg-red-50 border border-red-200 rounded-lg p-4">
          {blockedReason}
        </p>
        <Button variant="ghost" className="text-blue-600 font-semibold" onClick={() => setBatch(null)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> {t("factory.departmentEntry.backToScanner")}
        </Button>
      </div>
    );
  }

  const formProps = {
    batchId: batch.id,
    styleNumber: batch.style_number,
    workerId: user.id,
    onSubmitted: async () => {
      if (mode === "start") {
        try {
          await openDepartment(batch.id, department, user.id, batch.style_number);
        } catch (err: any) {
          toast({ title: t("factory.departmentEntry.failedOpenDept"), description: err.message, variant: "destructive" });
          return;
        }
      }
      setSubmitted(true);
    },
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <Button variant="ghost" size="sm" className="text-slate-600 -ml-2 hover:bg-slate-200/60" onClick={() => setBatch(null)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> {t("factory.common.back")}
      </Button>

      <div className="bg-[#e9ecef]/80 border border-slate-200/80 rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t("factory.entry.styleNumber")}</span>
            <h1 className="text-xl font-bold text-slate-900">{batch.style_number}</h1>
          </div>
          <Badge className="bg-white text-slate-700 border-slate-300 text-xs font-semibold px-3 py-1 rounded-full">
            {DEPARTMENT_LABELS[department]} — {mode === "end" ? t("factory.departmentEntry.endSuffix") : t("factory.departmentEntry.startSuffix")}
          </Badge>
        </div>
      </div>

      {mode === "end" ? (
        <EndConfirmationForm department={department} {...formProps} />
      ) : (
        <>
          {department === "accessories" && <AccessoriesForm {...formProps} />}
          {department === "cutting" && <CuttingForm {...formProps} />}
          {department === "sticker" && <StickerForm {...formProps} />}
          {department === "printing" && <PrintingForm {...formProps} />}
          {department === "embroidery" && <EmbroideryForm {...formProps} />}
          {department === "quality" && <QualityForm {...formProps} />}
          {department === "lot_bundling" && <LotBundlingForm {...formProps} />}
          {department === "stitching" && <StitchingForm {...formProps} />}
          {department === "button_ops" && <ButtonOpsForm {...formProps} />}
          {department === "clipping" && <ClippingForm {...formProps} />}
          {department === "press" && <PressForm {...formProps} />}
          {department === "quality_final" && <QualityFinalForm {...formProps} />}
          {department === "packing" && <PackingForm {...formProps} />}
        </>
      )}
    </div>
  );
}
