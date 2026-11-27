-- Manager On-Behalf Multi-Worker Entry inserts batch_tracking rows for OTHER workers.
-- The only INSERT policy ("Workers insert tracking") needs worker_id = auth.uid(), so it failed.
-- Add an INSERT policy for admins and holders of batches.update (any worker_id).
-- "Workers insert tracking" is unchanged. No UPDATE/DELETE rights added.
DROP POLICY IF EXISTS "Perm insert tracking on behalf" ON public.batch_tracking;
CREATE POLICY "Perm insert tracking on behalf" ON public.batch_tracking FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), 'batches.update'));
