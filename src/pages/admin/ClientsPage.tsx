import { useEffect, useState } from "react";
import { Loader2, Shield, ShieldCheck, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type AppRole = "admin" | "staff" | "client";

interface Profile {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
}

interface RoleRow {
  user_id: string;
  role: AppRole;
}

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [pRes, rRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, company, phone"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (!pRes.error) setProfiles((pRes.data ?? []) as Profile[]);
    if (!rRes.error) setRoles((rRes.data ?? []) as RoleRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const rolesFor = (id: string) => roles.filter((r) => r.user_id === id).map((r) => r.role);

  const toggleRole = async (userId: string, role: AppRole, hasIt: boolean) => {
    setBusy(userId + role);
    const { error } = hasIt
      ? await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role)
      : await supabase.from("user_roles").insert({ user_id: userId, role });
    setBusy(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: hasIt ? `Removed ${role}` : `Granted ${role}` });
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Clients & Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage who has access to the admin and client portals.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : profiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No users yet. Users appear here after they sign up at /auth.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => {
            const userRoles = rolesFor(p.id);
            const hasAdmin = userRoles.includes("admin");
            const hasStaff = userRoles.includes("staff");
            return (
              <Card key={p.id}>
                <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <UserIcon className="w-4 h-4 text-muted-foreground" />
                      <h3 className="font-semibold text-foreground">{p.full_name ?? "Unnamed"}</h3>
                      {hasAdmin && <Badge className="bg-accent text-accent-foreground">Admin</Badge>}
                      {hasStaff && <Badge variant="outline">Staff</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.company ?? "No company"} • {p.phone ?? "No phone"}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={hasStaff ? "secondary" : "outline"}
                        disabled={busy === p.id + "staff"}
                        onClick={() => toggleRole(p.id, "staff", hasStaff)}
                      >
                        <Shield className="w-4 h-4 mr-1" />
                        {hasStaff ? "Remove Staff" : "Grant Staff"}
                      </Button>
                      <Button
                        size="sm"
                        variant={hasAdmin ? "secondary" : "outline"}
                        disabled={busy === p.id + "admin"}
                        onClick={() => toggleRole(p.id, "admin", hasAdmin)}
                      >
                        <ShieldCheck className="w-4 h-4 mr-1" />
                        {hasAdmin ? "Remove Admin" : "Grant Admin"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Only admin users can change roles.
        </p>
      )}
    </div>
  );
}
