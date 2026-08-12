-- ============================================================
-- PIPELINE STAGES 7-9: BUTTON OPS, CLIPPING, PRESS
-- Migration: 20260812010000_pipeline_stage_7_8_9.sql
--
-- Adds three new department_sequence stages after Stitching Hall (6):
--   7. button_ops   (own worker dept; operation_type enum
--                    button/buttonhole/eyelet/bartack; button/eyelet
--                    consume accessory inventory via inventory_movements,
--                    buttonhole/bartack do not)
--   8. clipping     (own worker dept; garment_type + pcs; rate_per_pcs
--                    pulled read-only from department_cost_rates, same
--                    admin-set pattern as printing/embroidery)
--   9. press        (own worker dept; pcs_pressed only, no rate/stock)
--
-- All three key off production_bundles.id (bundle_id), same as
-- Stitching Hall — no new tables needed, bundles already exist.
-- ============================================================

-- ============================================================
-- 1. WIDEN DEPARTMENT CHECK CONSTRAINTS
-- ============================================================
ALTER TABLE public.department_sequence DROP CONSTRAINT IF EXISTS department_sequence_department_check;
ALTER TABLE public.department_sequence ADD CONSTRAINT department_sequence_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press'));

ALTER TABLE public.batch_department_status DROP CONSTRAINT IF EXISTS batch_department_status_department_check;
ALTER TABLE public.batch_department_status ADD CONSTRAINT batch_department_status_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press'));

ALTER TABLE public.department_entries DROP CONSTRAINT IF EXISTS department_entries_department_check;
ALTER TABLE public.department_entries ADD CONSTRAINT department_entries_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'lot_bundling', 'stitching', 'button_ops', 'clipping', 'press'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_department_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_department_check
  CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery', 'quality', 'stitching', 'button_ops', 'clipping', 'press'));

-- Strict sequence after Stitching Hall (order_index 6) — each stage its
-- own parallel_group so it fully gates the next, same as stages 4-6.
INSERT INTO public.department_sequence (department, order_index, parallel_group) VALUES
  ('button_ops', 7, 5),
  ('clipping', 8, 6),
  ('press', 9, 7)
ON CONFLICT (department) DO NOTHING;

-- ============================================================
-- 2. CLIPPING RATE: reuse department_cost_rates (admin/manager-set,
-- read-only to workers), same pattern as printing/embroidery.
-- Label is always 'default' (one rate per pcs, not per-color).
-- ============================================================
ALTER TABLE public.department_cost_rates DROP CONSTRAINT IF EXISTS department_cost_rates_department_check;
ALTER TABLE public.department_cost_rates ADD CONSTRAINT department_cost_rates_department_check
  CHECK (department IN ('printing', 'embroidery', 'clipping'));

CREATE OR REPLACE FUNCTION public.notify_on_missing_department_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT;
  v_rate_exists BOOLEAN;
  v_style TEXT;
BEGIN
  IF NEW.department NOT IN ('printing', 'embroidery', 'clipping') THEN
    RETURN NEW;
  END IF;

  v_label := COALESCE(NEW.payload ->> 'color', NEW.payload ->> 'label', 'default');

  SELECT EXISTS (
    SELECT 1 FROM public.department_cost_rates
    WHERE department = NEW.department AND label = v_label
  ) INTO v_rate_exists;

  IF NOT v_rate_exists THEN
    SELECT style_number INTO v_style
      FROM public.production_batches WHERE id = NEW.batch_id;

    INSERT INTO public.admin_notifications (type, title, message, batch_id)
    VALUES (
      'missing_department_rate',
      'Rate Not Set: ' || NEW.department || ' - ' || v_label,
      'A worker submitted a "' || NEW.department || '" entry for batch style "'
        || COALESCE(v_style, '?') || '" (label "' || v_label
        || '"), but no rate is configured. Please set the rate.',
      NEW.batch_id
    );
  END IF;

  RETURN NEW;
END;
$$;
