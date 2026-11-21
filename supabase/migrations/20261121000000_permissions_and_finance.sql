-- plans/01-finance-and-permissions.md
-- Part A: per-section permissions for the admin portal.
-- Part B: finance module (vendors, bills, payments, client receipts, expenses).

-- ============================================================
-- A. PERMISSIONS
-- ============================================================

CREATE TABLE public.user_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN (
    'rfqs', 'inbox', 'inventory', 'orders', 'batches', 'dispatch',
    'employees', 'clients', 'finance.view', 'finance.edit'
  )),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin always passes. finance.edit implies finance.view.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_permissions
        WHERE user_id = _user_id
          AND (permission = _permission
               OR (_permission = 'finance.view' AND permission = 'finance.edit'))
      )
$$;

-- Backfill: existing staff keep every non-finance section they could already open.
INSERT INTO public.user_permissions (user_id, permission, granted_by)
SELECT ur.user_id, p.permission, NULL
FROM public.user_roles ur
CROSS JOIN (VALUES ('rfqs'), ('inbox'), ('inventory'), ('orders'), ('batches'),
                   ('dispatch'), ('employees'), ('clients')) AS p(permission)
WHERE ur.role = 'staff'
ON CONFLICT DO NOTHING;

-- ============================================================
-- B. FINANCE
-- ============================================================

CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  bill_no TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  notes TEXT,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendor_bills_vendor_idx ON public.vendor_bills(vendor_id);

