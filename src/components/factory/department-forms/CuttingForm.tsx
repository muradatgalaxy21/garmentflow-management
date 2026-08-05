import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

export default function CuttingForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const [weightPerLayer, setWeightPerLayer] = useState<number>(0);
  const [layersQty, setLayersQty] = useState<number>(0);
  const [pcsPerLayer, setPcsPerLayer] = useState<number>(0);
  const [color, setColor] = useState("");
  const [styleNumberInput, setStyleNumberInput] = useState(styleNumber);
  const [submitting, setSubmitting] = useState(false);

  const totalWeight = useMemo(() => weightPerLayer * layersQty, [weightPerLayer, layersQty]);
  const totalPcs = useMemo(() => pcsPerLayer * layersQty, [pcsPerLayer, layersQty]);

  const handleSubmit = async () => {
    if (layersQty <= 0 || !color.trim() || !styleNumberInput.trim()) {
      toast({ title: "Fill in layers, color and style number", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "cutting",
        batchId,
        workerId,
        payload: {
          weight_per_layer: weightPerLayer,
          layers_qty: layersQty,
          pcs_per_layer: pcsPerLayer,
          color,
          style_number: styleNumberInput,
          total_weight: totalWeight,
          total_pcs: totalPcs,
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-bold text-slate-700">Weight / Layer</Label>
            <Input type="number" min="0" step="0.01" value={weightPerLayer}
              onChange={(e) => setWeightPerLayer(Math.max(0, parseFloat(e.target.value) || 0))}
              className="bg-white border-slate-300 h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">Layers Qty</Label>
            <Input type="number" min="0" value={layersQty}
              onChange={(e) => setLayersQty(Math.max(0, parseInt(e.target.value) || 0))}
              className="bg-white border-slate-300 h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">Pcs / Layer</Label>
            <Input type="number" min="0" value={pcsPerLayer}
              onChange={(e) => setPcsPerLayer(Math.max(0, parseInt(e.target.value) || 0))}
              className="bg-white border-slate-300 h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">Color</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="bg-white border-slate-300 h-11 mt-1" />
          </div>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">Style Number</Label>
          <Input value={styleNumberInput} onChange={(e) => setStyleNumberInput(e.target.value)} className="bg-white border-slate-300 h-11 mt-1" />
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-2">
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Total Weight</span>
            <span className="text-sm font-bold text-slate-800">{totalWeight.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Total Pcs</span>
            <span className="text-sm font-bold text-slate-800">{totalPcs}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || layersQty <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}
