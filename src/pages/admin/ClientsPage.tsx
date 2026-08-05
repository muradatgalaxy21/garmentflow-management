import { useEffect, useState } from "react";
import { Loader2, Shield, ShieldCheck, User as UserIcon, HardHat, UserPlus, DollarSign, Wrench, Briefcase, Download, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type AppRole = "admin" | "staff" | "client" | "worker" | "manager";

interface Profile {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  wage_type: "piece_rate" | "monthly_salary" | null;
  base_salary: number | null;
  default_piece_rate: number | null;
  skills: string[] | null;
  employee_id: string | null;
  department: "accessories" | "cutting" | "sticker" | "printing" | "embroidery" | null;
}

const DEPARTMENTS = ["accessories", "cutting", "sticker", "printing", "embroidery"] as const;

interface RoleRow {
  user_id: string;
  role: AppRole;
}

interface WorkerPayoutSummary {
  worker_id: string;
  worker_name: string;
  wage_type: string;
  total_pieces: number;
  total_wasted: number;
  calculated_payout: number;
}

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [payouts, setPayouts] = useState<WorkerPayoutSummary[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);

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

  const loadPayoutLedger = async () => {
    setLoadingPayouts(true);
    // Fetch all tracking entries joined with worker profiles & batch phase rates
    const { data: tracking, error: tErr } = await supabase
      .from("batch_tracking")
      .select("worker_id, quantity_completed, quantity_wasted, batch_id, phase_id");

    const { data: rates, error: rErr } = await supabase
      .from("batch_phase_rates")
      .select("batch_id, phase_id, rate_per_piece");

    if (tErr || rErr) {
      toast({ title: "Failed to fetch payout data", variant: "destructive" });
      setLoadingPayouts(false);
      return;
    }

    const rateMap = new Map<string, number>();
    rates?.forEach((r) => {
      rateMap.set(`${r.batch_id}_${r.phase_id}`, Number(r.rate_per_piece || 0));
    });

    const summaryMap = new Map<string, WorkerPayoutSummary>();

    profiles.forEach((p) => {
      if (rolesFor(p.id).includes("worker")) {
        summaryMap.set(p.id, {
          worker_id: p.id,
          worker_name: p.full_name || "Unnamed Worker",
          wage_type: p.wage_type === "monthly_salary" ? "Permanent (Monthly)" : "Dihaari (Per-Piece)",
          total_pieces: 0,
          total_wasted: 0,
          calculated_payout: p.wage_type === "monthly_salary" ? Number(p.base_salary || 0) : 0,
        });
      }
    });

    tracking?.forEach((t) => {
      const summary = summaryMap.get(t.worker_id);
      if (summary) {
        summary.total_pieces += Number(t.quantity_completed || 0);
        summary.total_wasted += Number(t.quantity_wasted || 0);
        if (summary.wage_type.includes("Dihaari")) {
          const rate = rateMap.get(`${t.batch_id}_${t.phase_id}`) || 0;
          summary.calculated_payout += Number(t.quantity_completed || 0) * rate;
        }
      }
    });

    setPayouts(Array.from(summaryMap.values()));
    setLoadingPayouts(false);
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

  const saveWorkerProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProfile) return;
    setBusy("saving_profile");

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editingProfile.full_name,
        employee_id: editingProfile.employee_id,
        wage_type: editingProfile.wage_type,
        base_salary: editingProfile.base_salary,
        default_piece_rate: editingProfile.default_piece_rate,
        skills: editingProfile.skills,
        department: editingProfile.department,
      })
      .eq("id", editingProfile.id);

    setBusy(null);
    if (error) {
      toast({ title: "Failed to update profile", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Worker profile updated successfully" });
    setEditingProfile(null);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Employee & Client Center</h1>
          <p className="text-sm text-muted-foreground">
            Manage permanent &amp; dihaari (per-piece) workers, assign manager roles, and view weekly payout ledgers.
          </p>
        </div>
      </div>

      {isAdmin && (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="py-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-accent" /> Create New Employee Account
            </h2>
            <form onSubmit={createWorker} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <Label htmlFor="worker-name" className="text-xs">Full Name</Label>
                <Input id="worker-name" name="fullName" placeholder="e.g. Tariq Mehmood" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="worker-email" className="text-xs">Email Address</Label>
                <Input id="worker-email" name="email" type="email" required placeholder="worker@factory.com" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="worker-password" className="text-xs">Password</Label>
                <Input id="worker-password" name="password" type="password" required minLength={6} placeholder="••••••••" className="mt-1" />
              </div>
              <Button type="submit" size="sm" disabled={creatingWorker} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {creatingWorker ? "Creating..." : "Create Account"}
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
        <Tabs defaultValue="workers" onValueChange={(v) => v === "payouts" && loadPayoutLedger()}>
          <TabsList className="grid grid-cols-3 max-w-lg">
            <TabsTrigger value="workers">Workers &amp; Staff ({workerProfiles.length})</TabsTrigger>
            <TabsTrigger value="clients">Clients ({clientProfiles.length})</TabsTrigger>
            <TabsTrigger value="payouts">Dihaari Payout Ledger</TabsTrigger>
          </TabsList>

          <TabsContent value="workers" className="mt-4">
            {renderWorkerList(workerProfiles)}
          </TabsContent>

          <TabsContent value="clients" className="mt-4">
            {renderClientList(clientProfiles)}
          </TabsContent>

          <TabsContent value="payouts" className="mt-4">
            {renderPayoutLedger()}
          </TabsContent>
        </Tabs>
      )}

      {/* Edit Worker Profile Modal */}
      {editingProfile && (
        <Dialog open={!!editingProfile} onOpenChange={(open) => !open && setEditingProfile(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HardHat className="w-5 h-5 text-accent" /> Worker Profile &amp; Dihaari Setup
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={saveWorkerProfile} className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">Full Name</Label>
                <Input
                  value={editingProfile.full_name || ""}
                  onChange={(e) => setEditingProfile({ ...editingProfile, full_name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Employee ID / Worker Tag</Label>
                <Input
                  value={editingProfile.employee_id || ""}
                  placeholder="e.g. WKR-104"
                  onChange={(e) => setEditingProfile({ ...editingProfile, employee_id: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Employment &amp; Wage Type</Label>
                <Select
                  value={editingProfile.wage_type || "piece_rate"}
                  onValueChange={(v: "piece_rate" | "monthly_salary") => setEditingProfile({ ...editingProfile, wage_type: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piece_rate">Dihaari Worker (Paid Per Piece)</SelectItem>
                    <SelectItem value="monthly_salary">Permanent Employee (Fixed Monthly Salary)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingProfile.wage_type === "monthly_salary" ? (
                <div>
                  <Label className="text-xs font-semibold">Monthly Base Salary (PKR / USD)</Label>
                  <Input
                    type="number"
                    value={editingProfile.base_salary || 0}
                    onChange={(e) => setEditingProfile({ ...editingProfile, base_salary: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-xs font-semibold">Default Piece Rate (PKR / Piece)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editingProfile.default_piece_rate || 0}
                    onChange={(e) => setEditingProfile({ ...editingProfile, default_piece_rate: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold">Department (data-entry access)</Label>
                <Select
                  value={editingProfile.department || "none"}
                  onValueChange={(v) => setEditingProfile({ ...editingProfile, department: v === "none" ? null : (v as Profile["department"]) })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Assigned Line Roles &amp; Skills</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {["Cutting Master", "Stitching", "Singer", "Embroidery", "Printing", "QC", "Packing"].map((skill) => {
                    const currentSkills = editingProfile.skills || [];
                    const isSelected = currentSkills.some((s) => s.toLowerCase() === skill.toLowerCase());
                    return (
                      <Badge
                        key={skill}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer px-2.5 py-1 text-xs transition-all ${
                          isSelected
                            ? "bg-accent text-accent-foreground font-bold border-accent"
                            : "bg-slate-900 text-slate-300 border-slate-700 hover:border-accent/50"
                        }`}
                        onClick={() => {
                          const updated = isSelected
                            ? currentSkills.filter((s) => s.toLowerCase() !== skill.toLowerCase())
                            : [...currentSkills, skill];
                          setEditingProfile({ ...editingProfile, skills: updated });
                        }}
                      >
                        {isSelected ? "✓ " : "+ "}{skill}
                      </Badge>
                    );
                  })}
                </div>
                <Input
                  value={(editingProfile.skills || []).join(", ")}
                  placeholder="Additional skills e.g. Overlock, Buttoning..."
                  onChange={(e) => setEditingProfile({
                    ...editingProfile,
                    skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                  className="mt-1"
                />
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setEditingProfile(null)}>Cancel</Button>
                <Button type="submit" disabled={busy === "saving_profile"}>Save Worker Settings</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  function renderWorkerList(list: Profile[]) {
    if (list.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No workers or staff found.</CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        {list.map((p) => {
          const userRoles = rolesFor(p.id);
          const hasAdmin = userRoles.includes("admin");
          const hasStaff = userRoles.includes("staff");
          const hasManager = userRoles.includes("manager");
          const hasWorker = userRoles.includes("worker");
          const isDihaari = p.wage_type !== "monthly_salary";

          return (
            <Card key={p.id} className="hover:border-accent/30 transition-colors">
              <CardContent className="py-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">{p.full_name ?? "Unnamed Worker"}</h3>
                    {p.employee_id && <Badge variant="secondary" className="font-mono text-xs">{p.employee_id}</Badge>}
                    {isDihaari ? (
                      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">Dihaari (Per-Piece)</Badge>
                    ) : (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Permanent Monthly</Badge>
                    )}
                    {hasAdmin && <Badge className="bg-accent text-accent-foreground">Admin</Badge>}
                    {hasManager && <Badge className="bg-blue-600 text-white">Manager</Badge>}
                    {hasStaff && <Badge variant="outline">Staff</Badge>}
                    {hasWorker && <Badge variant="outline">Worker</Badge>}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 flex-wrap">
                    <span>{p.email || p.phone || "No direct contact"}</span>
                    <span>• Wage: {isDihaari ? `Default ${p.default_piece_rate || 0}/pc` : `Salary ${p.base_salary || 0}/mo`}</span>
                    {p.skills && p.skills.length > 0 && (
                      <span className="flex items-center gap-1"><Wrench className="w-3 h-3 text-accent" /> {p.skills.join(", ")}</span>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {!hasAdmin && (
                      <Button size="sm" variant="outline" onClick={() => setEditingProfile(p)}>
                        <Briefcase className="w-3.5 h-3.5 mr-1" /> Edit Dihaari/Skills
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={hasManager ? "default" : "outline"}
                      className={hasManager ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                      disabled={busy === p.id + "manager"}
                      onClick={() => toggleRole(p.id, "manager", hasManager)}
                    >
                      <Shield className="w-3.5 h-3.5 mr-1" />
                      {hasManager ? "Manager" : "+ Grant Manager"}
                    </Button>
                    <Button
                      size="sm"
                      variant={hasWorker ? "secondary" : "outline"}
                      disabled={busy === p.id + "worker"}
                      onClick={() => toggleRole(p.id, "worker", hasWorker)}
                    >
                      <HardHat className="w-3.5 h-3.5 mr-1" />
                      {hasWorker ? "Worker Role" : "+ Worker Role"}
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

  function renderClientList(list: Profile[]) {
    if (list.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No clients registered yet.</CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-2">
        {list.map((p) => (
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
    );
  }

  function renderPayoutLedger() {
    if (loadingPayouts) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      );
    }

    const totalDihaariPayout = payouts.reduce((sum, p) => sum + p.calculated_payout, 0);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs font-semibold text-muted-foreground">Total Active Workers</p>
              <h3 className="text-2xl font-bold text-foreground mt-1">{payouts.length}</h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs font-semibold text-muted-foreground">Total Pieces Completed</p>
              <h3 className="text-2xl font-bold text-accent mt-1">{payouts.reduce((sum, p) => sum + p.total_pieces, 0).toLocaleString()} pcs</h3>
            </CardContent>
          </Card>
          <Card className="bg-emerald-500/10 border-emerald-500/20">
            <CardContent className="py-4">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Total Calculated Payout</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                PKR {totalDihaariPayout.toLocaleString()}
              </h3>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="py-4 border-b">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Weekly Dihaari &amp; Salary Ledger</span>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Download className="w-4 h-4 mr-1" /> Print Report
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground font-semibold">
                <tr>
                  <th className="p-3">Worker Name</th>
                  <th className="p-3">Wage Category</th>
                  <th className="p-3">Pieces Done</th>
                  <th className="p-3">Wasted Pcs</th>
                  <th className="p-3 text-right">Calculated Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payouts.map((p) => (
                  <tr key={p.worker_id} className="hover:bg-muted/20">
                    <td className="p-3 font-medium text-foreground">{p.worker_name}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={p.wage_type.includes("Dihaari") ? "border-amber-500 text-amber-600" : "border-emerald-500 text-emerald-600"}>
                        {p.wage_type}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono">{p.total_pieces}</td>
                    <td className="p-3 font-mono text-destructive">{p.total_wasted}</td>
                    <td className="p-3 text-right font-bold text-foreground">
                      PKR {p.calculated_payout.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  }
}

