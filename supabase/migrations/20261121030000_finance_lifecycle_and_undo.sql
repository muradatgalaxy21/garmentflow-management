-- plans/02-audit-safety-testing-assistant.md, parts A + B.
-- A. GAAP/IFRS-style lifecycle for finance documents:
--    draft (editable; creator can discard within 10 min) -> posted (maker-checker,
--    immutable) -> voided only by an offsetting entry while the period is open.
--    Admin closes/reopens months. No hard deletes.
-- B. change_log + undo for status changes (10 minutes, own actions only).

-- ============================================================
-- A1. Permission: finance.approve
-- ============================================================
ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_permission_check;
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_permission_check CHECK (permission IN (
  'rfqs.view', 'rfqs.update', 'rfqs.delete',
  'inbox.view', 'inbox.update',
  'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
  'orders.view', 'orders.create', 'orders.update', 'orders.delete',
  'batches.view', 'batches.create', 'batches.update', 'batches.delete',
  'dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete',
  'employees.view', 'employees.create', 'employees.update', 'employees.delete',
  'clients.view', 'clients.create', 'clients.update',
  'finance.view', 'finance.create', 'finance.update', 'finance.delete', 'finance.approve'
));

-- ============================================================
-- A2. Lifecycle columns
-- ============================================================
ALTER TABLE public.vendor_bills
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'discarded')),
  ADD COLUMN posted_at TIMESTAMPTZ, ADD COLUMN posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN self_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN discarded_at TIMESTAMPTZ, ADD COLUMN discarded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reverses_id UUID REFERENCES public.vendor_bills(id),
  ADD COLUMN voided_by_id UUID REFERENCES public.vendor_bills(id),
  ADD COLUMN void_reason TEXT;

ALTER TABLE public.vendor_payments
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'discarded')),
  ADD COLUMN posted_at TIMESTAMPTZ, ADD COLUMN posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN self_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN discarded_at TIMESTAMPTZ, ADD COLUMN discarded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reverses_id UUID REFERENCES public.vendor_payments(id),
  ADD COLUMN voided_by_id UUID REFERENCES public.vendor_payments(id),
  ADD COLUMN void_reason TEXT;

ALTER TABLE public.client_payments
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'discarded')),
  ADD COLUMN posted_at TIMESTAMPTZ, ADD COLUMN posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN self_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN discarded_at TIMESTAMPTZ, ADD COLUMN discarded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reverses_id UUID REFERENCES public.client_payments(id),
  ADD COLUMN voided_by_id UUID REFERENCES public.client_payments(id),
  ADD COLUMN void_reason TEXT;

ALTER TABLE public.expenses
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'discarded')),
  ADD COLUMN posted_at TIMESTAMPTZ, ADD COLUMN posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN self_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN discarded_at TIMESTAMPTZ, ADD COLUMN discarded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reverses_id UUID REFERENCES public.expenses(id),
  ADD COLUMN voided_by_id UUID REFERENCES public.expenses(id),
  ADD COLUMN void_reason TEXT;

-- Rows entered before this lifecycle existed were treated as final: mark posted.
UPDATE public.vendor_bills SET status = 'posted', posted_at = created_at, posted_by = created_by;
UPDATE public.vendor_payments SET status = 'posted', posted_at = created_at, posted_by = created_by;
UPDATE public.client_payments SET status = 'posted', posted_at = created_at, posted_by = created_by;
UPDATE public.expenses SET status = 'posted', posted_at = created_at, posted_by = created_by;

-- Reversal (void) rows carry negative amounts; everything else stays positive.
ALTER TABLE public.vendor_payments DROP CONSTRAINT IF EXISTS vendor_payments_amount_check;
ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_amount_check
  CHECK ((reverses_id IS NULL AND amount > 0) OR (reverses_id IS NOT NULL AND amount < 0));
ALTER TABLE public.client_payments DROP CONSTRAINT IF EXISTS client_payments_amount_check;
ALTER TABLE public.client_payments ADD CONSTRAINT client_payments_amount_check
  CHECK ((reverses_id IS NULL AND amount > 0) OR (reverses_id IS NOT NULL AND amount < 0));
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_check
  CHECK ((reverses_id IS NULL AND amount > 0) OR (reverses_id IS NOT NULL AND amount < 0));
