import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { insertDepartmentEntry, recordInventoryMovement } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

interface FabricItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  quantity_on_hand: number;
}

export default function CuttingForm({ batchId, styleNumber, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const [weightPerLayer, setWeightPerLayer] = useState<number>(0);
  const [layerSize, setLayerSize] = useState<number>(0);
  const [layersQty, setLayersQty] = useState<number>(0);
  const [pcsPerLayer, setPcsPerLayer] = useState<number>(0);
  const [pieceWeight, setPieceWeight] = useState<number>(0);
  const [color, setColor] = useState("");
  const [styleNumberInput, setStyleNumberInput] = useState(styleNumber);
  const [submitting, setSubmitting] = useState(false);
  const [fabric, setFabric] = useState<FabricItem | null>(null);
  const [checkingFabric, setCheckingFabric] = useState(true);

  useEffect(() => {
    const checkFabric = async () => {
      setCheckingFabric(true);
      const { data: batch } = await supabase
        .from("production_batches")
        .select("material_item_id")
        .eq("id", batchId)
        .maybeSingle();
      if (!batch?.material_item_id) {
        setFabric(null);
        setCheckingFabric(false);
        return;
      }
      const { data: item } = await supabase
        .from("inventory_items")
        .select("id, name, sku, unit, quantity_on_hand")
        .eq("id", batch.material_item_id)
        .maybeSingle();
      setFabric((item as FabricItem) ?? null);
      setCheckingFabric(false);
    };
    checkFabric();
  }, [batchId]);

  const fabricAvailable = !checkingFabric && !!fabric && Number(fabric.quantity_on_hand) > 0;

  const totalWeight = useMemo(() => weightPerLayer * layersQty, [weightPerLayer, layersQty]);
  const totalPcs = useMemo(() => pcsPerLayer * layersQty, [pcsPerLayer, layersQty]);
  const wastePerLayer = useMemo(
    () => Math.max(0, weightPerLayer - pcsPerLayer * pieceWeight),
    [weightPerLayer, pcsPerLayer, pieceWeight]
  );
  const totalWaste = useMemo(() => wastePerLayer * layersQty, [wastePerLayer, layersQty]);

  const handleSubmit = async () => {
    if (!fabricAvailable) {
      toast({ title: "Fabric not in inventory", description: "This batch's fabric is missing or out of stock. Cutting cannot proceed.", variant: "destructive" });
      return;
    }
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
        inventoryItemId: fabric.id,
        payload: {
          weight_per_layer: weightPerLayer,
          layer_size: layerSize,
          layers_qty: layersQty,
          pcs_per_layer: pcsPerLayer,
          piece_weight: pieceWeight,
          color,
          style_number: styleNumberInput,
          total_weight: totalWeight,
          total_pcs: totalPcs,
          waste_per_layer: wastePerLayer,
          total_waste: totalWaste,
          quantity: totalWeight,
        },
      });
      await recordInventoryMovement(fabric.id, totalWeight, "out", workerId, `Cutting entry for batch ${batchId}`);
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
        {!checkingFabric && !fabricAvailable && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-lg p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {fabric
                ? `Fabric "${fabric.name}" is out of stock (0 ${fabric.unit}). Cutting cannot proceed until inventory is restocked.`
                : "No fabric assigned to this batch, or it's not in inventory. Cutting cannot proceed."}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-bold text-slate-700">Weight / Layer</Label>
            <Input type="number" min="0" step="0.01" value={weightPerLayer}
              onChange={(e) => setWeightPerLayer(Math.max(0, parseFloat(e.target.value) || 0))}
              className="bg-white border-slate-300 h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-700">Layer Size (fabric length)</Label>
            <Input type="number" min="0" step="0.01" value={layerSize}
              onChange={(e) => setLayerSize(Math.max(0, parseFloat(e.target.value) || 0))}
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
            <Label className="text-xs font-bold text-slate-700">Weight / Piece</Label>
            <Input type="number" min="0" step="0.01" value={pieceWeight}
              onChange={(e) => setPieceWeight(Math.max(0, parseFloat(e.target.value) || 0))}
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
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Waste / Layer</span>
            <span className="text-sm font-bold text-slate-800">{wastePerLayer.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Total Waste</span>
            <span className="text-sm font-bold text-red-700">{totalWaste.toFixed(2)}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || checkingFabric || layersQty <= 0 || !fabricAvailable}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : checkingFabric ? "Checking fabric…" : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}
