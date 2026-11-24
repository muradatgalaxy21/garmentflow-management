-- BUG-4 / IMP-10 / IMP-13 (docs/TESTING-CHECKLIST.md, user decisions 2026-11-24):
-- * user_notifications: one row per person. Shown in the admin header bell,
--   regardless of section permissions. Each insert is emailed through the
--   send-notification-email edge function (pg_net + two Vault secrets, below).
-- * New RFQ / new client direct order -> every admin, manager and staff user.
--   pending_request_alerts() feeds the red banner on every admin page until the
--   RFQ leaves 'new' / the order leaves 'pending'.
-- * Every permission grant or removal -> permanent permission_change_log row,
--   and a notification to every admin (including the one who changed it) and
--   to the member.
--
-- One-time setup per project (test done 2026-11-24; live still to do):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-notification-email', 'notify_function_url');
--   select vault.create_secret('<random>', 'notify_webhook_secret');
--   supabase secrets set NOTIFY_WEBHOOK_SECRET=<same random>
-- Without the Vault secrets, notifications still appear in-app; no email is sent.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================
-- 1. Per-person notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('new_rfq', 'new_order', 'permission_change')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_notifications_user_created ON public.user_notifications (user_id, created_at DESC);
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications" ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Mark own notifications read" ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- No INSERT/DELETE policies: rows come only from the SECURITY DEFINER triggers below.

-- Only read_at may change from the client.
REVOKE UPDATE ON public.user_notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.user_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_users(_user_ids UUID[], _kind TEXT, _title TEXT, _body TEXT, _link TEXT)
RETURNS VOID LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.user_notifications (user_id, kind, title, body, link)
  SELECT DISTINCT u, _kind, _title, _body, _link FROM unnest(_user_ids) AS u
  WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = u) -- skips a member being deleted
$$;
REVOKE EXECUTE ON FUNCTION public.notify_users(UUID[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.users_with_roles(_roles public.app_role[])
RETURNS UUID[] LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT user_id), '{}') FROM public.user_roles WHERE role = ANY(_roles)
$$;
REVOKE EXECUTE ON FUNCTION public.users_with_roles(public.app_role[]) FROM PUBLIC, anon, authenticated;

-- Email leg: hand each new row to the edge function.
CREATE OR REPLACE FUNCTION public.email_user_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fn_url TEXT; secret TEXT;
BEGIN
  SELECT decrypted_secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'notify_function_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'notify_webhook_secret';
  IF fn_url IS NOT NULL AND secret IS NOT NULL THEN
    PERFORM net.http_post(
      url := fn_url,
      body := jsonb_build_object('id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret)
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER email_user_notification AFTER INSERT ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.email_user_notification();

-- ============================================================
-- 2. New RFQ / client direct order alerts (BUG-4, IMP-10)
-- ============================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS placed_by_client BOOLEAN NOT NULL DEFAULT false;

-- Orders the client placed themselves (not staff-entered ones).
CREATE OR REPLACE FUNCTION public.mark_client_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.placed_by_client := auth.uid() IS NOT NULL AND auth.uid() = NEW.client_id
                          AND NOT public.has_permission(auth.uid(), 'orders.create');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mark_client_order ON public.orders;
CREATE TRIGGER mark_client_order BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.mark_client_order();

-- Client direct orders placed before this migration.
UPDATE public.orders o SET placed_by_client = true
WHERE EXISTS (SELECT 1 FROM public.order_updates u WHERE u.order_id = o.id AND u.note LIKE 'Direct Order created by client%');

CREATE OR REPLACE FUNCTION public.alert_new_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE staff UUID[] := public.users_with_roles(ARRAY['admin', 'manager', 'staff']::public.app_role[]);
BEGIN
  IF TG_TABLE_NAME = 'rfqs' THEN
    PERFORM public.notify_users(staff, 'new_rfq',
      'New RFQ from ' || coalesce(NULLIF(NEW.company, ''), NEW.name),
      concat_ws(' · ', NEW.product_type, NULLIF(NEW.quantity, '') || ' pcs', left(NEW.message, 200)),
      '/admin/rfqs');
  ELSIF NEW.placed_by_client THEN
    PERFORM public.notify_users(staff, 'new_order',
      'New client order ' || NEW.order_number || coalesce(' from ' || NULLIF(NEW.party_name, ''), ''),
      NEW.product_summary || ' · ' || NEW.quantity || ' pcs',
      '/admin/orders');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS alert_new_rfq ON public.rfqs;
CREATE TRIGGER alert_new_rfq AFTER INSERT ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION public.alert_new_request();
DROP TRIGGER IF EXISTS alert_new_client_order ON public.orders;
CREATE TRIGGER alert_new_client_order AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.alert_new_request();

-- Banner data for every admin-portal user, whatever their section permissions.
-- Only what the banner shows: no client contact details.
CREATE OR REPLACE FUNCTION public.pending_request_alerts()
RETURNS TABLE (kind TEXT, id UUID, label TEXT, created_at TIMESTAMPTZ)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    SELECT 'rfq'::TEXT, r.id, coalesce(NULLIF(r.company, ''), r.name), r.created_at
    FROM public.rfqs r WHERE r.status = 'new'
    UNION ALL
    SELECT 'order', o.id, o.order_number || coalesce(' · ' || NULLIF(o.party_name, ''), ''), o.created_at
    FROM public.orders o WHERE o.placed_by_client AND o.status = 'pending'
  ) a
  WHERE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'staff'))
  ORDER BY 4
