-- ==================== RLS Policies: tournaments + fixtureMatches ====================
--
-- Decision Context:
-- - createTournament writes with the authenticated user's Supabase client so RLS
--   enforces organizerId = auth.uid().
-- - fixtureMatches are inserted immediately after the tournament to reserve the selected
--   club times. The insert policy scopes those rows to tournaments owned by auth.uid().
-- - SELECT is public because tournaments are discovery content, like public matches.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournaments'
      AND policyname = 'tournaments_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "tournaments_public_select" ON public."tournaments" FOR SELECT TO public USING (true)';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournaments'
      AND policyname = 'tournaments_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY "tournaments_insert_own" ON public."tournaments" FOR INSERT TO authenticated WITH CHECK ("organizerId" = auth.uid())';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournamentTeams'
      AND policyname = 'tournament_teams_insert_captain'
  ) THEN
    EXECUTE 'CREATE POLICY "tournament_teams_insert_captain" ON public."tournamentTeams" FOR INSERT TO authenticated WITH CHECK ("captainId" = auth.uid())';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournaments'
      AND policyname = 'tournaments_update_own'
  ) THEN
    EXECUTE 'CREATE POLICY "tournaments_update_own" ON public."tournaments" FOR UPDATE TO authenticated USING ("organizerId" = auth.uid()) WITH CHECK ("organizerId" = auth.uid())';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournamentTeamMembers'
      AND policyname = 'tournament_team_members_insert_self_captain'
  ) THEN
    EXECUTE 'CREATE POLICY "tournament_team_members_insert_self_captain" ON public."tournamentTeamMembers" FOR INSERT TO authenticated WITH CHECK ("playerId" = auth.uid() AND EXISTS (SELECT 1 FROM public."tournamentTeams" tt WHERE tt.id = "teamId" AND tt."captainId" = auth.uid()))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fixtureMatches'
      AND policyname = 'fixture_matches_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "fixture_matches_public_select" ON public."fixtureMatches" FOR SELECT TO public USING (true)';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fixtureMatches'
      AND policyname = 'fixture_matches_insert_own_tournament'
  ) THEN
    EXECUTE 'CREATE POLICY "fixture_matches_insert_own_tournament" ON public."fixtureMatches" FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public."tournaments" t WHERE t.id = "tournamentId" AND t."organizerId" = auth.uid()))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fixtureMatches'
      AND policyname = 'fixture_matches_update_own_tournament'
  ) THEN
    EXECUTE 'CREATE POLICY "fixture_matches_update_own_tournament" ON public."fixtureMatches" FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public."tournaments" t WHERE t.id = "tournamentId" AND t."organizerId" = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public."tournaments" t WHERE t.id = "tournamentId" AND t."organizerId" = auth.uid()))';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournamentTeams'
      AND policyname = 'tournament_teams_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "tournament_teams_public_select" ON public."tournamentTeams" FOR SELECT TO public USING (true)';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tournamentTeamMembers'
      AND policyname = 'tournament_team_members_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "tournament_team_members_public_select" ON public."tournamentTeamMembers" FOR SELECT TO public USING (true)';
  END IF;
END;
$$;
