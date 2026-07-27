# Progress Log

## 2026-07-27 16:52

## Done

### Branding
- Added real logo/favicon assets (`assets/en-en-garments-logo/`) into `public/`: favicon.ico, favicon.svg, favicon-16/32/512.png, apple-touch-icon.png, logo.svg, logo-white.svg, logo-mark.svg, logo.png, logo-white.png.
- Wired favicon `<link>` tags into `index.html`.
- Replaced "EEG" text-box logo placeholders with real `/logo-mark.svg`:
  - `src/components/layout/Header.tsx`
  - `src/components/layout/PortalLayout.tsx`
  - `src/pages/AuthPage.tsx`
- Fixed logo sizing (was clipped by fixed `w-8 h-8` square on a wide 1000x502 viewBox mark) — switched to `h-12 w-auto` / `h-16 w-auto` so aspect ratio holds.

### Role-based routing bug (employee landing on client portal)
Root causes found and fixed:
1. `AuthPage.tsx` — the "already logged in, skip form" `useEffect` always navigated to `/portal` regardless of role. Only the manual sign-in handler checked role. Extracted shared `resolveRoleTarget(userId, fallback)` and used it in both paths (worker → `/factory`, staff/admin → `/admin`, else fallback).
2. `Header.tsx` — "My Portal" nav link was hardcoded to `/portal` for any logged-in user. Since `/portal` route (`ProtectedRoute` with no `requireRoles`) allows any authenticated user in, a worker clicking that link landed in the client portal with no role check ever running. Fixed by deriving `portalPath` from `useAuth()` roles and using it for all 4 nav links (desktop/mobile × portal/profile). Removed the duplicate local supabase auth listener in favor of the shared `useAuth` hook.

### Verified
- `/factory` route (`requireRoles={["worker"]}`) correctly bounces an unauthenticated visitor to `/auth` with `state.from` set (confirmed via Playwright).
- `admin-create-worker` edge function (used by admin dashboard's "Create Employee Account" form in `ClientsPage.tsx`) correctly verifies caller is admin/staff before creating a user, and sets `requested_role: "worker"`.
- Full worker login → `/factory` redirect NOT yet verified end-to-end with a real login (blocked — see Blocked below).

## Blocked / Needs Attention

- **Signup rate-limited (429)** on the hosted Supabase project when testing worker signup via Playwright — hit Supabase's built-in email/signup rate limit. Could not create a fresh test worker account to finish an end-to-end login test. Need either:
  - A known worker test account (email+password) to log in with, or
  - Email confirmation disabled (see below) to reduce signup friction, or
  - Wait out the rate limit window.
- **Security finding (open)**: `supabase/functions/daily-summary/index.ts` uses the service-role client with no caller-auth/role check — anyone hitting the endpoint unauthenticated can read batch tracking data. Needs the same auth-header + admin/staff role check pattern already used in `admin-create-worker/index.ts`.

## Before Production

1. **Fix `daily-summary` edge function auth gap** (see above) — add caller JWT verification + admin/staff role check before touching the service-role client.
2. **Email verification**: currently must be disabled via Supabase Dashboard → Authentication → Sign In/Providers → Email → toggle off "Confirm email" (config.toml has no `[auth]` block since this is a hosted project, not local emulator — dashboard is the only way to change this pre-prod).
   - **Plan**: replace with phone OTP before going live. Requires:
     - Enable Phone provider + SMS gateway (Twilio/MessageBird/Vonage) in Dashboard.
     - Rework `AuthPage.tsx` sign-up/sign-in forms: phone field, OTP-entry step, swap `signUp`/`signInWithPassword` for `signInWithOtp({ phone })` + `verifyOtp()`.
     - Confirm `requested_role` metadata still flows through to the `handle_new_user` trigger.
3. **Re-enable/confirm email verification or OTP is actually active** before real users sign up in prod (currently disabled for dev testing — must not ship with it off unless OTP replaces it).
4. **Finish end-to-end worker login test** once a test account or disabled email confirmation unblocks it.
5. Review all `?? console.error` / silent failure paths added under time pressure — not yet audited.
