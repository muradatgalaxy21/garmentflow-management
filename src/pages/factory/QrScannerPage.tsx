import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Keyboard, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function QrScannerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);

  const lookupBatch = useCallback(
    async (qrHash: string) => {
      if (!qrHash.trim()) return;
      setLookingUp(true);
      try {
        const { data, error } = await supabase
          .from("production_batches")
          .select("id")
          .eq("qr_code_hash", qrHash.trim())
          .single();

        if (error || !data) {
          toast({ title: t("factory.scanner.notFound"), variant: "destructive" });
          setLookingUp(false);
          return;
        }
        navigate(`/factory/batch/${data.id}`);
      } catch {
        toast({ title: t("factory.common.error"), variant: "destructive" });
        setLookingUp(false);
      }
    },
    [navigate, toast, t]
  );

  useEffect(() => {
    let scannerInstance: { stop: () => Promise<void> } | null = null;

    const initScanner = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!scannerRef.current) return;
        const scannerId = "qr-scanner-container";
        scannerRef.current.id = scannerId;
        const scanner = new Html5Qrcode(scannerId);
        scannerInstance = scanner;
        setScanning(true);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            scanner.stop().catch(() => {});
            lookupBatch(decodedText);
          },
          () => {}
        );
      } catch {
        setCameraError(true);
        setScanning(false);
      }
    };
    initScanner();
    return () => { scannerInstance?.stop().catch(() => {}); };
  }, [lookupBatch]);

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-white">{t("factory.scanner.title")}</h1>
      <Card className="bg-slate-800 border-slate-700 overflow-hidden">
        <CardContent className="p-0">
          {cameraError ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
              <p className="text-sm text-slate-300">{t("factory.scanner.cameraError")}</p>
            </div>
          ) : (
            <div className="relative">
              <div ref={scannerRef} className="w-full min-h-[300px] bg-black" />
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500 text-center">{t("factory.scanner.instruction")}</p>
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Keyboard className="w-4 h-4" />
            <p className="text-sm">{t("factory.scanner.manualEntry")}</p>
          </div>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder={t("factory.scanner.placeholder")}
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              onKeyDown={(e) => { if (e.key === "Enter") lookupBatch(manualCode); }}
            />
            <Button
              onClick={() => lookupBatch(manualCode)}
              disabled={lookingUp || !manualCode.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap"
            >
              {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : t("factory.scanner.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
