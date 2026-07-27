-- ============================================================
-- WORKER ROLES, SEQUENTIAL PHASE CLOSURE & MULTI-WORKER LOGGING
-- Migration: 20260727030000_worker_roles_and_batch_closure.sql
-- ============================================================

-- 1. Ensure all standard production phases exist with clean sequence numbers
INSERT INTO public.production_phases (name, sequence_order)
VALUES
  ('Cutting', 1),
  ('Stitching', 2),
  ('Singer', 3),
  ('Embroidery', 4),
  ('Printing', 5),
  ('QC', 6),
  ('Packing', 7)
ON CONFLICT (name) DO UPDATE SET sequence_order = EXCLUDED.sequence_order;

-- 2. Create Batch Phase Status table to track explicit closure per batch phase
CREATE TABLE IF NOT EXISTS public.batch_phase_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES public.production_phases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, phase_id)
);

ALTER TABLE public.batch_phase_status ENABLE ROW LEVEL SECURITY;

-- Read policy: authenticated users can view phase statuses
CREATE POLICY "Authenticated users view batch phase status"
  ON public.batch_phase_status
  FOR SELECT TO authenticated
  USING (true);

-- Manage policy: Workers, Staff, Managers, and Admins can update/insert status
CREATE POLICY "Authenticated users manage batch phase status"
  ON public.batch_phase_status
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_batch_phase_status_updated_at
  BEFORE UPDATE ON public.batch_phase_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Function to check if a worker is assigned to a specific phase
CREATE OR REPLACE FUNCTION public.can_worker_enter_phase(_worker_id UUID, _phase_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_phase_name TEXT;
  v_skills TEXT[];
BEGIN
  -- Step 1: Admins, Staff, and Managers are always allowed
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _worker_id AND role IN ('admin', 'staff', 'manager')
  ) THEN
    RETURN true;
  END IF;

  -- Step 2: Get Phase Name
  SELECT name INTO v_phase_name FROM public.production_phases WHERE id = _phase_id;
  IF v_phase_name IS NULL THEN
    RETURN true;
  END IF;

  -- Step 3: Fetch Worker Skills
  SELECT skills INTO v_skills FROM public.profiles WHERE id = _worker_id;

  -- If skills array is empty/null, default to open access for legacy workers
  IF v_skills IS NULL OR array_length(v_skills, 1) IS NULL OR array_length(v_skills, 1) = 0 THEN
    RETURN true;
  END IF;

  -- Step 4: Check substring/case-insensitive match in worker skills
  FOR i IN 1..array_length(v_skills, 1) LOOP
    IF LOWER(v_skills[i]) LIKE '%' || LOWER(v_phase_name) || '%' 
       OR LOWER(v_phase_name) LIKE '%' || LOWER(v_skills[i]) || '%' THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- 4. Function to check if the previous phase for a batch is closed/completed
CREATE OR REPLACE FUNCTION public.is_previous_phase_closed(_batch_id UUID, _phase_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_seq INTEGER;
  v_prev_phase_id UUID;
  v_prev_status TEXT;
  v_prev_completed_qty INTEGER;
BEGIN
  -- Step 1: Find sequence order of current phase
  SELECT sequence_order INTO v_current_seq 
  FROM public.production_phases WHERE id = _phase_id;

  -- If it's the first phase (e.g. Cutting), no previous phase required
  IF v_current_seq IS NULL OR v_current_seq <= 1 THEN
    RETURN true;
  END IF;

  -- Step 2: Find the phase directly preceding this one
  SELECT id INTO v_prev_phase_id
  FROM public.production_phases
  WHERE sequence_order < v_current_seq
  ORDER BY sequence_order DESC
  LIMIT 1;

  IF v_prev_phase_id IS NULL THEN
    RETURN true;
  END IF;

  -- Step 3: Check if explicit closure record exists
  SELECT status INTO v_prev_status
  FROM public.batch_phase_status
  WHERE batch_id = _batch_id AND phase_id = v_prev_phase_id;

  IF v_prev_status = 'closed' THEN
    RETURN true;
  END IF;

  -- Step 4: Check if previous phase has tracking entries with quantity > 0
  SELECT COALESCE(SUM(quantity_completed), 0) INTO v_prev_completed_qty
  FROM public.batch_tracking
  WHERE batch_id = _batch_id AND phase_id = v_prev_phase_id;

  IF v_prev_completed_qty > 0 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
