-- ============================================================
-- CLIENT PASSCODE-GATED PORTAL ACCESS (plan.md §7)
--
-- A client signup already gets the `client` role via handle_new_user,
-- but must not be able to use /client-portal until an admin-issued
-- one-time code (emailed after order confirmation) is redeemed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Activation flag on profiles
-- ------------------------------------------------------------
-- Defaults true so existing accounts (and worker/admin/staff signups,
-- which never go through this gate) are unaffected.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_activated BOOLEAN NOT NULL DEFAULT true;

-- New client signups start deactivated; every other requested_role stays active.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role TEXT := NEW.raw_user_meta_data ->> 'requested_role';
BEGIN
  INSERT INTO public.profiles (id, full_name, company, phone, email, client_activated)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'company',
    NEW.raw_user_meta_data ->> 'phone',
    NEW.email,
    CASE WHEN v_requested_role = 'worker' THEN true ELSE false END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN v_requested_role = 'worker' THEN 'worker'::app_role ELSE 'client'::app_role END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. client_invite_codes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'redeemed', 'revoked')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  redeemed_by UUID REFERENCES auth.users(id),
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_invite_codes ENABLE ROW LEVEL SECURITY;

-- Admin/staff manage codes. No client-facing SELECT policy: redemption goes
-- through the service-role edge function, never a direct client query
-- (the code must not be guessable/browsable via RLS).
CREATE POLICY "Admin/staff view invite codes" ON public.client_invite_codes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Admin/staff issue invite codes" ON public.client_invite_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Admin/staff revoke invite codes" ON public.client_invite_codes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE INDEX idx_client_invite_codes_status ON public.client_invite_codes(status);
CREATE INDEX idx_client_invite_codes_order ON public.client_invite_codes(order_id);
