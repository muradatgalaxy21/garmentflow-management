// ---------------------------------------------------------------
// Admin Request Code Edge Function
//
// Step 1 of the secret admin signup flow. Generates a 6-digit
// code, stores it against the requester's email, and emails it
// to the fixed, hardcoded admin-approval address — never to the
// requester. Only someone with access to that inbox can complete
// an admin signup.
// ---------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fixed approval inbox — codes are only ever sent here, never to the requester.
const ADMIN_APPROVAL_EMAIL = "muradatgalaxy21@gmail.com";
const CODE_TTL_MINUTES = 10;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, fullName: rawFullName } = await req.json();
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Trim, cap length, and strip control/non-printable characters before
    // this ever reaches the DB or gets interpolated into the email body.
    const fullName = typeof rawFullName === "string"
      ? rawFullName.trim().slice(0, 100).replace(/[\x00-\x1F\x7F]/g, "")
      : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // CSPRNG, not Math.random() — this code gates admin account creation.
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const code = String(buf[0] % 1_000_000).padStart(6, "0");
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("admin_access_codes").insert({
      requester_email: email,
      requester_name: fullName ?? null,
      code,
      expires_at: expiresAt,
    });
    if (insertError) throw new Error(insertError.message);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "En En Garments Security <onboarding@resend.dev>",
          to: [ADMIN_APPROVAL_EMAIL],
          subject: "Admin signup access code requested",
          html: `
            <p>An admin account signup was requested.</p>
            <p><strong>Requester:</strong> ${escapeHtml(fullName ?? "(no name given)")} &lt;${escapeHtml(email)}&gt;</p>
            <p><strong>Access code:</strong> <span style="font-size:20px;letter-spacing:2px">${code}</span></p>
            <p>This code expires in ${CODE_TTL_MINUTES} minutes. If you did not expect this request, ignore this email — the code will simply expire.</p>
          `,
        }),
      });
      if (!res.ok) {
        console.error("Resend send failed", await res.text());
      }
    } else {
      console.error("RESEND_API_KEY not set — code not emailed:", code);
    }

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
