-- ============================================================
-- DEPARTMENT DATA-ENTRY MODULE
-- Migration: 20260805000000_department_entries.sql
--
-- Adds:
--   1. profiles.department (admin/manager-only assignable)
--   2. inventory_items.attributes (sticker size/type/color/design)
--      + narrow worker read access for accessory/sticker lookup
--   3. department_entries: worker-submitted logs per department
--   4. department_cost_rates: admin/manager-set printing/embroidery costs
--   5. Missing-rate notification trigger (mirrors notify_on_missing_rate)
-- ============================================================

-- ============================================================
-- 1. PROFILES: DEPARTMENT ASSIGNMENT
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department TEXT
    CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery'));

-- Admin/manager need to update OTHER users' profiles (department, skills, etc).
-- The existing "Users update own profile" policy only covers self-updates.
CREATE POLICY "Admin manager update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Belt-and-suspenders: even if a worker's own-row UPDATE reaches this table,
-- silently revert any department change unless the actor is admin/manager.
CREATE OR REPLACE FUNCTION public.guard_profile_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.department IS DISTINCT FROM OLD.department
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    NEW.department := OLD.department;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_profile_department
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_department();

-- ============================================================
-- 2. INVENTORY: STICKER ATTRIBUTES + WORKER LOOKUP ACCESS
-- ============================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}';

-- Workers may browse (not manage) accessory/sticker stock to pick items
-- and see cost/quantity when logging department entries. All other
-- categories and the movements table stay blocked for workers.
CREATE POLICY "Workers view accessory sticker inventory" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'worker')
    AND category IN ('accessory', 'sticker')
  );

-- ============================================================
-- 3. DEPARTMENT ENTRIES
-- Immutable per-department work log, one shared table since the
-- payload shape genuinely differs department to department.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.department_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL
    CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery')),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Set when the entry references a specific inventory item (accessories/sticker lookup)
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  -- Department-specific fields (quantities, colors, style numbers, etc.)
  payload JSONB NOT NULL,
  -- Computed total cost at submit time, stored for reporting
  total_cost NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.department_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers insert own department entries" ON public.department_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'worker')
    AND worker_id = auth.uid()
  );

CREATE POLICY "Workers view own department entries" ON public.department_entries
  FOR SELECT TO authenticated
  USING (
    worker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
    OR public.has_role(auth.uid(), 'manager')
  );

-- No UPDATE/DELETE policies: immutable audit log, same pattern as batch_tracking.

CREATE INDEX idx_department_entries_batch ON public.department_entries(batch_id, created_at DESC);
CREATE INDEX idx_department_entries_worker ON public.department_entries(worker_id, created_at DESC);
CREATE INDEX idx_department_entries_department ON public.department_entries(department);

-- ============================================================
-- 4. DEPARTMENT COST RATES
-- Admin/manager-set costs for departments with no inventory item
-- to pull a cost from (printing per-color cost, embroidery cost/piece).
-- Accessories costs instead reuse inventory_items.unit_cost directly.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.department_cost_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL CHECK (department IN ('printing', 'embroidery')),
  -- Color name for printing; 'default' for the single embroidery rate
  label TEXT NOT NULL,
  rate NUMERIC NOT NULL CHECK (rate >= 0),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department, label)
);

ALTER TABLE public.department_cost_rates ENABLE ROW LEVEL SECURITY;

-- Workers must read rates (shown read-only in the entry form)
CREATE POLICY "Authenticated users view department rates" ON public.department_cost_rates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin manager manage department rates" ON public.department_cost_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_department_cost_rates_updated_at
  BEFORE UPDATE ON public.department_cost_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. NOTIFY ADMIN ON MISSING PRINTING/EMBROIDERY RATE
-- Mirrors notify_on_missing_rate() from the factory tracking module.
-- ============================================================
ALTER TABLE public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_type_check;
ALTER TABLE public.admin_notifications ADD CONSTRAINT admin_notifications_type_check
  CHECK (type IN ('high_waste', 'missing_rate', 'batch_completed', 'info', 'missing_department_rate'));

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
  IF NEW.department NOT IN ('printing', 'embroidery') THEN
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

CREATE TRIGGER trg_notify_missing_department_rate
  AFTER INSERT ON public.department_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_missing_department_rate();
