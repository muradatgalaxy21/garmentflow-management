// IMP-13 check against the TEST project (.env.staging): grant + remove orders.view on
// the mock viewer as admin, then check history, RLS, alerts, links and emails.
// Run: node scripts/verify-permission-alerts.cjs
const proj = require("path").resolve(__dirname, "..");
const { createClient } = require(proj + "/node_modules/@supabase/supabase-js");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(proj + "/.env.staging", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const URL = env.STAGING_SUPABASE_URL, ANON = env.STAGING_SUPABASE_ANON_KEY;
const svc = createClient(URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const D = "mock.enen.test";
async function as(who) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `${who}@${D}`, password: env.MOCK_PASSWORD });
  if (error) throw new Error(who + ": " + error.message);
  c.uid = data.user.id; return c;
}
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
(async () => {
  const start = new Date().toISOString();
  const [admin, viewer, staff] = await Promise.all([as("admin"), as("viewer"), as("staff")]);
  const PERM = "orders.view";
  await admin.from("user_permissions").delete().eq("user_id", viewer.uid).eq("permission", PERM); // clean slate
  const s2 = new Date().toISOString();
  let r = await admin.from("user_permissions").insert({ user_id: viewer.uid, permission: PERM, granted_by: admin.uid });
  ok(!r.error, "admin grants " + PERM + (r.error ? " " + r.error.message : ""));
  r = await admin.from("user_permissions").delete().eq("user_id", viewer.uid).eq("permission", PERM);
  ok(!r.error, "admin removes " + PERM);
  // non-admin cannot change permissions
  r = await staff.from("user_permissions").insert({ user_id: staff.uid, permission: "payroll.manage" }).select();
  ok(!!r.error || (r.data ?? []).length === 0, "staff cannot self-grant");

  const log = await admin.from("permission_change_log").select("*").eq("user_id", viewer.uid).gte("changed_at", s2).order("changed_at");

  ok(log.data?.length === 2 && log.data[0].new_value === true && log.data[0].old_value === false && log.data[1].new_value === false && log.data[1].old_value === true, "log has grant then removal with old->new");
  ok(log.data?.every((l) => l.changed_by === admin.uid && l.changed_by_name && l.user_name), "log has who + names");
  const own = await viewer.from("permission_change_log").select("id").eq("user_id", viewer.uid).gte("changed_at", s2);
  ok(own.data?.length === 2, "member sees own history");
  const other = await staff.from("permission_change_log").select("id").eq("user_id", viewer.uid);
  ok((other.data ?? []).length === 0, "other staff cannot see member's history");
  const del = await admin.from("permission_change_log").delete().eq("user_id", viewer.uid).select();
  ok((del.data ?? []).length === 0, "history cannot be deleted (even by admin)");

  await new Promise((res) => setTimeout(res, 15000)); // let pg_net emails go
  const admins = (await svc.from("user_roles").select("user_id").eq("role", "admin")).data.map((x) => x.user_id);
  const notes = (await svc.from("user_notifications").select("user_id, title, body, link, emailed_at").eq("kind", "permission_change").gte("created_at", s2)).data;

  for (const id of [...admins, viewer.uid]) ok(notes.filter((n) => n.user_id === id).length === 2, "2 notifications for " + id + (id === viewer.uid ? " (member)" : " (admin)"));
  ok(notes.filter((n) => n.user_id === viewer.uid).every((n) => n.link === null), "member alerts have no link");
  ok(notes.filter((n) => admins.includes(n.user_id)).every((n) => n.link === "/admin/employees"), "admin alerts link to Employees");
  ok(!notes.some((n) => n.user_id === staff.uid), "uninvolved staff gets none");
  ok(notes.every((n) => n.emailed_at), "all emailed (" + notes.filter((n) => n.emailed_at).length + "/" + notes.length + ")");
  const vb = await viewer.from("user_notifications").select("id").eq("kind", "permission_change").gte("created_at", s2);
  ok(vb.data?.length === 2, "member reads own notifications in-app");
})().catch((e) => { console.error(e); process.exitCode = 1; });
