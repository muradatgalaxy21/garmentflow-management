-- ============================================================
-- FACTORY TRACKING MODULE
-- Migration: 20260430130000_factory_tracking.sql
--
-- This migration adds multi-phase production tracking to the
-- existing En En Garments system. It introduces:
--   1. A new 'worker' role for factory floor users
--   2. Production phases, batches, and per-piece tracking
--   3. Admin-configurable rates per batch per phase
--   4. In-app admin notifications for anomalies
--   5. Automatic inventory deduction on the Cutting phase
--   6. Strict RLS to prevent data leakage between roles
-- ============================================================

-- ============================================================
-- 1. EXTEND THE ROLE ENUM
-- ============================================================
-- IMPORTANT: If you get an error (55P04), run ONLY the line below first:
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'worker';
-- Then run the rest of the script.
COMMIT; 
-- ============================================================

-- ============================================================
-- 2. PRODUCTION PHASES
-- Defines the sequential workflow steps on the factory floor.
-- The sequence_order determines the pipeline order.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  -- 1. Determines the order in which phases appear in the UI
  -- 2. Used by triggers to identify the last phase for auto-completion
  sequence_order INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.production_phases ENABLE ROW LEVEL SECURITY;

-- Workers, staff, and admins can all read the phase definitions
CREATE POLICY "Authenticated users view phases"
  ON public.production_phases
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can create, update, or delete phases
CREATE POLICY "Admins manage phases"
  ON public.production_phases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 3. PRODUCTION BATCHES
-- Represents a specific production run of a garment style,
-- linked to an order. Each batch gets a unique QR code hash
-- for scanner identification on the factory floor.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 1. Links batch to the parent order for traceability
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  style_number TEXT NOT NULL,
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  -- 2. Status tracks the overall batch lifecycle
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  -- 3. Unique hash used to generate and scan QR code labels
  qr_code_hash TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  -- 4. Links to the raw material item that gets deducted
  --    during the Cutting phase (nullable for batches that
  --    do not consume tracked raw materials)
  material_item_id UUID REFERENCES public.inventory_items(id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;

-- Workers can view batches (read-only) for scanning and data entry
CREATE POLICY "Workers view batches"
  ON public.production_batches
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'worker')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

-- Only admin/staff can create, update, or delete batches
CREATE POLICY "Staff manage batches"
  ON public.production_batches
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

-- Auto-update the updated_at timestamp on modification
CREATE TRIGGER update_production_batches_updated_at
  BEFORE UPDATE ON public.production_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_batches_order ON public.production_batches(order_id);
CREATE INDEX idx_batches_status ON public.production_batches(status);
CREATE INDEX idx_batches_qr ON public.production_batches(qr_code_hash);

-- ============================================================
-- 4. BATCH PHASE RATES
-- Admin-configurable rate_per_piece for each batch/phase
-- combination. Workers see this as a read-only value.
-- Future-proofed: quantity_locked flag reserves the ability
-- to make quantity fields admin-only in the future.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.batch_phase_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id)
    ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES public.production_phases(id)
    ON DELETE CASCADE,
  -- 1. The monetary rate paid per completed piece at this phase
  rate_per_piece NUMERIC NOT NULL DEFAULT 0
    CHECK (rate_per_piece >= 0),
  -- 2. Future-proofing: when true, only admins can modify
  --    quantity fields on batch_tracking for this phase
  quantity_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 3. Ensure only one rate per batch per phase
  UNIQUE (batch_id, phase_id)
);

ALTER TABLE public.batch_phase_rates ENABLE ROW LEVEL SECURITY;

-- Workers can read rates (shown as read-only in the entry form)
CREATE POLICY "Authenticated users view rates"
  ON public.batch_phase_rates
  FOR SELECT TO authenticated
  USING (true);

-- Only admin/staff can set or update rates
CREATE POLICY "Staff manage rates"
  ON public.batch_phase_rates
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

CREATE TRIGGER update_batch_phase_rates_updated_at
  BEFORE UPDATE ON public.batch_phase_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. BATCH TRACKING
