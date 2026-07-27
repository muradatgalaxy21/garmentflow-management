import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Hidden admin sign-in / signup page. Never linked from the public site —
// reached only by clicking the site logo 4 times. Signup requires a
// one-time code that is emailed to a fixed, hardcoded approval inbox,
// never to the person signing up.

const signInSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

const requestSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

export default function AdminAuthPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Signup is two steps: request a code, then submit it to finish.
  const [step, setStep] = useState<"request" | "verify">("request");
  const [pending, setPending] = useState<{ email: string; password: string; fullName: string } | null>(null);
  const [code, setCode] = useState("");

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) {
      setLoading(false);
      toast({ title: "Sign in failed", description: error?.message ?? "Unknown error", variant: "destructive" });
      return;
    }

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("admin")) {
      await supabase.auth.signOut();
      setLoading(false);
      toast({ title: "Not authorized", description: "This account does not have admin access.", variant: "destructive" });
      return;
    }

    setLoading(false);
    toast({ title: "Welcome back, admin" });
    navigate("/admin", { replace: true });
  };

  const handleRequestCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = requestSchema.safeParse({
      fullName: String(fd.get("fullName") ?? ""),
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.functions.invoke("admin-request-code", {
      body: { email: parsed.data.email, fullName: parsed.data.fullName },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
      return;
    }
    setPending(parsed.data);
    setStep("verify");
    toast({ title: "Code requested", description: "An access code was sent for approval. Enter it below once you have it." });
  };

  const handleVerifyCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pending) return;
    if (code.trim().length !== 6) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.functions.invoke("admin-verify-signup", {
      body: { ...pending, code: code.trim() },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Admin account created", description: "You can now sign in." });
    setStep("request");
    setPending(null);
    setCode("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-6 py-16">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg p-8 shadow-xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full border-2 border-zinc-700 bg-zinc-800 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
            </div>
          </div>
          <h1 className="font-heading text-xl font-bold text-zinc-100">Restricted Access</h1>
          <p className="text-xs text-zinc-500 mt-1">Administrator sign-in / provisioning</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full bg-zinc-800">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Request Access</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4 mt-4" noValidate>
              <div>
                <Label htmlFor="admin-email" className="text-zinc-300">Email</Label>
                <Input id="admin-email" name="email" type="email" required className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100" />
              </div>
              <div>
                <Label htmlFor="admin-password" className="text-zinc-300">Password</Label>
                <Input id="admin-password" name="password" type="password" required minLength={6} className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100" />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            {step === "request" ? (
              <form onSubmit={handleRequestCode} className="space-y-4 mt-4" noValidate>
                <p className="text-xs text-zinc-500">
                  A one-time access code will be sent for approval. You will need that code to finish creating this account.
                </p>
                <div>
                  <Label htmlFor="req-name" className="text-zinc-300">Full Name</Label>
                  <Input id="req-name" name="fullName" required maxLength={100} className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100" />
                </div>
                <div>
                  <Label htmlFor="req-email" className="text-zinc-300">Email</Label>
                  <Input id="req-email" name="email" type="email" required maxLength={255} className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100" />
                </div>
                <div>
                  <Label htmlFor="req-password" className="text-zinc-300">Password</Label>
                  <Input id="req-password" name="password" type="password" required minLength={6} maxLength={72} className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100" />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Requesting..." : "Request Access Code"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4 mt-4" noValidate>
                <p className="text-xs text-zinc-500">
                  Enter the 6-digit code sent for approval to finish creating the account for <strong>{pending?.email}</strong>.
                </p>
                <div>
                  <Label htmlFor="verify-code" className="text-zinc-300">Access Code</Label>
                  <Input
                    id="verify-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    required
                    className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100 tracking-[0.3em] text-center text-lg"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Verifying..." : "Verify & Create Admin Account"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep("request"); setPending(null); setCode(""); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full text-center"
                >
                  ← Start over
                </button>
              </form>
            )}
          </TabsContent>
        </Tabs>

        <p className="text-[11px] text-zinc-600 text-center mt-6">
          <Link to="/" className="hover:text-zinc-400 transition-colors">Back to website</Link>
        </p>
      </div>
    </div>
  );
}
