import { createClient } from "@supabase/supabase-js";

/**
 * Bulk-create test worker/client accounts for manual QA.
 *
 * Usage:
 *   npx tsx --env-file=.env seed-test-users.ts --workers=5 --clients=3
 *
 * Requires VITE_SUPABASE_SERVICE_ROLE_KEY in .env (Supabase dashboard ->
 * Project Settings -> API -> service_role key). Never commit that key.
 *
 * Prints email/password pairs to stdout and to seed-test-users.out.json.
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env.");
  process.exit(1);
}

const DEPARTMENTS = ["accessories", "cutting", "sticker", "printing", "embroidery"] as const;

function argNum(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? Number(arg.split("=")[1]) : fallback;
}

const workerCount = argNum("workers", 5);
const clientCount = argNum("clients", 3);
const runId = Date.now().toString(36);

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createUser(opts: {
  email: string;
  password: string;
  fullName: string;
  requestedRole: "worker" | "client";
  extra?: Record<string, unknown>;
}) {
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName, requested_role: opts.requestedRole },
  });
  if (error || !data.user) {
    throw new Error(`${opts.email}: ${error?.message ?? "unknown error"}`);
  }
  if (opts.extra) {
    const { error: updateError } = await admin.from("profiles").update(opts.extra).eq("id", data.user.id);
    if (updateError) throw new Error(`${opts.email} profile update: ${updateError.message}`);
  }
  return { email: opts.email, password: opts.password, id: data.user.id, role: opts.requestedRole };
}

async function main() {
  const created: Array<{ email: string; password: string; id: string; role: string }> = [];

  for (let i = 1; i <= workerCount; i++) {
    const dept = DEPARTMENTS[(i - 1) % DEPARTMENTS.length];
    const email = `test-worker-${runId}-${i}@example.test`;
    const user = await createUser({
      email,
      password: "TestPass123!",
      fullName: `Test Worker ${i}`,
      requestedRole: "worker",
      extra: { department: dept },
    });
    created.push(user);
    console.log(`worker  ${email}  dept=${dept}`);
  }

  for (let i = 1; i <= clientCount; i++) {
    const email = `test-client-${runId}-${i}@example.test`;
    const user = await createUser({
      email,
      password: "TestPass123!",
      fullName: `Test Client ${i}`,
      requestedRole: "client",
    });
    created.push(user);
    console.log(`client  ${email}`);
  }

  const fs = await import("fs");
  fs.writeFileSync("seed-test-users.out.json", JSON.stringify(created, null, 2));
  console.log(`\nDone. ${created.length} accounts written to seed-test-users.out.json (all password: TestPass123!)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
