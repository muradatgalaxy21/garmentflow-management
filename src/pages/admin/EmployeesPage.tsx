import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Shield, HardHat, UserPlus, Briefcase, Download, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizePkPhone } from "@/lib/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { mergeDepartmentSkills } from "@/lib/workerSkills";
import { entryCost, entryPieces, type Department, type EntryStage } from "@/lib/departmentEntries";
import { downloadCsv } from "@/lib/export";
import { WAGE_BEARING_DEPARTMENTS } from "@/lib/finance";
import { ACTIONS, ACTION_LABELS, SECTIONS, type Action } from "@/lib/permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/admin/PageHeader";
import { pkr } from "@/lib/finance";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableToolbar } from "@/components/admin/TableToolbar";
import { MoreMenu } from "@/components/admin/MoreMenu";
import { EmptyState } from "@/components/admin/EmptyState";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_EMPLOYEE_FILTERS, filterEmployees, paginate, type EmployeeFilters } from "@/lib/employeeFilters";

type AppRole = "admin" | "staff" | "client" | "worker" | "manager";

// Pay fields come from employee_pay (payroll.view), merged in on load.
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
  department: "accessories" | "cutting" | "sticker" | "printing" | "embroidery" | "quality" | "stitching" | "button_ops" | "clipping" | "press" | "quality_final" | "packing" | null;
  sub_department: "singer" | "overlock" | "flatlock" | "lock_stitch" | null;
}

const DEPARTMENTS = ["accessories", "cutting", "sticker", "printing", "embroidery", "quality", "stitching", "button_ops", "clipping", "press", "quality_final", "packing"] as const;
const SUB_DEPARTMENTS = ["singer", "overlock", "flatlock", "lock_stitch"] as const;

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

