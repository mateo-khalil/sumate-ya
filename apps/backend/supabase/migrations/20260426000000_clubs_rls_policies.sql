-- ==================== RLS Policies: clubs ====================
--
-- Decision Context:
-- Why: The initial migration enabled RLS on clubs but did not define any
--   write policies. Only a public SELECT policy existed (clubs_public_select).
--   Without INSERT/UPDATE/DELETE policies, authenticated club_admins were
--   blocked from managing their own clubs (RLS default-deny for authenticated).
-- Constraints:
--   - service_role bypasses RLS entirely, so register() in authService works.
--   - These policies only affect authenticated (JWT-bearing) requests.
--   - INSERT: WITH CHECK enforces ownerId = auth.uid() at write time.
--   - UPDATE: USING filters rows visible for update; WITH CHECK prevents
--     changing ownerId to a different user.
--   - DELETE: USING filters rows; only the owner can delete their own club.
-- Previously fixed bugs:
--   - clubs_public_select already existed from dashboard setup.
--   - INSERT/UPDATE/DELETE policies were missing — added here (P4 audit fix).

-- Public read: already existed, reproduced here for completeness.
-- (Applied with IF NOT EXISTS to avoid duplicate-object error on re-run.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clubs'
      AND policyname = 'clubs_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY clubs_public_select ON public.clubs FOR SELECT TO public USING (true)';
  END IF;
END;
$$;

-- INSERT: club_admin can only create clubs where they are the owner.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clubs'
      AND policyname = 'clubs_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY clubs_insert_own ON public.clubs FOR INSERT TO authenticated WITH CHECK ("ownerId" = auth.uid())';
  END IF;
END;
$$;

-- UPDATE: club_admin can only update their own club, and cannot reassign ownership.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clubs'
      AND policyname = 'clubs_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY clubs_update_own ON public.clubs FOR UPDATE TO authenticated USING ("ownerId" = auth.uid()) WITH CHECK ("ownerId" = auth.uid())';
  END IF;
END;
$$;

-- DELETE: club_admin can only delete their own club.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clubs'
      AND policyname = 'clubs_delete_own'
  ) THEN
    EXECUTE 'CREATE POLICY clubs_delete_own ON public.clubs FOR DELETE TO authenticated USING ("ownerId" = auth.uid())';
  END IF;
END;
$$;
