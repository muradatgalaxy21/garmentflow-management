-- Auto-derive profiles.skills from department / sub_department so admins never
-- hand-tag skills. Skill names = production phase names (Cutting, Stitching,
-- Singer, Printing, Embroidery, QC, Packing ...). Mirrors src/lib/workerSkills.ts.
-- Idempotent: only appends a skill that is missing (case-insensitive).

CREATE OR REPLACE FUNCTION public.dept_skills(_dept TEXT, _sub TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_remove(ARRAY[
    CASE
      WHEN _dept IS NULL THEN NULL
      WHEN _dept IN ('quality', 'quality_final') THEN 'QC'
      ELSE initcap(replace(_dept, '_', ' '))
    END,
    CASE WHEN _dept = 'stitching' AND _sub = 'singer' THEN 'Singer' END
  ], NULL);
$$;

CREATE OR REPLACE FUNCTION public.merge_dept_skills(_skills TEXT[], _dept TEXT, _sub TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result TEXT[] := COALESCE(_skills, '{}');
  s TEXT;
BEGIN
  FOREACH s IN ARRAY public.dept_skills(_dept, _sub) LOOP
    IF NOT EXISTS (SELECT 1 FROM unnest(result) x WHERE lower(x) = lower(s)) THEN
      result := result || s;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- Keep skills in sync on every insert / department change (any code path, incl. seed scripts).
CREATE OR REPLACE FUNCTION public.profiles_auto_skills()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.department IS NOT NULL THEN
    NEW.skills := public.merge_dept_skills(NEW.skills, NEW.department::text, NEW.sub_department::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_profiles_auto_skills ON public.profiles;
CREATE TRIGGER zz_profiles_auto_skills
  BEFORE INSERT OR UPDATE OF department, sub_department ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_auto_skills();

-- Backfill existing workers (no-op for rows already containing the skill).
UPDATE public.profiles p
SET skills = public.merge_dept_skills(p.skills, p.department::text, p.sub_department::text)
WHERE p.department IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'worker')
  AND p.skills IS DISTINCT FROM public.merge_dept_skills(p.skills, p.department::text, p.sub_department::text);
