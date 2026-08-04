import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Keyboard, Loader2, AlertTriangle, PlayCircle, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function QrScannerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "end";
  const { user } = useAuth();
  const { toast } = useToast();

  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [insecureContext, setInsecureContext] = useState(false);
  const [startedBatchStyle, setStartedBatchStyle] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);

  const lookupBatch = useCallback(
    async (qrHash: string) => {
      if (!qrHash.trim() || !user) return;
      setLookingUp(true);
      try {
        const { data: batch, error } = await supabase
          .from("production_batches")
          .select("id, style_number")
          .eq("qr_code_hash", qrHash.trim())
          .single();

        if (error || !batch) {
          toast({ title: "QR Code Nahi Mila / Invalid Batch QR", variant: "destructive" });
          setLookingUp(false);
          return;
        }

        // Fetch User profile & system roles
        const [{ data: userProfile }, { data: userRoles }] = await Promise.all([
          supabase.from("profiles").select("skills").eq("id", user.id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", user.id),
        ]);

        const isManagerOrAdmin = userRoles?.some((r) => ["admin", "manager", "staff"].includes(r.role));
        const workerSkills = userProfile?.skills || [];

        if (mode === "start") {
          // Fetch default initial phase (e.g. Cutting or sequence_order 1)
          const { data: firstPhase } = await supabase
            .from("production_phases")
            .select("id, name, sequence_order")
            .order("sequence_order", { ascending: true })
            .limit(1)
            .single();

          if (firstPhase) {
            // 1. Worker Role Check for Cutting / Initial Phase
            if (!isManagerOrAdmin && workerSkills.length > 0) {
              const matchesRole = workerSkills.some(
                (s) => s.toLowerCase().includes(firstPhase.name.toLowerCase()) || firstPhase.name.toLowerCase().includes(s.toLowerCase())
              );
              if (!matchesRole) {
                toast({
                  title: "❌ Ghallat Step Scan!",
                  description: `Aap ka role "${workerSkills.join(", ")}" hai. Aap ${firstPhase.name} scan nahi kar sakte.`,
                  variant: "destructive",
                });
                setLookingUp(false);
                return;
              }
            }

            // Create active session in batch_worker_sessions
            const { error: sErr } = await supabase
              .from("batch_worker_sessions")
              .insert({
                batch_id: batch.id,
                phase_id: firstPhase.id,
                worker_id: user.id,
                status: "active",
                start_time: new Date().toISOString(),
              });

            if (sErr) {
              toast({ title: "Session Shuru Nahi Ho Saka", description: sErr.message, variant: "destructive" });
              setLookingUp(false);
              return;
            }
          }
          setStartedBatchStyle(batch.style_number);
          setLookingUp(false);
        } else {
          // Mode === 'end' -> Navigate to batch entry page to close session & submit count
          navigate(`/factory/batch/${batch.id}`);
        }
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        setLookingUp(false);
      }
    },
    [navigate, toast, user, mode]
  );

  useEffect(() => {
    if (!window.isSecureContext) {
      setInsecureContext(true);
      return;
    }

    let scannerInstance: { stop: () => Promise<void> } | null = null;
    let isRunning = false;

    const safeStop = () => {
      if (!isRunning || !scannerInstance) return;
      isRunning = false;
      try {
        scannerInstance.stop().catch(() => {});
      } catch {
        // already stopped
      }
    };

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
            isRunning = false;
            try {
              scanner.stop().catch(() => {});
            } catch {
              // already stopped
            }
            lookupBatch(decodedText);
          },
          () => {}
        );
        isRunning = true;
      } catch {
        setCameraError(true);
        setScanning(false);
      }
    };
    initScanner();
    return () => { safeStop(); };
  }, [lookupBatch]);

  if (startedBatchStyle) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5 max-w-lg mx-auto">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border-2 border-emerald-500 animate-pulse">
          <PlayCircle className="w-12 h-12" />
        </div>
        <h1 className="text-3xl font-black text-white">🟢 BATCH SHURU HO GAYA!</h1>
        <p className="text-lg font-bold text-emerald-300">
          Style: {startedBatchStyle}
        </p>
        <p className="text-sm text-slate-300">
          Aap ka work session start ho chuka hai. Kaam mukammal karne ke baad "Batch Khatam Scan" dabayein.
        </p>
        <Button
          size="lg"
          className="w-full h-16 text-xl font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-2xl rounded-2xl mt-4"
          onClick={() => navigate("/factory")}
        >
          Home Par Wapas Jayein
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-10">
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 text-center">
        <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
          {mode === "start" ? "🟢 STEP 1: START BATCH WORK SCAN" : "🔴 STEP 2: END BATCH WORK SCAN"}
        </span>
        <h1 className="text-2xl font-black text-white mt-1">
          {mode === "start" ? "Batch QR Code Scan Karein" : "Kaam Finish QR Code Scan Karein"}
        </h1>
      </div>

      <Card className="bg-slate-800 border-slate-700 overflow-hidden shadow-2xl">
        <CardContent className="p-0">
          {insecureContext ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
              <p className="text-sm text-slate-300">{t("factory.scanner.insecureContext")}</p>
            </div>
          ) : cameraError ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
              <p className="text-sm text-slate-300">{t("factory.scanner.cameraError")}</p>
            </div>
          ) : (
            <div className="relative">
              <div ref={scannerRef} className="w-full min-h-[300px] bg-black" />
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-400 font-bold">
            <Keyboard className="w-5 h-5 text-emerald-400" />
            <p className="text-sm">QR Code Text Ya Manual Code Enter Karein:</p>
          </div>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. BATCH-QR-HASH..."
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 h-12 text-base font-bold"
              onKeyDown={(e) => { if (e.key === "Enter") lookupBatch(manualCode); }}
            />
            <Button
              onClick={() => lookupBatch(manualCode)}
              disabled={lookingUp || !manualCode.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 px-6"
            >
              {lookingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