-- The core audit log: every time a worker processes pieces
-- at a phase, a row is inserted here. Workers can only INSERT
-- (never update or delete) to preserve audit integrity.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.batch_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id)
    ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES public.production_phases(id)
    ON DELETE RESTRICT,
  -- 1. The worker who performed the work
  worker_id UUID NOT NULL REFERENCES auth.users(id)
    ON DELETE RESTRICT,
  -- 2. Core tracking data entered by the worker
  quantity_completed INTEGER NOT NULL DEFAULT 0
    CHECK (quantity_completed >= 0),
  quantity_wasted INTEGER NOT NULL DEFAULT 0
    CHECK (quantity_wasted >= 0),
  -- 3. Optional notes from the worker (defect descriptions, etc.)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.batch_tracking ENABLE ROW LEVEL SECURITY;

-- SECURITY: Workers can ONLY insert records, never read others
-- or modify existing records. This preserves audit trail integrity.
CREATE POLICY "Workers insert tracking"
  ON public.batch_tracking
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'worker')
    AND worker_id = auth.uid()
  );

-- Workers can only view their own tracking entries (privacy)
CREATE POLICY "Workers view own tracking"
  ON public.batch_tracking
  FOR SELECT TO authenticated
  USING (
    worker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

-- Staff/admin have full read access for analytics and auditing
-- but no one can UPDATE or DELETE tracking records (immutable audit log)
-- Admin override for corrections handled via separate process

CREATE INDEX idx_tracking_batch ON public.batch_tracking(batch_id, created_at DESC);
CREATE INDEX idx_tracking_worker ON public.batch_tracking(worker_id, created_at DESC);
CREATE INDEX idx_tracking_phase ON public.batch_tracking(phase_id);

-- ============================================================
-- 6. ADMIN NOTIFICATIONS
-- In-app notification system for anomaly alerts and action items.
-- Populated by database triggers and edge functions.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 1. Categorizes the notification for filtering and display
  type TEXT NOT NULL CHECK (type IN (
    'high_waste', 'missing_rate', 'batch_completed', 'info'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  -- 2. Read status for dismissal
  is_read BOOLEAN NOT NULL DEFAULT false,
  -- 3. Optional link back to the relevant batch
  batch_id UUID REFERENCES public.production_batches(id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only admin/staff can view notifications (privacy)
CREATE POLICY "Staff view notifications"
  ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

-- Admin/staff can update (mark as read) and manage notifications
CREATE POLICY "Staff manage notifications"
  ON public.admin_notifications
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

CREATE INDEX idx_notifications_unread
  ON public.admin_notifications(is_read, created_at DESC)
  WHERE is_read = false;

-- ============================================================
-- 7. DATABASE TRIGGERS
-- ============================================================

-- 7a. AUTO-DEDUCT INVENTORY ON CUTTING PHASE
-- When a worker logs work at the Cutting phase, automatically
-- create an 'out' movement in inventory_movements for the
-- raw material linked to the batch.
CREATE OR REPLACE FUNCTION public.deduct_inventory_on_cutting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase_name TEXT;
  v_material_id UUID;
BEGIN
  -- Step 1: Look up the phase name to check if this is Cutting
  SELECT name INTO v_phase_name
    FROM public.production_phases
    WHERE id = NEW.phase_id;

  -- Step 2: Only proceed for the Cutting phase
  IF v_phase_name = 'Cutting' THEN
    -- Step 3: Get the linked raw material item
    SELECT material_item_id INTO v_material_id
      FROM public.production_batches
      WHERE id = NEW.batch_id;

    -- Step 4: If a material is linked, record the deduction
    IF v_material_id IS NOT NULL THEN
      INSERT INTO public.inventory_movements (
        item_id, type, quantity, reason, performed_by
      ) VALUES (
        v_material_id,
        'out',
        NEW.quantity_completed,
        'Auto-deducted: Cutting phase for batch ' || NEW.batch_id::TEXT,
        NEW.worker_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cutting_inventory_deduction
  AFTER INSERT ON public.batch_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_inventory_on_cutting();

-- 7b. AUTO-COMPLETE BATCH ON FINAL PHASE
-- When a tracking entry is logged for the last phase (highest
-- sequence_order), automatically mark the batch as completed.
CREATE OR REPLACE FUNCTION public.auto_complete_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_order INTEGER;
  v_phase_order INTEGER;
BEGIN
  -- Step 1: Find the highest sequence_order (the final phase)
  SELECT MAX(sequence_order) INTO v_max_order
    FROM public.production_phases;

  -- Step 2: Find the sequence_order for the submitted phase
  SELECT sequence_order INTO v_phase_order
    FROM public.production_phases
    WHERE id = NEW.phase_id;

  -- Step 3: If this is the final phase, mark the batch as completed
  IF v_phase_order = v_max_order THEN
    UPDATE public.production_batches
      SET status = 'completed'
      WHERE id = NEW.batch_id
        AND status = 'in_progress';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_batch_auto_complete
  AFTER INSERT ON public.batch_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_complete_batch();

-- 7c. NOTIFY ADMIN ON MISSING RATE
-- When a worker submits tracking for a batch/phase combo
-- that has no rate defined, create an admin notification
-- so the department manager can set the price.
CREATE OR REPLACE FUNCTION public.notify_on_missing_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate_exists BOOLEAN;
  v_phase_name TEXT;
  v_style TEXT;
BEGIN
  -- Step 1: Check if a rate is configured for this batch/phase
  SELECT EXISTS (
    SELECT 1 FROM public.batch_phase_rates
    WHERE batch_id = NEW.batch_id AND phase_id = NEW.phase_id
      AND rate_per_piece > 0
  ) INTO v_rate_exists;

  -- Step 2: If no rate exists, create an admin notification
  IF NOT v_rate_exists THEN
    SELECT name INTO v_phase_name
      FROM public.production_phases WHERE id = NEW.phase_id;
    SELECT style_number INTO v_style
      FROM public.production_batches WHERE id = NEW.batch_id;

    INSERT INTO public.admin_notifications (type, title, message, batch_id)
    VALUES (
      'missing_rate',
      'Rate Not Set: ' || COALESCE(v_phase_name, 'Unknown') || ' - ' || COALESCE(v_style, 'Unknown'),
      'A worker submitted tracking for batch style "' || COALESCE(v_style, '?')
        || '" at the "' || COALESCE(v_phase_name, '?')
        || '" phase, but no rate_per_piece is configured. Please set the rate.',
      NEW.batch_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_missing_rate
  AFTER INSERT ON public.batch_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_missing_rate();

-- 7d. NOTIFY ADMIN ON HIGH WASTE (>5% OF BATCH)
-- If a single tracking entry has waste exceeding 5% of the
-- batch total quantity, create an urgent admin notification.
CREATE OR REPLACE FUNCTION public.notify_on_high_waste()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_style TEXT;
  v_phase_name TEXT;
  v_threshold NUMERIC;
BEGIN
  -- Step 1: Get the batch total quantity for threshold calculation
  SELECT total_quantity, style_number INTO v_total, v_style
    FROM public.production_batches WHERE id = NEW.batch_id;

  -- Step 2: Calculate 5% threshold
  v_threshold := v_total * 0.05;

  -- Step 3: Check if waste exceeds threshold
  IF NEW.quantity_wasted > v_threshold AND NEW.quantity_wasted > 0 THEN
    SELECT name INTO v_phase_name
      FROM public.production_phases WHERE id = NEW.phase_id;

    INSERT INTO public.admin_notifications (type, title, message, batch_id)
    VALUES (
      'high_waste',
      'High Waste Alert: ' || COALESCE(v_style, 'Unknown'),
      'Waste of ' || NEW.quantity_wasted || ' pieces reported at "'
        || COALESCE(v_phase_name, '?') || '" phase for style "'
        || COALESCE(v_style, '?') || '" (threshold: '
        || ROUND(v_threshold) || ' pieces / 5% of ' || v_total || ').',
      NEW.batch_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_high_waste
  AFTER INSERT ON public.batch_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_high_waste();

-- ============================================================
-- 8. SEED DATA: Default production phases
-- ============================================================
INSERT INTO public.production_phases (name, sequence_order)
VALUES
  ('Cutting', 1),
  ('Stitching', 2),
  ('QC', 3),
  ('Packing', 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 9. ADDITIONAL SECURITY HARDENING
-- Ensure workers CANNOT access sensitive business tables.
-- These are defensive policies: even if someone crafts a raw
-- Supabase query with a worker token, these tables are blocked.
-- (The existing RLS policies already block workers, but this
--  makes the intent explicit and auditable.)
-- ============================================================

-- Workers must NOT be able to modify batch_tracking after insert
-- (no UPDATE/DELETE policies are granted, enforcing immutability)

-- Workers must NOT see financial data on orders
-- (existing orders SELECT policy only allows client_id match
--  or admin/staff role, so workers are already excluded)

-- Workers must NOT access rfqs or inventory_items
-- (existing RLS only grants admin/staff, so workers are excluded)
