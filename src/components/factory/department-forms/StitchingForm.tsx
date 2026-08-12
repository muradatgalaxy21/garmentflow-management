import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { insertDepartmentEntry, SUB_DEPARTMENT_LABELS, type SubDepartment } from "@/lib/departmentEntries";
import type { DepartmentFormProps } from "./types";

interface BundleOption {
  id: string;
  lot_no: string;
  bundle_no: number;
  pcs_count: number;
}

const ALL_SUB_DEPARTMENTS: SubDepartment[] = ["singer", "overlock", "flatlock", "lock_stitch"];

export default function StitchingForm({ batchId, workerId, onSubmitted }: DepartmentFormProps) {
  const { toast } = useToast();
  const [bundles, setBundles] = useState<BundleOption[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [bundleId, setBundleId] = useState("");
  const [fromSubDept, setFromSubDept] = useState<SubDepartment | null>(null);
  const [toSubDept, setToSubDept] = useState<SubDepartment | "">("");
  const [pcs, setPcs] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("sub_department")
      .eq("id", workerId)
      .maybeSingle()
      .then(({ data }) => setFromSubDept((data?.sub_department as SubDepartment | null) ?? null));
  }, [workerId]);

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

  const selectedBundle = useMemo(() => bundles.find((b) => b.id === bundleId) || null, [bundles, bundleId]);
  const toOptions = ALL_SUB_DEPARTMENTS.filter((d) => d !== fromSubDept);

  const handleSubmit = async () => {
    if (!bundleId || !toSubDept || pcs <= 0) {
      toast({ title: "Select a bundle, destination, and piece count", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error: transferError } = await supabase.from("bundle_transfers").insert({
        bundle_id: bundleId,
        from_sub_dept: fromSubDept,
        to_sub_dept: toSubDept,
        pcs,
        worker_id: workerId,
      });
      if (transferError) throw transferError;

      await insertDepartmentEntry({
        department: "stitching",
        batchId,
        workerId,
        payload: {
          bundle_id: bundleId,
          lot_no: selectedBundle?.lot_no ?? null,
          bundle_no: selectedBundle?.bundle_no ?? null,
          from_sub_dept: fromSubDept,
          to_sub_dept: toSubDept,
          pcs,
        },
      });
      toast({ title: "Transfer Logged!" });
      onSubmitted();
    } catch (err: any) {
      toast({ title: "Error logging transfer", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!fromSubDept) {
    return (
      <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
        <CardContent className="p-4">
          <p className="text-sm text-slate-700">
            No sub-department assigned to your account. Contact your admin or manager.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl shadow-xs">
      <CardContent className="p-4 space-y-4">
        <div className="bg-white/80 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Your Sub-Dept:</span>
          <span className="text-sm font-bold text-slate-800">{SUB_DEPARTMENT_LABELS[fromSubDept]}</span>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">Bundle</Label>
          {loadingBundles ? (
            <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : bundles.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
              No bundles found for this batch yet — Lot Bundling must be completed first.
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
          <Label className="text-xs font-bold text-slate-700">Send To</Label>
          <Select value={toSubDept} onValueChange={(v) => setToSubDept(v as SubDepartment)}>
            <SelectTrigger className="bg-white border-slate-300 h-11 mt-1">
              <SelectValue placeholder="Select sub-department" />
            </SelectTrigger>
            <SelectContent>
              {toOptions.map((d) => (
                <SelectItem key={d} value={d}>{SUB_DEPARTMENT_LABELS[d]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs font-bold text-slate-700">Pieces</Label>
          <Input type="number" min="0" value={pcs}
            onChange={(e) => setPcs(Math.max(0, parseInt(e.target.value) || 0))}
            className="bg-white border-slate-300 text-center text-xl font-bold h-11 mt-1" />
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold bg-[#4675a8] hover:bg-[#38608b] text-white shadow-xs rounded-xl"
          onClick={handleSubmit}
          disabled={submitting || !bundleId || !toSubDept || pcs <= 0}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Log Transfer"}
        </Button>
      </CardContent>
    </Card>
  );
}
