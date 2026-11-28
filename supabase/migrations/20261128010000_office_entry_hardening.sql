-- Hardening for office entries (security review of 20261128000000):
-- 1. office_entry inbox rows can only be created/changed inside submit_office_entry /
--    resolve_office_entry (a worker could otherwise insert a forged one, and inbox editors
--    could change entry_ids / department_finished before the owner accepts).
-- 2. resolve_office_entry only acts on the sender's own office rows for that batch + department,
--    and only when the sender is an office user (admin or batches.update).

CREATE OR REPLACE FUNCTION public.guard_office_entry_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.type = 'office_entry' OR (TG_OP = 'UPDATE' AND OLD.type = 'office_entry'))
     AND coalesce(current_setting('app.office_entry_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Office entries can only be filed from Manager Entry and resolved by the owner';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_office_entry_messages ON public.worker_inbox_messages;
CREATE TRIGGER guard_office_entry_messages BEFORE INSERT OR UPDATE ON public.worker_inbox_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_office_entry_messages();

CREATE OR REPLACE FUNCTION public.submit_office_entry(
  _batch_id UUID, _department TEXT, _work_date DATE, _rate_label TEXT,
  _finished BOOLEAN, _notes TEXT, _rows JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  b RECORD;
  st RECORD;
  r JSONB;
  blocker TEXT;
  w_id UUID; done_n INT; waste_n INT; panel UUID;
  rate NUMERIC; rlabel TEXT; has_panels BOOLEAN;
  start_id UUID; end_id UUID;
  ids UUID[] := '{}';
  summary JSONB := '[]';
  tot_done INT := 0; tot_waste INT := 0; n_rows INT := 0;
  msg_id UUID;
BEGIN
  IF NOT (public.has_role(uid, 'admin') OR public.has_permission(uid, 'batches.update')) THEN
    RAISE EXCEPTION 'You do not have permission to enter work';
  END IF;
  IF _department = 'accessories' OR NOT EXISTS (SELECT 1 FROM department_sequence WHERE department = _department) THEN
    RAISE EXCEPTION 'Department % cannot be entered here', _department;
  END IF;
  IF _work_date IS NULL OR _work_date > (now() AT TIME ZONE 'Asia/Karachi')::date THEN
    RAISE EXCEPTION 'Work date must be today or earlier';
  END IF;
  IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) = 0 THEN
    RAISE EXCEPTION 'Add at least one worker row';
  END IF;

  SELECT id, style_number, status INTO b FROM production_batches WHERE id = _batch_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF b.status = 'paused' THEN
    RAISE EXCEPTION 'This batch is paused by admin. No new work can be logged until it is resumed.';
  END IF;
  IF b.status <> 'in_progress' THEN RAISE EXCEPTION 'Batch is %', b.status; END IF;

  blocker := public.department_gate_blocker(_batch_id, _department);
  IF blocker IS NOT NULL THEN
    RAISE EXCEPTION 'Previous department "%" has not finished this batch yet', blocker;
  END IF;

  SELECT * INTO st FROM batch_department_status WHERE batch_id = _batch_id AND department = _department FOR UPDATE;
  IF st.batch_id IS NOT NULL AND st.status = 'closed' THEN
    RAISE EXCEPTION 'This department is already closed for this batch';
  END IF;
  IF st.batch_id IS NULL THEN
    -- Office entry is office-verified: no separate start approval step.
    INSERT INTO batch_department_status (batch_id, department, status, opened_by, start_verification_status, end_enabled)
    VALUES (_batch_id, _department, 'open', uid, 'accepted', true);
  END IF;

  has_panels := _department = 'cutting' AND EXISTS (SELECT 1 FROM batch_phase_panel_rates WHERE batch_id = _batch_id);

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    w_id := (r->>'worker_id')::uuid;
    done_n := coalesce((r->>'completed')::int, 0);
    waste_n := coalesce((r->>'wasted')::int, 0);
    panel := nullif(r->>'panel_rate_id', '')::uuid;
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = w_id AND role = 'worker') THEN
      RAISE EXCEPTION 'Row %: not a worker', n_rows + 1;
    END IF;
    IF done_n < 0 OR waste_n < 0 OR done_n + waste_n = 0 THEN
      RAISE EXCEPTION 'Row %: enter pieces done or wasted', n_rows + 1;
    END IF;

    rate := NULL; rlabel := NULL;
    IF _department = 'cutting' THEN
      IF panel IS NOT NULL THEN
        SELECT rate_per_piece, label INTO rate, rlabel FROM batch_phase_panel_rates WHERE id = panel AND batch_id = _batch_id;
        IF rlabel IS NULL THEN RAISE EXCEPTION 'Row %: panel rate is not on this batch', n_rows + 1; END IF;
      ELSIF has_panels THEN
        RAISE EXCEPTION 'Row %: pick the panel', n_rows + 1;
      END IF;
    ELSIF _department = 'stitching' THEN
      SELECT sub_department INTO rlabel FROM profiles WHERE id = w_id;
      SELECT c.rate INTO rate FROM department_cost_rates c WHERE c.department = 'stitching' AND c.label = rlabel;
    ELSIF _department <> 'lot_bundling' THEN
      rlabel := coalesce(nullif(_rate_label, ''), 'default');
      SELECT c.rate INTO rate FROM department_cost_rates c WHERE c.department = _department AND c.label = rlabel;
    END IF;

    INSERT INTO department_entries (department, batch_id, worker_id, stage, payload, entered_by, work_date)
    VALUES (_department, _batch_id, w_id, 'start',
            jsonb_build_object('office_entry', true, 'rate_per_piece', rate, 'rate_label', rlabel, 'panel_rate_id', panel),
            uid, _work_date)
    RETURNING id INTO start_id;
    INSERT INTO department_entries (department, batch_id, worker_id, stage, payload, entered_by, work_date)
    VALUES (_department, _batch_id, w_id, 'end',
            jsonb_build_object('office_entry', true, 'quantity_completed', done_n, 'quantity_wasted', waste_n,
                               'rate_per_piece', rate, 'rate_label', rlabel, 'panel_rate_id', panel,
                               'notes', nullif(btrim(coalesce(_notes, '')), '')),
            uid, _work_date)
    RETURNING id INTO end_id;

    ids := ids || start_id || end_id;
    summary := summary || jsonb_build_object('worker_id', w_id, 'completed', done_n, 'wasted', waste_n, 'rate', rate, 'rate_label', rlabel);
    tot_done := tot_done + done_n; tot_waste := tot_waste + waste_n; n_rows := n_rows + 1;
  END LOOP;

  UPDATE batch_department_status SET end_verification_status = 'pending'
   WHERE batch_id = _batch_id AND department = _department;

  PERFORM set_config('app.office_entry_write', 'on', true);
  INSERT INTO worker_inbox_messages (type, worker_id, batch_id, department, message, payload)
  VALUES ('office_entry', uid, _batch_id, _department,
          format('Office entry, batch %s, work date %s: %s worker row(s), %s done, %s wasted%s.',
                 b.style_number, to_char(_work_date, 'DD-Mon-YYYY'), n_rows, tot_done, tot_waste,
                 CASE WHEN _finished THEN '. Department finished' ELSE '' END),
          jsonb_build_object('entry_ids', to_jsonb(ids), 'department_finished', coalesce(_finished, false),
                             'work_date', _work_date, 'rows', summary, 'notes', nullif(btrim(coalesce(_notes, '')), '')))
  RETURNING id INTO msg_id;
  RETURN msg_id;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_office_entry(_msg_id UUID, _decision TEXT, _note TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  m RECORD;
  ids UUID[];
  closed BOOLEAN := false;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Only the owner (admin) can accept or deny office entries';
  END IF;
  IF _decision NOT IN ('accepted', 'denied') THEN RAISE EXCEPTION 'Unknown decision'; END IF;
  SELECT * INTO m FROM worker_inbox_messages WHERE id = _msg_id FOR UPDATE;
  IF m.id IS NULL OR m.type <> 'office_entry' THEN RAISE EXCEPTION 'Office entry not found'; END IF;
  IF m.status <> 'pending' THEN RAISE EXCEPTION 'This entry was already %', m.status; END IF;
  -- A slip only counts when its sender may enter work, and it only ever touches that sender's own
  -- office rows on this batch + department (never arbitrary ids from the payload).
  IF NOT (public.has_role(m.worker_id, 'admin') OR public.has_permission(m.worker_id, 'batches.update')) THEN
    RAISE EXCEPTION 'This office entry was not filed by an office user';
  END IF;
  ids := ARRAY(
    SELECT e.id FROM department_entries e
     WHERE e.id IN (SELECT jsonb_array_elements_text(m.payload->'entry_ids')::uuid)
       AND e.batch_id = m.batch_id AND e.department = m.department
       AND e.entered_by = m.worker_id AND e.payload->>'office_entry' = 'true');
  PERFORM set_config('app.office_entry_write', 'on', true);

  IF _decision = 'accepted' THEN
    -- Pay counts on accept (BUG-6): rate x completed on the END rows; wasted unpaid.
    UPDATE department_entries
       SET payload = payload || '{"accepted": true}'::jsonb,
           total_cost = CASE
             WHEN total_cost IS NULL AND jsonb_typeof(payload->'rate_per_piece') = 'number'
             THEN (payload->>'rate_per_piece')::numeric * (payload->>'quantity_completed')::numeric
             ELSE total_cost END
     WHERE id = ANY(ids) AND stage = 'end';
    IF (m.payload->>'department_finished')::boolean THEN
      UPDATE batch_department_status
         SET status = 'closed', closed_by = uid, closed_at = now(), end_verification_status = 'accepted'
       WHERE batch_id = m.batch_id AND department = m.department;
      closed := true;
    END IF;
  ELSE
    DELETE FROM department_entries WHERE id = ANY(ids);
  END IF;

  UPDATE worker_inbox_messages
     SET status = _decision, resolved_by = uid, resolved_at = now(), resolution_note = nullif(btrim(coalesce(_note, '')), '')
   WHERE id = _msg_id;

  IF NOT closed THEN
    IF _decision = 'denied'
       AND NOT EXISTS (SELECT 1 FROM department_entries WHERE batch_id = m.batch_id AND department = m.department) THEN
      -- Nothing left in this department: drop the open status row so it reads "not started" again.
      DELETE FROM batch_department_status
       WHERE batch_id = m.batch_id AND department = m.department AND status = 'open';
    ELSE
      UPDATE batch_department_status
         SET end_verification_status = CASE WHEN EXISTS (
               SELECT 1 FROM worker_inbox_messages x
                WHERE x.batch_id = m.batch_id AND x.department = m.department
                  AND x.status = 'pending' AND x.type IN ('office_entry', 'batch_end_verification'))
             THEN 'pending' ELSE 'none' END
       WHERE batch_id = m.batch_id AND department = m.department AND status = 'open';
    END IF;
  END IF;
END $$;
