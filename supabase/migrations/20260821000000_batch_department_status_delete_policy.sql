-- batch_department_status has no DELETE policy, so stale-row cleanup
-- (deleteDepartmentEntryAndRestock, FactoryDashboard self-heal) silently
-- fails under RLS and leaves ghost "open" rows forever — the "no work
-- but still shows open batch" deadlock.
CREATE POLICY "Admin/staff delete batch department status" ON public.batch_department_status
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- Workers self-heal their own stuck-open row (FactoryDashboard clears it
-- client-side when no department_entries back it up anymore).
CREATE POLICY "Workers delete own stale open department status" ON public.batch_department_status
  FOR DELETE TO authenticated
  USING (
    opened_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND department = batch_department_status.department
    )
  );
