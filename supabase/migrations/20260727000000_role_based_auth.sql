-- ============================================================
-- ROLE-BASED AUTH
-- Migration: 20260727000000_role_based_auth.sql
--
-- 1. Self-serve signup now assigns 'worker' or 'client' based on
--    the role the user picked on /auth (never 'admin' — that only
--    happens through the admin-verify-signup edge function using
--    the service role key, after an email-code challenge).
-- 2. admin_access_codes: holds the one-time codes emailed to the
--    protected admin address for the secret admin signup flow.
--    RLS is enabled with NO policies, so only the service role
--    (edge functions) can touch it — anon/authenticated are denied.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role TEXT := NEW.raw_user_meta_data ->> 'requested_role';
BEGIN
  INSERT INTO public.profiles (id, full_name, company, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'company',
    NEW.raw_user_meta_data ->> 'phone'
  );

  -- Only 'worker' and 'client' can be self-selected at signup.
  -- Admin is never granted here, regardless of what a client sends.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN v_requested_role = 'worker' THEN 'worker'::app_role ELSE 'client'::app_role END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_email TEXT NOT NULL,
  requester_name TEXT,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  -- Wrong-guess counter; the row is locked (used=true) after 5 to stop brute-forcing.
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_access_codes ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge functions) can read/write this table.

CREATE INDEX idx_admin_codes_email ON public.admin_access_codes(requester_email, used);
