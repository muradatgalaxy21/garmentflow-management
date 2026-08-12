import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

const PATCH_TYPES = ["shirt", "trouser", "sweatshirt", "hoodie", "jacket", "polo"] as const;
const PLACEMENTS = ["front chest", "front upper left", "back", "sleeve", "collar"] as const;

export default function StickerForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState<number>(0);
  const [type, setType] = useState("");
  const [patchType, setPatchType] = useState<string>("");
  const [placement, setPlacement] = useState<string>("");
  const [color, setColor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (quantity <= 0 || !patchType || !placement) {
      toast({ title: t("factory.forms.sticker.fillQtyPatchPlacement"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "sticker",
        batchId,
        workerId,
        payload: {
          quantity, type, patch_type: patchType, placement, color, style_no: styleNumber,
        },
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
          <Label className="text-xs font-bold text-slate-700">{t("factory.dashboard.quantity")}</Label>
          <Input type="number" min="0" value={quantity}
            onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 h-11 mt-1" />
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.sticker.type")}</Label>
          <Input value={type} onChange={(e) => setType(e.target.value)} className="bg-white border-slate-300 h-11 mt-1" />
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.sticker.patchType")}</Label>
          <Select value={patchType} onValueChange={setPatchType}>
            <SelectTrigger className="bg-white border-slate-300 h-11 mt-1 capitalize">
              <SelectValue placeholder={t("factory.forms.sticker.selectPatchType")} />
            </SelectTrigger>
            <SelectContent>
              {PATCH_TYPES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.sticker.placement")}</Label>
          <Select value={placement} onValueChange={setPlacement}>
            <SelectTrigger className="bg-white border-slate-300 h-11 mt-1 capitalize">
              <SelectValue placeholder={t("factory.forms.sticker.selectPlacement")} />
            </SelectTrigger>
            <SelectContent>
              {PLACEMENTS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.common.color")}</Label>
          <Input value={color} onChange={(e) => setColor(e.target.value)} className="bg-white border-slate-300 h-11 mt-1" />
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">{t("factory.common.styleNo")}</span>
          <span className="text-sm font-bold text-slate-800">{styleNumber}</span>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || quantity <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
