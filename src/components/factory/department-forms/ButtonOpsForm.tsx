import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  insertDepartmentEntry,
  recordInventoryMovement,
  BUTTON_OPERATION_LABELS,
  type ButtonOperation,
} from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

interface BundleOption {
  id: string;
  lot_no: string;
  bundle_no: number;
  pcs_count: number;
}

interface InventoryMatch {
  id: string;
  name: string;
  sku: string;
  unit_cost: number | null;
  quantity_on_hand: number;
}

const ALL_OPERATIONS: ButtonOperation[] = ["button", "buttonhole", "eyelet", "bartack"];
// Only these operations consume tracked accessory stock — buttonhole/bartack are pure stitching ops.
const STOCK_LINKED_OPERATIONS: Record<ButtonOperation, string | null> = {
  button: "Buttons",
  buttonhole: null,
  eyelet: "Eyelets",
  bartack: null,
};

export default function ButtonOpsForm({ batchId, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundleId, setBundleId] = useState("");
  const [operationType, setOperationType] = useState<ButtonOperation | "">("");
  const [pcsCompleted, setPcsCompleted] = useState<number>(0);
  const [matches, setMatches] = useState<InventoryMatch[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("production_bundles")
      .select("id, lot_no, bundle_no, pcs_count")
      .eq("batch_id", batchId)
      .order("lot_no")
      .order("bundle_no")
      .then(({ data }) => {
        setBundles((data as BundleOption[]) ?? []);
        setLoadingBundles(false);
      });
  }, [batchId]);

  const accessoryType = operationType ? STOCK_LINKED_OPERATIONS[operationType] : null;

  useEffect(() => {
    setSelectedItemId("");
    if (!accessoryType) {
      setMatches([]);
      return;
    }
    supabase
      .from("inventory_items")
      .select("id, name, sku, unit_cost, quantity_on_hand, attributes")
      .eq("category", "accessory")
      .contains("attributes", { type: accessoryType })
      .then(({ data }) => setMatches((data as InventoryMatch[]) ?? []));
  }, [accessoryType]);

  const selectedItem = useMemo(() => matches.find((m) => m.id === selectedItemId) || null, [matches, selectedItemId]);
  const selectedBundle = useMemo(() => bundles.find((b) => b.id === bundleId) || null, [bundles, bundleId]);

  const handleSubmit = async () => {
    if (!bundleId || !operationType || pcsCompleted <= 0) {
      toast({ title: "Select a bundle, operation, and piece count", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "button_ops",
        batchId,
        workerId,
        inventoryItemId: selectedItem?.id ?? null,
        payload: {
          bundle_id: bundleId,
          lot_no: selectedBundle?.lot_no ?? null,
          bundle_no: selectedBundle?.bundle_no ?? null,
          operation_type: operationType,
          pcs_completed: pcsCompleted,
        },
      });
      if (selectedItem) {
        await recordInventoryMovement(selectedItem.id, pcsCompleted, "out", workerId, `Used in ${operationType} entry for batch ${batchId}`);
      }
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
          <Label className="text-xs font-bold text-slate-700">Bundle</Label>
          {loadingBundles ? (
            <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : bundles.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
              No bundles found for this batch yet.
            </p>
          ) : (
            <Select value={bundleId} onValueChange={setBundleId}>
              <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                <SelectValue placeholder="Select bundle" />
              </SelectTrigger>
              <SelectContent>
                {bundles.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    Lot {b.lot_no} · Bundle #{b.bundle_no} ({b.pcs_count} pcs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">Operation</Label>
          <Select value={operationType} onValueChange={(v) => setOperationType(v as ButtonOperation)}>
            <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
              <SelectValue placeholder="Select operation" />
            </SelectTrigger>
            <SelectContent>
              {ALL_OPERATIONS.map((op) => (
                <SelectItem key={op} value={op}>{BUTTON_OPERATION_LABELS[op]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {accessoryType && (
          matches.length > 0 ? (
            <div>
              <Label className="text-xs font-bold text-slate-700">{accessoryType} — Matching Inventory</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {matches.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.sku}) — {m.quantity_on_hand} in stock
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              No {accessoryType.toLowerCase()} found in inventory yet. Staff will need to add it.
            </p>
          )
        )}

        <div>
          <Label className="text-xs font-bold text-slate-700">Pieces Completed</Label>
          <Input type="number" min="0" value={pcsCompleted}
            onChange={(e) => setPcsCompleted(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !bundleId || !operationType || pcsCompleted <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}
