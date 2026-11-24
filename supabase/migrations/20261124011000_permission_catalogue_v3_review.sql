-- Security review of 20261124010000_permission_catalogue_v3.sql:
-- 1. payroll.manage could change the holder's own pay or an admin's pay.
--    Only admins may; everyone else edits other non-admin, non-client staff.
-- 2. pipeline.view was aliased to batches.view inside has_any_permission, which
--    also opened every other batches.view-gated policy (profiles, user_roles,
--    notifications). The alias is removed; the tables the Pipeline Status page
--    reads accept pipeline.view explicitly instead.

DROP POLICY IF EXISTS "Payroll add pay" ON public.employee_pay;
DROP POLICY IF EXISTS "Payroll change pay" ON public.employee_pay;
DROP POLICY IF EXISTS "Payroll remove pay" ON public.employee_pay;
CREATE OR REPLACE FUNCTION public.can_manage_pay_of(_target UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR (public.has_permission(auth.uid(), 'payroll.manage')
          AND _target <> auth.uid()
          AND NOT public.has_role(_target, 'admin')
          AND NOT public.has_role(_target, 'client'))
$$;
CREATE POLICY "Payroll add pay" ON public.employee_pay FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_pay_of(user_id));
CREATE POLICY "Payroll change pay" ON public.employee_pay FOR UPDATE TO authenticated
  USING (public.can_manage_pay_of(user_id)) WITH CHECK (public.can_manage_pay_of(user_id));
CREATE POLICY "Payroll remove pay" ON public.employee_pay FOR DELETE TO authenticated
  USING (public.can_manage_pay_of(user_id));

CREATE OR REPLACE FUNCTION public.has_any_permission(_user_id UUID, _permissions TEXT[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH g AS (
    SELECT split_part(permission, '.', 1) AS s, split_part(permission, '.', 2) AS a
    FROM public.user_permissions WHERE user_id = _user_id
  ), g2 AS (
    SELECT s, a FROM g
    UNION SELECT regexp_replace(s, '^(finance|inbox)_.*$', '\1'), a FROM g
  )
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM g2 WHERE s || '.' || a = ANY(_permissions) OR s || '.view' = ANY(_permissions))
$$;

-- Pipeline Status page reads (production_bundles and batch_department_status
-- are already readable by every signed-in user).
DROP POLICY IF EXISTS "Perm view batches" ON public.production_batches;
CREATE POLICY "Perm view batches" ON public.production_batches FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.view', 'pipeline.view', 'orders.view', 'dispatch.view', 'employees.view', 'rfqs.view', 'inventory.view']));
DROP POLICY IF EXISTS "Perm view dispatches" ON public.batch_dispatches;
CREATE POLICY "Perm view dispatches" ON public.batch_dispatches FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['dispatch.view', 'batches.view', 'pipeline.view']));
DROP POLICY IF EXISTS "Workers view own department entries" ON public.department_entries;
CREATE POLICY "Workers view own department entries" ON public.department_entries FOR SELECT TO authenticated
  USING (worker_id = auth.uid()
         OR public.has_any_permission(auth.uid(), ARRAY['batches.view', 'pipeline.view', 'employees.view', 'orders.view', 'dispatch.view']));
DROP POLICY IF EXISTS "Perm view inventory" ON public.inventory_items;
CREATE POLICY "Perm view inventory" ON public.inventory_items FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['inventory.view', 'batches.view', 'pipeline.view', 'finance.view']));
DROP POLICY IF EXISTS "Clients view own orders" ON public.orders;
CREATE POLICY "Clients view own orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = client_id
         OR public.has_any_permission(auth.uid(), ARRAY['orders.view', 'batches.view', 'pipeline.view', 'rfqs.view', 'finance.view']));
