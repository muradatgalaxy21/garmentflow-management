-- Review fixes for office entries:
-- 1. resolve_office_entry: the sender check applies to Accept only; Deny always works.
-- 2. dispatch_availability: office packing rows count only once the owner accepted the slip.

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
  -- Deny always works (so slips of a manager who lost access can still be cleared).
  IF _decision = 'accepted' AND NOT (public.has_role(m.worker_id, 'admin') OR public.has_permission(m.worker_id, 'batches.update')) THEN
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

CREATE OR REPLACE FUNCTION public.dispatch_availability(p_batch_id UUID DEFAULT NULL)
RETURNS TABLE (batch_id UUID, packed_pcs INT, dispatched_pcs INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id,
         COALESCE(NULLIF((SELECT SUM((e.payload->>'quantity_completed')::numeric)::int
                            FROM department_entries e
                           WHERE e.batch_id = b.id AND e.department = 'packing' AND e.stage = 'end'
                             AND e.payload->>'quantity_completed' ~ '^[0-9.]+$'
                             AND (e.payload->>'office_entry' IS DISTINCT FROM 'true' OR e.payload->>'accepted' = 'true')), 0), b.total_quantity),
         COALESCE((SELECT SUM(d.pcs_count)::int FROM batch_dispatches d WHERE d.batch_id = b.id), 0)
    FROM production_batches b
   WHERE b.status = 'completed' AND (p_batch_id IS NULL OR b.id = p_batch_id);
$$;
