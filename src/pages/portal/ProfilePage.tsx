import { useEffect, useState } from "react";
import { Loader2, User } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(100),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
});

interface Profile {
  full_name: string | null;
  company: string | null;
  phone: string | null;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile>({ full_name: "", company: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Derive initials from full_name or email for the avatar placeholder
  const initials = profile.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, company, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as Profile);
        setLoading(false);
      });
  }, [user]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const parsed = profileSchema.safeParse({
      full_name: String(fd.get("full_name") ?? ""),
      company: String(fd.get("company") ?? "") || undefined,
      phone: String(fd.get("phone") ?? "") || undefined,
    });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        company: parsed.data.company ?? null,
        phone: parsed.data.phone ?? null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    // Update local state so initials refresh instantly
    setProfile((prev) => ({ ...prev, full_name: parsed.data.full_name }));
    toast({ title: "Profile updated", description: "Your changes have been saved." });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">My Profile</h1>
        <p className="text-base text-muted-foreground mt-1">Manage your account details and contact information.</p>
      </div>

      {/* Avatar / identity section */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Account Identity</CardTitle>
          <CardDescription>Your display name and avatar used across the portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            {/* Avatar placeholder: shows initials until image upload is implemented */}
            <div
              className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold font-heading shadow-inner shrink-0"
              title="Profile avatar placeholder — image upload coming soon"
            >
              {initials}
            </div>
            <div>
              <p className="font-semibold text-foreground text-base">{profile.full_name || "—"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1">
                <User className="w-3 h-3" /> Profile image upload — coming soon
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile edit form */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Contact Details</CardTitle>
          <CardDescription>Update your name, company, and phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            {/* Email is read-only — managed by Supabase Auth */}
            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                value={user?.email ?? ""}
                disabled
                className="mt-1.5 bg-muted/50 cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">Email is managed by your account authentication.</p>
            </div>

            <Separator />

            <div>
              <Label htmlFor="full_name">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={profile.full_name ?? ""}
                required
                maxLength={100}
                autoComplete="name"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="company">Company Name</Label>
              <Input
                id="company"
                name="company"
                defaultValue={profile.company ?? ""}
                maxLength={200}
                autoComplete="organization"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile.phone ?? ""}
                maxLength={30}
                autoComplete="tel"
                className="mt-1.5"
              />
            </div>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                "Save Changes"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
