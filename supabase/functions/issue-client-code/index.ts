// ---------------------------------------------------------------
// Issue Client Code Edge Function
//
// Admin/staff-only: generates a one-time client portal access code
// tied to an order (plan.md §7). Email delivery via Resend is NOT
// wired yet — this stubs the send (console.log) and returns the
// code in the response so the admin can relay it manually until a
// RESEND_API_KEY is configured. Swap the stub for a real Resend call
// (see §9.2 — same edge function should also serve manager email
// notifications once built) without changing the DB/UI contract.
// ---------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// CSPRNG with rejection sampling — Math.random() is not safe for an access
// code (predictable, guessable). Rejection sampling avoids modulo bias from
// alphabet.length (33) not evenly dividing 256.
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 ambiguity
  const limit = 256 - (256 % alphabet.length);
  let code = "";
  const buf = new Uint8Array(1);
  while (code.length < 8) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) code += alphabet[buf[0] % alphabet.length];
  }
  return code;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const roles = (callerRoles ?? []).map((r) => r.role);
    if (!roles.includes("admin") && !roles.includes("staff")) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { orderId, email, expiresInDays } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Recipient email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + (expiresInDays ?? 14) * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await admin.from("client_invite_codes").insert({
      code,
      order_id: orderId ?? null,
      email,
      created_by: caller.id,
      expires_at: expiresAt,
    });
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO(§9.2): replace with Resend send once RESEND_API_KEY is configured.
    console.log(`[issue-client-code] STUBBED EMAIL to ${email}: your access code is ${code} (expires ${expiresAt})`);

    return new Response(JSON.stringify({ ok: true, code, expiresAt, emailSent: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
