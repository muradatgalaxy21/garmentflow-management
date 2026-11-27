-- Pause / resume a production batch. Admin only, reason required, permanent history.
-- While paused: no new worker or on-behalf entries (department_entries, batch_tracking).
-- Accepting/denying already-pending approvals is UPDATE-only, so it stays allowed.

ALTER TABLE public.production_batches DROP CONSTRAINT IF EXISTS production_batches_status_check;
ALTER TABLE public.production_batches
  ADD CONSTRAINT production_batches_status_check
  CHECK (status IN ('in_progress', 'paused', 'completed', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.batch_pause_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  action     TEXT NOT NULL CHECK (action IN ('paused', 'resumed')),
  reason     TEXT,
  by_user    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_batch_pause_log_batch ON public.batch_pause_log(batch_id, created_at DESC);
ALTER TABLE public.batch_pause_log ENABLE ROW LEVEL SECURITY;

-- Read-only from the client; rows come only from set_batch_paused().
CREATE POLICY "View batch pause log" ON public.batch_pause_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'batches.view'));

-- Only an admin may move a batch into or out of 'paused' (blocks staff/manager UPDATEs via RLS).
CREATE OR REPLACE FUNCTION public.guard_batch_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status = 'paused' OR NEW.status = 'paused')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can pause or resume a batch';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_batch_pause ON public.production_batches;
CREATE TRIGGER guard_batch_pause BEFORE UPDATE ON public.production_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_batch_pause();

CREATE OR REPLACE FUNCTION public.set_batch_paused(_batch_id UUID, _paused BOOLEAN, _reason TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can pause or resume a batch';
  END IF;
  SELECT status INTO cur FROM public.production_batches WHERE id = _batch_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF _paused THEN
    IF cur <> 'in_progress' THEN RAISE EXCEPTION 'Only an in-progress batch can be paused'; END IF;
    IF coalesce(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to pause a batch'; END IF;
    UPDATE public.production_batches SET status = 'paused' WHERE id = _batch_id;
  ELSE
    IF cur <> 'paused' THEN RAISE EXCEPTION 'Batch is not paused'; END IF;
    UPDATE public.production_batches SET status = 'in_progress' WHERE id = _batch_id;
  END IF;
  INSERT INTO public.batch_pause_log (batch_id, action, reason, by_user)
  VALUES (_batch_id, CASE WHEN _paused THEN 'paused' ELSE 'resumed' END, nullif(btrim(_reason), ''), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.set_batch_paused(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_batch_paused(UUID, BOOLEAN, TEXT) TO authenticated;

-- No new work while paused (workers and manager on-behalf entries alike).
CREATE OR REPLACE FUNCTION public.block_entries_when_paused()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.production_batches WHERE id = NEW.batch_id AND status = 'paused') THEN
    RAISE EXCEPTION 'This batch is paused by admin. No new work can be logged until it is resumed.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS block_entries_when_paused ON public.department_entries;
CREATE TRIGGER block_entries_when_paused BEFORE INSERT ON public.department_entries
  FOR EACH ROW EXECUTE FUNCTION public.block_entries_when_paused();
DROP TRIGGER IF EXISTS block_entries_when_paused ON public.batch_tracking;
CREATE TRIGGER block_entries_when_paused BEFORE INSERT ON public.batch_tracking
  FOR EACH ROW EXECUTE FUNCTION public.block_entries_when_paused();
