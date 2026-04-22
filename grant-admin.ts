import { createClient } from "@supabase/supabase-js";

/**
 * One-time script to grant admin role to a specific user by email.
 *
 * Usage:
 *   npx tsx --env-file=.env grant-admin.ts
 *
 * To grant a DIFFERENT email, pass it as an arg:
 *   npx tsx --env-file=.env grant-admin.ts someone@example.com
 */

const TARGET_EMAIL = process.argv[2] ?? "tikkamasala286@gmail.com";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be in your .env file.");
  process.exit(1);
}

// Note: the anon key cannot directly query auth.users.
// We use the Supabase admin API via the service role key if available,
// otherwise we fall back to the Dashboard SQL approach guide below.
const supabase = createClient(supabaseUrl, supabaseKey);

async function grantAdmin() {
  console.log(`Attempting to grant admin role to: ${TARGET_EMAIL}`);
  console.log("---------------------------------------------------");
  console.log("IMPORTANT: This script cannot directly promote a user via the anon key.");
  console.log("You have two options:\n");
  console.log("OPTION 1 — Run this SQL in your Supabase Dashboard (SQL Editor):");
  console.log("---------------------------------------------------------------------");
  console.log(`
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = '${TARGET_EMAIL}'
ON CONFLICT (user_id, role) DO NOTHING;
  `);
  console.log("---------------------------------------------------------------------");
  console.log("\nOPTION 2 — Use a VITE_SUPABASE_SERVICE_ROLE_KEY in your .env:");
  console.log("Add VITE_SUPABASE_SERVICE_ROLE_KEY=<your service role key> to .env,");
  console.log("then this script will run the promotion automatically.\n");

  // If a service role key is present, run the promotion automatically
  const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.log("No service role key found. Please use Option 1 above (recommended for security).");
    return;
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 1: look up the user by email
  const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    return;
  }

  const target = usersData.users.find((u) => u.email === TARGET_EMAIL);
  if (!target) {
    console.error(`No user found with email: ${TARGET_EMAIL}`);
    console.error("The user must create an account first before you can assign a role.");
    return;
  }

  // Step 2: insert the admin role record
  const { error: insertErr } = await adminClient
    .from("user_roles")
    .insert({ user_id: target.id, role: "admin" });

  if (insertErr && !insertErr.message.includes("duplicate")) {
    console.error("Failed to insert role:", insertErr.message);
    return;
  }

  console.log(`Admin role successfully granted to ${TARGET_EMAIL} (user ID: ${target.id})`);
  console.log("The user needs to log out and back in for the new role to take effect.");
}

grantAdmin();
