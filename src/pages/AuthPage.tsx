import { useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { z } from "zod";
import { Eye, EyeOff, Briefcase, HardHat, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/i18n/useTranslation";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

type PortalRole = "client" | "worker";

// Land the user on the area their role actually uses instead of always /portal.
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

// A reusable password input that reveals itself only while the eye icon is held down.
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
        className="pr-10"
      />
      <button
        type="button"
        aria-label={revealed ? "Hide password" : "Show password"}
        onMouseDown={() => setReveal(true)}
        onMouseUp={() => setReveal(false)}
        onMouseLeave={() => setReveal(false)}
        onPointerDown={() => setReveal(true)}
        onPointerUp={() => setReveal(false)}
        onPointerLeave={() => setReveal(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  // Pre-select role if specified in query params (?role=worker or ?role=client)
  const initialRole = searchParams.get("role") === "worker" ? "worker" : searchParams.get("role") === "client" ? "client" : null;
  const [role, setRole] = useState<PortalRole | null>(initialRole);

  // Redirect target after successful auth — fallback to /portal
  const from = (location.state as { from?: string } | null)?.from ?? "/portal";

  // If already logged in, skip the auth form entirely
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
        emailRedirectTo: `${window.location.origin}/portal`,
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
    <div className="min-h-screen flex items-center justify-center bg-secondary/40 px-6 py-16">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-8 shadow-sm relative">

        {/* Top right language switcher */}
        <div className="absolute top-4 right-4">
          <LanguageSwitcher variant="ghost" size="sm" />
        </div>

        {/* Brand header */}
        <div className="text-center mb-8 pt-2">
          <div className="flex justify-center mb-4">
            <img src="/logo-mark.svg" alt="En En Garments" className="h-16 w-auto" />
          </div>
          <Link to="/" className="font-heading text-2xl font-bold text-foreground hover:text-accent transition-colors">
            En En Garments
          </Link>
          <p className="text-sm text-muted-foreground mt-1">{t("auth.title")}</p>
        </div>

        {!role ? (
          // Step 1: Pick portal type (Client vs Worker)
          <div className="space-y-3">
            <p className="text-sm text-center text-muted-foreground mb-4">{t("auth.continueAs")}</p>
            <button
              type="button"
              onClick={() => setRole("client")}
              className="w-full flex items-center gap-4 p-4 rounded-lg border border-border hover:border-accent hover:bg-secondary/40 transition-colors text-left"
            >
              <Briefcase className="w-6 h-6 text-accent shrink-0" />
              <div>
                <div className="font-medium text-foreground">{t("auth.client")}</div>
                <div className="text-xs text-muted-foreground">{t("auth.clientDesc")}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setRole("worker")}
              className="w-full flex items-center gap-4 p-4 rounded-lg border border-border hover:border-accent hover:bg-amber-500/10 border-amber-500/30 transition-colors text-left"
            >
              <HardHat className="w-6 h-6 text-amber-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">{t("auth.worker")}</div>
                <div className="text-xs text-muted-foreground">{t("auth.workerDesc")}</div>
              </div>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setRole(null)}
                className="text-xs text-muted-foreground hover:text-accent transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t("auth.changeRole")} ({role === "client" ? t("auth.client") : t("auth.worker")})
              </button>
            </div>

            {role === "worker" && (
              <div className="mb-4 p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
                {t("auth.workerNotice")}
              </div>
            )}

            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
              </TabsList>

              {/* Sign In tab */}
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 mt-4" noValidate autoComplete="on">
                  <div>
                    <Label htmlFor="signin-email">{t("auth.email")}</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={255}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signin-password">{t("auth.password")}</Label>
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
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? t("factory.common.loading") : t("auth.submitSignIn")}
                  </Button>
                </form>
              </TabsContent>

              {/* Sign Up tab */}
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 mt-4" noValidate autoComplete="on">
                  <div>
                    <Label htmlFor="signup-name">{t("auth.fullName")}</Label>
                    <Input
                      id="signup-name"
                      name="fullName"
                      autoComplete="name"
                      required
                      maxLength={100}
                      className="mt-1"
                    />
                  </div>
                  {role === "client" && (
                    <div>
                      <Label htmlFor="signup-company">{t("auth.company")}</Label>
                      <Input
                        id="signup-company"
                        name="company"
                        autoComplete="organization"
                        maxLength={200}
                        className="mt-1"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="signup-email">{t("auth.email")}</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={255}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="signup-password">{t("auth.password")}</Label>
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
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? t("factory.common.loading") : t("auth.submitSignUp")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          <Link to="/" className="hover:text-accent transition-colors">{t("auth.backToSite")}</Link>
        </p>
      </div>
    </div>
  );
}
