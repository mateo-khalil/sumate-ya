-- ==================== RLS Policies: matchParticipants ====================
--
-- Decision Context:
-- Why: The initial migration enabled RLS on matchParticipants but only the INSERT
--   and SELECT policies existed (INSERT: auth.uid() = playerId, SELECT: public).
--   The DELETE policy is needed so authenticated players can leave a match they joined.
--   UPDATE is intentionally excluded: players do not switch teams mid-match; if needed
--   in the future, a player should leave and re-join rather than do an UPDATE.
-- Pre-condition: SELECT and INSERT policies already exist from initial migration.
-- Previously fixed bugs: none relevant.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matchParticipants'
      AND policyname = 'participants_player_delete'
  ) THEN
    EXECUTE 'CREATE POLICY "participants_player_delete" ON public."matchParticipants" FOR DELETE TO authenticated USING (auth.uid() = "playerId")';
  END IF;
END;
$$;
