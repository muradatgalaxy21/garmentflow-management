import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
// Using onMouseDown / onPointerDown so it works on both desktop and mobile.
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
        // Switch between "text" and "password" so Chrome/Firefox detect it as a password field.
        type={revealed ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="pr-10"
      />
      {/* Hold-to-show button: reveals password while pressed, hides on release */}
      <button
        type="button"
        aria-label={revealed ? "Hide password" : "Show password"}
        // onMouseDown/onPointerDown covers both mouse and touch
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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Redirect target after successful auth — fallback to /portal
  const from = (location.state as { from?: string } | null)?.from ?? "/portal";

  // If already logged in, skip the auth form entirely
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate(from, { replace: true });
    });
  }, [from, navigate]);

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
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Welcome back" });
    navigate(from, { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const companyVal = String(fd.get("company") ?? "").trim();
    const parsed = signUpSchema.safeParse({
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      fullName: String(fd.get("fullName") ?? ""),
      company: companyVal || undefined,
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
        },
      },
    });
    setLoading(false);
    if (error) {
      let description = error.message;
      if ((error as { code?: string }).code === "weak_password" || /pwned|weak/i.test(error.message)) {
        description =
          "This password has appeared in a known data breach. Please choose a stronger, unique password (mix letters, numbers, symbols).";
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
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-8 shadow-sm">

        {/* Brand header — logo placeholder + company name */}
        <div className="text-center mb-8">
          {/* Logo placeholder: replace /logo.png in public/ when ready */}
          <div className="flex justify-center mb-4">
            <div
              className="w-20 h-20 rounded-full border-2 border-border bg-secondary/60 flex items-center justify-center text-muted-foreground text-xs font-medium"
              title="Replace with your logo at public/logo.png"
            >
              LOGO
            </div>
          </div>
          <Link to="/" className="font-heading text-2xl font-bold text-foreground hover:text-accent transition-colors">
            En En Garments
          </Link>
          <p className="text-sm text-muted-foreground mt-1">Client &amp; Admin Portal</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          {/* Sign In tab */}
          <TabsContent value="signin">
            {/*
              autocomplete="on" tells the browser this is a real login form.
              Each field uses the standard autocomplete tokens so Chrome offers saved credentials.
            */}
            <form onSubmit={handleSignIn} className="space-y-4 mt-4" noValidate autoComplete="on">
              <div>
                <Label htmlFor="signin-email">Email</Label>
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
                <Label htmlFor="signin-password">Password</Label>
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
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </TabsContent>

          {/* Sign Up tab */}
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4 mt-4" noValidate autoComplete="on">
              <div>
                <Label htmlFor="signup-name">Full Name</Label>
                <Input
                  id="signup-name"
                  name="fullName"
                  autoComplete="name"
                  required
                  maxLength={100}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="signup-company">Company (optional)</Label>
                <Input
                  id="signup-company"
                  name="company"
                  autoComplete="organization"
                  maxLength={200}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="signup-email">Email</Label>
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
                <Label htmlFor="signup-password">Password</Label>
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
                {loading ? "Creating..." : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center mt-6">
          <Link to="/" className="hover:text-accent transition-colors">Back to website</Link>
        </p>
      </div>
    </div>
  );
}
