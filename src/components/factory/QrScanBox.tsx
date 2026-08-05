import { useEffect, useRef, useState } from "react";
import { Keyboard, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QrScanBoxProps {
  onDecoded: (code: string) => void;
  busy?: boolean;
}

/**
 * Camera + manual-entry QR scan UI shared across factory-portal scan flows.
 * Extracted from QrScannerPage so the camera lifecycle (and its
 * insecure-context / double-stop-crash fixes) only lives in one place.
 */
export default function QrScanBox({ onDecoded, busy }: QrScanBoxProps) {
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [cameraError, setCameraError] = useState(false);
  const [insecureContext, setInsecureContext] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

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
            onDecodedRef.current(decodedText);
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
  }, []);

  return (
    <div className="space-y-4">
      <Card className="bg-[#e9ecef]/60 border border-slate-300/70 overflow-hidden rounded-xl">
        <CardContent className="p-0">
          {insecureContext ? (
            <div className="flex items-center gap-3 p-4 bg-[#e9ecef]/60 text-slate-700 text-xs">
              <AlertTriangle className="w-5 h-5 text-slate-500 shrink-0" />
              <span>Camera scanning needs a secure (https) connection. Use manual entry below.</span>
            </div>
          ) : cameraError ? (
            <div className="flex items-center gap-3 p-4 bg-[#e9ecef]/90 text-slate-700 text-xs font-normal border-l-4 border-slate-400">
              <AlertTriangle className="w-5 h-5 text-slate-500 shrink-0" />
              <span>Camera access denied. Please use manual entry.</span>
            </div>
          ) : (
            <div className="relative">
              <div ref={scannerRef} className="w-full min-h-[250px] bg-slate-900 rounded-xl overflow-hidden" />
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#e9ecef]/60 border border-slate-300/70 rounded-xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-600 text-xs font-medium">
            <Keyboard className="w-4 h-4 text-slate-500" />
            <p>Enter QR code text or manual code</p>
          </div>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. BATCH-QR-HASH..."
              className="bg-[#e9ecef]/90 border-slate-300 text-slate-900 placeholder:text-slate-400 h-11 text-xs font-medium focus-visible:ring-blue-500 rounded-lg"
              onKeyDown={(e) => { if (e.key === "Enter") onDecoded(manualCode); }}
            />
            <Button
              onClick={() => onDecoded(manualCode)}
              disabled={busy || !manualCode.trim()}
              className="bg-[#4675a8] hover:bg-[#38608b] text-white font-semibold h-11 px-5 rounded-lg text-xs shrink-0"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
