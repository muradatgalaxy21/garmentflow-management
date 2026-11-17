-- bundle_quality_status ran with the owner's (postgres) privileges, bypassing
-- RLS on bundle_quality_checks and exposing it to the anon role via REST.
-- security_invoker makes the view apply the caller's RLS instead.
ALTER VIEW public.bundle_quality_status SET (security_invoker = on);
