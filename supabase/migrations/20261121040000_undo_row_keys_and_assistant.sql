-- Fix for 20261121030000: batch_department_status has no id column (its key is
-- batch_id + department), so change_log now stores a generic row_key.
-- Also: rate-limit table for the staff-assistant edge function (plans/02 part D).

ALTER TABLE public.change_log ALTER COLUMN row_id DROP NOT NULL;
ALTER TABLE public.change_log ADD COLUMN IF NOT EXISTS row_key JSONB;
UPDATE public.change_log SET row_key = jsonb_build_object('id', row_id) WHERE row_key IS NULL;
ALTER TABLE public.change_log ALTER COLUMN row_key SET NOT NULL;

CREATE OR REPLACE FUNCTION public.change_log_key(_table TEXT, _row JSONB)
RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE WHEN _table = 'batch_department_status'
              THEN jsonb_build_object('batch_id', _row -> 'batch_id', 'department', _row -> 'department')
              ELSE jsonb_build_object('id', _row -> 'id') END
$$;

-- WHERE clause for a row_key, e.g. "batch_id = ($1->>'batch_id')::uuid AND department = ($1->>'department')"
CREATE OR REPLACE FUNCTION public.change_log_where(_table TEXT, _key JSONB)
RETURNS TEXT LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT string_agg(format('t.%I::text = ($1 ->> %L)', k, k), ' AND ')
    FROM jsonb_object_keys(_key) k
$$;

