-- plan.md §5: party/company name travels with an order through every stage.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS party_name TEXT;

-- Backfill from the client's profile (company, falling back to full name).
UPDATE public.orders o
SET party_name = COALESCE(p.company, p.full_name)
FROM public.profiles p
WHERE p.id = o.client_id
  AND o.party_name IS NULL;
