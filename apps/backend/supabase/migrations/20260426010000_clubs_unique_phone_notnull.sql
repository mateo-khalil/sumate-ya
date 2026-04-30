-- ==================== clubs: UNIQUE ownerId + phone NOT NULL ====================
--
-- Decision Context:
-- Why: The audit of US "Registro de Club" found two missing DB constraints:
--   1. clubs.ownerId had no UNIQUE constraint — a club_admin could register multiple
--      clubs, violating the 1:1 relationship required by the data model.
--   2. clubs.phone was nullable in the DB but required by the Zod registration schema,
--      creating an inconsistency that could allow phone-less clubs via direct API calls.
-- Pre-condition: before applying, the seeded duplicate (ownerId a1000000...08 had
--   clubs b1000000...02 and b1000000...03) was resolved:
--   - 2 real matches pointing to b1000000...03 were moved to b1000000...02.
--   - Seeded match e1000000...03 and the club b1000000...03 were deleted.
--   - 0 null phone values existed, confirmed before applying NOT NULL.
-- Previously fixed bugs:
--   - clubs.ownerId lacked UNIQUE — enforced here.
--   - clubs.phone was nullable — aligned with Zod required validation.
-- Profiles DELETE policy decision:
--   - No DELETE policy is created for public.profiles. Profiles are preserved even
--     if a user "deletes" their account. Hard deletes are admin-only operations
--     performed via service_role (which bypasses RLS). If self-service account
--     deletion is needed in the future, use a soft-delete flag (e.g. isDeleted boolean)
--     rather than a DELETE policy, to preserve referential integrity with matches and clubs.

-- 1. Unique constraint: one club per club_admin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'clubs'
      AND constraint_name = 'clubs_ownerid_unique'
  ) THEN
    ALTER TABLE public.clubs ADD CONSTRAINT clubs_ownerid_unique UNIQUE ("ownerId");
  END IF;
END;
$$;

-- 2. Phone is required in the registration flow — align DB schema to match.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clubs'
      AND column_name = 'phone' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.clubs ALTER COLUMN phone SET NOT NULL;
  END IF;
END;
$$;