CREATE OR REPLACE FUNCTION public.log_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n JSONB := to_jsonb(NEW); o JSONB; k TEXT; oldv JSONB := '{}'; newv JSONB := '{}';
BEGIN
  IF auth.uid() IS NULL OR coalesce(current_setting('app.undoing', true), '') = 'on' THEN RETURN NULL; END IF;
  -- Only admin-portal users (admin, or anyone holding a permission) get undo.
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid())) THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.change_log (table_name, row_key, row_id, op, new_values, changed_by)
    VALUES (TG_TABLE_NAME, public.change_log_key(TG_TABLE_NAME, n), (n ->> 'id')::uuid, 'INSERT', n, auth.uid());
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
    INSERT INTO public.change_log (table_name, row_key, row_id, op, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, public.change_log_key(TG_TABLE_NAME, n), (n ->> 'id')::uuid, 'UPDATE', oldv, newv, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_action(_action_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; cur JSONB; k TEXT; cols TEXT; vals TEXT; w TEXT;
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
    w := public.change_log_where(c.table_name, c.row_key);
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %s FOR UPDATE', c.table_name, w) INTO cur USING c.row_key;
    IF c.op = 'INSERT' THEN
      IF cur IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.%I t WHERE %s', c.table_name, w) USING c.row_key;
      END IF;
    ELSE
      IF cur IS NULL THEN RAISE EXCEPTION 'A changed record no longer exists; cannot undo'; END IF;
      FOR k IN SELECT jsonb_object_keys(c.new_values) LOOP
        IF (cur -> k) IS DISTINCT FROM (c.new_values -> k) THEN
          RAISE EXCEPTION 'Someone changed this record again after you; undo refused';
        END IF;
      END LOOP;
      SELECT string_agg(format('%I', key), ', '), string_agg(format('r.%I', key), ', ')
        INTO cols, vals FROM jsonb_object_keys(c.old_values) key;
      EXECUTE format('UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $2) r) WHERE %s',
                     c.table_name, cols, vals, c.table_name, w)
        USING c.row_key, c.old_values;
    END IF;
  END LOOP;
  UPDATE public.change_log SET undone_at = now() WHERE action_id = _action_id;
  PERFORM set_config('app.undoing', 'off', true);
END;
$$;

-- Staff assistant rate limiting: written/read only by the edge function (service role).
CREATE TABLE IF NOT EXISTS public.assistant_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_usage_user_at ON public.assistant_usage (user_id, at DESC);
ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Security review fixes on 20261121030000
-- ============================================================

-- (4) Undo still needs the section permission the change used.
CREATE OR REPLACE FUNCTION public.change_log_perms(_table TEXT)
RETURNS TEXT[] LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE _table
    WHEN 'orders' THEN ARRAY['orders.update']
    WHEN 'order_updates' THEN ARRAY['orders.create', 'orders.update']
    WHEN 'production_batches' THEN ARRAY['batches.update']
    WHEN 'batch_dispatches' THEN ARRAY['dispatch.create', 'dispatch.update']
    WHEN 'worker_inbox_messages' THEN ARRAY['inbox.update']
    WHEN 'client_inbox_messages' THEN ARRAY['inbox.update']
    WHEN 'batch_department_status' THEN ARRAY['batches.update', 'inbox.update', 'employees.delete']
    ELSE ARRAY[]::TEXT[] END
$$;

CREATE OR REPLACE FUNCTION public.undo_action(_action_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; cur JSONB; k TEXT; cols TEXT; vals TEXT; w TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.change_log WHERE action_id = _action_id AND changed_by = auth.uid()) THEN
    RAISE EXCEPTION 'Nothing to undo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.change_log WHERE action_id = _action_id
             AND (undone_at IS NOT NULL OR changed_at <= now() - interval '10 minutes')) THEN
    RAISE EXCEPTION 'Undo window (10 minutes) has passed or it was already undone';
  END IF;
  IF EXISTS (SELECT 1 FROM public.change_log WHERE action_id = _action_id
             AND NOT public.has_any_permission(auth.uid(), public.change_log_perms(table_name))) THEN
    RAISE EXCEPTION 'You no longer have permission to undo this';
  END IF;
  PERFORM set_config('app.undoing', 'on', true);
  FOR c IN SELECT * FROM public.change_log WHERE action_id = _action_id ORDER BY id DESC LOOP
    w := public.change_log_where(c.table_name, c.row_key);
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %s FOR UPDATE', c.table_name, w) INTO cur USING c.row_key;
    IF c.op = 'INSERT' THEN
      IF cur IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.%I t WHERE %s', c.table_name, w) USING c.row_key;
      END IF;
    ELSE
      IF cur IS NULL THEN RAISE EXCEPTION 'A changed record no longer exists; cannot undo'; END IF;
      FOR k IN SELECT jsonb_object_keys(c.new_values) LOOP
        IF (cur -> k) IS DISTINCT FROM (c.new_values -> k) THEN
          RAISE EXCEPTION 'Someone changed this record again after you; undo refused';
        END IF;
      END LOOP;
      SELECT string_agg(format('%I', key), ', '), string_agg(format('r.%I', key), ', ')
        INTO cols, vals FROM jsonb_object_keys(c.old_values) key;
      EXECUTE format('UPDATE public.%I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $2) r) WHERE %s',
                     c.table_name, cols, vals, c.table_name, w)
        USING c.row_key, c.old_values;
    END IF;
  END LOOP;
  UPDATE public.change_log SET undone_at = now() WHERE action_id = _action_id;
  PERFORM set_config('app.undoing', 'off', true);
END;
$$;

-- (2) Track who last changed a draft (header or lines).
ALTER TABLE public.vendor_bills ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.vendor_payments ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.client_payments ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
-- Backfill audit columns only; guards off so a closed month can't block the migration.
ALTER TABLE public.vendor_bills DISABLE TRIGGER guard_vendor_bills;
ALTER TABLE public.vendor_payments DISABLE TRIGGER guard_vendor_payments;
ALTER TABLE public.client_payments DISABLE TRIGGER guard_client_payments;
ALTER TABLE public.expenses DISABLE TRIGGER guard_expenses;
UPDATE public.vendor_bills SET modified_by = created_by WHERE modified_by IS NULL;
UPDATE public.vendor_payments SET modified_by = created_by WHERE modified_by IS NULL;
UPDATE public.client_payments SET modified_by = created_by WHERE modified_by IS NULL;
UPDATE public.expenses SET modified_by = created_by WHERE modified_by IS NULL;
ALTER TABLE public.vendor_bills ENABLE TRIGGER guard_vendor_bills;
ALTER TABLE public.vendor_payments ENABLE TRIGGER guard_vendor_payments;
ALTER TABLE public.client_payments ENABLE TRIGGER guard_client_payments;
ALTER TABLE public.expenses ENABLE TRIGGER guard_expenses;

-- (1)(3) Creator and timestamps are server-set and immutable outside RPCs.
CREATE OR REPLACE FUNCTION public.guard_finance_doc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rpc BOOLEAN := coalesce(current_setting('app.finance_rpc', true), '') = 'on';
  n JSONB; o JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Finance entries are never deleted: discard a draft or void a posted entry';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT rpc THEN
      NEW.created_by := auth.uid();
      NEW.created_at := now();
    END IF;
    NEW.modified_by := COALESCE(NEW.created_by, auth.uid());
    NEW.modified_at := now();
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
    IF NOT rpc OR (n - 'voided_by_id' - 'void_reason' - 'updated_at' - 'modified_at' - 'modified_by')
                  <> (o - 'voided_by_id' - 'void_reason' - 'updated_at' - 'modified_at' - 'modified_by') THEN
      RAISE EXCEPTION 'Posted entries cannot be edited. Void it instead.';
    END IF;
    RETURN NEW;
  END IF;
  -- Draft: free edits, but lifecycle/audit fields only via RPC.
  IF NOT rpc AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
      OR NEW.posted_by IS DISTINCT FROM OLD.posted_by OR NEW.self_approved IS DISTINCT FROM OLD.self_approved
      OR NEW.discarded_at IS DISTINCT FROM OLD.discarded_at OR NEW.reverses_id IS DISTINCT FROM OLD.reverses_id
      OR NEW.voided_by_id IS DISTINCT FROM OLD.voided_by_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Use Approve / Discard / Void for that';
  END IF;
  IF NOT rpc THEN
    NEW.modified_by := auth.uid();
    NEW.modified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- (2) Approver must differ from creator AND last editor, and approves exactly
-- the version they saw (_expected_modified_at).
DROP FUNCTION IF EXISTS public.post_finance_entry(TEXT, UUID);
CREATE OR REPLACE FUNCTION public.post_finance_entry(_table TEXT, _id UUID, _expected_modified_at TIMESTAMPTZ)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row JSONB; is_admin BOOLEAN := public.has_role(auth.uid(), 'admin'); involved BOOLEAN;
BEGIN
  PERFORM public.finance_check_table(_table);
  IF NOT public.has_permission(auth.uid(), 'finance.approve') THEN
    RAISE EXCEPTION 'You need Finance > Approve to post entries';
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1 FOR UPDATE', _table) INTO row USING _id;
  IF row IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF row ->> 'status' <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be approved'; END IF;
  IF (row ->> 'modified_at')::timestamptz IS DISTINCT FROM _expected_modified_at THEN
    RAISE EXCEPTION 'This entry changed after you opened it. Refresh and check it again.';
  END IF;
  involved := (row ->> 'created_by')::uuid = auth.uid() OR (row ->> 'modified_by')::uuid = auth.uid();
  IF involved AND NOT is_admin THEN
    RAISE EXCEPTION 'Maker-checker: someone who did not create or edit this entry must approve it';
  END IF;
  IF _table = 'vendor_bills' AND (row ->> 'total_amount')::numeric <= 0 THEN
    RAISE EXCEPTION 'A bill needs at least one line before approval';
  END IF;
  PERFORM set_config('app.finance_rpc', 'on', true);
  EXECUTE format('UPDATE public.%I SET status = ''posted'', posted_at = now(), posted_by = $2, self_approved = $3 WHERE id = $1', _table)
    USING _id, auth.uid(), involved;
  PERFORM set_config('app.finance_rpc', 'off', true);
END;
$$;
