-- ============================================================
-- PIPELINE STAGES 10-13: QUALITY (FINAL), QUALITY COMPLETE, PACKING, DISPATCH
-- Migration: 20260812020000_pipeline_stage_10_11_12_13.sql
--
--   10. quality_final  (own worker dept; bundle_id, verdict enum
--                       confirm/alter/reject; alter captures which
--                       upstream department it's routed back to)
--   11. Quality Complete — NOT a worker form, a computed status: a bundle
--       is quality_complete once its latest quality_final verdict is
--       confirm or reject, or a later re-check supersedes an earlier
--       alter. Exposed via the bundle_quality_status view.
--   12. packing        (own worker dept; bundle_id, cartons_packed,
--                       pcs_per_carton validated against an admin-set
--                       pack_ratio JSON config per batch; packaging
--                       material consumed via inventory_movements)
--   13. dispatch        (admin-only, not a worker department — batch_dispatches
--                       table; the "auto-generated batch report" is a
--                       client-side rollup query over department_entries,
--                       no new table needed for it)
-- ============================================================

-- ============================================================
-- 1. WIDEN DEPARTMENT CHECK CONSTRAINTS
-- ============================================================
ALTER TABLE public.department_sequence DROP CONSTRAINT IF EXISTS department_sequence_department_check;
ALTER TABLE public.department_sequence ADD CONSTRAINT department_sequence_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press', 'quality_final', 'packing'));

ALTER TABLE public.batch_department_status DROP CONSTRAINT IF EXISTS batch_department_status_department_check;
ALTER TABLE public.batch_department_status ADD CONSTRAINT batch_department_status_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press', 'quality_final', 'packing'));

ALTER TABLE public.department_entries DROP CONSTRAINT IF EXISTS department_entries_department_check;
ALTER TABLE public.department_entries ADD CONSTRAINT department_entries_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press', 'quality_final', 'packing'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_department_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'stitching', 'button_ops', 'clipping', 'press', 'quality_final', 'packing'));

-- Strict sequence after Press (order_index 9). Quality Complete (plan
-- stage 11) is deliberately not its own row — it's a computed status
-- over quality_final's output, so Packing gates directly on quality_final.
INSERT INTO public.department_sequence (department, order_index, parallel_group) VALUES
  ('quality_final', 10, 8),
  ('packing', 11, 9)
ON CONFLICT (department) DO NOTHING;

-- ============================================================
-- 2. BUNDLE QUALITY CHECKS (stage 10 routing + stage 11 computed status)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bundle_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.production_bundles(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('confirm', 'alter', 'reject')),
  routed_to_department TEXT CHECK (routed_to_department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press')),
  alter_reason TEXT,
  reject_reason TEXT,
  checked_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (verdict != 'alter' OR routed_to_department IS NOT NULL),
  CHECK (verdict != 'reject' OR reject_reason IS NOT NULL)
);

ALTER TABLE public.bundle_quality_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view bundle quality checks" ON public.bundle_quality_checks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Quality final workers log checks" ON public.bundle_quality_checks
  FOR INSERT TO authenticated
  WITH CHECK (
    checked_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = 'quality_final'
    )
  );

CREATE INDEX idx_bundle_quality_checks_bundle ON public.bundle_quality_checks(bundle_id, checked_at DESC);

-- A bundle is "quality_complete" (plan stage 11) once its most recent
-- check resolves to confirm or reject — an "alter" leaves it open until
-- a later re-check (post-rework) supersedes it.
CREATE OR REPLACE VIEW public.bundle_quality_status AS
SELECT DISTINCT ON (bundle_id)
  bundle_id,
  batch_id,
  verdict AS latest_verdict,
  routed_to_department,
  alter_reason,
  reject_reason,
  checked_by,
  checked_at,
  (verdict IN ('confirm', 'reject')) AS is_quality_complete
FROM public.bundle_quality_checks
ORDER BY bundle_id, checked_at DESC;

-- ============================================================
-- 3. PACK RATIO CONFIG (stage 12) — admin/manager-set per batch,
-- read-only to workers, same convention as department_cost_rates.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.batch_pack_ratios (
  batch_id UUID PRIMARY KEY REFERENCES public.production_batches(id) ON DELETE CASCADE,
  ratio JSONB NOT NULL,
  set_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.batch_pack_ratios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view pack ratios" ON public.batch_pack_ratios
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin manager manage pack ratios" ON public.batch_pack_ratios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_batch_pack_ratios_updated_at
  BEFORE UPDATE ON public.batch_pack_ratios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. DISPATCH (stage 13) — admin-only, not a worker department.
-- The "auto-generated batch report" is computed client-side from
-- department_entries; no report table needed.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.batch_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  dispatch_date DATE NOT NULL,
  carrier TEXT,
  carton_count INT NOT NULL CHECK (carton_count > 0),
  dispatch_note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.batch_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin staff manager manage dispatches" ON public.batch_dispatches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX idx_batch_dispatches_batch ON public.batch_dispatches(batch_id, created_at DESC);

-- ============================================================
-- 5. MISSING-RATE NOTIFICATION: NOT APPLICABLE
-- quality_final and packing carry no per-unit cost rate — the existing
-- notify_on_missing_department_rate() trigger already no-ops for any
-- department not in ('printing', 'embroidery', 'clipping').
-- ============================================================
