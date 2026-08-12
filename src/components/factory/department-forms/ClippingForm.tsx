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

interface BundleOption {
  id: string;
  lot_no: string;
  bundle_no: number;
  pcs_count: number;
}

const GARMENT_TYPES = ["Shirt", "Trouser", "Jacket", "T-Shirt", "Other"] as const;

export default function ClippingForm({ batchId, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundleId, setBundleId] = useState("");
  const [garmentType, setGarmentType] = useState<string>("");
  const [pcsCompleted, setPcsCompleted] = useState<number>(0);
  const [ratePerPcs, setRatePerPcs] = useState<number | null>(null);
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

    supabase
      .from("department_cost_rates")
      .select("rate")
      .eq("department", "clipping")
      .eq("label", "default")
      .maybeSingle()
      .then(({ data }) => setRatePerPcs(data?.rate ?? null));
  }, [batchId]);

  const selectedBundle = useMemo(() => bundles.find((b) => b.id === bundleId) || null, [bundles, bundleId]);
  const totalPay = ratePerPcs !== null ? ratePerPcs * pcsCompleted : null;

  const handleSubmit = async () => {
    if (!bundleId || !garmentType || pcsCompleted <= 0) {
      toast({ title: "Select a bundle, garment type, and piece count", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "clipping",
        batchId,
        workerId,
        payload: {
          bundle_id: bundleId,
          lot_no: selectedBundle?.lot_no ?? null,
          bundle_no: selectedBundle?.bundle_no ?? null,
          garment_type: garmentType,
          pcs_completed: pcsCompleted,
          rate_per_pcs: ratePerPcs,
        },
        totalCost: totalPay,
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
          <Label className="text-xs font-bold text-slate-700">Garment Type</Label>
          <Select value={garmentType} onValueChange={setGarmentType}>
            <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
              <SelectValue placeholder="Select garment type" />
            </SelectTrigger>
            <SelectContent>
              {GARMENT_TYPES.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Rate / Piece:</span>
          <span className="text-sm font-bold text-slate-800">
            {ratePerPcs !== null ? `PKR ${ratePerPcs}` : "Set by Admin"}
          </span>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">Pieces Completed</Label>
          <Input type="number" min="0" value={pcsCompleted}
            onChange={(e) => setPcsCompleted(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>

        {totalPay !== null && (
          <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Pay:</span>
            <span className="text-sm font-bold text-slate-800">PKR {totalPay.toFixed(2)}</span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !bundleId || !garmentType || pcsCompleted <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}
