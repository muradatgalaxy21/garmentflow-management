-- ============================================================
-- CUTTING PANEL RATES
-- Cutting can have multiple garment panels (front/back/sleeve/
-- collar/...) that each pay a different Rs/piece rate depending
-- on panel + size. batch_phase_rates only holds one flat rate
-- per batch+phase, which isn't enough for Cutting.
--
-- Adds a free-text label + rate list per batch+phase (used by
-- the admin "Piece Rates" dialog when phase = Cutting; other
-- phases keep using the existing single batch_phase_rates row)
-- and a nullable batch_tracking.panel_rate_id so the manual
-- bulk-log entry can pin a tracking row to the panel rate that
-- was actually paid, instead of the phase's flat rate.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.batch_phase_panel_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES public.production_phases(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  rate_per_piece NUMERIC NOT NULL DEFAULT 0 CHECK (rate_per_piece >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.batch_phase_panel_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view panel rates"
  ON public.batch_phase_panel_rates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff manage panel rates"
  ON public.batch_phase_panel_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE INDEX idx_panel_rates_batch_phase ON public.batch_phase_panel_rates(batch_id, phase_id);

ALTER TABLE public.batch_tracking
  ADD COLUMN IF NOT EXISTS panel_rate_id UUID REFERENCES public.batch_phase_panel_rates(id) ON DELETE SET NULL;

-- ============================================================
-- worker_inbox_messages.department was never widened when the
-- pipeline grew from 5 to 13 departments (20260812020000 updated
-- department_sequence/batch_department_status/department_entries/
-- profiles but missed this table) — so a batch_start_verification
-- or batch_end_verification message for any of the 8 newer
-- departments (quality, lot_bundling, stitching, button_ops,
-- clipping, press, quality_final, packing) violated this CHECK
-- and never reached the admin inbox.
-- ============================================================
ALTER TABLE public.worker_inbox_messages DROP CONSTRAINT IF EXISTS worker_inbox_messages_department_check;
ALTER TABLE public.worker_inbox_messages ADD CONSTRAINT worker_inbox_messages_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press', 'quality_final', 'packing'));
