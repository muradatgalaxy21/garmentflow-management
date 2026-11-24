-- Security review of 20261124000000:
-- 1. A client could insert its own order_number (e.g. squat future ORD-2026-NNNN
--    values). Callers without orders.create always get the sequence value; staff
--    get it when they leave order_number empty. Trigger instead of column DEFAULT
--    so the sequence is not consumed twice (NOT NULL is checked after BEFORE triggers).
-- 2. Client timeline notes: only while the order is still pending, stamped now().
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.order_number, '') = ''
     OR (auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(), 'orders.create')) THEN
    NEW.order_number := 'ORD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assign_order_number ON public.orders;
CREATE TRIGGER assign_order_number BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

-- '' default keeps order_number optional for inserts (and in generated types); the trigger replaces it.
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT '';
-- Only the SECURITY DEFINER trigger touches the sequence.
REVOKE ALL ON SEQUENCE public.order_number_seq FROM anon, authenticated;

DROP POLICY IF EXISTS "Clients add notes to own orders" ON public.order_updates;
CREATE POLICY "Clients add notes to own orders" ON public.order_updates FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND created_at >= now() - interval '1 minute' AND created_at <= now() + interval '1 minute'
    AND status = 'pending'
    AND EXISTS (SELECT 1 FROM public.orders o
                WHERE o.id = order_updates.order_id
                  AND o.client_id = auth.uid()
                  AND o.status = 'pending')
  );
