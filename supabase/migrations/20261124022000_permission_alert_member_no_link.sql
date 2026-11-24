-- IMP-13 follow-up (user decision 2026-11-24): the member's own
-- "Permissions changed" alert has no link. Members usually lack employees.view,
-- so /admin/employees showed "No access". Admins keep the link.
CREATE OR REPLACE FUNCTION public.log_permission_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  granted BOOLEAN := TG_OP = 'INSERT';
  actor UUID := auth.uid();
  actor_name TEXT := coalesce(public.person_name(auth.uid()), 'System');
  admins UUID[] := public.users_with_roles(ARRAY['admin']::public.app_role[]);
  changes JSONB;
  r RECORD;
  title TEXT;
  body TEXT;
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

    title := 'Permissions changed: ' || coalesce(public.person_name(r.user_id), 'deleted user');
    body := actor_name || CASE WHEN granted THEN ' granted: ' ELSE ' removed: ' END || array_to_string(r.perms, ', ');
    PERFORM public.notify_users(admins, 'permission_change', title, body, '/admin/employees');
    IF NOT r.user_id = ANY(admins) THEN
      PERFORM public.notify_users(ARRAY[r.user_id], 'permission_change', title, body, NULL);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
