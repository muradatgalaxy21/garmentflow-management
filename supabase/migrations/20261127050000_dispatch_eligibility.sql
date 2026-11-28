-- Dispatch eligibility (BUG-19): only 'completed' batches can be dispatched, in pieces,
-- never more than packed minus already dispatched. Enforced in DB so the UI can't be bypassed.
-- batch_dispatches.pcs_count is nullable only for rows logged before this migration.

ALTER TABLE public.batch_dispatches
  ADD COLUMN IF NOT EXISTS pcs_count INT CHECK (pcs_count > 0);

-- Per completed batch: pieces packed (packing END quantity_completed; fallback batch total) and pieces dispatched.
CREATE OR REPLACE FUNCTION public.dispatch_availability(p_batch_id UUID DEFAULT NULL)
RETURNS TABLE (batch_id UUID, packed_pcs INT, dispatched_pcs INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id,
         COALESCE(NULLIF((SELECT SUM((e.payload->>'quantity_completed')::numeric)::int
                            FROM department_entries e
                           WHERE e.batch_id = b.id AND e.department = 'packing' AND e.stage = 'end'
                             AND e.payload->>'quantity_completed' ~ '^[0-9.]+$'), 0), b.total_quantity),
         COALESCE((SELECT SUM(d.pcs_count)::int FROM batch_dispatches d WHERE d.batch_id = b.id), 0)
    FROM production_batches b
   WHERE b.status = 'completed' AND (p_batch_id IS NULL OR b.id = p_batch_id);
$$;
GRANT EXECUTE ON FUNCTION public.dispatch_availability(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_packed INT; v_done INT;
BEGIN
  IF NEW.pcs_count IS NULL THEN
    RAISE EXCEPTION 'Enter the number of pieces dispatched';
  END IF;
  SELECT a.packed_pcs, a.dispatched_pcs INTO v_packed, v_done FROM public.dispatch_availability(NEW.batch_id) a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only completed batches can be dispatched';
  END IF;
  -- On UPDATE the row's own old pieces are already in dispatched_pcs.
  IF TG_OP = 'UPDATE' THEN v_done := v_done - COALESCE(OLD.pcs_count, 0); END IF;
  IF v_done + NEW.pcs_count > v_packed THEN
    RAISE EXCEPTION 'Only % pieces left to dispatch for this batch', GREATEST(v_packed - v_done, 0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_dispatch ON public.batch_dispatches;
CREATE TRIGGER guard_dispatch BEFORE INSERT OR UPDATE OF batch_id, pcs_count ON public.batch_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_dispatch();
