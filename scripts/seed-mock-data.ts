/**
 * Mock data for manual testing on a SEPARATE Supabase test project (plans/02 part E).
 * Never run against the live project — the script refuses known live refs.
 *
 * Setup (once): create a new Supabase project, push migrations to it, then make
 * `.env.staging` (gitignored) with:
 *   STAGING_SUPABASE_URL=https://<test-ref>.supabase.co
 *   STAGING_SUPABASE_ANON_KEY=...
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY=...
 *   MOCK_PASSWORD=<password for all mock email accounts>
 *
 * Run:  npx tsx --env-file=.env.staging scripts/seed-mock-data.ts
 * Safe to re-run: existing mock rows are reused, not duplicated.
 * Writes logins to mock-users.out.md (gitignored).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const url = process.env.STAGING_SUPABASE_URL ?? "";
const anonKey = process.env.STAGING_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? "";
const password = process.env.MOCK_PASSWORD ?? "";

function fail(msg: string): never {
  console.error("✖ " + msg);
  process.exit(1);
}
if (!url || !anonKey || !serviceKey || !password) fail("Set STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SUPABASE_SERVICE_ROLE_KEY and MOCK_PASSWORD in .env.staging.");
if (password.length < 10) fail("MOCK_PASSWORD must be at least 10 characters.");

// Live-project guard: the linked project ref, the config project_id, and the main .env URL.
const liveRefs = new Set<string>();
if (existsSync("supabase/.temp/project-ref")) liveRefs.add(readFileSync("supabase/.temp/project-ref", "utf8").trim());
const cfg = existsSync("supabase/config.toml") ? readFileSync("supabase/config.toml", "utf8").match(/project_id\s*=\s*"([^"]+)"/) : null;
if (cfg) liveRefs.add(cfg[1]);
if (existsSync(".env")) {
  const m = readFileSync(".env", "utf8").match(/VITE_SUPABASE_URL\s*=\s*"?https:\/\/([a-z0-9]+)\.supabase\.co/);
  if (m) liveRefs.add(m[1]);
}
for (const ref of liveRefs) if (ref && url.includes(ref)) fail(`Refusing: ${url} looks like the LIVE project (${ref}). Use a separate test project.`);

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const DOMAIN = "mock.enen.test";
const out: string[] = [];

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) fail(`${label}: ${error.message}`);
  return data;
}

// ---------- users ----------
let userCache: { id: string; email?: string; phone?: string }[] | null = null;
async function findUser(email?: string, phone?: string) {
  if (!userCache) {
    userCache = [];
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) fail("listUsers: " + error.message);
      userCache.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? undefined, phone: u.phone ?? undefined })));
      if (data.users.length < 1000) break;
    }
  }
  return userCache.find((u) => (email && u.email === email) || (phone && u.phone === phone.replace("+", "")));
}

interface Person { key: string; name: string; email?: string; phone?: string; roles: string[]; perms?: string[]; profile?: Record<string, unknown> }

async function ensurePerson(p: Person): Promise<string> {
  let u = await findUser(p.email, p.phone);
  if (!u) {
    const isWorker = p.roles.includes("worker");
    const { data, error } = await admin.auth.admin.createUser(
      p.email
        ? { email: p.email, password, email_confirm: true, user_metadata: { full_name: p.name, requested_role: isWorker ? "worker" : "client" } }
        : { phone: p.phone, phone_confirm: true, user_metadata: { full_name: p.name, requested_role: "worker", phone: p.phone } },
    );
    if (error || !data.user) fail(`createUser ${p.key}: ${error?.message}`);
    u = { id: data.user.id, email: p.email, phone: p.phone };
    userCache!.push(u);
  }
  // Roles: replace whatever the signup trigger guessed.
  await must(`roles ${p.key} clear`, admin.from("user_roles").delete().eq("user_id", u.id));
  await must(`roles ${p.key}`, admin.from("user_roles").insert(p.roles.map((role) => ({ user_id: u!.id, role: role as never }))));
  await must(`perms ${p.key} clear`, admin.from("user_permissions").delete().eq("user_id", u.id));
  if (p.perms?.length) await must(`perms ${p.key}`, admin.from("user_permissions").insert(p.perms.map((permission) => ({ user_id: u!.id, permission, granted_by: null }))));
  await must(`profile ${p.key}`, admin.from("profiles").update({ full_name: p.name, phone: p.phone ?? null, client_activated: true, ...(p.profile ?? {}) }).eq("id", u.id));
  out.push(`| ${p.key} | ${p.name} | ${p.email ?? p.phone} | ${p.roles.join(", ")} | ${p.perms?.join(", ") ?? (p.roles.includes("admin") ? "all" : "—")} |`);
  return u.id;
}

const ALL_OPS = ["rfqs.view", "rfqs.update", "inbox.view", "inbox.update", "inventory.view", "inventory.create", "inventory.update",
  "orders.view", "orders.create", "orders.update", "batches.view", "batches.create", "batches.update",
  "dispatch.view", "dispatch.create", "employees.view", "clients.view"];

const WORKER_DEPTS = ["accessories", "cutting", "sticker", "printing", "embroidery", "quality", "stitching", "button_ops", "clipping", "press", "quality_final", "packing"];

async function main() {
  console.log(`Seeding mock data into ${url}`);
  const ids: Record<string, string> = {};

  ids.admin = await ensurePerson({ key: "admin", name: "Mock Admin", email: `admin@${DOMAIN}`, roles: ["admin"] });
  ids.staff = await ensurePerson({ key: "staff", name: "Mock Staff (ops)", email: `staff@${DOMAIN}`, roles: ["staff"], perms: ALL_OPS });
  ids.manager = await ensurePerson({ key: "manager", name: "Mock Floor Manager", email: `manager@${DOMAIN}`, roles: ["manager"],
    perms: ["batches.view", "batches.update", "inbox.view", "inbox.update", "dispatch.view"] });
  ids.maker = await ensurePerson({ key: "finance_maker", name: "Mock Accounts Clerk", email: `clerk@${DOMAIN}`, roles: ["staff"],
    perms: ["finance.view", "finance.create", "finance.update"] });
  ids.checker = await ensurePerson({ key: "finance_checker", name: "Mock Finance Manager", email: `checker@${DOMAIN}`, roles: ["manager"],
    perms: ["finance.view", "finance.approve", "finance.delete"] });
  ids.viewer = await ensurePerson({ key: "viewer", name: "Mock Viewer (no perms)", email: `viewer@${DOMAIN}`, roles: ["staff"], perms: [] });

  const workers: Record<string, string> = {};
  for (const [i, dept] of WORKER_DEPTS.entries()) {
    workers[dept] = await ensurePerson({
      key: `worker_${dept}`, name: `Mock Worker ${dept}`, phone: `+9230000000${String(i + 10).padStart(2, "0")}`, roles: ["worker"],
      profile: { department: dept, wage_type: i % 3 === 0 ? "monthly_salary" : "piece_rate", base_salary: i % 3 === 0 ? 32000 : null,
        default_piece_rate: i % 3 === 0 ? null : 6 + i, employee_id: `MK-${String(i + 1).padStart(3, "0")}`,
        sub_department: dept === "stitching" ? "overlock" : null },
    });
  }
  const clients: string[] = [];
  for (const [i, co] of ["Mock Apparel UK", "Mock Sportswear DE", "Mock Retail PK"].entries()) {
    clients.push(await ensurePerson({ key: `client_${i + 1}`, name: co, email: `client${i + 1}@${DOMAIN}`, roles: ["client"], profile: { company: co } }));
  }

  // ---------- inventory ----------
  const items = [
    ["MK-FAB-JER", "Mock Jersey Fabric 180gsm", "fabric", "meters", 1200, 200, 650],
    ["MK-FAB-FLC", "Mock Fleece Fabric", "fabric", "meters", 90, 150, 900],          // low stock
    ["MK-ACC-BTN", "Mock Buttons 14mm", "accessory", "pcs", 8000, 1000, 2],
    ["MK-ACC-ZIP", "Mock Zipper 20cm", "accessory", "pcs", 500, 600, 18],             // low stock
    ["MK-ACC-LBL", "Mock Woven Labels", "accessory", "pcs", 6000, 1000, 3],
    ["MK-STK-SZ", "Mock Size Stickers", "sticker", "pcs", 10000, 2000, 1],
    ["MK-PKG-CTN", "Mock Export Cartons", "packaging", "pcs", 300, 100, 120],
  ] as const;
  const itemIds: Record<string, string> = {};
  for (const [sku, name, category, unit, qty, reorder, cost] of items) {
    const row = await must(`item ${sku}`, admin.from("inventory_items")
      .upsert({ sku, name, category, unit, quantity_on_hand: qty, reorder_level: reorder, unit_cost: cost }, { onConflict: "sku" })
      .select("id").single());
    itemIds[sku] = row.id;
  }

  // ---------- orders + batches ----------
  const orders = [
    ["MOCK-ORD-001", clients[0], "Crew-neck tees, 3 colours", 1200, 1440000, "in_production"],
    ["MOCK-ORD-002", clients[1], "Fleece hoodies", 600, 2100000, "in_production"],
    ["MOCK-ORD-003", clients[2], "Polo shirts", 800, 1120000, "shipped"],
    ["MOCK-ORD-004", clients[0], "Joggers (not priced yet)", 400, null, "pending"],
  ] as const;
  const orderIds: Record<string, string> = {};
  for (const [no, client, summary, qty, amount, status] of orders) {
    const row = await must(`order ${no}`, admin.from("orders").upsert(
      { order_number: no, client_id: client, product_summary: summary, quantity: qty, total_amount: amount, currency: "PKR", status: status as never },
      { onConflict: "order_number" }).select("id").single());
    orderIds[no] = row.id;
  }
  async function ensureBatch(style: string, order: string, qty: number, status: string) {
    const { data: found } = await admin.from("production_batches").select("id").eq("style_number", style).maybeSingle();
    if (found) return found.id as string;
    const row = await must(`batch ${style}`, admin.from("production_batches")
      .insert({ style_number: style, order_id: orderIds[order], total_quantity: qty, status, material_item_id: itemIds["MK-FAB-JER"] })
      .select("id").single());
    return row.id as string;
  }
  const b1 = await ensureBatch("MOCK-B1-TEE", "MOCK-ORD-001", 1200, "in_progress");
  const b2 = await ensureBatch("MOCK-B2-HOOD", "MOCK-ORD-002", 600, "in_progress");
  const b3 = await ensureBatch("MOCK-B3-POLO", "MOCK-ORD-003", 800, "completed");
  await admin.from("manager_batch_assignments").upsert({ manager_id: ids.manager, batch_id: b1 }, { onConflict: "manager_id,batch_id" });

  // ---------- pipeline progress ----------
  const now = new Date().toISOString();
  async function dept(batch: string, d: string, state: "closed" | "open" | "pending") {
    const w = workers[d] ?? workers.accessories;
    await must(`status ${d}`, admin.from("batch_department_status").upsert({
      batch_id: batch, department: d, opened_by: w, status: state === "closed" ? "closed" : "open",
      start_verification_status: state === "pending" ? "pending" : "accepted", end_enabled: state !== "pending",
      end_verification_status: state === "closed" ? "accepted" : "none", closed_at: state === "closed" ? now : null,
    }, { onConflict: "batch_id,department" }));
  }
  async function entry(batch: string, d: string, pcs: number, cost: number) {
    const { count } = await admin.from("department_entries").select("*", { count: "exact", head: true }).eq("batch_id", batch).eq("department", d);
    if (count) return;
    await must(`entry ${d}`, admin.from("department_entries").insert([
      { batch_id: batch, department: d, worker_id: workers[d], stage: "start", payload: { pcs, mock: true } },
      { batch_id: batch, department: d, worker_id: workers[d], stage: "end", payload: { pcs, mock: true }, total_cost: cost },
    ]));
  }
  // B1: accessories + cutting closed, printing open (worker on it)
  for (const d of ["accessories", "cutting"]) { await dept(b1, d, "closed"); await entry(b1, d, 1200, 0); }
  await dept(b1, "printing", "open");
  // B2: accessories started, waiting for admin verification (shows in Inbox)
  await dept(b2, "accessories", "pending");
  const { count: inboxCount } = await admin.from("worker_inbox_messages").select("*", { count: "exact", head: true }).eq("batch_id", b2);
  if (!inboxCount) await must("inbox", admin.from("worker_inbox_messages").insert({
    type: "batch_start_verification", status: "pending", batch_id: b2, department: "accessories", worker_id: workers.accessories,
    message: "MOCK: started accessories check for MOCK-B2-HOOD",
  }));
  // B3: whole pipeline closed + dispatched
  for (const d of ["accessories", "cutting", "printing", "quality", "stitching", "button_ops", "clipping", "press", "quality_final", "packing"]) {
    await dept(b3, d, "closed");
    await entry(b3, d, 800, ["stitching", "press", "packing", "quality"].includes(d) ? 800 * 8 : 0);
  }
  const { count: dCount } = await admin.from("batch_dispatches").select("*", { count: "exact", head: true }).eq("batch_id", b3);
  if (!dCount) await must("dispatch", admin.from("batch_dispatches").insert({ batch_id: b3, dispatch_date: now.slice(0, 10), carton_count: 40, carrier: "MOCK TCS Cargo" }));

  // ---------- finance (as real users, so maker-checker applies) ----------
  const { data: existingVendor } = await admin.from("vendors").select("id").eq("name", "MOCK Kapra House").maybeSingle();
  if (!existingVendor) await seedFinance(clients);
  else console.log("Finance mock data already present, skipped.");

  writeFileSync("mock-users.out.md", [
    "# Mock users (TEST project only — do not commit)", "",
    `Email accounts use the MOCK_PASSWORD from .env.staging. Workers sign in by phone: add each number below in the test project under Authentication → Providers → Phone → test phone numbers with a fixed OTP.`, "",
    "| key | name | login | roles | permissions |", "|---|---|---|---|---|", ...out, "",
  ].join("\n"));
  console.log("✔ Done. Logins written to mock-users.out.md");
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) fail(`sign in ${email}: ${error.message}`);
  return c;
}

async function seedFinance(clients: string[]) {
  const clerk = await signIn(`clerk@${DOMAIN}`);
  const checker = await signIn(`checker@${DOMAIN}`);
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const vendors = await must("vendors", clerk.from("vendors").insert([
    { name: "MOCK Kapra House", category: "fabric", contact_person: "Mock Contact", phone: "+923000001001", opening_balance: 150000 },
    { name: "MOCK Accessories Mart", category: "accessories", phone: "+923000001002", opening_balance: 0 },
    { name: "MOCK Print Works", category: "printing", opening_balance: 0 },
    { name: "MOCK Cargo Movers", category: "transport", opening_balance: 0 },
  ]).select("id, name"));
  const v = Object.fromEntries(vendors.map((x: { id: string; name: string }) => [x.name, x.id]));

  async function bill(vendor: string, no: string, date: string, due: string | null, lines: { d: string; item?: string; q: number; p: number }[]) {
    const b = await must(`bill ${no}`, clerk.from("vendor_bills").insert({ vendor_id: v[vendor], bill_no: no, bill_date: date, due_date: due }).select("id").single());
    await must(`lines ${no}`, clerk.from("vendor_bill_items").insert(lines.map((l) => ({ bill_id: b.id, description: l.d, quantity: l.q, unit_price: l.p, inventory_item_id: null }))));
    return b.id as string;
  }
  const bPosted = await bill("MOCK Kapra House", "MOCK-KH-101", day(-40), day(-10), [{ d: "Jersey 180gsm", q: 500, p: 640 }]);      // overdue
  const bPosted2 = await bill("MOCK Accessories Mart", "MOCK-AM-55", day(-12), day(18), [{ d: "Buttons 14mm", q: 5000, p: 2 }, { d: "Woven labels", q: 3000, p: 3 }]);
  await bill("MOCK Print Works", "MOCK-PW-9", day(-2), day(28), [{ d: "Front print", q: 1200, p: 35 }]);                           // stays draft

  async function approve(table: string, id: string) {
    const row = await must(`read ${table}`, checker.from(table as never).select("modified_at").eq("id", id).single()) as { modified_at: string };
    await must(`approve ${table}`, checker.rpc("post_finance_entry", { _table: table, _id: id, _expected_modified_at: row.modified_at }));
  }
  await approve("vendor_bills", bPosted);
  await approve("vendor_bills", bPosted2);

  const pay = await must("payment", clerk.from("vendor_payments").insert({ vendor_id: v["MOCK Kapra House"], bill_id: bPosted, amount: 120000, paid_on: day(-5), method: "bank", reference: "MOCK-TXN-1" }).select("id").single());
  await approve("vendor_payments", pay.id);
  await must("draft payment", clerk.from("vendor_payments").insert({ vendor_id: v["MOCK Accessories Mart"], amount: 10000, paid_on: day(0), method: "cash" }));

  const rc = await must("receipt", clerk.from("client_payments").insert({ client_id: clients[2], amount: 600000, received_on: day(-3), method: "bank", reference: "MOCK-LC-7" }).select("id").single());
  await approve("client_payments", rc.id);
  await must("draft receipt", clerk.from("client_payments").insert({ client_id: clients[0], amount: 300000, received_on: day(0), method: "cheque", reference: "MOCK-CHQ-12" }));

  for (const [cat, amt, d, post] of [["rent", 150000, -20, true], ["electricity", 86000, -8, true], ["transport", 12500, -1, false], ["repairs", 7000, 0, false]] as const) {
    const e = await must(`expense ${cat}`, clerk.from("expenses").insert({ category: cat, amount: amt, spent_on: day(d), method: "cash", paid_to: `MOCK ${cat} payee` }).select("id").single());
    if (post) await approve("expenses", e.id);
  }
  console.log("Finance: 4 vendors, 3 bills (2 posted, 1 draft), payments/receipts/expenses (posted + drafts).");
}

main().catch((e) => fail(String(e)));
