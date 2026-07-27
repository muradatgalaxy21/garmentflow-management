// ---------------------------------------------------------------
// Admin Verify Signup Edge Function
//
// Step 2 of the secret admin signup flow. Checks the code emailed
// to the fixed approval inbox, and if it matches and is unexpired,
// creates the user directly with the service role and grants the
// 'admin' role. This is the ONLY path that can ever grant 'admin' —
// the public signup trigger never assigns it.
// ---------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, fullName: rawFullName, code } = await req.json();
    if (!email || !password || !code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Email, password, and code are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fullName = typeof rawFullName === "string"
      ? rawFullName.trim().slice(0, 100).replace(/[\x00-\x1F\x7F]/g, "")
      : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Look up the latest pending code for this email regardless of the
    // submitted value, so wrong guesses can be counted against it — a
    // lookup keyed on (email, code) together would let an attacker probe
    // codes with zero attempt tracking.
    const { data: codeRow, error: codeError } = await supabase
      .from("admin_access_codes")
      .select("id, code, expires_at, used, attempts")
      .eq("requester_email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError || !codeRow) {
      return new Response(JSON.stringify({ error: "Invalid code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (codeRow.used) {
      return new Response(JSON.stringify({ error: "Code already used or locked — request a new one" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(codeRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Code expired — request a new one" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (codeRow.code !== code) {
      const attempts = codeRow.attempts + 1;
      const MAX_ATTEMPTS = 5;
      await supabase
        .from("admin_access_codes")
        .update({ attempts, used: attempts >= MAX_ATTEMPTS })
        .eq("id", codeRow.id);
      const message = attempts >= MAX_ATTEMPTS
        ? "Too many wrong attempts — code locked, request a new one"
        : "Invalid code";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? null },
    });
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? "Failed to create account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The signup trigger already gave this user 'client' — replace it with 'admin'.
    await supabase.from("user_roles").delete().eq("user_id", created.user.id).eq("role", "client");
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "admin" });
    if (roleError) throw new Error(roleError.message);

    await supabase.from("admin_access_codes").update({ used: true }).eq("id", codeRow.id);

    return new Response(JSON.stringify({ ok: true }), {
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
