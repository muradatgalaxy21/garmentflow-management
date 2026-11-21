import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Landing page for the emailed reset link. Supabase signs the user in with a
// recovery session from the link; we only let them set a new password here.
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Link already processed (e.g. page refresh): a session means we can proceed.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setReady((r) => r ?? !!data.session);
    }, 1500);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast({ title: "Use at least 8 characters", variant: "destructive" });
    if (pw !== pw2) return toast({ title: "Passwords don't match", variant: "destructive" });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast({ title: "Could not update password", description: error.message, variant: "destructive" });
    await supabase.auth.signOut();
    toast({ title: "Password updated", description: "Sign in with your new password." });
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-heading text-xl font-bold mb-1">Set a new password</h1>
        {ready === null && <Loader2 className="w-5 h-5 animate-spin text-accent mt-4" />}
        {ready === false && (
          <p className="text-sm text-muted-foreground mt-2">
            This reset link is invalid or has expired. Use "Forgot password?" on the sign-in page to get a new one.
          </p>
        )}
        {ready && (
          <form onSubmit={save} className="space-y-3 mt-4">
            <div>
              <Label htmlFor="new-pw">New password</Label>
              <Input id="new-pw" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="new-pw2">Repeat new password</Label>
              <Input id="new-pw2" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save new password"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
