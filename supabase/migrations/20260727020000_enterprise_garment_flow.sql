-- ============================================================
-- ENTERPRISE GARMENT FLOW & WORKER ACCESSIBILITY MODULE
-- Migration: 20260727020000_enterprise_garment_flow.sql
-- ============================================================

-- 1. 'manager' role added in 20260727015000_add_manager_role.sql (separate transaction; see that file for why)

-- 2. Extend profiles for Worker Wage Classification & Employee Details
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wage_type TEXT DEFAULT 'piece_rate' CHECK (wage_type IN ('piece_rate', 'monthly_salary')),
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0 CHECK (base_salary >= 0),
  ADD COLUMN IF NOT EXISTS default_piece_rate NUMERIC DEFAULT 0 CHECK (default_piece_rate >= 0),
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS employee_id TEXT UNIQUE;

-- 3. Create Manager Batch Assignments Table
CREATE TABLE IF NOT EXISTS public.manager_batch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (manager_id, batch_id)
);

ALTER TABLE public.manager_batch_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers view batch assignments"
  ON public.manager_batch_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR manager_id = auth.uid()
  );

CREATE POLICY "Admins manage batch assignments"
  ON public.manager_batch_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_manager_assignments_mgr ON public.manager_batch_assignments(manager_id);
CREATE INDEX idx_manager_assignments_batch ON public.manager_batch_assignments(batch_id);

-- 4. Create Batch Worker Sessions (Start & End Session QR Tracking)
CREATE TABLE IF NOT EXISTS public.batch_worker_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES public.production_phases(id) ON DELETE RESTRICT,
  worker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  quantity_completed INTEGER DEFAULT 0 CHECK (quantity_completed >= 0),
  quantity_wasted INTEGER DEFAULT 0 CHECK (quantity_wasted >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.batch_worker_sessions ENABLE ROW LEVEL SECURITY;

-- Workers can create sessions for themselves
CREATE POLICY "Workers create own sessions"
  ON public.batch_worker_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'worker')
    AND worker_id = auth.uid()
  );

-- Workers can view and update their active sessions
CREATE POLICY "Workers view own sessions"
  ON public.batch_worker_sessions
  FOR SELECT TO authenticated
  USING (
    worker_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Workers update own sessions"
  ON public.batch_worker_sessions
  FOR UPDATE TO authenticated
  USING (worker_id = auth.uid())
  WITH CHECK (worker_id = auth.uid());

-- Staff, Manager, Admin can manage sessions if needed
CREATE POLICY "Staff and Managers manage sessions"
  ON public.batch_worker_sessions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
    OR public.has_role(auth.uid(), 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE INDEX idx_sessions_worker_status ON public.batch_worker_sessions(worker_id, status);
CREATE INDEX idx_sessions_batch ON public.batch_worker_sessions(batch_id);

-- Trigger to auto update updated_at on batch_worker_sessions
CREATE TRIGGER update_batch_worker_sessions_updated_at
  BEFORE UPDATE ON public.batch_worker_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Trigger to insert batch_tracking when a worker session is completed
CREATE OR REPLACE FUNCTION public.sync_session_to_batch_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When session transitions from active -> completed, insert audit entry into batch_tracking
  IF OLD.status = 'active' AND NEW.status = 'completed' THEN
    INSERT INTO public.batch_tracking (
      batch_id,
      phase_id,
      worker_id,
      quantity_completed,
      quantity_wasted,
      notes,
      created_at
    ) VALUES (
      NEW.batch_id,
      NEW.phase_id,
      NEW.worker_id,
      COALESCE(NEW.quantity_completed, 0),
      COALESCE(NEW.quantity_wasted, 0),
      NEW.notes,
      COALESCE(NEW.end_time, now())
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_session_to_tracking
  AFTER UPDATE ON public.batch_worker_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_session_to_batch_tracking();

-- 6. Helper function for Managers to check batch access
CREATE OR REPLACE FUNCTION public.has_batch_access(_user_id UUID, _batch_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'staff')
  ) OR EXISTS (
    SELECT 1 FROM public.manager_batch_assignments WHERE manager_id = _user_id AND batch_id = _batch_id
  );
$$;

-- Allow Managers to view production batches if assigned or if admin/staff
CREATE POLICY "Managers view assigned batches"
  ON public.production_batches
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'worker')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
    OR (
      public.has_role(auth.uid(), 'manager')
      AND public.has_batch_access(auth.uid(), id)
    )
  );
