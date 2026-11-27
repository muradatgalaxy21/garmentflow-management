// Manager On-Behalf insert into batch_tracking, against the TEST project (.env.staging).
// Checks: admin can insert for another worker; viewer (no permissions) cannot;
// a worker cannot insert for another worker. Cleans up its rows with the service role.
// Run: node scripts/verify-manager-tracking-insert.cjs
const proj = require("path").resolve(__dirname, "..");
const { createClient } = require(proj + "/node_modules/@supabase/supabase-js");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(proj + "/.env.staging", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const URL = env.STAGING_SUPABASE_URL, ANON = env.STAGING_SUPABASE_ANON_KEY;
const svc = createClient(URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const D = "mock.enen.test";
async function as(who) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const cred = who.startsWith("+") ? { phone: who } : { email: `${who}@${D}` };
  const { data, error } = await c.auth.signInWithPassword({ ...cred, password: env.MOCK_PASSWORD });
  if (error) throw new Error(who + ": " + error.message);
  c.uid = data.user.id; return c;
}
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
(async () => {
  // mock workers are phone-only (no password): give the TEST worker the mock password so it can sign in
  const { data: ul } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const wu = ul.users.find((u) => u.phone === "923000000011");
  await svc.auth.admin.updateUserById(wu.id, { password: env.MOCK_PASSWORD });
  const [admin, viewer, worker] = await Promise.all([as("admin"), as("viewer"), as("+923000000011")]);
  // a different worker to act on behalf of
  const { data: others } = await svc.from("user_roles").select("user_id").eq("role", "worker").neq("user_id", worker.uid).limit(1);
  const target = others?.[0]?.user_id;
  const { data: batch } = await svc.from("production_batches").select("id").limit(1).single();
  const phaseId = (await svc.from("production_phases").select("id").limit(1).single()).data?.id;
  if (!target || !batch || !phaseId) throw new Error("need a second worker, a batch and a phase in the test project");
  const row = (wid) => ({ batch_id: batch.id, phase_id: phaseId, worker_id: wid, quantity_completed: 1, quantity_wasted: 0, notes: "[Manager On-Behalf] verify script" });

  let r = await admin.from("batch_tracking").insert(row(target)).select();
  ok(!r.error && r.data?.length === 1, "admin inserts for another worker" + (r.error ? " " + r.error.message : ""));
  r = await viewer.from("batch_tracking").insert(row(target)).select();
  ok(!!r.error, "viewer (no permissions) cannot insert for another worker");
  r = await worker.from("batch_tracking").insert(row(target)).select();
  ok(!!r.error, "worker cannot insert for another worker");
  r = await worker.from("batch_tracking").insert(row(worker.uid)).select();
  ok(!r.error, "worker still inserts own row (unchanged policy)" + (r.error ? " " + r.error.message : ""));

  await svc.from("batch_tracking").delete().eq("batch_id", batch.id).eq("notes", "[Manager On-Behalf] verify script");
  await svc.from("batch_tracking").delete().eq("batch_id", batch.id).eq("worker_id", worker.uid).eq("quantity_completed", 1).gte("created_at", new Date(Date.now() - 60000).toISOString());
})().catch((e) => { console.error(e); process.exitCode = 1; });
