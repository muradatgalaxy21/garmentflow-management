import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Email/password users (admin, staff, managers, clients). Workers use phone OTP
// and never need this. Always shows the same message so it can't be used to
// check which emails have accounts.
export default function ForgotPasswordLink({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    setSent(true);
  };

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setSent(false); }} className={`text-xs underline underline-offset-2 ${className}`}>
        Forgot password?
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>We'll email you a link to set a new password.</DialogDescription>
          </DialogHeader>
          {sent ? (
            <p className="text-sm">If an account exists for <b>{email}</b>, a reset link is on its way. Check your inbox and spam folder.</p>
          ) : (
            <form onSubmit={send} className="space-y-3" id="forgot-form">
              <div>
                <Label htmlFor="forgot-email">Email</Label>
                <Input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </form>
          )}
          <DialogFooter>
            {sent ? (
              <Button onClick={() => setOpen(false)}>Close</Button>
            ) : (
              <Button type="submit" form="forgot-form" disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Send reset link"}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
