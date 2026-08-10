-- ============================================================
-- WORKER INBOX + BATCH START/END ADMIN VERIFICATION
-- Migration: 20260810000000_worker_inbox.sql
--
-- Adds an admin-facing inbox for two purposes:
--   1. Batch start/end verification: when a worker scans the Start QR,
--      a verification message lands in the admin inbox. Admin accepting
--      it enables that department's End QR (disabled by default). When
--      the End QR is scanned, another verification message lands in the
--      inbox; the department cannot close until admin accepts/denies/
--      reprocesses it.
--   2. Worker queries: free-form messages workers can send to admin.
--      Verification messages always sort ahead of queries in the inbox.
-- ============================================================

-- ============================================================
-- 1. VERIFICATION GATING COLUMNS ON batch_department_status
-- ============================================================
ALTER TABLE public.batch_department_status
  ADD COLUMN IF NOT EXISTS start_verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (start_verification_status IN ('pending', 'accepted', 'denied')),
  ADD COLUMN IF NOT EXISTS end_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_verification_status TEXT NOT NULL DEFAULT 'none'
    CHECK (end_verification_status IN ('none', 'pending', 'accepted', 'denied', 'reprocess'));

-- Admin/staff need to update start/end verification + end_enabled columns
-- when resolving inbox messages (existing UPDATE policy only covers the
-- worker closing their own department).
CREATE POLICY "Admin/staff update batch department status" ON public.batch_department_status
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- ============================================================
-- 2. WORKER INBOX MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.worker_inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('batch_start_verification', 'batch_end_verification', 'worker_query')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied', 'reprocess', 'resolved')),
  batch_id UUID REFERENCES public.production_batches(id) ON DELETE CASCADE,
  department TEXT CHECK (department IN ('accessories', 'cutting', 'sticker', 'printing', 'embroidery')),
  worker_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL,
  payload JSONB,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_inbox_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/staff view all inbox messages" ON public.worker_inbox_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

CREATE POLICY "Workers view own inbox messages" ON public.worker_inbox_messages
  FOR SELECT TO authenticated
  USING (worker_id = auth.uid());

CREATE POLICY "Workers send inbox messages" ON public.worker_inbox_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    worker_id = auth.uid()
    AND (
      type = 'worker_query'
      OR public.has_role(auth.uid(), 'worker')
    )
  );

CREATE POLICY "Admin/staff resolve inbox messages" ON public.worker_inbox_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE INDEX idx_worker_inbox_messages_status ON public.worker_inbox_messages(status);
CREATE INDEX idx_worker_inbox_messages_worker ON public.worker_inbox_messages(worker_id);
CREATE INDEX idx_worker_inbox_messages_batch ON public.worker_inbox_messages(batch_id);
