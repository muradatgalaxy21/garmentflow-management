import { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import QrScanBox from "@/components/factory/QrScanBox";

export default function QrScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "end";
  const { user } = useAuth();
  const { toast } = useToast();

  const [lookingUp, setLookingUp] = useState(false);
  const [startedBatchStyle, setStartedBatchStyle] = useState<string | null>(null);

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

  if (startedBatchStyle) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-300">
          <PlayCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Batch Started!</h1>
        <p className="text-base font-semibold text-blue-700">
          Style: {startedBatchStyle}
        </p>
        <p className="text-xs text-slate-600">
          Your work session has started. Scan the Finish QR code when your batch is completed.
        </p>
        <Button
          size="lg"
          className="w-full h-12 text-base font-semibold bg-[#4675a8] hover:bg-[#38608b] text-white rounded-xl shadow-xs mt-2"
          onClick={() => navigate("/factory")}
        >
          Return to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* Header Banner matching Screenshot 2 */}
      <div className="bg-[#e9ecef]/80 border border-slate-200/80 rounded-xl p-5 text-center shadow-xs">
        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium text-slate-600 border border-slate-300 bg-white/70">
          {mode === "start" ? "Step 1: Start Batch Work Scan" : "Step 2: End Batch Work Scan"}
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-3 font-sans">
          {mode === "start" ? "Scan Start QR Code" : "Scan Finish QR Code"}
        </h1>
      </div>

      <QrScanBox onDecoded={lookupBatch} busy={lookingUp} />
    </div>
  );
}


