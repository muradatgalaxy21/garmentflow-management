import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Validation schemas for sign-in and sign-up.
// Required string + email so TypeScript narrows to non-optional.
const signInSchema = z.object({
  email: z.string({ required_error: "Email is required" }).trim().email("Invalid email").max(255),
  password: z.string({ required_error: "Password is required" }).min(6, "Password must be at least 6 characters").max(72),
});

const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Name is required").max(100),
  company: z.string().trim().max(200).optional(),
});

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Redirect target after successful auth — fallback to /portal
  const from = (location.state as { from?: string } | null)?.from ?? "/portal";

  // If already logged in, skip the form
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate(from, { replace: true });
    });
  }, [from, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
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
    const parsed = signUpSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
      fullName: fd.get("fullName"),
      company: fd.get("company") || undefined,
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
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Account created",
      description: "You can now sign in. Email confirmation may be required depending on your project settings.",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/40 px-6 py-16">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-8 shadow-sm">
        <div className="text-center mb-6">
          <Link to="/" className="font-heading text-2xl font-bold text-foreground">
            En En Garments
          </Link>
          <p className="text-sm text-muted-foreground mt-1">Client & Admin Portal</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4 mt-4" noValidate>
              <div>
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" name="email" type="email" required maxLength={255} />
              </div>
              <div>
                <Label htmlFor="signin-password">Password</Label>
                <Input id="signin-password" name="password" type="password" required minLength={6} maxLength={72} />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4 mt-4" noValidate>
              <div>
                <Label htmlFor="signup-name">Full Name</Label>
                <Input id="signup-name" name="fullName" required maxLength={100} />
              </div>
              <div>
                <Label htmlFor="signup-company">Company (optional)</Label>
                <Input id="signup-company" name="company" maxLength={200} />
              </div>
              <div>
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" name="email" type="email" required maxLength={255} />
              </div>
              <div>
                <Label htmlFor="signup-password">Password</Label>
                <Input id="signup-password" name="password" type="password" required minLength={6} maxLength={72} />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Creating..." : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center mt-6">
          <Link to="/" className="hover:text-accent">Back to website</Link>
        </p>
      </div>
    </div>
  );
}