-- Credit-note lines use negative quantity.
ALTER TABLE public.vendor_bill_items DROP CONSTRAINT IF EXISTS vendor_bill_items_quantity_check;
ALTER TABLE public.vendor_bill_items ADD CONSTRAINT vendor_bill_items_quantity_check CHECK (quantity <> 0);

-- ============================================================
-- A3. Accounting periods
-- ============================================================
CREATE TABLE public.accounting_periods (
  period_month DATE PRIMARY KEY CHECK (period_month = date_trunc('month', period_month)::date),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE public.accounting_period_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month DATE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('close', 'reopen')),
  note TEXT,
  done_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  done_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_period_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance view periods" ON public.accounting_periods FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY "Finance view period events" ON public.accounting_period_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.view'));
-- No write policies: only the admin RPCs below change periods.

CREATE OR REPLACE FUNCTION public.is_period_closed(_d DATE)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.accounting_periods
                 WHERE period_month = date_trunc('month', _d)::date AND closed_at IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION public.close_period(_month DATE, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m DATE := date_trunc('month', _month)::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only an admin can close a month'; END IF;
  INSERT INTO public.accounting_periods (period_month, closed_at, closed_by) VALUES (m, now(), auth.uid())
  ON CONFLICT (period_month) DO UPDATE SET closed_at = now(), closed_by = auth.uid();
  INSERT INTO public.accounting_period_events (period_month, action, note) VALUES (m, 'close', _note);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_period(_month DATE, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m DATE := date_trunc('month', _month)::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only an admin can re-open a month'; END IF;
  IF coalesce(trim(_note), '') = '' THEN RAISE EXCEPTION 'A reason is required to re-open a month'; END IF;
  UPDATE public.accounting_periods SET closed_at = NULL, closed_by = NULL WHERE period_month = m;
  INSERT INTO public.accounting_period_events (period_month, action, note) VALUES (m, 'reopen', _note);
END;
$$;

-- ============================================================
-- A4. Guards (trigger) — all lifecycle moves go through the RPCs, which set
--     app.finance_rpc = 'on' for their own transaction only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.finance_doc_date(_table TEXT, _row JSONB)
RETURNS DATE LANGUAGE SQL IMMUTABLE AS $$
  SELECT (_row ->> CASE _table
    WHEN 'vendor_bills' THEN 'bill_date'
    WHEN 'vendor_payments' THEN 'paid_on'
    WHEN 'client_payments' THEN 'received_on'
    WHEN 'expenses' THEN 'spent_on' END)::date
$$;

CREATE OR REPLACE FUNCTION public.guard_finance_doc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rpc BOOLEAN := coalesce(current_setting('app.finance_rpc', true), '') = 'on';
  n JSONB; o JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Finance entries are never deleted: discard a draft or void a posted entry';
  END IF;

  n := to_jsonb(NEW);
  IF public.is_period_closed(public.finance_doc_date(TG_TABLE_NAME, n)) THEN
    RAISE EXCEPTION 'That month is closed. Use a date in an open month (adjustment entry).';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT rpc AND (NEW.status <> 'draft' OR NEW.reverses_id IS NOT NULL OR NEW.posted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'New entries start as drafts';
    END IF;
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  IF public.is_period_closed(public.finance_doc_date(TG_TABLE_NAME, o)) THEN
    RAISE EXCEPTION 'That month is closed';
  END IF;
  IF OLD.status = 'discarded' THEN
    RAISE EXCEPTION 'Discarded entries cannot change';
  END IF;
  IF OLD.status = 'posted' THEN
    -- Only the void RPC may touch a posted row, and only to link its reversal
    -- (bills: the RPC also never changes totals of the original).
    IF NOT rpc OR (n - 'voided_by_id' - 'void_reason' - 'updated_at') <> (o - 'voided_by_id' - 'void_reason' - 'updated_at') THEN
      RAISE EXCEPTION 'Posted entries cannot be edited. Void it instead.';
    END IF;
    RETURN NEW;
  END IF;
  -- Draft: free edits, but lifecycle fields only via RPC.
  IF NOT rpc AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
      OR NEW.posted_by IS DISTINCT FROM OLD.posted_by OR NEW.self_approved IS DISTINCT FROM OLD.self_approved
      OR NEW.discarded_at IS DISTINCT FROM OLD.discarded_at OR NEW.reverses_id IS DISTINCT FROM OLD.reverses_id
      OR NEW.voided_by_id IS DISTINCT FROM OLD.voided_by_id OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'Use Approve / Discard / Void for that';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_vendor_bills BEFORE INSERT OR UPDATE OR DELETE ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_doc();
CREATE TRIGGER guard_vendor_payments BEFORE INSERT OR UPDATE OR DELETE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_doc();
CREATE TRIGGER guard_client_payments BEFORE INSERT OR UPDATE OR DELETE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_doc();
CREATE TRIGGER guard_expenses BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_finance_doc();

-- Bill lines change only while the bill is a draft (or inside an RPC).
CREATE OR REPLACE FUNCTION public.guard_vendor_bill_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s TEXT;
BEGIN
  SELECT status INTO s FROM public.vendor_bills WHERE id = COALESCE(NEW.bill_id, OLD.bill_id);
  IF s IS DISTINCT FROM 'draft' AND coalesce(current_setting('app.finance_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Lines can only change while the bill is a draft';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.quantity < 0 AND coalesce(current_setting('app.finance_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Quantity must be above 0';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER vendor_bill_item_guard BEFORE INSERT OR DELETE ON public.vendor_bill_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_bill_item();

-- Stock follows line sign: positive line = stock in, credit-note line = stock out.
CREATE OR REPLACE FUNCTION public.apply_vendor_bill_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_id UUID := COALESCE(NEW.bill_id, OLD.bill_id);
  r RECORD;
  sign INT;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; sign := 1; ELSE r := OLD; sign := -1; END IF;
  IF r.inventory_item_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements (item_id, type, quantity, reason, performed_by)
    VALUES (r.inventory_item_id,
            CASE WHEN sign * r.quantity > 0 THEN 'in' ELSE 'out' END::public.movement_type,
            abs(r.quantity),
            CASE WHEN TG_OP = 'INSERT' THEN 'Purchase bill ' ELSE 'Purchase bill line removed ' END || r.bill_id,
            auth.uid());
  END IF;

  UPDATE public.vendor_bills
     SET total_amount = COALESCE((SELECT sum(amount) FROM public.vendor_bill_items WHERE bill_id = v_bill_id), 0)
   WHERE id = v_bill_id AND status = 'draft';
  RETURN NULL;
END;
$$;

-- No hard deletes on finance documents any more.
DROP POLICY IF EXISTS "Finance delete vendor_bills" ON public.vendor_bills;
DROP POLICY IF EXISTS "Finance delete vendor_payments" ON public.vendor_payments;
DROP POLICY IF EXISTS "Finance delete client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Finance delete expenses" ON public.expenses;

-- ============================================================
-- A5. Lifecycle RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.finance_check_table(_table TEXT)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _table NOT IN ('vendor_bills', 'vendor_payments', 'client_payments', 'expenses') THEN
    RAISE EXCEPTION 'Unknown finance table %', _table;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_finance_entry(_table TEXT, _id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row JSONB; is_admin BOOLEAN := public.has_role(auth.uid(), 'admin');
BEGIN
  PERFORM public.finance_check_table(_table);
  IF NOT public.has_permission(auth.uid(), 'finance.approve') THEN
    RAISE EXCEPTION 'You need Finance > Approve to post entries';
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1 FOR UPDATE', _table) INTO row USING _id;
  IF row IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF row ->> 'status' <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be approved'; END IF;
  IF (row ->> 'created_by')::uuid = auth.uid() AND NOT is_admin THEN
    RAISE EXCEPTION 'Maker-checker: someone else must approve your own entry';
  END IF;
  IF _table = 'vendor_bills' AND (row ->> 'total_amount')::numeric <= 0 THEN
    RAISE EXCEPTION 'A bill needs at least one line before approval';
  END IF;
  PERFORM set_config('app.finance_rpc', 'on', true);
  EXECUTE format('UPDATE public.%I SET status = ''posted'', posted_at = now(), posted_by = $2, self_approved = $3 WHERE id = $1', _table)
    USING _id, auth.uid(), (row ->> 'created_by')::uuid IS NOT DISTINCT FROM auth.uid();
  PERFORM set_config('app.finance_rpc', 'off', true);
END;
$$;

-- Undo for drafts: creator within 10 minutes, or anyone with finance.delete.
CREATE OR REPLACE FUNCTION public.discard_finance_draft(_table TEXT, _id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row JSONB;
BEGIN
  PERFORM public.finance_check_table(_table);
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1 FOR UPDATE', _table) INTO row USING _id;
  IF row IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF row ->> 'status' <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be undone. Void a posted entry instead.'; END IF;
  IF NOT (public.has_permission(auth.uid(), 'finance.delete')
          OR ((row ->> 'created_by')::uuid = auth.uid() AND (row ->> 'created_at')::timestamptz > now() - interval '10 minutes')) THEN
    RAISE EXCEPTION 'Undo window (10 minutes) has passed. Ask someone with Finance > Delete/Void.';
  END IF;
  PERFORM set_config('app.finance_rpc', 'on', true);
  IF _table = 'vendor_bills' THEN
    DELETE FROM public.vendor_bill_items WHERE bill_id = _id; -- reverses linked stock
    UPDATE public.vendor_bills SET total_amount = 0 WHERE id = _id;
  END IF;
  EXECUTE format('UPDATE public.%I SET status = ''discarded'', discarded_at = now(), discarded_by = $2 WHERE id = $1', _table)
    USING _id, auth.uid();
  PERFORM set_config('app.finance_rpc', 'off', true);
END;
$$;

-- Void a posted entry with an offsetting (negative) posted entry dated today.
CREATE OR REPLACE FUNCTION public.void_finance_entry(_table TEXT, _id UUID, _reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row JSONB; new_id UUID := gen_random_uuid(); who UUID := auth.uid();
BEGIN
  PERFORM public.finance_check_table(_table);
  IF NOT public.has_permission(who, 'finance.delete') THEN
    RAISE EXCEPTION 'You need Finance > Delete/Void to void entries';
  END IF;
  IF coalesce(trim(_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to void'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1 FOR UPDATE', _table) INTO row USING _id;
  IF row IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF row ->> 'status' <> 'posted' THEN RAISE EXCEPTION 'Only posted entries can be voided. Undo/discard a draft instead.'; END IF;
  IF row ->> 'reverses_id' IS NOT NULL THEN RAISE EXCEPTION 'A reversal entry cannot itself be voided'; END IF;
  IF row ->> 'voided_by_id' IS NOT NULL THEN RAISE EXCEPTION 'Already voided'; END IF;

  PERFORM set_config('app.finance_rpc', 'on', true);
  IF _table = 'vendor_bills' THEN
    -- Built as a draft so the line trigger can total it, then posted.
    INSERT INTO public.vendor_bills (id, vendor_id, bill_no, bill_date, notes, status, reverses_id, created_by)
    VALUES (new_id, (row ->> 'vendor_id')::uuid, 'CN-' || coalesce(row ->> 'bill_no', ''), CURRENT_DATE,
            'Credit note — void: ' || _reason, 'draft', _id, who);
    INSERT INTO public.vendor_bill_items (bill_id, description, inventory_item_id, quantity, unit, unit_price)
    SELECT new_id, description, inventory_item_id, -quantity, unit, unit_price
      FROM public.vendor_bill_items WHERE bill_id = _id;
    UPDATE public.vendor_bills SET status = 'posted', posted_at = now(), posted_by = who WHERE id = new_id;
  ELSIF _table = 'vendor_payments' THEN
    INSERT INTO public.vendor_payments (id, vendor_id, bill_id, amount, paid_on, method, reference, notes, status, posted_at, posted_by, reverses_id, created_by)
    VALUES (new_id, (row ->> 'vendor_id')::uuid, (row ->> 'bill_id')::uuid, -(row ->> 'amount')::numeric, CURRENT_DATE,
            row ->> 'method', row ->> 'reference', 'Void: ' || _reason, 'posted', now(), who, _id, who);
  ELSIF _table = 'client_payments' THEN
    INSERT INTO public.client_payments (id, client_id, order_id, amount, received_on, method, reference, notes, status, posted_at, posted_by, reverses_id, created_by)
    VALUES (new_id, (row ->> 'client_id')::uuid, (row ->> 'order_id')::uuid, -(row ->> 'amount')::numeric, CURRENT_DATE,
            row ->> 'method', row ->> 'reference', 'Void: ' || _reason, 'posted', now(), who, _id, who);
  ELSE
    INSERT INTO public.expenses (id, category, amount, spent_on, method, paid_to, notes, status, posted_at, posted_by, reverses_id, created_by)
    VALUES (new_id, row ->> 'category', -(row ->> 'amount')::numeric, CURRENT_DATE,
            row ->> 'method', row ->> 'paid_to', 'Void: ' || _reason, 'posted', now(), who, _id, who);
  END IF;
  EXECUTE format('UPDATE public.%I SET voided_by_id = $2, void_reason = $3 WHERE id = $1', _table) USING _id, new_id, _reason;
  PERFORM set_config('app.finance_rpc', 'off', true);
  RETURN new_id;
END;
$$;

-- Bill balances: discarded bills/payments ignored; voided bills and credit notes settle to 0.
DROP VIEW IF EXISTS public.vendor_bill_balances;
CREATE VIEW public.vendor_bill_balances
WITH (security_invoker = on) AS
SELECT
  b.id, b.vendor_id, b.bill_no, b.bill_date, b.due_date, b.total_amount,
  b.status AS doc_status, b.reverses_id, b.voided_by_id, b.created_by,
  COALESCE(p.paid, 0) AS paid_amount,
  CASE WHEN b.voided_by_id IS NOT NULL OR b.reverses_id IS NOT NULL THEN 0
       ELSE b.total_amount - COALESCE(p.paid, 0) END AS balance,
  CASE
    WHEN b.reverses_id IS NOT NULL THEN 'credit_note'
    WHEN b.voided_by_id IS NOT NULL THEN 'void'
    WHEN b.total_amount - COALESCE(p.paid, 0) <= 0 THEN 'paid'
    WHEN b.due_date IS NOT NULL AND b.due_date < CURRENT_DATE THEN 'overdue'
    WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS status
FROM public.vendor_bills b
LEFT JOIN (
  SELECT bill_id, sum(amount) AS paid FROM public.vendor_payments
  WHERE bill_id IS NOT NULL AND status <> 'discarded' GROUP BY bill_id
) p ON p.bill_id = b.id
WHERE b.status <> 'discarded';

-- ============================================================
-- B. change_log + undo for status changes
-- ============================================================
CREATE TABLE public.change_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE')),
  old_values JSONB,
  new_values JSONB NOT NULL,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_id UUID,
  label TEXT,
  undone_at TIMESTAMPTZ
);
CREATE INDEX change_log_user_idx ON public.change_log (changed_by, changed_at DESC);
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own changes" ON public.change_log FOR SELECT TO authenticated
  USING (changed_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
-- Rows are written only by the trigger / RPCs (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.log_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n JSONB := to_jsonb(NEW); o JSONB; k TEXT; oldv JSONB := '{}'; newv JSONB := '{}';
BEGIN
  IF auth.uid() IS NULL OR coalesce(current_setting('app.undoing', true), '') = 'on' THEN RETURN NULL; END IF;
  -- Only admin-portal users (admin, or anyone holding a permission) get undo;
  -- worker/client actions are not logged here.
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid())) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.change_log (table_name, row_id, op, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', n, auth.uid());
    RETURN NULL;
  END IF;
  o := to_jsonb(OLD);
  FOR k IN SELECT jsonb_object_keys(n) LOOP
    IF k NOT IN ('updated_at') AND (n -> k) IS DISTINCT FROM (o -> k) THEN
      oldv := oldv || jsonb_build_object(k, o -> k);
      newv := newv || jsonb_build_object(k, n -> k);
    END IF;
  END LOOP;
  IF newv <> '{}' THEN
    INSERT INTO public.change_log (table_name, row_id, op, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', oldv, newv, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER log_orders AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER log_production_batches AFTER UPDATE ON public.production_batches FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER log_batch_dispatches AFTER INSERT OR UPDATE ON public.batch_dispatches FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER log_order_updates AFTER INSERT ON public.order_updates FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER log_worker_inbox AFTER UPDATE ON public.worker_inbox_messages FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER log_client_inbox AFTER UPDATE ON public.client_inbox_messages FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER log_batch_department_status AFTER UPDATE ON public.batch_department_status FOR EACH ROW EXECUTE FUNCTION public.log_change();

CREATE OR REPLACE FUNCTION public.server_now()
RETURNS TIMESTAMPTZ LANGUAGE SQL STABLE AS $$ SELECT now() $$;

-- Group my untagged changes since _since into one undoable action.
CREATE OR REPLACE FUNCTION public.tag_my_changes(_since TIMESTAMPTZ, _label TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a UUID := gen_random_uuid(); n INT;
BEGIN
  UPDATE public.change_log SET action_id = a, label = left(_label, 200)
   WHERE changed_by = auth.uid() AND action_id IS NULL AND changed_at >= _since;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN CASE WHEN n > 0 THEN a END;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_recent_actions()
RETURNS TABLE (action_id UUID, label TEXT, changed_at TIMESTAMPTZ, changes INT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT action_id, max(label), min(changed_at), count(*)::int
    FROM public.change_log
   WHERE changed_by = auth.uid() AND action_id IS NOT NULL AND undone_at IS NULL
     AND changed_at > now() - interval '10 minutes'
   GROUP BY action_id
   ORDER BY min(changed_at) DESC
$$;

-- Roll one of my actions back (state rollback). Refuses if any row changed again since.
CREATE OR REPLACE FUNCTION public.undo_action(_action_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; cur JSONB; k TEXT; cols TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.change_log WHERE action_id = _action_id AND changed_by = auth.uid()) THEN
    RAISE EXCEPTION 'Nothing to undo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.change_log WHERE action_id = _action_id
             AND (undone_at IS NOT NULL OR changed_at <= now() - interval '10 minutes')) THEN
    RAISE EXCEPTION 'Undo window (10 minutes) has passed or it was already undone';
  END IF;
  PERFORM set_config('app.undoing', 'on', true);
  FOR c IN SELECT * FROM public.change_log WHERE action_id = _action_id ORDER BY id DESC LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1 FOR UPDATE', c.table_name) INTO cur USING c.row_id;
    IF c.op = 'INSERT' THEN
      IF cur IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', c.table_name) USING c.row_id;
      END IF;
    ELSE
      IF cur IS NULL THEN RAISE EXCEPTION 'A changed record no longer exists; cannot undo'; END IF;
      FOR k IN SELECT jsonb_object_keys(c.new_values) LOOP
        IF (cur -> k) IS DISTINCT FROM (c.new_values -> k) THEN
          RAISE EXCEPTION 'Someone changed this record again after you; undo refused';
        END IF;
      END LOOP;
      SELECT string_agg(format('%I', key), ', ') INTO cols FROM jsonb_object_keys(c.old_values) key;
      EXECUTE format('UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r) WHERE id = $2',
                     c.table_name, cols,
                     (SELECT string_agg(format('r.%I', key), ', ') FROM jsonb_object_keys(c.old_values) key),
                     c.table_name)
        USING c.old_values, c.row_id;
    END IF;
  END LOOP;
  UPDATE public.change_log SET undone_at = now() WHERE action_id = _action_id;
  PERFORM set_config('app.undoing', 'off', true);
END;
$$;
