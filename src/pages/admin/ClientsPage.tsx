import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type AppRole = "admin" | "staff" | "client" | "worker" | "manager";

interface Profile {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
}

interface RoleRow {
  user_id: string;
  role: AppRole;
}

export default function ClientsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [pRes, rRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (!pRes.error) setProfiles((pRes.data ?? []) as Profile[]);
      if (!rRes.error) setRoles((rRes.data ?? []) as RoleRow[]);
      setLoading(false);
    };
    load();
  }, []);

  const rolesFor = (id: string) => roles.filter((r) => r.user_id === id).map((r) => r.role);
  const clientProfiles = profiles.filter((p) => rolesFor(p.id).includes("client"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Client Center</h1>
        <p className="text-sm text-muted-foreground">View registered client accounts.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : clientProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No clients registered yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clientProfiles.map((p) => (
            <Card key={p.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{p.full_name ?? "Unnamed Client"}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{p.company || "No Company"} • {p.email || p.phone || "No contact"}</p>
                </div>
                <Badge variant="outline">Client Account</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
