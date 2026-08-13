-- ============================================================
-- CLIENT INBOX (plan.md §8)
-- Mirrors worker_inbox_messages so clients can message admin/staff
-- about an order without email/phone.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'client_query' CHECK (type IN ('client_query', 'order_question')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  client_id UUID NOT NULL REFERENCES auth.users(id),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_inbox_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/staff view all client inbox messages" ON public.client_inbox_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Clients view own inbox messages" ON public.client_inbox_messages
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Clients send inbox messages" ON public.client_inbox_messages
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND public.has_role(auth.uid(), 'client'));

CREATE POLICY "Admin/staff resolve client inbox messages" ON public.client_inbox_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE INDEX idx_client_inbox_messages_status ON public.client_inbox_messages(status);
CREATE INDEX idx_client_inbox_messages_client ON public.client_inbox_messages(client_id);
CREATE INDEX idx_client_inbox_messages_order ON public.client_inbox_messages(order_id);
