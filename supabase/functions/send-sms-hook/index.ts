// ---------------------------------------------------------------
// Supabase Auth "Send SMS" hook
//
// Supabase Auth calls this instead of Twilio/etc. whenever it needs to
// send a phone OTP. We forward the code to a local Pakistani SMS gateway.
//
// Secrets (supabase secrets set ...):
//   SEND_SMS_HOOK_SECRET  - "v1,whsec_..." shown when enabling the hook in
//                           Dashboard -> Authentication -> Hooks
//   SMS_GATEWAY_URL       - gateway HTTP send endpoint
//   SMS_GATEWAY_API_KEY   - gateway API key
//   SMS_SENDER_ID         - PTA-registered sender/mask
// ---------------------------------------------------------------

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  const payload = await req.text();
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");

  let user: { phone: string };
  let sms: { otp: string };
  try {
    ({ user, sms } = new Webhook(secret).verify(payload, Object.fromEntries(req.headers)) as {
      user: { phone: string };
      sms: { otp: string };
    });
  } catch {
    return json({ error: { http_code: 401, message: "Invalid hook signature" } }, 401);
  }

  // auth.users.phone is E.164 without '+', e.g. 923001234567.
  const to = user.phone.replace(/^\+/, "");
  const message = `Your En En Garments code is ${sms.otp}. Do not share it with anyone.`;

  // TODO(gateway): adjust to the chosen gateway's API (SendPK / Veevo Tech / Eocean...).
  const res = await fetch(Deno.env.get("SMS_GATEWAY_URL") ?? "", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: Deno.env.get("SMS_GATEWAY_API_KEY"),
      sender: Deno.env.get("SMS_SENDER_ID"),
      to,
      message,
    }),
  }).catch((e) => e as Error);

  if (res instanceof Error || !res.ok) {
    const detail = res instanceof Error ? res.message : `${res.status} ${await res.text()}`;
    console.error("SMS gateway failed:", detail);
    return json({ error: { http_code: 502, message: "Failed to send SMS" } }, 502);
  }
  return json({});
});
