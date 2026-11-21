-- plans/01-finance-and-permissions.md, Part A v2 (user request 2026-11-21):
-- every admin section gets separate view / create / update / delete
-- permissions, and every admin-facing table is enforced by has_permission()
-- in RLS instead of the old admin/staff/manager role checks.
-- Worker and client policies are left untouched. Admin always passes.
-- Managers with batches access still only see batches assigned to them
-- (has_batch_access).

-- ============================================================
-- 1. PERMISSION KEYS: section.action
-- ============================================================

ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_permission_check;

-- Convert keys from 20261121000000 (old: one key per section, finance.view/edit).
-- Each old key keeps exactly the access that role had before; nobody gains delete.
INSERT INTO public.user_permissions (user_id, permission, granted_by, created_at)
SELECT up.user_id, m.new_key, up.granted_by, up.created_at
FROM public.user_permissions up
JOIN (VALUES
  ('rfqs', 'rfqs.view'), ('rfqs', 'rfqs.update'),
  ('inbox', 'inbox.view'), ('inbox', 'inbox.update'),
  ('inventory', 'inventory.view'), ('inventory', 'inventory.create'), ('inventory', 'inventory.update'),
  ('orders', 'orders.view'), ('orders', 'orders.create'), ('orders', 'orders.update'),
  ('batches', 'batches.view'), ('batches', 'batches.create'), ('batches', 'batches.update'),
  ('dispatch', 'dispatch.view'), ('dispatch', 'dispatch.create'), ('dispatch', 'dispatch.update'),
  ('employees', 'employees.view'), ('employees', 'employees.create'),
  ('clients', 'clients.view'), ('clients', 'clients.create'), ('clients', 'clients.update'),
  ('finance.edit', 'finance.view'), ('finance.edit', 'finance.create'), ('finance.edit', 'finance.update')
) AS m(old_key, new_key) ON m.old_key = up.permission
ON CONFLICT DO NOTHING;

DELETE FROM public.user_permissions
WHERE permission IN ('rfqs', 'inbox', 'inventory', 'orders', 'batches', 'dispatch', 'employees', 'clients', 'finance.edit');

ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_permission_check CHECK (permission IN (
  'rfqs.view', 'rfqs.update', 'rfqs.delete',
  'inbox.view', 'inbox.update',
  'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
  'orders.view', 'orders.create', 'orders.update', 'orders.delete',
  'batches.view', 'batches.create', 'batches.update', 'batches.delete',
  'dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete',
  'employees.view', 'employees.create', 'employees.update', 'employees.delete',
  'clients.view', 'clients.create', 'clients.update',
  'finance.view', 'finance.create', 'finance.update', 'finance.delete'
));

-- Admin passes everything. Any action in a section implies that section's view.
CREATE OR REPLACE FUNCTION public.has_any_permission(_user_id UUID, _permissions TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_permissions up
        WHERE up.user_id = _user_id
          AND (up.permission = ANY(_permissions)
               OR split_part(up.permission, '.', 1) || '.view' = ANY(_permissions))
      )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_permission(_user_id, ARRAY[_permission])
$$;

-- ============================================================
-- 2. RLS — drop role-based admin policies, add permission ones
-- ============================================================

-- rfqs (public "Anyone can submit RFQ" insert stays)
DROP POLICY IF EXISTS "Staff view RFQs" ON public.rfqs;
DROP POLICY IF EXISTS "Staff update RFQs" ON public.rfqs;
DROP POLICY IF EXISTS "Admins delete RFQs" ON public.rfqs;
CREATE POLICY "Perm view rfqs" ON public.rfqs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'rfqs.view'));
CREATE POLICY "Perm update rfqs" ON public.rfqs FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'rfqs.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'rfqs.update'));
CREATE POLICY "Perm delete rfqs" ON public.rfqs FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'rfqs.delete'));

