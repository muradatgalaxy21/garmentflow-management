
-- ============================================================
-- 1. ROLES SYSTEM
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'client');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function avoids recursive RLS when checking roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Users can see their own roles; admins can see all
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 2. PROFILES
-- ============================================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  company TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Shared timestamp updater used across multiple tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create a profile and default client role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'company',
    NEW.raw_user_meta_data ->> 'phone'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. RFQs (Request for Quote)
-- ============================================================

CREATE TYPE public.rfq_status AS ENUM ('new', 'contacted', 'quoted', 'won', 'lost');

CREATE TABLE public.rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  product_type TEXT,
  quantity TEXT,
  message TEXT NOT NULL,
  status rfq_status NOT NULL DEFAULT 'new',
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can submit a new RFQ
CREATE POLICY "Anyone can submit RFQ" ON public.rfqs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Staff view RFQs" ON public.rfqs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff update RFQs" ON public.rfqs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Admins delete RFQs" ON public.rfqs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_rfqs_updated_at
BEFORE UPDATE ON public.rfqs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_rfqs_status ON public.rfqs(status);
CREATE INDEX idx_rfqs_created ON public.rfqs(created_at DESC);

-- ============================================================
-- 4. INVENTORY
-- ============================================================

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  reorder_level NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view inventory" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff manage inventory" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE TRIGGER update_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TYPE public.movement_type AS ENUM ('in', 'out', 'adjust');

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type movement_type NOT NULL,
  quantity NUMERIC NOT NULL,
  reason TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view movements" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff record movements" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE INDEX idx_movements_item ON public.inventory_movements(item_id, created_at DESC);

-- Trigger keeps quantity_on_hand in sync atomically; avoids race conditions
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'in' THEN
    UPDATE public.inventory_items
       SET quantity_on_hand = quantity_on_hand + NEW.quantity
     WHERE id = NEW.item_id;
  ELSIF NEW.type = 'out' THEN
    UPDATE public.inventory_items
       SET quantity_on_hand = quantity_on_hand - NEW.quantity
     WHERE id = NEW.item_id;
  ELSIF NEW.type = 'adjust' THEN
    UPDATE public.inventory_items
       SET quantity_on_hand = NEW.quantity
     WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_movement_apply
AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- ============================================================
-- 5. ORDERS (Client portal)
-- ============================================================

CREATE TYPE public.order_status AS ENUM ('pending', 'in_production', 'qc', 'shipped', 'delivered', 'cancelled');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL UNIQUE,
  product_summary TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  total_amount NUMERIC,
  currency TEXT DEFAULT 'USD',
  status order_status NOT NULL DEFAULT 'pending',
  expected_delivery DATE,
  tracking_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    auth.uid() = client_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

CREATE POLICY "Staff manage orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_orders_client ON public.orders(client_id, created_at DESC);
CREATE INDEX idx_orders_status ON public.orders(status);

CREATE TABLE public.order_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order participants view updates" ON public.order_updates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_updates.order_id
        AND (
          o.client_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'staff')
        )
    )
  );

CREATE POLICY "Staff add updates" ON public.order_updates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE INDEX idx_order_updates_order ON public.order_updates(order_id, created_at DESC);
