// Manager Entry + stage skip (migration 20261128000000) against the TEST project (.env.staging).
// Creates a throwaway batch, drives the RPCs as admin / manager / viewer / worker, checks the rows,
// then deletes the batch (cascades entries, statuses, logs) and its inbox messages with the service role.
// Run: node scripts/verify-office-entry.cjs
const proj = require("path").resolve(__dirname, "..");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const envFile = fs.existsSync(proj + "/.env.staging") ? proj + "/.env.staging" : require("path").resolve(proj, "../../../.env.staging");
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const URL = env.STAGING_SUPABASE_URL, ANON = env.STAGING_SUPABASE_ANON_KEY;
const svc = createClient(URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function as(who) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `${who}@mock.enen.test`, password: env.MOCK_PASSWORD });
  if (error) throw new Error(who + ": " + error.message);
  c.uid = data.user.id; return c;
}
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const [admin, manager, viewer] = await Promise.all([as("admin"), as("manager"), as("viewer")]);
  const { data: wr } = await svc.from("user_roles").select("user_id").eq("role", "worker").limit(2);
  const [w1, w2] = wr.map((r) => r.user_id);
  const { data: order } = await svc.from("orders").select("id").limit(1).single();
  const { data: batch, error: bErr } = await svc.from("production_batches")
    .insert({ order_id: order.id, style_number: `VERIFY-OFFICE-${Date.now()}`, total_quantity: 100 }).select("id").single();
  if (bErr) throw bErr;
  const B = batch.id;
  let tempRate = false;
  const rpc = (c, fn, args) => c.rpc(fn, args);
  const slip = (c, department, rows, extra = {}) => rpc(c, "submit_office_entry", {
    _batch_id: B, _department: department, _work_date: today, _rate_label: "", _finished: false, _notes: "verify", _rows: rows, ...extra,
  });
  const status = async (d) => (await svc.from("batch_department_status").select("*").eq("batch_id", B).eq("department", d).maybeSingle()).data;

  try {
    // Gate: press needs every earlier stage closed.
    let r = await slip(manager, "press", [{ worker_id: w1, completed: 5, wasted: 0 }]);
    ok(!!r.error && /has not finished/.test(r.error.message), "gate blocks press on a fresh batch");

    // Stage skip: only admin.
    r = await rpc(manager, "set_stage_skip", { _batch_id: B, _department: "accessories", _reason: "not_needed", _note: "" });
    ok(!!r.error, "manager cannot mark a stage skipped");
    for (const d of ["accessories", "cutting", "sticker", "quality", "lot_bundling", "stitching", "button_ops", "clipping"]) {
      r = await rpc(admin, "set_stage_skip", { _batch_id: B, _department: d, _reason: d === "sticker" ? "not_needed" : "before_system", _note: "verify" });
      if (r.error) { ok(false, `admin marks ${d}: ${r.error.message}`); }
    }
    const acc = await status("accessories");
    ok(acc?.status === "closed" && acc?.skip_reason === "before_system", "skip row is closed with reason");
    r = await rpc(admin, "set_stage_skip", { _batch_id: B, _department: "accessories", _reason: "before_system", _note: "" });
    ok(!!r.error, "cannot mark the same stage twice");

    // Permissions on submit.
    r = await slip(viewer, "press", [{ worker_id: w1, completed: 5, wasted: 0 }]);
    ok(!!r.error, "viewer cannot submit a slip");
    r = await rpc(manager, "submit_office_entry", { _batch_id: B, _department: "press", _work_date: "2999-01-01", _rate_label: "", _finished: false, _notes: "", _rows: [{ worker_id: w1, completed: 1, wasted: 0 }] });
    ok(!!r.error && /today or earlier/.test(r.error.message), "future work date rejected");
    r = await slip(manager, "accessories", [{ worker_id: w1, completed: 1, wasted: 0 }]);
    ok(!!r.error, "accessories not accepted");
    r = await slip(manager, "press", [{ worker_id: w1, completed: 0, wasted: 0 }]);
    ok(!!r.error, "row with no pieces rejected");

    // Slip 1 (partial): manager submits; admin accepts -> pay stamped, department stays open.
    let { data: rateRow } = await svc.from("department_cost_rates").select("rate").eq("department", "press").eq("label", "default").maybeSingle();
    if (!rateRow) { await svc.from("department_cost_rates").insert({ department: "press", label: "default", rate: 3 }); tempRate = true; rateRow = { rate: 3 }; }
    const rate = Number(rateRow.rate);
    r = await slip(manager, "press", [{ worker_id: w1, completed: 40, wasted: 2 }, { worker_id: w2, completed: 10, wasted: 0 }], { _work_date: "2026-11-20" });
    ok(!r.error && typeof r.data === "string", "manager submits a past-dated slip" + (r.error ? " " + r.error.message : ""));
    const msg1 = r.data;
    const { data: rows1 } = await svc.from("department_entries").select("*").eq("batch_id", B).eq("department", "press");
    ok(rows1.length === 4 && rows1.every((e) => e.entered_by === manager.uid && e.work_date === "2026-11-20"), "START+END per worker, entered_by manager, work_date kept");
    ok(rows1.filter((e) => e.stage === "end").every((e) => e.total_cost === null), "no pay before accept");
    ok((await status("press"))?.end_verification_status === "pending", "department shows waiting for approval");

    r = await rpc(manager, "resolve_office_entry", { _msg_id: msg1, _decision: "accepted", _note: "" });
    ok(!!r.error, "manager cannot accept (owner only)");
    r = await rpc(admin, "resolve_office_entry", { _msg_id: msg1, _decision: "accepted", _note: "ok" });
    ok(!r.error, "admin accepts" + (r.error ? " " + r.error.message : ""));
    const { data: ends1 } = await svc.from("department_entries").select("worker_id, total_cost, payload").eq("batch_id", B).eq("department", "press").eq("stage", "end");
    const e1 = ends1.find((e) => e.worker_id === w1);
    ok(Number(e1.total_cost) === rate * 40 && e1.payload.accepted === true, `pay = rate x done, wasted unpaid (rate ${rate})`);
    const st1 = await status("press");
    ok(st1.status === "open" && st1.end_verification_status === "none", "partial slip keeps the department open");

    // Hardening: nobody can forge or edit an office_entry message outside the functions.
    const { data: wl } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const wu = wl.users.find((u) => u.phone === "923000000011");
    await svc.auth.admin.updateUserById(wu.id, { password: env.MOCK_PASSWORD });
    const worker = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: wsess } = await worker.auth.signInWithPassword({ phone: "+923000000011", password: env.MOCK_PASSWORD });
    r = await worker.from("worker_inbox_messages").insert({ type: "office_entry", worker_id: wsess.user.id, batch_id: B, department: "press", message: "forged", payload: { entry_ids: rows1.map((e) => e.id), department_finished: true } });
    ok(!!r.error, "worker cannot forge an office entry");
    r = await slip(manager, "press", [{ worker_id: w1, completed: 7, wasted: 0 }]);
    const msgEdit = r.data;
    r = await manager.from("worker_inbox_messages").update({ payload: { entry_ids: rows1.map((e) => e.id), department_finished: true } }).eq("id", msgEdit).select();
    ok(!!r.error || (r.data ?? []).length === 0, "manager cannot edit a pending slip payload");
    r = await manager.from("worker_inbox_messages").update({ status: "accepted" }).eq("id", msgEdit).select();
    ok(!!r.error || (r.data ?? []).length === 0, "manager cannot mark a slip accepted directly");
    r = await rpc(admin, "resolve_office_entry", { _msg_id: msgEdit, _decision: "denied", _note: "" });
    ok(!r.error, "admin still resolves normally" + (r.error ? " " + r.error.message : ""));

    // Slip 2 denied: rows deleted.
    r = await slip(manager, "press", [{ worker_id: w1, completed: 999, wasted: 0 }]);
    const msg2 = r.data;
    r = await rpc(admin, "resolve_office_entry", { _msg_id: msg2, _decision: "denied", _note: "wrong" });
    ok(!r.error, "admin denies");
    const { count } = await svc.from("department_entries").select("id", { count: "exact", head: true }).eq("batch_id", B).eq("department", "press");
    ok(count === 4, "denied slip's rows are deleted, accepted ones stay");

    // Slip 3 finished -> accept closes.
    r = await slip(manager, "press", [{ worker_id: w2, completed: 50, wasted: 0 }], { _finished: true });
    r = await rpc(admin, "resolve_office_entry", { _msg_id: r.data, _decision: "accepted", _note: "" });
    ok(!r.error && (await status("press"))?.status === "closed", "finished slip closes the department on accept");
    r = await slip(manager, "press", [{ worker_id: w1, completed: 1, wasted: 0 }]);
    ok(!!r.error && /already closed/.test(r.error.message), "closed department refuses new slips");

    // Undo skip.
    r = await rpc(admin, "undo_stage_skip", { _batch_id: B, _department: "sticker", _note: "" });
    ok(!r.error && !(await status("sticker")), "admin undoes a skip");
    const { data: log } = await svc.from("batch_stage_skip_log").select("action").eq("batch_id", B).eq("department", "sticker");
    ok(log.map((l) => l.action).sort().join() === "marked,undone", "skip and undo are audited");
    r = await rpc(admin, "undo_stage_skip", { _batch_id: B, _department: "press", _note: "" });
    ok(!!r.error, "cannot undo a real (worked) department");

    // Pause guard.
    r = await rpc(admin, "set_batch_paused", { _batch_id: B, _paused: true, _reason: "verify" });
    if (r.error) ok(false, "pause: " + r.error.message);
    r = await slip(manager, "quality_final", [{ worker_id: w1, completed: 1, wasted: 0 }]);
    ok(!!r.error && /paused/.test(r.error.message), "paused batch refuses slips");
  } finally {
    if (tempRate) await svc.from("department_cost_rates").delete().eq("department", "press").eq("label", "default");
    await svc.from("worker_inbox_messages").delete().eq("batch_id", B);
    await svc.from("production_batches").delete().eq("id", B);
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
