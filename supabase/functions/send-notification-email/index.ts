// ---------------------------------------------------------------
// Email leg of user_notifications (BUG-4 / IMP-10 / IMP-13).
// Called by the email_user_notification trigger through pg_net with
// { id } and the x-webhook-secret header (Vault secret
// notify_webhook_secret = edge secret NOTIFY_WEBHOOK_SECRET).
// Sends the notification to its user's email (profiles.email, else the
// auth email) and stamps emailed_at. Phone-only users get in-app only.
// Without RESEND_API_KEY, sendEmail only logs (see _shared/email.ts).
// ---------------------------------------------------------------
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email.ts";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  const secret = Deno.env.get("NOTIFY_WEBHOOK_SECRET");
  if (!secret || !timingSafeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) {
    return json({ error: "Not authorized" }, 403);
  }
  try {
    const { id } = await req.json();
    if (typeof id !== "string") return json({ error: "Missing id" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: n } = await admin.from("user_notifications").select("id, user_id, title, body, link, emailed_at").eq("id", id).maybeSingle();
    if (!n) return json({ error: "Not found" }, 404);
    if (n.emailed_at) return json({ ok: true, skipped: "already emailed" });

    const { data: profile } = await admin.from("profiles").select("email").eq("id", n.user_id).maybeSingle();
    let to = profile?.email as string | null | undefined;
    if (!to) to = (await admin.auth.admin.getUserById(n.user_id)).data.user?.email;
    if (!to) return json({ ok: true, skipped: "no email" });

    const site = Deno.env.get("SITE_URL") ?? "https://enengarments.com";
    const link = n.link ? `<p><a href="${site}${escapeHtml(n.link)}">Open in the portal</a></p>` : "";
    const { sent } = await sendEmail(to, `[En En Garments] ${n.title}`, `<p>${escapeHtml(n.body)}</p>${link}`);
    if (sent) await admin.from("user_notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id);
    return json({ ok: true, sent });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
