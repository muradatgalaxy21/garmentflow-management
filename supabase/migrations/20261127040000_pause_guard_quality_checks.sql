-- bundle_quality_checks carries both batch_id and bundle_id. The generic pause guard only looked at
-- batch_id, so a row could name an unpaused batch while pointing at a bundle of a paused one.
-- Check both, and reject rows where the two disagree.
CREATE OR REPLACE FUNCTION public.block_quality_when_paused()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bundle_batch UUID;
BEGIN
  SELECT batch_id INTO bundle_batch FROM public.production_bundles WHERE id = NEW.bundle_id;
  IF bundle_batch IS DISTINCT FROM NEW.batch_id THEN
    RAISE EXCEPTION 'Bundle does not belong to this batch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.production_batches WHERE id = NEW.batch_id AND status = 'paused') THEN
    RAISE EXCEPTION 'This batch is paused by admin. No new work can be logged until it is resumed.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS block_entries_when_paused ON public.bundle_quality_checks;
DROP TRIGGER IF EXISTS block_quality_when_paused ON public.bundle_quality_checks;
CREATE TRIGGER block_quality_when_paused BEFORE INSERT ON public.bundle_quality_checks
  FOR EACH ROW EXECUTE FUNCTION public.block_quality_when_paused();
