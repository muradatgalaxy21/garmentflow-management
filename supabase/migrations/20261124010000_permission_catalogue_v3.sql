-- IMP-3 / IMP-4 (docs/TESTING-CHECKLIST.md, user decisions 2026-11-24):
-- * Managers oversee departments, not assigned batches: batch-assignment
--   scoping is removed. What anyone can do comes only from permissions.
-- * Pay is split out of batch/employee permissions:
--     rates.manage   – piece rates per batch, cutting panel rates, department cost rates
--     payroll.view   – see salary / default piece rate / wage type
--     payroll.manage – change them
--   Pay fields move from profiles to employee_pay so payroll.view is enforced
--   by RLS (profiles stay readable with employees.view).
-- * New sections: pipeline (Pipeline Status page), inbox_workers / inbox_clients
--   (was one inbox), finance_vendors / finance_purchases (bills + vendor payments)
--   / finance_receivables (client payments) / finance_expenses / finance_reports
--   (read-only on all finance data).
-- Rates stay readable by every signed-in user: workers' entry forms price work from them.

-- ============================================================
-- 1. Drop manager batch-assignment scoping
-- ============================================================
-- has_batch_access() is still referenced by many batch-linked policies; it now
-- passes for everyone so those policies reduce to their permission check.
CREATE OR REPLACE FUNCTION public.has_batch_access(_user_id UUID, _batch_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$ SELECT true $$;

DROP TABLE IF EXISTS public.manager_batch_assignments;

-- ============================================================
-- 2. Permission keys
-- ============================================================
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_permission_check;

-- finance.X -> every finance area that has X; finance.view also -> reports.
INSERT INTO public.user_permissions (user_id, permission, granted_by, created_at)
SELECT up.user_id, area || '.' || split_part(up.permission, '.', 2), up.granted_by, up.created_at
FROM public.user_permissions up
CROSS JOIN unnest(ARRAY['finance_vendors', 'finance_purchases', 'finance_receivables', 'finance_expenses']) AS area
WHERE up.permission LIKE 'finance.%'
  AND NOT (area = 'finance_vendors' AND up.permission = 'finance.approve')
ON CONFLICT DO NOTHING;
INSERT INTO public.user_permissions (user_id, permission, granted_by, created_at)
SELECT user_id, 'finance_reports.view', granted_by, created_at FROM public.user_permissions WHERE permission = 'finance.view'
ON CONFLICT DO NOTHING;

-- inbox.X -> both inboxes.
INSERT INTO public.user_permissions (user_id, permission, granted_by, created_at)
SELECT up.user_id, box || '.' || split_part(up.permission, '.', 2), up.granted_by, up.created_at
FROM public.user_permissions up
CROSS JOIN unnest(ARRAY['inbox_workers', 'inbox_clients']) AS box
WHERE up.permission LIKE 'inbox.%'
ON CONFLICT DO NOTHING;

-- Keep today's access for non-managers: whoever could edit batches could set
-- rates, whoever could edit employees could set pay. Managers lose both (IMP-3).
INSERT INTO public.user_permissions (user_id, permission, granted_by, created_at)
SELECT up.user_id, m.new_key, up.granted_by, now()
FROM public.user_permissions up
JOIN (VALUES ('batches.update', 'rates.manage'),
             ('employees.update', 'payroll.view'), ('employees.update', 'payroll.manage'))
  AS m(old_key, new_key) ON m.old_key = up.permission
WHERE NOT public.has_role(up.user_id, 'manager')
ON CONFLICT DO NOTHING;

-- Batches viewers keep seeing the pipeline page.
INSERT INTO public.user_permissions (user_id, permission, granted_by, created_at)
SELECT user_id, 'pipeline.view', granted_by, now() FROM public.user_permissions WHERE permission = 'batches.view'
ON CONFLICT DO NOTHING;

DELETE FROM public.user_permissions WHERE permission LIKE 'finance.%' OR permission LIKE 'inbox.%';

ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_permission_check CHECK (permission IN (
  'rfqs.view', 'rfqs.update', 'rfqs.delete',
  'inbox_workers.view', 'inbox_workers.update',
  'inbox_clients.view', 'inbox_clients.update',
  'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
  'orders.view', 'orders.create', 'orders.update', 'orders.delete',
  'batches.view', 'batches.create', 'batches.update', 'batches.delete',
  'pipeline.view',
  'rates.manage',
  'dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete',
  'employees.view', 'employees.create', 'employees.update', 'employees.delete',
  'payroll.view', 'payroll.manage',
  'clients.view', 'clients.create', 'clients.update',
  'finance_vendors.view', 'finance_vendors.create', 'finance_vendors.update', 'finance_vendors.delete',
  'finance_purchases.view', 'finance_purchases.create', 'finance_purchases.update', 'finance_purchases.delete', 'finance_purchases.approve',
  'finance_receivables.view', 'finance_receivables.create', 'finance_receivables.update', 'finance_receivables.delete', 'finance_receivables.approve',
  'finance_expenses.view', 'finance_expenses.create', 'finance_expenses.update', 'finance_expenses.delete', 'finance_expenses.approve',
  'finance_reports.view'
));

-- Admin passes. Any action in a section implies its view.
-- Older policies ask for 'finance.X' / 'inbox.X' meaning "this action in any
-- finance area / either inbox" (e.g. finance users may read orders); those
-- keep working through the group alias below. Area-specific checks use the
-- area key. pipeline.view reads the same batch data as batches.view.
CREATE OR REPLACE FUNCTION public.has_any_permission(_user_id UUID, _permissions TEXT[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH g AS (
    SELECT split_part(permission, '.', 1) AS s, split_part(permission, '.', 2) AS a
    FROM public.user_permissions WHERE user_id = _user_id
  ), g2 AS (
    SELECT s, a FROM g
    UNION SELECT regexp_replace(s, '^(finance|inbox)_.*$', '\1'), a FROM g
    UNION SELECT 'batches', 'view' FROM g WHERE s = 'pipeline'
  )
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM g2 WHERE s || '.' || a = ANY(_permissions) OR s || '.view' = ANY(_permissions))
$$;

-- ============================================================
-- 3. Rates -> rates.manage
-- ============================================================
DROP POLICY IF EXISTS "Perm manage rates" ON public.batch_phase_rates;
CREATE POLICY "Perm manage rates" ON public.batch_phase_rates FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'rates.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'rates.manage'));
DROP POLICY IF EXISTS "Perm manage panel rates" ON public.batch_phase_panel_rates;
CREATE POLICY "Perm manage panel rates" ON public.batch_phase_panel_rates FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'rates.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'rates.manage'));
DROP POLICY IF EXISTS "Perm manage department rates" ON public.department_cost_rates;
CREATE POLICY "Perm manage department rates" ON public.department_cost_rates FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'rates.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'rates.manage'));

-- ============================================================
-- 4. Payroll: own table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_pay (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  wage_type TEXT NOT NULL DEFAULT 'piece_rate' CHECK (wage_type IN ('piece_rate', 'monthly_salary')),
  base_salary NUMERIC NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  default_piece_rate NUMERIC NOT NULL DEFAULT 0 CHECK (default_piece_rate >= 0),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_pay ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or payroll view pay" ON public.employee_pay FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'payroll.view'));
CREATE POLICY "Payroll add pay" ON public.employee_pay FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'payroll.manage') AND NOT public.has_role(user_id, 'client'));
CREATE POLICY "Payroll change pay" ON public.employee_pay FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'payroll.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'payroll.manage') AND NOT public.has_role(user_id, 'client'));
CREATE POLICY "Payroll remove pay" ON public.employee_pay FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'payroll.manage'));
CREATE TRIGGER update_employee_pay_updated_at BEFORE UPDATE ON public.employee_pay
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.employee_pay (user_id, wage_type, base_salary, default_piece_rate, updated_by)
SELECT p.id, coalesce(p.wage_type, 'piece_rate'), coalesce(p.base_salary, 0), coalesce(p.default_piece_rate, 0), NULL
FROM public.profiles p
WHERE NOT public.has_role(p.id, 'client')
ON CONFLICT (user_id) DO NOTHING;