CREATE TABLE public.vendor_bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.vendor_bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit TEXT,
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  amount NUMERIC(14,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendor_bill_items_bill_idx ON public.vendor_bill_items(bill_id);

CREATE TABLE public.vendor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  bill_id UUID REFERENCES public.vendor_bills(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'cash'
    CHECK (method IN ('cash', 'bank', 'cheque', 'jazzcash', 'easypaisa', 'other')),
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendor_payments_vendor_idx ON public.vendor_payments(vendor_id);
CREATE INDEX vendor_payments_bill_idx ON public.vendor_payments(bill_id);

CREATE TABLE public.client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  received_on DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'cash'
    CHECK (method IN ('cash', 'bank', 'cheque', 'jazzcash', 'easypaisa', 'other')),
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_payments_client_idx ON public.client_payments(client_id);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'misc',
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'cash'
    CHECK (method IN ('cash', 'bank', 'cheque', 'jazzcash', 'easypaisa', 'other')),
  paid_to TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendor_bills_updated_at BEFORE UPDATE ON public.vendor_bills
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bill lines: keep bill total in sync and move linked stock.
-- SECURITY DEFINER so a finance.edit user without inventory rights can still
-- trigger the stock movement their purchase implies.
CREATE OR REPLACE FUNCTION public.apply_vendor_bill_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id UUID := COALESCE(NEW.bill_id, OLD.bill_id);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.inventory_item_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements (item_id, type, quantity, reason, performed_by)
    VALUES (NEW.inventory_item_id, 'in', NEW.quantity, 'Purchase bill ' || NEW.bill_id, auth.uid());
  ELSIF TG_OP = 'DELETE' AND OLD.inventory_item_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements (item_id, type, quantity, reason, performed_by)
    VALUES (OLD.inventory_item_id, 'out', OLD.quantity, 'Purchase bill line removed ' || OLD.bill_id, auth.uid());
  END IF;

  UPDATE public.vendor_bills
     SET total_amount = COALESCE((SELECT sum(amount) FROM public.vendor_bill_items WHERE bill_id = v_bill_id), 0)
   WHERE id = v_bill_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER vendor_bill_item_apply
AFTER INSERT OR DELETE ON public.vendor_bill_items
FOR EACH ROW EXECUTE FUNCTION public.apply_vendor_bill_item();

-- Lines are insert/delete only: editing a line in place would desync stock.
CREATE OR REPLACE FUNCTION public.block_vendor_bill_item_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Bill lines cannot be edited; delete and re-add instead';
END;
$$;

CREATE TRIGGER vendor_bill_item_no_update
BEFORE UPDATE ON public.vendor_bill_items
FOR EACH ROW EXECUTE FUNCTION public.block_vendor_bill_item_update();

-- Bill balances. Overdue = unpaid balance past due date.
CREATE VIEW public.vendor_bill_balances
WITH (security_invoker = on) AS
SELECT
  b.id,
  b.vendor_id,
  b.bill_no,
  b.bill_date,
  b.due_date,
  b.total_amount,
  COALESCE(p.paid, 0) AS paid_amount,
  b.total_amount - COALESCE(p.paid, 0) AS balance,
  CASE
    WHEN b.total_amount - COALESCE(p.paid, 0) <= 0 THEN 'paid'
    WHEN b.due_date IS NOT NULL AND b.due_date < CURRENT_DATE THEN 'overdue'
    WHEN COALESCE(p.paid, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS status
FROM public.vendor_bills b
LEFT JOIN (
  SELECT bill_id, sum(amount) AS paid FROM public.vendor_payments
  WHERE bill_id IS NOT NULL GROUP BY bill_id
) p ON p.bill_id = b.id;

-- RLS
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors', 'vendor_bills', 'vendor_bill_items',
                           'vendor_payments', 'client_payments', 'expenses'] LOOP
    EXECUTE format('CREATE POLICY "Finance view %1$s" ON public.%1$I FOR SELECT TO authenticated
                    USING (public.has_permission(auth.uid(), ''finance.view''))', t);
    EXECUTE format('CREATE POLICY "Finance insert %1$s" ON public.%1$I FOR INSERT TO authenticated
                    WITH CHECK (public.has_permission(auth.uid(), ''finance.edit''))', t);
    EXECUTE format('CREATE POLICY "Finance update %1$s" ON public.%1$I FOR UPDATE TO authenticated
                    USING (public.has_permission(auth.uid(), ''finance.edit''))
                    WITH CHECK (public.has_permission(auth.uid(), ''finance.edit''))', t);
    EXECUTE format('CREATE POLICY "Admin delete %1$s" ON public.%1$I FOR DELETE TO authenticated
                    USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

-- Bill lines are replaced on edit (delete + insert), so finance.edit needs delete there.
CREATE POLICY "Finance edit delete bill items" ON public.vendor_bill_items
  FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'finance.edit'));

-- Read access finance users need on existing tables (policies are OR'd with existing ones).
-- Profiles and department_entries are NOT opened up: finance gets only the
-- fields it needs through the gated functions below.
CREATE POLICY "Finance view orders" ON public.orders
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));
CREATE POLICY "Finance view inventory items" ON public.inventory_items
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'finance.view'));

-- Client display names for receivables (only for given ids, only name fields).
CREATE OR REPLACE FUNCTION public.finance_party_names(_ids UUID[])
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, COALESCE(NULLIF(p.company, ''), NULLIF(p.full_name, ''), 'Unnamed client')
  FROM public.profiles p
  WHERE p.id = ANY(_ids) AND public.has_permission(auth.uid(), 'finance.view')
$$;

-- Wage totals for the P&L: piece-rate cost logged in [_from, _to] in
-- wage-bearing departments, plus the sum of monthly salaries (caller pro-rates).
CREATE OR REPLACE FUNCTION public.finance_wage_totals(_from DATE, _to DATE)
RETURNS TABLE (piece_rate NUMERIC, monthly_salaries NUMERIC)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COALESCE(sum(total_cost), 0) FROM public.department_entries
      WHERE department IN ('sticker', 'quality', 'stitching', 'button_ops', 'clipping', 'press', 'quality_final', 'packing')
        AND created_at >= _from AND created_at < _to + 1),
    (SELECT COALESCE(sum(base_salary), 0) FROM public.profiles WHERE wage_type = 'monthly_salary')
  WHERE public.has_permission(auth.uid(), 'finance.view')
$$;
