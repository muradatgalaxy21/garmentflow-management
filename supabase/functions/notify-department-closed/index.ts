// ---------------------------------------------------------------
// Notify Department Closed Edge Function
//
// Manager email notifications (plan.md §9.2, §11.3). Every insert
// into `admin_notifications` (high_waste, missing_rate,
// batch_completed, missing_department_rate) already shows up
// in-app via NotificationBell. This function is the email leg:
// it emails every admin/manager profile.
//
// Trigger: Supabase Dashboard -> Database -> Webhooks -> INSERT on
// public.admin_notifications -> HTTP request to this function's URL,
// with a custom header "x-webhook-secret: <NOTIFY_WEBHOOK_SECRET>".
// Not wired as a SQL trigger because it needs this project's own
// function URL + secret, which aren't known at migration-write time —
// same one-time dashboard step already deferred for RESEND_API_KEY
// (see issue-client-code). Without NOTIFY_WEBHOOK_SECRET configured as
// an edge function secret, this endpoint refuses every request — it
// must not be left open, since it emails every admin/manager with
// caller-supplied title/message.
// ---------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("NOTIFY_WEBHOOK_SECRET");
    const suppliedSecret = req.headers.get("x-webhook-secret") ?? "";
    if (!webhookSecret || !timingSafeEqual(suppliedSecret, webhookSecret)) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Database Webhook payload shape: { type: "INSERT", table, record, ... }
    const body = await req.json();
    const record = body.record ?? body;
    const { title, message } = record as { title: string; message: string };
    if (!title || !message) {
      return new Response(JSON.stringify({ error: "Missing title/message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRows } = await admin.from("user_roles").select("user_id").in("role", ["admin", "manager"]);
    const userIds = [...new Set((roleRows ?? []).map((r) => r.user_id))];
    const { data: profileRows } = await admin.from("profiles").select("email").in("id", userIds);
    const emails = [...new Set((profileRows ?? []).map((p) => p.email).filter(Boolean))];
    for (const to of emails) {
      await sendEmail(to as string, `[En En Garments] ${title}`, `<p>${message}</p>`);
    }

    return new Response(JSON.stringify({ ok: true, notified: emails.length }), {
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
