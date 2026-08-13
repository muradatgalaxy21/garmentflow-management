import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

// Gate between client signup and /client-portal (plan.md §7). A client
// account exists in auth.users right after signup but profiles.client_activated
// stays false until this code (emailed by admin after order confirmation)
// is redeemed via the redeem-client-code edge function.

const codeSchema = z.object({
  code: z.string().trim().min(4, "Enter your access code").max(20),
});

export default function ActivateAccountPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, clientActivated, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (clientActivated) navigate("/client-portal", { replace: true });
  }, [clientActivated, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = codeSchema.safeParse({ code: String(fd.get("code") ?? "") });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("redeem-client-code", {
      body: { code: parsed.data.code },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({
        title: "Activation failed",
        description: data?.error ?? error?.message ?? "Could not redeem this code",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Account activated", description: "Welcome to the client portal." });
    navigate("/client-portal", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F5F2EA]">
      <Header />

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-white border border-[#E4DDD0] rounded-lg p-8 shadow-sm text-center">
          <div className="flex justify-center mb-3">
            <img src="/logo-mark.svg" alt="En En Garments" className="h-10 w-auto" />
          </div>
          <h2 className="font-heading text-2xl font-bold text-[#1E293B]">Enter your access code</h2>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            {user?.email
              ? `We emailed an access code to activate the client portal for ${user.email}.`
              : "We emailed an access code to activate your client portal account."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 text-left" noValidate>
            <div>
              <Label htmlFor="code" className="text-xs font-semibold text-[#1E293B]">
                Access Code
              </Label>
              <Input
                id="code"
                name="code"
                autoComplete="one-time-code"
                required
                maxLength={20}
                placeholder="e.g. AB3K7Q2M"
                className="mt-1 bg-[#FAF8F3] border-[#E5DFD3] tracking-widest uppercase"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1B2A4A] text-white hover:bg-[#121B33] font-semibold py-2.5"
            >
              {loading ? "Activating…" : "Activate account"}
            </Button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            Don't have a code yet? Contact us once your order is confirmed.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-[#B88E28] hover:underline font-medium mt-3"
          >
            Sign out
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
