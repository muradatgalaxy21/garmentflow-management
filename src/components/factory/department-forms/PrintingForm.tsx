import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { insertDepartmentEntry } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

export default function PrintingForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
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
      toast({ title: "Enter color and total quantity", variant: "destructive" });
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
          <Label className="text-xs font-bold text-slate-700">Color</Label>
          {rates.length > 0 ? (
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                <SelectValue placeholder="Select color" />
              </SelectTrigger>
              <SelectContent>
                {rates.map((r) => <SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Color name"
              className="bg-white border-slate-300 h-11 mt-1" />
          )}
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Per Color Cost:</span>
          <span className="text-sm font-bold text-slate-800">
            {perColorCost !== null ? `PKR ${perColorCost}` : "Set by Admin"}
          </span>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">Total Quantity</Label>
          <Input type="number" min="0" value={totalQuantity}
            onChange={(e) => setTotalQuantity(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 h-11 mt-1" />
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Style No:</span>
          <span className="text-sm font-bold text-slate-800">{styleNumber}</span>
        </div>

        {totalCost !== null && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Cost:</span>
            <span className="text-sm font-bold text-slate-800">PKR {totalCost.toFixed(2)}</span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !color.trim() || totalQuantity <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}