$$;

-- ============================================================
-- 3. Permission change history + alerts (IMP-13)
-- ============================================================
-- Permanent: no FK (survives user deletion), names snapshotted, no write policies.
CREATE TABLE IF NOT EXISTS public.permission_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_name TEXT,
  permission TEXT NOT NULL,
  old_value BOOLEAN NOT NULL,
  new_value BOOLEAN NOT NULL,
  changed_by UUID,
  changed_by_name TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permission_change_log_user ON public.permission_change_log (user_id, changed_at DESC);
ALTER TABLE public.permission_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and the member view permission history" ON public.permission_change_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.person_name(_id UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(NULLIF(full_name, ''), email, phone, 'Unknown') FROM public.profiles WHERE id = _id
$$;
REVOKE EXECUTE ON FUNCTION public.person_name(UUID) FROM PUBLIC, anon, authenticated;

-- Statement-level: one history batch + one alert per member per save.
CREATE OR REPLACE FUNCTION public.log_permission_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  granted BOOLEAN := TG_OP = 'INSERT';
  actor UUID := auth.uid();
  actor_name TEXT := coalesce(public.person_name(auth.uid()), 'System');
  changes JSONB;
  r RECORD;
BEGIN
  -- Only the transition table for this event exists.
  IF granted THEN
    SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'permission', permission)) INTO changes FROM new_rows;
  ELSE
    SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'permission', permission)) INTO changes FROM old_rows;
  END IF;
  FOR r IN
    SELECT (c ->> 'user_id')::UUID AS user_id, array_agg(c ->> 'permission' ORDER BY c ->> 'permission') AS perms
    FROM jsonb_array_elements(coalesce(changes, '[]')) c
    GROUP BY 1
  LOOP
    INSERT INTO public.permission_change_log (user_id, user_name, permission, old_value, new_value, changed_by, changed_by_name)
    SELECT r.user_id, public.person_name(r.user_id), p, NOT granted, granted, actor, actor_name FROM unnest(r.perms) p;

    PERFORM public.notify_users(
      public.users_with_roles(ARRAY['admin']::public.app_role[]) || r.user_id,
      'permission_change',
      'Permissions changed: ' || coalesce(public.person_name(r.user_id), 'deleted user'),
      actor_name || CASE WHEN granted THEN ' granted: ' ELSE ' removed: ' END || array_to_string(r.perms, ', '),
      '/admin/employees');
  END LOOP;
  RETURN NULL;
END;
$$;
-- Transition tables need one trigger per event.
DROP TRIGGER IF EXISTS log_permission_grants ON public.user_permissions;
CREATE TRIGGER log_permission_grants AFTER INSERT ON public.user_permissions
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.log_permission_changes();
DROP TRIGGER IF EXISTS log_permission_removals ON public.user_permissions;
CREATE TRIGGER log_permission_removals AFTER DELETE ON public.user_permissions
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.log_permission_changes();
