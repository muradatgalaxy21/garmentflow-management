-- Security review fix (2026-11-21) on 20261121010000_granular_permissions.sql:
-- profile updates were allowed for employees.update OR clients.update on ANY row.
-- Now each permission only reaches its own kind of profile, admin profiles stay
-- out of reach, and pay/HR fields can only change with employees.update
-- (this also closes the older hole where "Users update own profile" let a
-- worker raise their own salary or piece rate).

DROP POLICY IF EXISTS "Perm update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Perm update employee profiles" ON public.profiles;
DROP POLICY IF EXISTS "Perm update client profiles" ON public.profiles;

CREATE POLICY "Perm update employee profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'employees.update')
         AND NOT public.has_role(id, 'admin') AND NOT public.has_role(id, 'client'))
  WITH CHECK (public.has_permission(auth.uid(), 'employees.update')
              AND NOT public.has_role(id, 'admin') AND NOT public.has_role(id, 'client'));

CREATE POLICY "Perm update client profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'clients.update') AND public.has_role(id, 'client'))
  WITH CHECK (public.has_permission(auth.uid(), 'clients.update') AND public.has_role(id, 'client'));

-- Pay/HR fields: silently keep old values unless the caller holds employees.update
-- (admin passes). Service-role calls (edge functions, no auth.uid()) are trusted,
-- same as guard_client_activated.
CREATE OR REPLACE FUNCTION public.guard_profile_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'employees.update') THEN
    NEW.department := OLD.department;
    NEW.sub_department := OLD.sub_department;
    NEW.wage_type := OLD.wage_type;
    NEW.base_salary := OLD.base_salary;
    NEW.default_piece_rate := OLD.default_piece_rate;
    NEW.skills := OLD.skills;
    NEW.employee_id := OLD.employee_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- Security review fix #2: batch-linked rows follow the batch scope.
-- Managers only see/edit batches assigned to them (has_batch_access is true
-- for admin/staff), so every table keyed by batch_id gets the same check.
-- ============================================================

DROP POLICY IF EXISTS "Perm manage rates" ON public.batch_phase_rates;
CREATE POLICY "Perm manage rates" ON public.batch_phase_rates FOR ALL TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']) AND public.has_batch_access(auth.uid(), batch_id))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']) AND public.has_batch_access(auth.uid(), batch_id));

DROP POLICY IF EXISTS "Perm manage panel rates" ON public.batch_phase_panel_rates;
CREATE POLICY "Perm manage panel rates" ON public.batch_phase_panel_rates FOR ALL TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']) AND public.has_batch_access(auth.uid(), batch_id))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']) AND public.has_batch_access(auth.uid(), batch_id));

DROP POLICY IF EXISTS "Perm manage pack ratios" ON public.batch_pack_ratios;
CREATE POLICY "Perm manage pack ratios" ON public.batch_pack_ratios FOR ALL TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']) AND public.has_batch_access(auth.uid(), batch_id))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']) AND public.has_batch_access(auth.uid(), batch_id));

DROP POLICY IF EXISTS "Workers view own sessions" ON public.batch_worker_sessions;
DROP POLICY IF EXISTS "Perm manage sessions" ON public.batch_worker_sessions;
CREATE POLICY "Workers view own sessions" ON public.batch_worker_sessions FOR SELECT TO authenticated
  USING (worker_id = auth.uid()
         OR (public.has_permission(auth.uid(), 'batches.view') AND public.has_batch_access(auth.uid(), batch_id)));
CREATE POLICY "Perm manage sessions" ON public.batch_worker_sessions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'batches.update') AND public.has_batch_access(auth.uid(), batch_id))
  WITH CHECK (public.has_permission(auth.uid(), 'batches.update') AND public.has_batch_access(auth.uid(), batch_id));

DROP POLICY IF EXISTS "Workers view own tracking" ON public.batch_tracking;
DROP POLICY IF EXISTS "Perm delete tracking" ON public.batch_tracking;
CREATE POLICY "Workers view own tracking" ON public.batch_tracking FOR SELECT TO authenticated
  USING (worker_id = auth.uid()
         OR (public.has_any_permission(auth.uid(), ARRAY['batches.view', 'employees.view', 'orders.view'])
             AND public.has_batch_access(auth.uid(), batch_id)));
CREATE POLICY "Perm delete tracking" ON public.batch_tracking FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'batches.delete') AND public.has_batch_access(auth.uid(), batch_id));

DROP POLICY IF EXISTS "Perm update batch department status" ON public.batch_department_status;
DROP POLICY IF EXISTS "Perm delete batch department status" ON public.batch_department_status;
CREATE POLICY "Perm update batch department status" ON public.batch_department_status FOR UPDATE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox.update', 'employees.delete']) AND public.has_batch_access(auth.uid(), batch_id))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox.update', 'employees.delete']) AND public.has_batch_access(auth.uid(), batch_id));
CREATE POLICY "Perm delete batch department status" ON public.batch_department_status FOR DELETE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox.update', 'employees.delete']) AND public.has_batch_access(auth.uid(), batch_id));

DROP POLICY IF EXISTS "Perm view dispatches" ON public.batch_dispatches;
DROP POLICY IF EXISTS "Perm create dispatches" ON public.batch_dispatches;
DROP POLICY IF EXISTS "Perm update dispatches" ON public.batch_dispatches;
DROP POLICY IF EXISTS "Perm delete dispatches" ON public.batch_dispatches;
CREATE POLICY "Perm view dispatches" ON public.batch_dispatches FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['dispatch.view', 'batches.view']) AND public.has_batch_access(auth.uid(), batch_id));
CREATE POLICY "Perm create dispatches" ON public.batch_dispatches FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'dispatch.create') AND public.has_batch_access(auth.uid(), batch_id));
CREATE POLICY "Perm update dispatches" ON public.batch_dispatches FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'dispatch.update') AND public.has_batch_access(auth.uid(), batch_id))
  WITH CHECK (public.has_permission(auth.uid(), 'dispatch.update') AND public.has_batch_access(auth.uid(), batch_id));
CREATE POLICY "Perm delete dispatches" ON public.batch_dispatches FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'dispatch.delete') AND public.has_batch_access(auth.uid(), batch_id));

DROP POLICY IF EXISTS "Workers view own department entries" ON public.department_entries;
DROP POLICY IF EXISTS "Perm delete department entries" ON public.department_entries;
CREATE POLICY "Workers view own department entries" ON public.department_entries FOR SELECT TO authenticated
  USING (worker_id = auth.uid()
         OR (public.has_any_permission(auth.uid(), ARRAY['batches.view', 'employees.view', 'orders.view', 'dispatch.view'])
             AND public.has_batch_access(auth.uid(), batch_id)));
CREATE POLICY "Perm delete department entries" ON public.department_entries FOR DELETE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['employees.delete', 'batches.delete']) AND public.has_batch_access(auth.uid(), batch_id));

-- ============================================================
-- Security review fix #3: invite codes are one-time secrets; only people who
-- can issue or revoke them may read them.
-- ============================================================
DROP POLICY IF EXISTS "Perm view invite codes" ON public.client_invite_codes;
CREATE POLICY "Perm view invite codes" ON public.client_invite_codes FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['clients.create', 'orders.create', 'clients.update']));
