-- ============================================================
-- FIX: profiles.client_activated authorization bypass
--
-- "Users update own profile" (20260417111448) lets any authenticated
-- user UPDATE their own profiles row with no column restriction — RLS
-- is row-level, not column-level. That means a client could self-set
-- client_activated = true directly from the browser client, completely
-- skipping the §7 passcode redemption gate.
--
-- RLS can't restrict individual columns, so lock client_activated with
-- a trigger: revert it to the old value unless the caller is admin/staff,
-- or the call is running as service-role (redeem-client-code / the
-- handle_new_user trigger both use the service-role client with no
-- caller JWT forwarded, so auth.uid() is NULL in that context).
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_client_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_activated IS DISTINCT FROM OLD.client_activated THEN
    IF auth.uid() IS NOT NULL
       AND NOT public.has_role(auth.uid(), 'admin')
       AND NOT public.has_role(auth.uid(), 'staff')
    THEN
      NEW.client_activated := OLD.client_activated;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_client_activated ON public.profiles;
CREATE TRIGGER guard_client_activated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_client_activated();
