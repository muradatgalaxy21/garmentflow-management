-- ============================================================
-- ADMIN DELETE OVERRIDE
-- Migration: 20260810010000_admin_delete_everything.sql
--
-- Lets admins delete/correct records in the two tables that were
-- previously immutable audit logs (batch_tracking, department_entries).
-- production_batches, orders, and inventory_items already have
-- "FOR ALL" admin/staff policies that cover DELETE, so no change
-- needed there. Workers still have no write access beyond INSERT.
-- ============================================================

CREATE POLICY "Admins delete tracking" ON public.batch_tracking
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete department entries" ON public.department_entries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