-- orders (client "create own orders" insert stays)
DROP POLICY IF EXISTS "Clients view own orders" ON public.orders;
DROP POLICY IF EXISTS "Staff manage orders" ON public.orders;
DROP POLICY IF EXISTS "Finance view orders" ON public.orders;
CREATE POLICY "Clients view own orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = client_id
         OR public.has_any_permission(auth.uid(), ARRAY['orders.view', 'batches.view', 'rfqs.view', 'finance.view']));
CREATE POLICY "Perm create orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'orders.create'));
CREATE POLICY "Perm update orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'orders.update'));
CREATE POLICY "Perm delete orders" ON public.orders FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.delete'));

-- order_updates
DROP POLICY IF EXISTS "Order participants view updates" ON public.order_updates;
DROP POLICY IF EXISTS "Staff add updates" ON public.order_updates;
CREATE POLICY "Order participants view updates" ON public.order_updates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_updates.order_id
                 AND (o.client_id = auth.uid() OR public.has_permission(auth.uid(), 'orders.view'))));
CREATE POLICY "Perm add order updates" ON public.order_updates FOR INSERT TO authenticated
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['orders.create', 'orders.update']));

-- inventory_items (worker policies stay)
DROP POLICY IF EXISTS "Staff view inventory" ON public.inventory_items;
DROP POLICY IF EXISTS "Staff manage inventory" ON public.inventory_items;
DROP POLICY IF EXISTS "Finance view inventory items" ON public.inventory_items;
CREATE POLICY "Perm view inventory" ON public.inventory_items FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['inventory.view', 'batches.view', 'finance.view']));
CREATE POLICY "Perm create inventory" ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.create'));
CREATE POLICY "Perm update inventory" ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory.update'));
CREATE POLICY "Perm delete inventory" ON public.inventory_items FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.delete'));

-- inventory_movements (worker insert stays). Deleting a worker entry restocks,
-- so employees.delete may record movements too.
DROP POLICY IF EXISTS "Staff view movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Staff record movements" ON public.inventory_movements;
CREATE POLICY "Perm view movements" ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory.view'));
CREATE POLICY "Perm record movements" ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['inventory.create', 'inventory.update', 'employees.delete']));

-- production_batches: managers only see assigned batches (has_batch_access is
-- true for admin/staff, assignment-based for everyone else).
DROP POLICY IF EXISTS "Managers view assigned batches" ON public.production_batches;
DROP POLICY IF EXISTS "Staff manage batches" ON public.production_batches;
DROP POLICY IF EXISTS "Workers view batches" ON public.production_batches;
CREATE POLICY "Workers view batches" ON public.production_batches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'worker'));
CREATE POLICY "Perm view batches" ON public.production_batches FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.view', 'orders.view', 'dispatch.view', 'employees.view', 'rfqs.view', 'inventory.view'])
         AND public.has_batch_access(auth.uid(), id));
CREATE POLICY "Perm create batches" ON public.production_batches FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'batches.create'));
CREATE POLICY "Perm update batches" ON public.production_batches FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'batches.update') AND public.has_batch_access(auth.uid(), id))
  WITH CHECK (public.has_permission(auth.uid(), 'batches.update'));
CREATE POLICY "Perm delete batches" ON public.production_batches FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'batches.delete') AND public.has_batch_access(auth.uid(), id));

-- per-batch rates & pack ratios are written while creating or editing a batch
DROP POLICY IF EXISTS "Staff manage rates" ON public.batch_phase_rates;
CREATE POLICY "Perm manage rates" ON public.batch_phase_rates FOR ALL TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']));

DROP POLICY IF EXISTS "Staff manage panel rates" ON public.batch_phase_panel_rates;
CREATE POLICY "Perm manage panel rates" ON public.batch_phase_panel_rates FOR ALL TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']));

DROP POLICY IF EXISTS "Admin manager manage pack ratios" ON public.batch_pack_ratios;
CREATE POLICY "Perm manage pack ratios" ON public.batch_pack_ratios FOR ALL TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.create', 'batches.update']));

