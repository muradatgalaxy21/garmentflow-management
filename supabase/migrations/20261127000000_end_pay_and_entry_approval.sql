-- BUG-6: worker pay is stamped on the END entry when admin accepts the END
--        (total_cost = rate x quantity_completed), so admins need UPDATE on department_entries.
-- BUG-7: accessories/cutting stock is deducted when admin approves the entry,
--        which needs a new inbox message type.
-- No data is modified. Legacy START rows keep their total_cost; the app ignores it.

ALTER TABLE public.worker_inbox_messages DROP CONSTRAINT IF EXISTS worker_inbox_messages_type_check;
ALTER TABLE public.worker_inbox_messages
  ADD CONSTRAINT worker_inbox_messages_type_check
  CHECK (type IN ('batch_start_verification', 'batch_end_verification', 'worker_query', 'entry_approval'));

DROP POLICY IF EXISTS "Perm update department entries" ON public.department_entries;
CREATE POLICY "Perm update department entries" ON public.department_entries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_any_permission(auth.uid(), ARRAY['inbox.update', 'inbox_workers.update']))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_any_permission(auth.uid(), ARRAY['inbox.update', 'inbox_workers.update']));
