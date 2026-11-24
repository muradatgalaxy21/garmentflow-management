// ---------------------------------------------------------------
// Shared transactional email sender (plan.md §9.2).
//
// One place for every edge function that needs to send an email
// (client passcode, manager notifications, ...). Uses the Resend
// REST API directly via fetch — no SDK dependency needed for one
// POST call.
//
// RESEND_API_KEY not set (not configured yet, see progress.md) =>
// stub: log to console and return { ok: true, sent: false } so
// callers keep working (admin relays codes manually) until the key
// is added as a Supabase Edge Function secret.
// ---------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "En En Garments <onboarding@resend.dev>";

export async function sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
  if (!RESEND_API_KEY) {
    console.log(`[send-email] STUBBED (no RESEND_API_KEY) to ${to}: ${subject}\n${html}`);
    return { sent: false };
  }

  // Resend rate-limits per team (429). One alert fans out to every staff
  // user at once, so retry with jittered backoff instead of dropping mail.
  // ponytail: in-request retry only; a queue if staff count outgrows it.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (res.status !== 429 || attempt >= 4) break;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1) + Math.random() * 500));
  }

  if (!res.ok) {
    console.error(`[send-email] Resend API error ${res.status}: ${await res.text()}`);
    return { sent: false };
  }
  return { sent: true };
}