-- factory-wide department rates
DROP POLICY IF EXISTS "Admin manager manage department rates" ON public.department_cost_rates;
CREATE POLICY "Perm manage department rates" ON public.department_cost_rates FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'batches.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'batches.update'));

-- batch_tracking (legacy; worker insert stays)
DROP POLICY IF EXISTS "Workers view own tracking" ON public.batch_tracking;
DROP POLICY IF EXISTS "Admins delete tracking" ON public.batch_tracking;
CREATE POLICY "Workers view own tracking" ON public.batch_tracking FOR SELECT TO authenticated
  USING (worker_id = auth.uid()
         OR public.has_any_permission(auth.uid(), ARRAY['batches.view', 'employees.view', 'orders.view']));
CREATE POLICY "Perm delete tracking" ON public.batch_tracking FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'batches.delete'));

-- batch_worker_sessions (legacy; worker insert/update stay)
DROP POLICY IF EXISTS "Staff and Managers manage sessions" ON public.batch_worker_sessions;
DROP POLICY IF EXISTS "Workers view own sessions" ON public.batch_worker_sessions;
CREATE POLICY "Workers view own sessions" ON public.batch_worker_sessions FOR SELECT TO authenticated
  USING (worker_id = auth.uid() OR public.has_permission(auth.uid(), 'batches.view'));
CREATE POLICY "Perm manage sessions" ON public.batch_worker_sessions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'batches.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'batches.update'));

-- batch_department_status: admin-side writes come from inbox verification,
-- batch management and worker-entry cleanup (worker policies stay).
DROP POLICY IF EXISTS "Admin/staff update batch department status" ON public.batch_department_status;
DROP POLICY IF EXISTS "Admin/staff delete batch department status" ON public.batch_department_status;
CREATE POLICY "Perm update batch department status" ON public.batch_department_status FOR UPDATE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox.update', 'employees.delete']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox.update', 'employees.delete']));
CREATE POLICY "Perm delete batch department status" ON public.batch_department_status FOR DELETE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.update', 'inbox.update', 'employees.delete']));

-- batch_dispatches
DROP POLICY IF EXISTS "Admin staff manager manage dispatches" ON public.batch_dispatches;
CREATE POLICY "Perm view dispatches" ON public.batch_dispatches FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['dispatch.view', 'batches.view']));
CREATE POLICY "Perm create dispatches" ON public.batch_dispatches FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'dispatch.create'));
CREATE POLICY "Perm update dispatches" ON public.batch_dispatches FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'dispatch.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'dispatch.update'));
CREATE POLICY "Perm delete dispatches" ON public.batch_dispatches FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'dispatch.delete'));

-- department_entries (worker insert stays)
DROP POLICY IF EXISTS "Workers view own department entries" ON public.department_entries;
DROP POLICY IF EXISTS "Admins delete department entries" ON public.department_entries;
DROP POLICY IF EXISTS "Finance view department entries" ON public.department_entries;
CREATE POLICY "Workers view own department entries" ON public.department_entries FOR SELECT TO authenticated
  USING (worker_id = auth.uid()
         OR public.has_any_permission(auth.uid(), ARRAY['batches.view', 'employees.view', 'orders.view', 'dispatch.view']));
CREATE POLICY "Perm delete department entries" ON public.department_entries FOR DELETE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['employees.delete', 'batches.delete']));

-- profiles (own-profile policies stay)
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin manager update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Finance view profiles" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id
         OR public.has_any_permission(auth.uid(), ARRAY['employees.view', 'clients.view', 'orders.view', 'batches.view', 'inbox.view']));
CREATE POLICY "Perm update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['employees.update', 'clients.update']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['employees.update', 'clients.update']));

-- user_roles: still only admin manages roles; listing roles is needed to
-- tell clients from workers on these pages.
CREATE POLICY "Perm view roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['employees.view', 'clients.view', 'orders.view', 'batches.view']));