-- Same guard as 20261121020000 minus the pay fields (now in employee_pay).
CREATE OR REPLACE FUNCTION public.guard_profile_department()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'employees.update') THEN
    NEW.department := OLD.department;
    NEW.sub_department := OLD.sub_department;
    NEW.skills := OLD.skills;
    NEW.employee_id := OLD.employee_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS wage_type,
  DROP COLUMN IF EXISTS base_salary,
  DROP COLUMN IF EXISTS default_piece_rate;

CREATE OR REPLACE FUNCTION public.finance_wage_totals(_from DATE, _to DATE)
RETURNS TABLE (piece_rate NUMERIC, monthly_salaries NUMERIC)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COALESCE(sum(total_cost), 0) FROM public.department_entries
      WHERE department IN ('sticker', 'quality', 'stitching', 'button_ops', 'clipping', 'press', 'quality_final', 'packing')
        AND created_at >= _from AND created_at < _to + 1),
    (SELECT COALESCE(sum(base_salary), 0) FROM public.employee_pay WHERE wage_type = 'monthly_salary')
  WHERE public.has_permission(auth.uid(), 'finance_reports.view')
$$;

-- ============================================================
-- 5. Inbox split
-- ============================================================
DROP POLICY IF EXISTS "Perm view worker inbox" ON public.worker_inbox_messages;
DROP POLICY IF EXISTS "Perm resolve worker inbox" ON public.worker_inbox_messages;
CREATE POLICY "Perm view worker inbox" ON public.worker_inbox_messages FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox_workers.view'));
CREATE POLICY "Perm resolve worker inbox" ON public.worker_inbox_messages FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox_workers.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'inbox_workers.update'));

DROP POLICY IF EXISTS "Perm view client inbox" ON public.client_inbox_messages;
DROP POLICY IF EXISTS "Perm resolve client inbox" ON public.client_inbox_messages;
CREATE POLICY "Perm view client inbox" ON public.client_inbox_messages FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox_clients.view'));
CREATE POLICY "Perm resolve client inbox" ON public.client_inbox_messages FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox_clients.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'inbox_clients.update'));

