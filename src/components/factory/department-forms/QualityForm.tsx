import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

const DEFECT_TAGS = ["Stitching", "Fabric", "Print/Embroidery", "Measurement", "Sticker", "Accessory", "Other"] as const;

export default function QualityForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const [checkedQty, setCheckedQty] = useState<number>(0);
  const [passQty, setPassQty] = useState<number>(0);
  const [defectTag, setDefectTag] = useState<string>("");
  const [defectReason, setDefectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const defectQty = useMemo(() => Math.max(0, checkedQty - passQty), [checkedQty, passQty]);

  const handleSubmit = async () => {
    if (checkedQty <= 0) {
      toast({ title: "Enter checked quantity", variant: "destructive" });
      return;
    }
    if (passQty > checkedQty) {
      toast({ title: "Pass quantity can't exceed checked quantity", variant: "destructive" });
      return;
    }
    if (defectQty > 0 && !defectTag) {
      toast({ title: "Select a defect reason tag", variant: "destructive" });
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
      });
      toast({ title: "Entry Saved!" });
      onSubmitted();
    } catch (err: any) {
      toast({ title: "Error saving entry", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div>
          <Label className="text-xs font-bold text-slate-700">Checked Quantity</Label>
          <Input type="number" min="0" value={checkedQty}
            onChange={(e) => setCheckedQty(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-slate-700">Pass Quantity</Label>
          <Input type="number" min="0" value={passQty}
            onChange={(e) => setPassQty(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Defect Quantity:</span>
          <span className="text-sm font-bold text-red-700">{defectQty}</span>
        </div>

        {defectQty > 0 && (
          <>
            <div>
              <Label className="text-xs font-bold text-slate-700">Defect Reason (Tag)</Label>
              <Select value={defectTag} onValueChange={setDefectTag}>
                <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {DEFECT_TAGS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-600">Notes (Optional)</Label>
              <Textarea value={defectReason} onChange={(e) => setDefectReason(e.target.value)} rows={2}
                placeholder="Details on the defect..."
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
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}