export default function EmployeesPage() {
  const { isAdmin, can } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [payouts, setPayouts] = useState<WorkerPayoutSummary[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [filters, setFilters] = useState<EmployeeFilters>(DEFAULT_EMPLOYEE_FILTERS);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const setFilter = (patch: Partial<EmployeeFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const [permEdit, setPermEdit] = useState<{ profile: Profile; granted: Set<string>; original: Set<string> } | null>(null);

  // IMP-13: permanent change history (RLS: admins, or the member themself).
  const [permHistory, setPermHistory] = useState<{ id: string; permission: string; old_value: boolean; new_value: boolean; changed_by_name: string | null; changed_at: string }[]>([]);

  const openPermissions = async (p: Profile) => {
    const [{ data, error }, { data: hist }] = await Promise.all([
      supabase.from("user_permissions").select("permission").eq("user_id", p.id),
      supabase.from("permission_change_log").select("id, permission, old_value, new_value, changed_by_name, changed_at")
        .eq("user_id", p.id).order("changed_at", { ascending: false }).limit(100),
    ]);
    if (error) return toast({ title: "Could not load permissions", description: error.message, variant: "destructive" });
    const set = new Set((data ?? []).map((r) => r.permission));
    setPermHistory(hist ?? []);
    setPermEdit({ profile: p, granted: new Set(set), original: set });
  };

  const savePermissions = async () => {
    if (!permEdit) return;
    const uid = permEdit.profile.id;
    const added = [...permEdit.granted].filter((x) => !permEdit.original.has(x));
    const removed = [...permEdit.original].filter((x) => !permEdit.granted.has(x));
    if (!added.length && !removed.length) return setPermEdit(null);
    const ok = await confirm({
      title: `Change permissions for ${permEdit.profile.full_name ?? "this person"}?`,
      description: "Takes effect next time they open or refresh the portal. The change is logged.",
      details: [
        ["Currently", `${permEdit.original.size} permission${permEdit.original.size === 1 ? "" : "s"}`],
        ["After saving", `${permEdit.granted.size} permission${permEdit.granted.size === 1 ? "" : "s"}`],
        ["Added", added.length ? added.join(", ") : "none"],
        ["Removed", removed.length ? removed.join(", ") : "none"],
      ],
      confirmLabel: "Save permissions",
      destructive: removed.length > 0,
    });
    if (!ok) return;
    setBusy("saving_perms");
    const results = await Promise.all([
      added.length ? supabase.from("user_permissions").insert(added.map((permission) => ({ user_id: uid, permission }))) : null,
      removed.length ? supabase.from("user_permissions").delete().eq("user_id", uid).in("permission", removed) : null,
    ]);
    setBusy(null);
    const err = results.find((r) => r?.error)?.error;
    if (err) return toast({ title: "Could not save permissions", description: err.message, variant: "destructive" });
    toast({ title: "Permissions updated", description: "Takes effect next time they open or refresh the portal." });
    setPermEdit(null);
  };

  const load = async () => {
    setLoading(true);
    const [pRes, rRes, payRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("user_id, role"),
      // RLS returns nothing here without payroll.view.
      supabase.from("employee_pay").select("user_id, wage_type, base_salary, default_piece_rate"),
    ]);
    const pay = new Map((payRes.data ?? []).map((r) => [r.user_id, r]));
    if (!pRes.error) {
      setProfiles((pRes.data ?? []).map((p) => {
        const w = pay.get(p.id);
        return {
          ...p,
          wage_type: (w?.wage_type ?? "piece_rate") as Profile["wage_type"],
          base_salary: w?.base_salary ?? 0,
          default_piece_rate: w?.default_piece_rate ?? 0,
        } as Profile;
      }));
    }
    if (!rRes.error) setRoles((rRes.data ?? []) as RoleRow[]);
    setLoading(false);
  };

  const loadPayoutLedger = async () => {
    setLoadingPayouts(true);
    const { data: tracking, error: tErr } = await supabase
      .from("batch_tracking")
      .select("worker_id, quantity_completed, quantity_wasted, batch_id, phase_id, panel_rate_id");

    const { data: rates, error: rErr } = await supabase
      .from("batch_phase_rates")
      .select("batch_id, phase_id, rate_per_piece");

    const { data: panelRates, error: prErr } = await supabase
      .from("batch_phase_panel_rates")
      .select("id, rate_per_piece");

    const { data: deptEntries, error: dErr } = await supabase
      .from("department_entries")
      .select("worker_id, department, stage, payload, total_cost")
      .in("department", WAGE_BEARING_DEPARTMENTS);

    if (tErr || rErr || prErr || dErr) {
      toast({ title: "Failed to fetch payout data", variant: "destructive" });
      setLoadingPayouts(false);
      return;
    }

    const rateMap = new Map<string, number>();
    rates?.forEach((r) => {
      rateMap.set(`${r.batch_id}_${r.phase_id}`, Number(r.rate_per_piece || 0));
    });
    const panelRateMap = new Map<string, number>();
    panelRates?.forEach((r) => {
      panelRateMap.set(r.id, Number(r.rate_per_piece || 0));
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
          const rate = t.panel_rate_id
            ? panelRateMap.get(t.panel_rate_id) ?? 0
            : rateMap.get(`${t.batch_id}_${t.phase_id}`) || 0;
          summary.calculated_payout += Number(t.quantity_completed || 0) * rate;
        }
      }
    });

    // Real worker QR-logged work — total_cost is rate × END completed pieces,
    // stamped when admin accepts the END (unaccepted ENDs have null cost). START
    // rows carry no quantity/cost, and legacy START cost is ignored (BUG-6).
    deptEntries?.forEach((e) => {
      const row = { department: e.department as Department, stage: e.stage as EntryStage };
      const summary = summaryMap.get(e.worker_id);
      if (!summary) return;
      summary.total_pieces += entryPieces({ ...row, payload: (e.payload as Record<string, unknown>) ?? {} }) ?? 0;
      if (summary.wage_type.includes("Dihaari")) {
        summary.calculated_payout += Number(entryCost({ ...row, total_cost: e.total_cost }) || 0);
      }
    });

    setPayouts(Array.from(summaryMap.values()));
    setLoadingPayouts(false);
  };

  useEffect(() => {
    load();
  }, []);

  const rolesFor = (id: string) => roles.filter((r) => r.user_id === id).map((r) => r.role);

  const workerProfiles = profiles.filter((p) => !rolesFor(p.id).includes("client"));
  const filteredWorkers = filterEmployees(workerProfiles, filters, (p) => rolesFor(p.id));
  const paged = paginate(filteredWorkers, page);
  const filtersActive = filters.role !== "all" || filters.department !== "all" || filters.pay !== "all";

  const nextEmployeeId = () => {
    const maxNum = profiles.reduce((max, p) => {
      const match = p.employee_id?.match(/^EN-(\d+)$/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `EN-${String(maxNum + 1).padStart(3, "0")}`;
  };

  const openEditProfile = (p: Profile) => {
    setEditingProfile({ ...p, employee_id: p.employee_id || nextEmployeeId() });
  };

  const toggleRole = async (userId: string, role: AppRole, hasIt: boolean) => {
    const person = profiles.find((p) => p.id === userId);
    const current = rolesFor(userId);
    const next = hasIt ? current.filter((r) => r !== role) : [...current, role];
    const list = (r: string[]) => (r.length ? r.join(", ") : "none");
    if (!(await confirm({
      title: hasIt ? `Remove the ${role} role?` : `Grant the ${role} role?`,
      details: [["Person", person?.full_name ?? "Unnamed"], ["Current roles", list(current)], ["New roles", list(next)]],
      confirmLabel: hasIt ? "Remove" : "Grant",
      destructive: hasIt,
    }))) return;
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

    const { error: payErr } = can("payroll.manage")
      ? await supabase.from("employee_pay").upsert({
          user_id: editingProfile.id,
          wage_type: editingProfile.wage_type ?? "piece_rate",
          base_salary: editingProfile.base_salary ?? 0,
          default_piece_rate: editingProfile.default_piece_rate ?? 0,
        })
      : { error: null };
    const { error } = payErr ? { error: payErr } : await supabase
      .from("profiles")
      .update({
        full_name: editingProfile.full_name,
        employee_id: editingProfile.employee_id,
        skills: mergeDepartmentSkills(editingProfile.skills, editingProfile.department, editingProfile.department === "stitching" ? editingProfile.sub_department : null),
        department: editingProfile.department,
        sub_department: editingProfile.department === "stitching" ? editingProfile.sub_department : null,
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
    const phone = normalizePkPhone(String(fd.get("phone") ?? ""));
    const fullName = String(fd.get("fullName") ?? "").trim();
    if (!phone) {
      toast({ title: "Invalid input", description: "Enter a valid Pakistani mobile number (03XXXXXXXXX).", variant: "destructive" });
      return;
    }
    setCreatingWorker(true);
    const { error } = await supabase.functions.invoke("admin-create-worker", {
      body: { phone, fullName },
    });
    setCreatingWorker(false);
    if (error) {
      toast({ title: "Failed to create account", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Employee account created" });
    setCreateOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Employee Center" description="Manage permanent & dihaari (per-piece) workers, assign manager roles, and view weekly payout ledgers.">
        {can("employees.create") && (
          <Button onClick={() => setCreateOpen(true)}><UserPlus /> Add employee</Button>
        )}
      </PageHeader>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create new employee account</DialogTitle></DialogHeader>
          <form onSubmit={createWorker} className="space-y-3">
            <div>
              <Label htmlFor="worker-name" className="text-xs">Full Name</Label>
              <Input id="worker-name" name="fullName" placeholder="e.g. Tariq Mehmood" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="worker-phone" className="text-xs">Mobile Number</Label>
              <Input id="worker-phone" name="phone" type="tel" required placeholder="03001234567" className="mt-1" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creatingWorker}>{creatingWorker ? "Creating..." : "Create Account"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : (
        <Tabs defaultValue="workers" onValueChange={(v) => v === "payouts" && loadPayoutLedger()}>
          <TabsList className={`grid max-w-md ${can("payroll.view") ? "grid-cols-2" : "grid-cols-1"}`}>
            <TabsTrigger value="workers">Workers &amp; Staff ({workerProfiles.length})</TabsTrigger>
            {can("payroll.view") && <TabsTrigger value="payouts">Dihaari Payout Ledger</TabsTrigger>}
          </TabsList>

          <TabsContent value="workers" className="mt-4 space-y-3">
            <TableToolbar
              search={filters.q}
              onSearch={(q) => setFilter({ q })}
              placeholder="Search name, phone, skill, role…"
              count={filteredWorkers.length}
              noun="employee"
              filtersActive={filtersActive}
              onClear={() => { setFilters(DEFAULT_EMPLOYEE_FILTERS); setPage(1); }}
            >
              <Select value={filters.role} onValueChange={(role) => setFilter({ role })}>
                <SelectTrigger className="w-[130px]" aria-label="Filter by role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {["admin", "manager", "staff", "worker"].map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                  <SelectItem value="none">No role</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.department} onValueChange={(department) => setFilter({ department })}>
                <SelectTrigger className="w-[150px]" aria-label="Filter by department"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {DEPARTMENTS.map((d) => <SelectItem key={d} value={d} className="capitalize">{d.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              {can("payroll.view") && (
                <Select value={filters.pay} onValueChange={(pay) => setFilter({ pay: pay as EmployeeFilters["pay"] })}>
                  <SelectTrigger className="w-[150px]" aria-label="Filter by pay type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All pay types</SelectItem>
                    <SelectItem value="piece_rate">Dihaari (per piece)</SelectItem>
                    <SelectItem value="monthly_salary">Permanent monthly</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </TableToolbar>
            {renderWorkerList(paged.rows)}
          </TabsContent>

          {can("payroll.view") && (
            <TabsContent value="payouts" className="mt-4">
              {renderPayoutLedger()}
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Edit Worker Profile Modal */}
      {permEdit && (
        <Dialog open onOpenChange={(o) => !o && setPermEdit(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Permissions — {permEdit.profile.full_name ?? "Unnamed"}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Tick what this person can do in each section. Add, Edit or Delete also turns on View. Admins always have everything.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Section</th>
                    {ACTIONS.map((a) => <th key={a} className="py-2 px-2 font-medium text-center">{ACTION_LABELS[a]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((sec, i) => (<Fragment key={sec.key}>
                    {sec.group !== SECTIONS[i - 1]?.group && (
                      <tr><td colSpan={ACTIONS.length + 1} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.group}</td></tr>
                    )}
                    <tr className="border-t border-border">
                      <td className="py-2 pr-2">{sec.label}</td>
                      {ACTIONS.map((a) => {
                        const key = `${sec.key}.${a}`;
                        if (!(sec.actions as readonly Action[]).includes(a)) {
                          return <td key={a} className="text-center text-muted-foreground/50">—</td>;
                        }
                        return (
                          <td key={a} className="text-center">
                            <Checkbox
                              aria-label={`${sec.label} ${ACTION_LABELS[a]}`}
                              checked={permEdit.granted.has(key)}
                              onCheckedChange={(c) => {
                                const next = new Set(permEdit.granted);
                                if (c) {
                                  next.add(key);
                                  if ((sec.actions as readonly Action[]).includes("view")) next.add(`${sec.key}.view`); // any action needs view
                                } else if (a === "view") {
                                  for (const x of sec.actions) next.delete(`${sec.key}.${x}`); // no view = nothing
                                } else {
                                  next.delete(key);
                                }
                                setPermEdit({ ...permEdit, granted: next });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>))}
                </tbody>
              </table>
            </div>
            <div>
              <h4 className="text-sm font-semibold mt-2 mb-1">Change history</h4>
              {permHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
              ) : (
                <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                  {permHistory.map((h) => (
                    <li key={h.id} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">{fmtDateTime(h.changed_at)}</span>
                      <span>
                        {h.changed_by_name ?? "System"}: <span className="font-mono">{h.permission}</span>{" "}
                        {h.old_value ? "on" : "off"} → <span className={h.new_value ? "text-emerald-600" : "text-red-600"}>{h.new_value ? "on" : "off"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPermEdit(null)}>Cancel</Button>
              <Button onClick={savePermissions} disabled={busy === "saving_perms"}>Save permissions</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
                <Input value={editingProfile.employee_id || ""} disabled className="mt-1 font-mono" />
                <p className="text-[11px] text-muted-foreground mt-1">Auto-assigned sequentially, not editable.</p>
              </div>

              {can("payroll.view") && (<>
              <div>
                <Label className="text-xs font-semibold">Employment &amp; Wage Type</Label>
                <Select
                  disabled={!can("payroll.manage")}
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
                    disabled={!can("payroll.manage")}
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
                    disabled={!can("payroll.manage")}
                    value={editingProfile.default_piece_rate || 0}
                    onChange={(e) => setEditingProfile({ ...editingProfile, default_piece_rate: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              )}
              </>)}

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
                      <SelectItem key={d} value={d} className="capitalize">{d.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editingProfile.department === "stitching" && (
                <div>
                  <Label className="text-xs font-semibold">Sub-Department (Stitching Hall)</Label>
                  <Select
                    value={editingProfile.sub_department || "none"}
                    onValueChange={(v) => setEditingProfile({ ...editingProfile, sub_department: v === "none" ? null : (v as Profile["sub_department"]) })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {SUB_DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d} className="capitalize">{d.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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
      return <EmptyState title="No workers or staff found" description="Try a different search or clear the filters." />;
    }
    const showPay = can("payroll.view");
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead>Role</TableHead>
                {showPay && <TableHead className="hidden md:table-cell">Pay type</TableHead>}
                <TableHead className="hidden lg:table-cell">Department / skills</TableHead>
                <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => {
                const userRoles = rolesFor(p.id);
                const hasAdmin = userRoles.includes("admin");
                const hasStaff = userRoles.includes("staff");
                const hasManager = userRoles.includes("manager");
                const hasWorker = userRoles.includes("worker");
                const isDihaari = p.wage_type !== "monthly_salary";
                const canEdit = !hasAdmin && can("employees.update");
                const wage = isDihaari ? `Default ${p.default_piece_rate || 0}/pc` : `Salary ${p.base_salary || 0}/mo`;
                const dept = [p.department?.replace("_", " "), p.sub_department?.replace("_", " ")].filter(Boolean).join(" · ");

                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/admin/employees/${p.id}`)}>
                    <TableCell>
                      <Link to={`/admin/employees/${p.id}`} onClick={(e) => e.stopPropagation()} className="min-w-[7rem] inline-block font-medium text-foreground hover:underline">
                        {p.full_name ?? (hasAdmin ? "Admin" : "Unnamed Worker")}
                      </Link>
                      {p.employee_id && <div className="font-mono text-xs text-muted-foreground">{p.employee_id}</div>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{p.email || p.phone || "No direct contact"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {hasAdmin && <StatusBadge tone="info">Admin</StatusBadge>}
                        {hasManager && <StatusBadge tone="info">Manager</StatusBadge>}
                        {hasStaff && <StatusBadge>Staff</StatusBadge>}
                        {hasWorker && <StatusBadge>Worker</StatusBadge>}
                        {userRoles.length === 0 && <span className="text-xs text-muted-foreground">No role</span>}
                      </div>
                    </TableCell>
                    {showPay && (
                      <TableCell className="hidden md:table-cell">
                        {hasAdmin ? <span className="text-xs text-muted-foreground">—</span> : (<>
                          {isDihaari ? <StatusBadge tone="warning">Dihaari (per piece)</StatusBadge> : <StatusBadge tone="success">Permanent monthly</StatusBadge>}
                          <div className="text-xs text-muted-foreground mt-1">{wage}</div>
                        </>)}
                      </TableCell>
                    )}
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      <div className="capitalize">{dept || "Unassigned"}</div>
                      {p.skills && p.skills.length > 0 && <div>{p.skills.join(", ")}</div>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!hasAdmin && (
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button size="sm" variant="outline" aria-label={`Edit ${p.full_name ?? "employee"}`} onClick={() => openEditProfile(p)}>
                              <Briefcase /> <span className="hidden sm:inline">Edit</span>
                            </Button>
                          )}
                          {isAdmin && (
                            <MoreMenu label={`More actions for ${p.full_name ?? "employee"}`}>
                              <DropdownMenuItem disabled={busy === p.id + "manager"} onSelect={() => toggleRole(p.id, "manager", hasManager)}>
                                <Shield className="mr-2 h-4 w-4" /> {hasManager ? "Remove Manager" : "Grant Manager"}
                              </DropdownMenuItem>
                              {(hasManager || hasStaff) && (
                                <DropdownMenuItem onSelect={() => openPermissions(p)}>
                                  <KeyRound className="mr-2 h-4 w-4" /> Permissions
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem disabled={busy === p.id + "worker"} onSelect={() => toggleRole(p.id, "worker", hasWorker)}>
                                <HardHat className="mr-2 h-4 w-4" /> {hasWorker ? "Remove Worker Role" : "Add Worker Role"}
                              </DropdownMenuItem>
                            </MoreMenu>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {paged.pages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {paged.page} of {paged.pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={paged.page >= paged.pages} onClick={() => setPage(paged.page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function exportPayoutsCsv() {
    const rows: (string | number)[][] = [
      ["Worker Name", "Wage Category", "Pieces Done", "Wasted Pcs", "Calculated Payout (PKR)"],
      ...payouts.map((p) => [p.worker_name, p.wage_type, p.total_pieces, p.total_wasted, p.calculated_payout]),
    ];
    downloadCsv(`dihaari-salary-ledger-${new Date().toISOString().slice(0, 10)}.csv`, rows);
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
              <h3 className="text-2xl font-bold text-primary mt-1">{payouts.reduce((sum, p) => sum + p.total_pieces, 0).toLocaleString()} pcs</h3>
            </CardContent>
          </Card>
          <Card className="bg-emerald-500/10 border-emerald-500/20">
            <CardContent className="py-4">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Total Calculated Payout</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {pkr(totalDihaariPayout)}
              </h3>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="py-4 border-b">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Weekly Dihaari &amp; Salary Ledger</span>
              <Button size="sm" variant="outline" onClick={() => exportPayoutsCsv()}>
                <Download className="w-4 h-4 mr-1" /> Download CSV
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
                    <td className="p-3 font-mono text-danger">{p.total_wasted}</td>
                    <td className="p-3 text-right font-bold text-foreground">
                      {pkr(p.calculated_payout)}
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
