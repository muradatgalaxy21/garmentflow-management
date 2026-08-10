ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS color_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;
