import { useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { normalizePkPhone } from "@/lib/phone";
import { useTranslation } from "@/i18n/useTranslation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

type PortalRole = "client" | "worker";

// Land the user on the area their role actually uses instead of always /client-portal.
async function resolveRoleTarget(userId: string, fallback: string): Promise<string> {
  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const userRoles = (roleRows ?? []).map((r) => r.role);
  if (userRoles.includes("worker")) return "/factory";
  if (userRoles.includes("admin") || userRoles.includes("staff")) return "/admin";
  return fallback;
}

// Validation schemas for sign-in and sign-up forms.
const signInSchema = z.object({
  email: z.string({ required_error: "Email is required" }).trim().email("Invalid email").max(255),
  password: z.string({ required_error: "Password is required" }).min(6, "Password must be at least 6 characters").max(72),
});

const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Name is required").max(100),
  company: z.string().trim().max(200).optional(),
});

// Password input with eye toggle
function PasswordField({
  id,
  name,
  autoComplete,
  required,
  minLength,
  maxLength,
}: {
  id: string;
  name: string;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const [revealed, setReveal] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={revealed ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="pr-10 bg-[#FAF8F3] border-[#E5DFD3]"
      />
      <button
        type="button"
        aria-label={revealed ? "Hide password" : "Show password"}
        onMouseDown={() => setReveal(true)}
        onMouseUp={() => setReveal(false)}
        onMouseLeave={() => setReveal(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        tabIndex={-1}
      >
        {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

const RESEND_SECONDS = 60;

// Worker sign-in / sign-up by phone number + SMS OTP (no password).
function WorkerPhoneAuth({ mode, onSignedIn }: { mode: "signin" | "signup"; onSignedIn: (userId: string) => void }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const sendCode = async (phone: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options:
        mode === "signup"
          ? { shouldCreateUser: true, data: { full_name: fullName.trim(), requested_role: "worker" } }
          : { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      const description = /signups not allowed|user not found/i.test(error.message)
        ? "No account found for this number. Use Sign Up first."
        : error.message;
      toast({ title: "Could not send code", description, variant: "destructive" });
      return;
    }
    setSentTo(phone);
    setCode("");
    setCooldown(RESEND_SECONDS);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && fullName.trim().length < 2) {
      toast({ title: "Invalid input", description: "Name is required", variant: "destructive" });
      return;
    }
    const phone = normalizePkPhone(phoneInput);
    if (!phone) {
      toast({ title: "Invalid input", description: "Enter a valid Pakistani mobile number (03XXXXXXXXX)", variant: "destructive" });
      return;
    }
    sendCode(phone);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentTo || !/^\d{6}$/.test(code)) {
      toast({ title: "Invalid input", description: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code, type: "sms" });
    setLoading(false);
    if (error || !data.user) {
      toast({ title: "Verification failed", description: error?.message ?? "Invalid code", variant: "destructive" });
      return;
    }
    try { localStorage.setItem("worker_last_active", String(Date.now())); } catch { /* storage blocked */ }
    onSignedIn(data.user.id);
  };

  const inputCls = "mt-1 bg-[#FAF8F3] border-[#E5DFD3]";
  const btnCls = "w-full bg-[#1B2A4A] text-white hover:bg-[#121B33] font-semibold py-2.5";

  if (sentTo) {
    return (
      <form onSubmit={handleVerify} className="space-y-4 text-left" noValidate>
        <p className="text-xs text-gray-500">{sentTo}</p>
        <div>
          <Label htmlFor={`${mode}-otp`} className="text-xs font-semibold text-[#1E293B]">{t("auth.otp")}</Label>
          <Input
            id={`${mode}-otp`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputCls} tracking-[0.5em] text-center text-lg`}
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading} className={btnCls}>
          {loading ? t("factory.common.loading") : t("auth.verifyCode")}
        </Button>
        <div className="flex justify-between text-xs">
          <button type="button" onClick={() => setSentTo(null)} className="text-[#B88E28] hover:underline">
            {t("auth.changeNumber")}
          </button>
          <button
            type="button"
            disabled={cooldown > 0 || loading}
            onClick={() => sendCode(sentTo)}
            className="text-[#B88E28] hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            {cooldown > 0 ? `${t("auth.resendIn")} ${cooldown}s` : t("auth.resend")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSend} className="space-y-4 text-left" noValidate>
      {mode === "signup" && (
        <div>
          <Label htmlFor="worker-signup-name" className="text-xs font-semibold text-[#1E293B]">{t("auth.fullName")}</Label>
          <Input
            id="worker-signup-name"
            autoComplete="name"
            maxLength={100}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
          />
        </div>
      )}
      <div>
        <Label htmlFor={`${mode}-phone`} className="text-xs font-semibold text-[#1E293B]">{t("auth.phone")}</Label>
        <Input
          id={`${mode}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t("auth.phoneHint")}
          maxLength={16}
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          className={inputCls}
        />
      </div>
      <Button type="submit" disabled={loading} className={btnCls}>
        {loading ? t("factory.common.loading") : t("auth.sendCode")}
      </Button>
    </form>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const initialRole = searchParams.get("role") === "worker" ? "worker" : searchParams.get("role") === "client" ? "client" : null;
  const [role, setRole] = useState<PortalRole | null>(initialRole);

  const from = (location.state as { from?: string } | null)?.from ?? "/client-portal";

  useEffect(() => {
    const cameFromProtectedRoute = Boolean((location.state as { from?: string } | null)?.from);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      let target = from;
      if (!cameFromProtectedRoute) {
        target = await resolveRoleTarget(session.user.id, from);
      }
      navigate(target, { replace: true });
    });
  }, [from, navigate, location.state]);

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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      setLoading(false);
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      return;
    }

    const cameFromProtectedRoute = Boolean((location.state as { from?: string } | null)?.from);
    let target = from;
    if (!cameFromProtectedRoute && data.user) {
      target = await resolveRoleTarget(data.user.id, from);
    }

    setLoading(false);
    toast({ title: "Welcome back" });
    navigate(target, { replace: true });
  };

  const handleWorkerSignedIn = async (userId: string) => {
    const cameFromProtectedRoute = Boolean((location.state as { from?: string } | null)?.from);
    const target = cameFromProtectedRoute ? from : await resolveRoleTarget(userId, "/factory");
    toast({ title: "Welcome" });
    navigate(target, { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!role) return;
    const fd = new FormData(e.currentTarget);
    const companyVal = String(fd.get("company") ?? "").trim();
    const parsed = signUpSchema.safeParse({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      fullName: String(fd.get("fullName") ?? ""),
      company: role === "client" ? companyVal || undefined : undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/client-portal`,
        data: {
          full_name: parsed.data.fullName,
          company: parsed.data.company,
          requested_role: role,
        },
      },
    });
    setLoading(false);
    if (error) {
      let description = error.message;
      if ((error as { code?: string }).code === "weak_password" || /pwned|weak/i.test(error.message)) {
        description =
          "This password has appeared in a known data breach. Please choose a stronger, unique password.";
      } else if (/already registered|already exists/i.test(error.message)) {
        description = "An account with this email already exists. Try signing in instead.";
      }
      toast({ title: "Sign up failed", description, variant: "destructive" });
      return;
    }
    toast({
      title: "Account created",
      description: "Please check your email to confirm your account, then sign in.",
    });
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F5F2EA]">
      <Header />

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-white border border-[#E4DDD0] rounded-lg p-8 shadow-sm text-center relative">
          {/* Logo mark */}
          <div className="flex justify-center mb-3">
            <img src="/logo-mark.svg" alt="En En Garments" className="h-10 w-auto" />
          </div>

          <h2 className="font-heading text-2xl font-bold text-[#1E293B]">En En Garments</h2>
          <p className="text-sm text-gray-500 mt-1 mb-6">Employees & Client Portal</p>

          {!role ? (
            // Step 1: Pick portal type (Client vs Worker)
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-3">Continue as:</p>
              <button
                type="button"
                onClick={() => setRole("client")}
                className="w-full p-4 rounded-lg border border-[#E4DDD0] hover:border-[#B88E28] bg-[#FAF8F3] hover:bg-white text-left transition-colors cursor-pointer"
              >
                <div className="font-bold text-[#1E293B] text-base">Client</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Place orders, track production, manage your account
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRole("worker")}
                className="w-full p-4 rounded-lg border border-[#E4DDD0] hover:border-[#B88E28] bg-[#FAF8F3] hover:bg-white text-left transition-colors cursor-pointer"
              >
                <div className="font-bold text-[#1E293B] text-base">Factory Employee / Worker</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Factory floor sign-in for production logging & piece counting
                </div>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => setRole(null)}
                  className="text-xs text-[#B88E28] hover:underline flex items-center gap-1 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Change role ({role === "client" ? "Client" : "Worker"})
                </button>
              </div>

              {role === "worker" && (
                <div className="mb-4 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs text-left">
                  {t("auth.workerNotice")}
                </div>
              )}

              {role === "worker" ? (
                <Tabs defaultValue="signin" className="w-full">
                  <TabsList className="grid grid-cols-2 w-full mb-4">
                    <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                    <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="signin">
                    <WorkerPhoneAuth mode="signin" onSignedIn={handleWorkerSignedIn} />
                  </TabsContent>
                  <TabsContent value="signup">
                    <WorkerPhoneAuth mode="signup" onSignedIn={handleWorkerSignedIn} />
                  </TabsContent>
                </Tabs>
              ) : (
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid grid-cols-2 w-full mb-4">
                  <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                  <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
                </TabsList>

                {/* Sign In tab */}
                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4 text-left" noValidate autoComplete="on">
                    <div>
                      <Label htmlFor="signin-email" className="text-xs font-semibold text-[#1E293B]">
                        {t("auth.email")}
                      </Label>
                      <Input
                        id="signin-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={255}
                        className="mt-1 bg-[#FAF8F3] border-[#E5DFD3]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="signin-password" className="text-xs font-semibold text-[#1E293B]">
                        {t("auth.password")}
                      </Label>
                      <div className="mt-1">
                        <PasswordField
                          id="signin-password"
                          name="password"
                          autoComplete="current-password"
                          required
                          minLength={6}
                          maxLength={72}
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#1B2A4A] text-white hover:bg-[#121B33] font-semibold py-2.5"
                    >
                      {loading ? t("factory.common.loading") : t("auth.submitSignIn")}
                    </Button>
                  </form>
                </TabsContent>

                {/* Sign Up tab */}
                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4 text-left" noValidate autoComplete="on">
                    <div>
                      <Label htmlFor="signup-name" className="text-xs font-semibold text-[#1E293B]">
                        {t("auth.fullName")}
                      </Label>
                      <Input
                        id="signup-name"
                        name="fullName"
                        autoComplete="name"
                        required
                        maxLength={100}
                        className="mt-1 bg-[#FAF8F3] border-[#E5DFD3]"
                      />
                    </div>
                    {role === "client" && (
                      <div>
                        <Label htmlFor="signup-company" className="text-xs font-semibold text-[#1E293B]">
                          {t("auth.company")}
                        </Label>
                        <Input
                          id="signup-company"
                          name="company"
                          autoComplete="organization"
                          maxLength={200}
                          className="mt-1 bg-[#FAF8F3] border-[#E5DFD3]"
                        />
                      </div>
                    )}
                    <div>
                      <Label htmlFor="signup-email" className="text-xs font-semibold text-[#1E293B]">
                        {t("auth.email")}
                      </Label>
                      <Input
                        id="signup-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={255}
                        className="mt-1 bg-[#FAF8F3] border-[#E5DFD3]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="signup-password" className="text-xs font-semibold text-[#1E293B]">
                        {t("auth.password")}
                      </Label>
                      <div className="mt-1">
                        <PasswordField
                          id="signup-password"
                          name="password"
                          autoComplete="new-password"
                          required
                          minLength={6}
                          maxLength={72}
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#1B2A4A] text-white hover:bg-[#121B33] font-semibold py-2.5"
                    >
                      {loading ? t("factory.common.loading") : t("auth.submitSignUp")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
              )}
            </>
          )}

          <p className="text-xs text-gray-500 text-center mt-6">
            <Link to="/" className="text-[#B88E28] hover:underline font-medium">
              Back to main website
            </Link>
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}

