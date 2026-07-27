-- Wrong-guess counter for admin_access_codes, so admin-verify-signup can
-- lock a code out after repeated failed guesses instead of allowing
-- unlimited brute-force attempts against the 6-digit code.
ALTER TABLE public.admin_access_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
