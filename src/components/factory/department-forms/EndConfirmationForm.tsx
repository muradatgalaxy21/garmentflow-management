import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { insertDepartmentEntry, submitEndForVerification, type Department } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

interface EndConfirmationFormProps extends DepartmentFormProps {
  department: Department;
}

export default function EndConfirmationForm({ department, batchId, workerId, styleNumber, onSubmitted }: EndConfirmationFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [quantityCompleted, setQuantityCompleted] = useState<number>(0);
  const [quantityWasted, setQuantityWasted] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (quantityCompleted <= 0 && quantityWasted <= 0) {
      toast({ title: t("factory.forms.endConfirmation.enterCompletedOrWasted"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department,
        batchId,
        workerId,
        stage: "end",
        payload: {
          quantity_completed: quantityCompleted,
          quantity_wasted: quantityWasted,
          notes: notes || null,
        },
      });
      await submitEndForVerification({
        batchId,
        department,
        workerId,
        styleNumber,
        quantityCompleted,
        quantityWasted,
        notes,
      });
      toast({ title: t("factory.forms.endConfirmation.batchEndSubmitted") });
      onSubmitted();
    } catch (err: any) {
      toast({ title: t("factory.forms.endConfirmation.errorConfirmingEnd"), description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.endConfirmation.completedQuantity")}</Label>
          <Input
            type="number"
            min="0"
            value={quantityCompleted}
            onChange={(e) => setQuantityCompleted(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-slate-900 text-center text-xl font-bold h-11 rounded-lg mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.endConfirmation.wastedQuantity")}</Label>
          <Input
            type="number"
            min="0"
            value={quantityWasted}
            onChange={(e) => setQuantityWasted(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-slate-900 text-center text-xl font-bold h-11 rounded-lg mt-1"
          />
        </div>
        <div>
          <Label className="text-xs font-medium text-slate-600">{t("factory.entry.notes")}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t("factory.forms.endConfirmation.notesPlaceholder")}
            className="mt-1 bg-white border-slate-300 text-slate-900 text-xs placeholder:text-slate-400 rounded-lg"
          />
        </div>
        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.forms.endConfirmation.confirmBatchEnd")}
        </Button>
      </CardContent>
    </Card>
  );
}
