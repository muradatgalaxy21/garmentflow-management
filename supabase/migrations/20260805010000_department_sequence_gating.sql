-- ============================================================
-- DEPARTMENT SEQUENCE GATING
-- Migration: 20260805010000_department_sequence_gating.sql
--
-- Adds:
--   1. department_sequence: static ordering of the 5 wired departments
--      (accessories -> cutting -> [sticker | printing | embroidery]).
--      More stages (lot bundling, stitching hall, etc.) get inserted
--      here later without touching app code.
--   2. batch_department_status: open/closed state per batch+department,
--      opened only by Start scan, closed only by End scan.
--   3. department_entries.stage: distinguishes the Start form entry
--      from the generic End confirmation entry.
--   4. Notify-on-department-closed trigger (in-app placeholder for the
--      manager email that isn't wired up yet).
-- ============================================================

-- ============================================================
-- 1. DEPARTMENT SEQUENCE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.department_sequence (
  department TEXT PRIMARY KEY
    CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery')),
  order_index INT NOT NULL,
  -- Departments sharing an order_index are alternatives for a batch
  -- (only one of them is used per batch), not a strict sub-sequence.
  parallel_group INT NOT NULL
);

INSERT INTO public.department_sequence (department, order_index, parallel_group) VALUES
  ('accessories', 1, 1),
  ('cutting', 2, 1),
  ('sticker', 3, 1),
  ('printing', 3, 1),
  ('embroidery', 3, 1)
ON CONFLICT (department) DO NOTHING;

ALTER TABLE public.department_sequence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view department sequence" ON public.department_sequence
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 2. BATCH DEPARTMENT STATUS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.batch_department_status (
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  department TEXT NOT NULL
    CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by UUID REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (batch_id, department)
);

ALTER TABLE public.batch_department_status ENABLE ROW LEVEL SECURITY;

-- Every worker needs to read every batch's statuses to know whether the
-- department ahead of theirs in sequence is closed yet.
CREATE POLICY "Authenticated users view batch department status" ON public.batch_department_status
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Workers open own department" ON public.batch_department_status
  FOR INSERT TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = batch_department_status.department
    )
  );

CREATE POLICY "Workers close own department" ON public.batch_department_status
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = batch_department_status.department
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = batch_department_status.department
    )
  );

CREATE INDEX idx_batch_department_status_batch ON public.batch_department_status(batch_id);

-- ============================================================
-- 3. DEPARTMENT_ENTRIES: START VS END STAGE
-- ============================================================
ALTER TABLE public.department_entries
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'start' CHECK (stage IN ('start', 'end'));

-- ============================================================
-- 4. NOTIFY ON DEPARTMENT CLOSED (placeholder for manager email)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_department_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_style TEXT;
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    SELECT style_number INTO v_style
      FROM public.production_batches WHERE id = NEW.batch_id;

    INSERT INTO public.admin_notifications (type, title, message, batch_id)
    VALUES (
      'info',
      'Department Closed: ' || NEW.department,
      'Style "' || COALESCE(v_style, '?') || '" finished the "' || NEW.department
        || '" department. (Manager email notification not implemented yet — see progress.md.)',
      NEW.batch_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_department_closed
  AFTER UPDATE ON public.batch_department_status
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_department_closed();
