import { useEffect, useState } from "react";
import { Loader2, Shield, ShieldCheck, User as UserIcon, HardHat, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type AppRole = "admin" | "staff" | "client" | "worker";

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
  const [creatingWorker, setCreatingWorker] = useState(false);

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

  const clientProfiles = profiles.filter((p) => rolesFor(p.id).includes("client"));
  const workerProfiles = profiles.filter((p) => !rolesFor(p.id).includes("client"));

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

  const createWorker = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const fullName = String(fd.get("fullName") ?? "").trim();
    if (!email || password.length < 6) {
      toast({ title: "Invalid input", description: "Email and a 6+ character password are required.", variant: "destructive" });
      return;
    }
    setCreatingWorker(true);
    const { error } = await supabase.functions.invoke("admin-create-worker", {
      body: { email, password, fullName },
    });
    setCreatingWorker(false);
    if (error) {
      toast({ title: "Failed to create account", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Employee account created" });
    (e.target as HTMLFormElement).reset();
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

      {isAdmin && (
        <Card>
          <CardContent className="py-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4" /> Create Employee Account
            </h2>
            <form onSubmit={createWorker} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <Label htmlFor="worker-name" className="text-xs">Full Name</Label>
                <Input id="worker-name" name="fullName" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="worker-email" className="text-xs">Email</Label>
                <Input id="worker-email" name="email" type="email" required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="worker-password" className="text-xs">Password</Label>
                <Input id="worker-password" name="password" type="password" required minLength={6} className="mt-1" />
              </div>
              <Button type="submit" size="sm" disabled={creatingWorker}>
                {creatingWorker ? "Creating..." : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : (
        <Tabs defaultValue="clients">
          <TabsList>
            <TabsTrigger value="clients">Clients ({clientProfiles.length})</TabsTrigger>
            <TabsTrigger value="workers">Workers &amp; Staff ({workerProfiles.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="clients" className="mt-4">
            {renderList(clientProfiles, "No clients yet. Clients appear here after they sign up at /auth.")}
          </TabsContent>
          <TabsContent value="workers" className="mt-4">
            {renderList(workerProfiles, "No workers or staff yet.")}
          </TabsContent>
        </Tabs>
      )}

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Only admin users can change roles.
        </p>
      )}
    </div>
  );

  function renderList(list: Profile[], emptyMessage: string) {
    if (list.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">{emptyMessage}</CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-2">
        {list.map((p) => {
          const userRoles = rolesFor(p.id);
          const hasAdmin = userRoles.includes("admin");
          const hasStaff = userRoles.includes("staff");
          const hasWorker = userRoles.includes("worker");
          return (
            <Card key={p.id}>
              <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">{p.full_name ?? "Unnamed"}</h3>
                    {hasAdmin && <Badge className="bg-accent text-accent-foreground">Admin</Badge>}
                    {hasStaff && <Badge variant="outline">Staff</Badge>}
                    {hasWorker && <Badge variant="outline">Worker</Badge>}
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
                    <Button
                      size="sm"
                      variant={hasWorker ? "secondary" : "outline"}
                      disabled={busy === p.id + "worker"}
                      onClick={() => toggleRole(p.id, "worker", hasWorker)}
                    >
                      <HardHat className="w-4 h-4 mr-1" />
                      {hasWorker ? "Remove Worker" : "Grant Worker"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }
}