-- admin_notifications (inserted only by SECURITY DEFINER triggers)
DROP POLICY IF EXISTS "Staff manage notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "Staff view notifications" ON public.admin_notifications;
CREATE POLICY "Perm view notifications" ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.view', 'inbox.view']));
CREATE POLICY "Perm mark notifications read" ON public.admin_notifications FOR UPDATE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['batches.view', 'inbox.view']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['batches.view', 'inbox.view']));

-- worker inbox (worker policies stay)
DROP POLICY IF EXISTS "Admin/staff view all inbox messages" ON public.worker_inbox_messages;
DROP POLICY IF EXISTS "Admin/staff resolve inbox messages" ON public.worker_inbox_messages;
CREATE POLICY "Perm view worker inbox" ON public.worker_inbox_messages FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox.view'));
CREATE POLICY "Perm resolve worker inbox" ON public.worker_inbox_messages FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'inbox.update'));

-- client inbox (client policies stay)
DROP POLICY IF EXISTS "Admin/staff view all client inbox messages" ON public.client_inbox_messages;
DROP POLICY IF EXISTS "Admin/staff resolve client inbox messages" ON public.client_inbox_messages;
CREATE POLICY "Perm view client inbox" ON public.client_inbox_messages FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox.view'));
CREATE POLICY "Perm resolve client inbox" ON public.client_inbox_messages FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'inbox.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'inbox.update'));

-- client invite codes (issued from the Orders page when adding a new client)
DROP POLICY IF EXISTS "Admin/staff view invite codes" ON public.client_invite_codes;
DROP POLICY IF EXISTS "Admin/staff issue invite codes" ON public.client_invite_codes;
DROP POLICY IF EXISTS "Admin/staff revoke invite codes" ON public.client_invite_codes;
CREATE POLICY "Perm view invite codes" ON public.client_invite_codes FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['clients.view', 'orders.view']));
CREATE POLICY "Perm issue invite codes" ON public.client_invite_codes FOR INSERT TO authenticated
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['clients.create', 'orders.create']));
CREATE POLICY "Perm revoke invite codes" ON public.client_invite_codes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'clients.update'))
  WITH CHECK (public.has_permission(auth.uid(), 'clients.update'));

-- finance tables: finance.edit is gone; split into create / update / delete.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'vendor_bills', 'vendor_bill_items',
                           'vendor_payments', 'client_payments', 'expenses'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Finance insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Finance update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin delete %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Finance insert %1$s" ON public.%1$I FOR INSERT TO authenticated
                    WITH CHECK (public.has_permission(auth.uid(), ''finance.create''))', t);
    EXECUTE format('CREATE POLICY "Finance update %1$s" ON public.%1$I FOR UPDATE TO authenticated
                    USING (public.has_permission(auth.uid(), ''finance.update''))
                    WITH CHECK (public.has_permission(auth.uid(), ''finance.update''))', t);
    EXECUTE format('CREATE POLICY "Finance delete %1$s" ON public.%1$I FOR DELETE TO authenticated
                    USING (public.has_permission(auth.uid(), ''finance.delete''))', t);
  END LOOP;
END $$;

-- Editing a bill replaces its lines; adding lines happens on create too.
DROP POLICY IF EXISTS "Finance edit delete bill items" ON public.vendor_bill_items;
DROP POLICY IF EXISTS "Finance insert vendor_bill_items" ON public.vendor_bill_items;
CREATE POLICY "Finance insert vendor_bill_items" ON public.vendor_bill_items FOR INSERT TO authenticated
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['finance.create', 'finance.update']));
CREATE POLICY "Finance replace bill items" ON public.vendor_bill_items FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.update'));

-- ============================================================
-- 3. TRIGGER GUARDS that used role checks
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_profile_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.department IS DISTINCT FROM OLD.department
     AND NOT public.has_permission(auth.uid(), 'employees.update') THEN
    NEW.department := OLD.department;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_client_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_activated IS DISTINCT FROM OLD.client_activated THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'clients.update') THEN
      NEW.client_activated := OLD.client_activated;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
