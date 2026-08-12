-- ============================================================
-- PIPELINE STAGES 4-6: QUALITY, LOT BUNDLING, STITCHING HALL
-- Migration: 20260812000000_pipeline_stage_4_5_6.sql
--
-- Adds three new department_sequence stages after the existing
-- accessories -> cutting -> [sticker|printing|embroidery] chain:
--   4. quality        (own worker dept, standard start/end gate)
--   5. lot_bundling    (NOT a separate worker dept — cutting workers'
--                       second pass on a batch once cutting itself is
--                       closed; app picks this "effective department"
--                       once profiles.department = 'cutting' AND their
--                       cutting stage is already closed for the batch)
--   6. stitching       (own worker dept, multi-worker circulation
--                       between sub-departments; still uses the
--                       existing start/end + admin-verification gate
--                       for closing the whole stage on a batch, plus a
--                       new bundle_transfers log for in-stage movement)
--
-- Also adds production_bundles (stage 5 creates these; stage 6+ key
-- off bundle_id per §4.2 of plan.md) and profiles.sub_department
-- (stitching sub-dept assignment: singer/overlock/flatlock/lock_stitch).
-- ============================================================

-- ============================================================
-- 1. WIDEN DEPARTMENT CHECK CONSTRAINTS
-- ============================================================
ALTER TABLE public.department_sequence DROP CONSTRAINT IF EXISTS department_sequence_department_check;
ALTER TABLE public.department_sequence ADD CONSTRAINT department_sequence_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching'));

ALTER TABLE public.batch_department_status DROP CONSTRAINT IF EXISTS batch_department_status_department_check;
ALTER TABLE public.batch_department_status ADD CONSTRAINT batch_department_status_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching'));

ALTER TABLE public.department_entries DROP CONSTRAINT IF EXISTS department_entries_department_check;
ALTER TABLE public.department_entries ADD CONSTRAINT department_entries_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching'));

-- profiles.department: 'lot_bundling' is deliberately excluded — it is
-- never a worker's assigned department, only 'cutting' workers reach it
-- (their second pass once cutting is closed for a batch).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_department_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'stitching'));

INSERT INTO public.department_sequence (department, order_index, parallel_group) VALUES
  ('quality', 4, 2),
  ('lot_bundling', 5, 3),
  ('stitching', 6, 4)
ON CONFLICT (department) DO NOTHING;

-- ============================================================
-- 2. STITCHING SUB-DEPARTMENT ASSIGNMENT
-- One fixed sub-dept per worker, admin/manager-assignable only
-- (same guard pattern as profiles.department).
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sub_department TEXT
    CHECK (sub_department IN ('singer', 'overlock', 'flatlock', 'lock_stitch'));

CREATE OR REPLACE FUNCTION public.guard_profile_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.department IS DISTINCT FROM OLD.department OR NEW.sub_department IS DISTINCT FROM OLD.sub_department)
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    NEW.department := OLD.department;
    NEW.sub_department := OLD.sub_department;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. PRODUCTION BUNDLES (stage 5 output; stages 6+ key off bundle_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  lot_no TEXT NOT NULL,
  bundle_no INT NOT NULL,
  pcs_count INT NOT NULL CHECK (pcs_count > 0),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, lot_no, bundle_no)
);

ALTER TABLE public.production_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view production bundles" ON public.production_bundles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Cutting workers create bundles" ON public.production_bundles
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = 'cutting'
    )
  );

CREATE INDEX idx_production_bundles_batch ON public.production_bundles(batch_id);

-- ============================================================
-- 4. BUNDLE TRANSFERS (stage 6 circulation log)
-- Any sub-dept can receive from any sub-dept, any number of times —
-- no fixed order. from_sub_dept is null for a bundle's first entry
-- into Stitching Hall.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bundle_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.production_bundles(id) ON DELETE CASCADE,
  from_sub_dept TEXT CHECK (from_sub_dept IN ('singer', 'overlock', 'flatlock', 'lock_stitch')),
  to_sub_dept TEXT NOT NULL CHECK (to_sub_dept IN ('singer', 'overlock', 'flatlock', 'lock_stitch')),
  pcs INT NOT NULL CHECK (pcs > 0),
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bundle_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view bundle transfers" ON public.bundle_transfers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Stitching workers log own transfers" ON public.bundle_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    worker_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = 'stitching'
    )
  );

CREATE INDEX idx_bundle_transfers_bundle ON public.bundle_transfers(bundle_id, created_at DESC);

-- ============================================================
-- 5. MISSING-RATE NOTIFICATION: NOT APPLICABLE TO NEW STAGES
-- Quality/lot_bundling/stitching carry no per-unit cost rate (§4.1
-- inventory link column is "none" for all three) — the existing
-- notify_on_missing_department_rate() trigger already no-ops for any
-- department not in ('printing', 'embroidery'), so no change needed.
-- ============================================================
