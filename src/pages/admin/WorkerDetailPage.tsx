import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, HardHat, Loader2, Shield, User as UserIcon, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

interface WorkEntry {
  id: string;
  created_at: string;
  quantity_completed: number;
  quantity_wasted: number;
  notes: string | null;
  production_phases: { name: string } | null;
  production_batches: { style_number: string; status: string; orders: { order_number: string } | null } | null;
}

export default function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [pRes, rRes, eRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", id),
      supabase
        .from("batch_tracking")
        .select(
          "id, created_at, quantity_completed, quantity_wasted, notes, production_phases(name), production_batches(style_number, status, orders(order_number))"
        )
        .eq("worker_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (!pRes.error) setProfile(pRes.data as Profile | null);
    if (!rRes.error) setRoles((rRes.data ?? []).map((r) => r.role as AppRole));
    if (!eRes.error) setEntries((eRes.data ?? []) as unknown as WorkEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hasAdmin = roles.includes("admin");
  const hasManager = roles.includes("manager");
  const hasWorker = roles.includes("worker");
  const isDihaari = profile?.wage_type !== "monthly_salary";

  const currentEntries = entries.filter((e) => e.production_batches && !["completed", "cancelled"].includes(e.production_batches.status));
  const pastEntries = entries.filter((e) => !e.production_batches || ["completed", "cancelled"].includes(e.production_batches.status));

  const toggleRole = async (role: AppRole, hasIt: boolean) => {
    if (!id) return;
    if (hasIt && !window.confirm(`Remove ${role} role from this person?`)) return;
    setBusy(role);
    const { error } = hasIt
      ? await supabase.from("user_roles").delete().eq("user_id", id).eq("role", role)
      : await supabase.from("user_roles").insert({ user_id: id, role });
    setBusy(null);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: hasIt ? `Removed ${role}` : `Granted ${role}` });
    load();
  };

  const nextEmployeeId = () => {
    const match = profile?.employee_id?.match(/^EN-(\d+)$/i);
    return match ? profile!.employee_id! : "EN-001";
  };

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    setBusy("saving");
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editing.full_name,
        wage_type: editing.wage_type,
        base_salary: editing.base_salary,
        default_piece_rate: editing.default_piece_rate,
        skills: editing.skills,
        department: editing.department,
      })
      .eq("id", editing.id);
    setBusy(null);
    if (error) {
      toast({ title: "Failed to update profile", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Worker profile updated successfully" });
    setEditing(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/employees")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Worker not found.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/employees")}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Employees
      </Button>

      <Card>
        <CardContent className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <UserIcon className="w-5 h-5 text-muted-foreground" />
              <h1 className="font-heading text-xl font-bold text-foreground">{profile.full_name ?? "Unnamed Worker"}</h1>
              {profile.employee_id && <Badge variant="secondary" className="font-mono text-xs">{profile.employee_id}</Badge>}
              {isDihaari ? (
                <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">Dihaari (Per-Piece)</Badge>
              ) : (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Permanent Monthly</Badge>
              )}
              {hasAdmin && <Badge className="bg-accent text-accent-foreground">Admin</Badge>}
              {hasManager && <Badge className="bg-blue-600 text-white">Manager</Badge>}
              {hasWorker && <Badge variant="outline">Worker</Badge>}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 flex-wrap">
              <span>{profile.email || profile.phone || "No direct contact"}</span>
              <span>• Wage: {isDihaari ? `Default ${profile.default_piece_rate || 0}/pc` : `Salary ${profile.base_salary || 0}/mo`}</span>
              {profile.department && <span className="capitalize">• Dept: {profile.department}</span>}
              {profile.skills && profile.skills.length > 0 && (
                <span className="flex items-center gap-1"><Wrench className="w-3 h-3 text-accent" /> {profile.skills.join(", ")}</span>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2 items-center">
              {!hasAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing({ ...profile, employee_id: profile.employee_id || nextEmployeeId() })}
                >
                  <Briefcase className="w-3.5 h-3.5 mr-1" /> Edit Dihaari/Skills
                </Button>
              )}
              <Button
                size="sm"
                variant={hasManager ? "default" : "outline"}
                className={hasManager ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
                disabled={busy === "manager"}
                onClick={() => toggleRole("manager", hasManager)}
              >
                <Shield className="w-3.5 h-3.5 mr-1" />
                {hasManager ? "Manager" : "+ Grant Manager"}
              </Button>
              <Button
                size="sm"
                variant={hasWorker ? "secondary" : "outline"}
                disabled={busy === "worker"}
                onClick={() => toggleRole("worker", hasWorker)}
              >
                <HardHat className="w-3.5 h-3.5 mr-1" />
                {hasWorker ? "Worker Role" : "+ Worker Role"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-4 border-b">
          <CardTitle className="text-base">Currently Working On ({currentEntries.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {currentEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No active batch work right now.</p>
          ) : (
            <WorkTable entries={currentEntries} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-4 border-b">
          <CardTitle className="text-base">Work History ({pastEntries.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {pastEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No completed work logged yet.</p>
          ) : (
            <WorkTable entries={pastEntries} />
          )}
        </CardContent>
      </Card>

      {editing && (
        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HardHat className="w-5 h-5 text-accent" /> Worker Profile &amp; Dihaari Setup
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={saveProfile} className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">Full Name</Label>
                <Input
                  value={editing.full_name || ""}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Employee ID / Worker Tag</Label>
                <Input value={editing.employee_id || ""} disabled className="mt-1 font-mono" />
                <p className="text-[11px] text-muted-foreground mt-1">Auto-assigned sequentially, not editable.</p>
              </div>

              <div>
                <Label className="text-xs font-semibold">Employment &amp; Wage Type</Label>
                <Select
                  value={editing.wage_type || "piece_rate"}
                  onValueChange={(v: "piece_rate" | "monthly_salary") => setEditing({ ...editing, wage_type: v })}
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

              {editing.wage_type === "monthly_salary" ? (
                <div>
                  <Label className="text-xs font-semibold">Monthly Base Salary (PKR / USD)</Label>
                  <Input
                    type="number"
                    value={editing.base_salary || 0}
                    onChange={(e) => setEditing({ ...editing, base_salary: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              ) : (
                <div>
                  <Label className="text-xs font-semibold">Default Piece Rate (PKR / Piece)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editing.default_piece_rate || 0}
                    onChange={(e) => setEditing({ ...editing, default_piece_rate: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold">Department (data-entry access)</Label>
                <Select
                  value={editing.department || "none"}
                  onValueChange={(v) => setEditing({ ...editing, department: v === "none" ? null : (v as Profile["department"]) })}
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
                    const currentSkills = editing.skills || [];
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
                          setEditing({ ...editing, skills: updated });
                        }}
                      >
                        {isSelected ? "✓ " : "+ "}{skill}
                      </Badge>
                    );
                  })}
                </div>
                <Input
                  value={(editing.skills || []).join(", ")}
                  placeholder="Additional skills e.g. Overlock, Buttoning..."
                  onChange={(e) => setEditing({
                    ...editing,
                    skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                  className="mt-1"
                />
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={busy === "saving"}>Save Worker Settings</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function WorkTable({ entries }: { entries: WorkEntry[] }) {
  return (
    <table className="w-full text-sm text-left">
      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground font-semibold">
        <tr>
          <th className="p-3">Date</th>
          <th className="p-3">Order</th>
          <th className="p-3">Batch</th>
          <th className="p-3">Phase</th>
          <th className="p-3">Status</th>
          <th className="p-3">Pieces</th>
          <th className="p-3">Wasted</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {entries.map((e) => (
          <tr key={e.id} className="hover:bg-muted/20">
            <td className="p-3 text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</td>
            <td className="p-3">{e.production_batches?.orders?.order_number ? `#${e.production_batches.orders.order_number}` : "—"}</td>
            <td className="p-3 font-medium text-foreground">{e.production_batches?.style_number ?? "—"}</td>
            <td className="p-3">{e.production_phases?.name ?? "—"}</td>
            <td className="p-3 capitalize">
              <Badge variant="outline">{e.production_batches?.status ?? "unknown"}</Badge>
            </td>
            <td className="p-3 font-mono">{e.quantity_completed}</td>
            <td className="p-3 font-mono text-destructive">{e.quantity_wasted}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
