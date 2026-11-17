-- Workers sign in by phone + SMS OTP. Phone-auth users have no email and
-- carry their number in auth.users.phone (E.164 without '+'), so store that
-- on the profile when signup metadata doesn't supply one.
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
    COALESCE(NEW.raw_user_meta_data ->> 'phone', NULLIF('+' || NEW.phone, '+')),
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
