CREATE POLICY "Clients create own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);