-- Approving a worker's START/END request updates the department status.
DROP POLICY IF EXISTS "Perm update batch department status" ON public.batch_department_status;
DROP POLICY IF EXISTS "Perm delete batch department status" ON public.batch_department_status;
CREATE POLICY "Perm update batch department status" ON public.batch_department_status FOR UPDATE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox_workers.update', 'employees.delete']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox_workers.update', 'employees.delete']));
CREATE POLICY "Perm delete batch department status" ON public.batch_department_status FOR DELETE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox_workers.update', 'employees.delete']));

CREATE OR REPLACE FUNCTION public.change_log_perms(_table TEXT)
RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE _table
    WHEN 'orders' THEN ARRAY['orders.update']
    WHEN 'order_updates' THEN ARRAY['orders.create', 'orders.update']
    WHEN 'production_batches' THEN ARRAY['batches.update']
    WHEN 'batch_dispatches' THEN ARRAY['dispatch.create', 'dispatch.update']
    WHEN 'worker_inbox_messages' THEN ARRAY['inbox_workers.update']
    WHEN 'client_inbox_messages' THEN ARRAY['inbox_clients.update']
    WHEN 'batch_department_status' THEN ARRAY['batches.update', 'inbox_workers.update', 'employees.delete']
    ELSE ARRAY[]::TEXT[] END
$$;

-- ============================================================
-- 6. Finance split per area
-- ============================================================
CREATE OR REPLACE FUNCTION public.finance_area(_table TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE _table
    WHEN 'vendors' THEN 'finance_vendors'
    WHEN 'vendor_bills' THEN 'finance_purchases'
    WHEN 'vendor_bill_items' THEN 'finance_purchases'
    WHEN 'vendor_payments' THEN 'finance_purchases'
    WHEN 'client_payments' THEN 'finance_receivables'
    WHEN 'expenses' THEN 'finance_expenses'
  END
$$;

DO $$
DECLARE t TEXT; area TEXT; readers TEXT[];
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'vendor_bills', 'vendor_bill_items',
                           'vendor_payments', 'client_payments', 'expenses'] LOOP
    area := public.finance_area(t);
    -- Reports reads everything; a vendor ledger shows bills + payments; bills show vendor names.
    readers := ARRAY[area || '.view', 'finance_reports.view']
      || CASE WHEN area = 'finance_purchases' THEN ARRAY['finance_vendors.view']
              WHEN t = 'vendors' THEN ARRAY['finance_purchases.view'] ELSE ARRAY[]::TEXT[] END;
    EXECUTE format('DROP POLICY IF EXISTS "Finance view %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Finance insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Finance update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Finance delete %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Finance view %1$s" ON public.%1$I FOR SELECT TO authenticated
                    USING (public.has_any_permission(auth.uid(), %2$L::TEXT[]))', t, readers);
    EXECUTE format('CREATE POLICY "Finance insert %1$s" ON public.%1$I FOR INSERT TO authenticated
                    WITH CHECK (public.has_permission(auth.uid(), %2$L))', t, area || '.create');
    EXECUTE format('CREATE POLICY "Finance update %1$s" ON public.%1$I FOR UPDATE TO authenticated
                    USING (public.has_permission(auth.uid(), %2$L))
                    WITH CHECK (public.has_permission(auth.uid(), %2$L))', t, area || '.update');
    -- Ledger rows are never hard-deleted (void instead, 20261121030000); only
    -- vendors and bill lines keep a DELETE policy.
    IF t IN ('vendors', 'vendor_bill_items') THEN
      EXECUTE format('CREATE POLICY "Finance delete %1$s" ON public.%1$I FOR DELETE TO authenticated
                      USING (public.has_permission(auth.uid(), %2$L))', t, area || '.delete');
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Finance insert vendor_bill_items" ON public.vendor_bill_items;
DROP POLICY IF EXISTS "Finance replace bill items" ON public.vendor_bill_items;
CREATE POLICY "Finance insert vendor_bill_items" ON public.vendor_bill_items FOR INSERT TO authenticated
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['finance_purchases.create', 'finance_purchases.update']));
CREATE POLICY "Finance replace bill items" ON public.vendor_bill_items FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'finance_purchases.update'));

-- Approve / undo / void RPCs: same bodies, area-specific permission.
-- Rewritten in place from the live definitions so their logic is not copied here.
DO $$
DECLARE f REGPROCEDURE; src TEXT; patched TEXT;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('post_finance_entry', 'discard_finance_draft', 'void_finance_entry') LOOP
    src := pg_get_functiondef(f);
    patched := replace(replace(src,
      '''finance.approve''', 'public.finance_area(_table) || ''.approve'''),
      '''finance.delete''', 'public.finance_area(_table) || ''.delete''');
    IF patched = src THEN RAISE EXCEPTION 'No finance permission found in %', f; END IF;
    EXECUTE patched;
  END LOOP;
END $$;
