-- BUG-5: order numbers came from the last 6 digits of Date.now() and wrapped
-- every ~16.7 min. Now a DB sequence fills order_number when the caller omits it.
-- Format ORD-<year>-<running number, min 4 digits>; counter never resets.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

ALTER TABLE public.orders
  ALTER COLUMN order_number SET DEFAULT
    'ORD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');

-- BUG-3: clients could not add the timeline note for their own direct order
-- (insert needed orders.create/update). Allow it on their own order only, as
-- themselves, and only with the order's current status so no fake status steps.
DROP POLICY IF EXISTS "Clients add notes to own orders" ON public.order_updates;
CREATE POLICY "Clients add notes to own orders" ON public.order_updates FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o
                WHERE o.id = order_updates.order_id
                  AND o.client_id = auth.uid()
                  AND o.status::text = order_updates.status::text)
  );
