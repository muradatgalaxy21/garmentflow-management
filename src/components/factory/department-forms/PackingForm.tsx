import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n/useTranslation";
import { insertDepartmentEntry, recordInventoryMovement } from "@/lib/departmentEntries";
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
  quantity_on_hand: number;
}

export default function PackingForm({ batchId, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundleId, setBundleId] = useState("");
  const [ratio, setRatio] = useState<Record<string, number> | null>(null);
  const [cartonsPacked, setCartonsPacked] = useState<number>(0);
  const [pcsPerCarton, setPcsPerCarton] = useState<number>(0);
  const [matches, setMatches] = useState<InventoryMatch[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ratePerPiece, setRatePerPiece] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("department_cost_rates")
      .select("rate")
      .eq("department", "packing")
      .eq("label", "default")
      .maybeSingle()
      .then(({ data }) => setRatePerPiece(data ? Number(data.rate) : null));
  }, []);

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
      .from("batch_pack_ratios")
      .select("ratio")
      .eq("batch_id", batchId)
      .maybeSingle()
      .then(({ data }) => {
        const r = data?.ratio as Record<string, number> | undefined;
        if (r) {
          setRatio(r);
          setPcsPerCarton(Object.values(r).reduce((sum, n) => sum + n, 0));
        }
      });

    supabase
      .from("inventory_items")
      .select("id, name, sku, quantity_on_hand")
      .eq("category", "packaging")
      .then(({ data }) => setMatches((data as InventoryMatch[]) ?? []));
  }, [batchId]);

  const selectedBundle = useMemo(() => bundles.find((b) => b.id === bundleId) || null, [bundles, bundleId]);
  const selectedItem = useMemo(() => matches.find((m) => m.id === selectedItemId) || null, [matches, selectedItemId]);
  const expectedPerCarton = ratio ? Object.values(ratio).reduce((sum, n) => sum + n, 0) : null;
  const ratioMismatch = expectedPerCarton !== null && pcsPerCarton > 0 && pcsPerCarton !== expectedPerCarton;
  const totalCost = ratePerPiece !== null ? ratePerPiece * cartonsPacked * pcsPerCarton : null;

  const handleSubmit = async () => {
    if (!bundleId || cartonsPacked <= 0 || pcsPerCarton <= 0) {
      toast({ title: t("factory.forms.packing.selectBundleCartonDetails"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await insertDepartmentEntry({
        department: "packing",
        batchId,
        workerId,
        inventoryItemId: selectedItem?.id ?? null,
        payload: {
          bundle_id: bundleId,
          lot_no: selectedBundle?.lot_no ?? null,
          bundle_no: selectedBundle?.bundle_no ?? null,
          cartons_packed: cartonsPacked,
          pcs_per_carton: pcsPerCarton,
          ratio_snapshot: ratio,
        },
        totalCost,
      });
      if (selectedItem) {
        await recordInventoryMovement(selectedItem.id, cartonsPacked, "out", workerId, `Used in packing entry for batch ${batchId}`);
      }
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
          <Label className="text-xs font-bold text-slate-700">{t("factory.common.bundle")}</Label>
          {loadingBundles ? (
            <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : bundles.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
              {t("factory.common.noBundles")}
            </p>
          ) : (
            <Select value={bundleId} onValueChange={setBundleId}>
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

        <div className="bg-white/80 p-3 rounded-lg border border-slate-200">
          <span className="text-xs font-medium text-slate-500">{t("factory.forms.packing.packRatio")}</span>
          <p className="text-sm font-bold text-slate-800 mt-1">
            {ratio ? Object.entries(ratio).map(([k, v]) => `${k}:${v}`).join("  ") : t("factory.forms.packing.notSetByAdmin")}
          </p>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.packing.piecesPerCarton")}</Label>
          <Input type="number" min="0" value={pcsPerCarton}
            onChange={(e) => setPcsPerCarton(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
          {ratioMismatch && (
            <p className="text-xs text-amber-700 mt-1">
              {t("factory.forms.packing.ratioMismatch").replace("{n}", String(expectedPerCarton))}
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">{t("factory.forms.packing.cartonsPacked")}</Label>
          <Input type="number" min="0" value={cartonsPacked}
            onChange={(e) => setCartonsPacked(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>

        {matches.length > 0 && (
          <div>
            <Label className="text-xs font-bold text-slate-700">{t("factory.forms.packing.packagingMaterial")}</Label>
            <Select value={selectedItemId} onValueChange={setSelectedItemId}>
              <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
                <SelectValue placeholder={t("factory.forms.packing.selectItemOptional")} />
              </SelectTrigger>
              <SelectContent>
                {matches.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.sku}) — {m.quantity_on_hand} {t("factory.common.inStock")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          disabled={submitting || !bundleId || cartonsPacked <= 0 || pcsPerCarton <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("factory.common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
