-- ==================== Reassign match teams (result-loading correction) ====================
--
-- Decision Context:
-- - Why: when loading a result, a participant may need to fix the rosters (someone changed
--   sides mid-match, or was placed on the wrong team at join time). matchesWon is computed
--   from matchParticipants.team at confirmation, so the teams must be correctable BEFORE the
--   result is confirmed.
-- - SECURITY DEFINER: matchParticipants intentionally has NO UPDATE policy (see
--   match_participants_rls — players leave & re-join instead of switching). Rather than
--   broaden RLS, this RPC performs the team move with owner privileges after an explicit
--   participant check, keeping the surface area minimal.
-- - Authorization: caller must be a participant of the match (auth.uid()).
-- - Window guard: edits are only allowed AFTER the match has ended (scheduledAt+durationMin)
--   and BEFORE the result is confirmed. After confirmation, stats are already counted, so
--   roster edits are refused to avoid stat drift.
-- - Validation: every playerId in the payload must already be a participant of the match —
--   this RPC never adds/removes participants, it only moves them between 'a' and 'b'.
-- - Team values arrive as the lowercase matchTeam enum ('a'/'b'); the service maps the
--   GraphQL A/B before calling.
-- - Previously fixed bugs: none relevant (new capability).

CREATE OR REPLACE FUNCTION public.reassign_match_teams(
  p_match_id uuid,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_match record;
  v_end timestamptz;
  v_bad integer;
  v_assignment jsonb;
  v_updated integer := 0;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."matchParticipants"
    WHERE "matchId" = p_match_id AND "playerId" = v_auth_uid
  ) THEN
    RAISE EXCEPTION 'Solo los participantes del partido pueden editar los equipos';
  END IF;

  SELECT m.status, m."resultStatus", m."scheduledAt", m."durationMin"
  INTO v_match
  FROM public."matches" m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF v_match.status = 'cancelled' THEN
    RAISE EXCEPTION 'El partido fue cancelado';
  END IF;

  IF v_match."resultStatus" = 'confirmed' THEN
    RAISE EXCEPTION 'El resultado ya fue confirmado; no se pueden editar los equipos';
  END IF;

  v_end := v_match."scheduledAt" + (COALESCE(v_match."durationMin", 60) || ' minutes')::interval;
  IF now() < v_end THEN
    RAISE EXCEPTION 'El partido todavía está en juego';
  END IF;

  -- Every assigned player must already be a participant.
  SELECT count(*) INTO v_bad
  FROM jsonb_array_elements(p_assignments) a
  WHERE NOT EXISTS (
    SELECT 1 FROM public."matchParticipants" mp
    WHERE mp."matchId" = p_match_id
      AND mp."playerId" = (a->>'playerId')::uuid
  );

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Algún jugador no pertenece a este partido';
  END IF;

  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    UPDATE public."matchParticipants"
    SET team = (v_assignment->>'team')::"matchTeam"
    WHERE "matchId" = p_match_id
      AND "playerId" = (v_assignment->>'playerId')::uuid
      AND team::text <> (v_assignment->>'team');
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_match_teams(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.reassign_match_teams(uuid, jsonb) TO authenticated;

-- _apply_confirmed_submission is an INTERNAL cascade helper — never reachable via PostgREST.
-- Supabase default privileges grant EXECUTE on public functions to anon/authenticated, so
-- REVOKE FROM public is insufficient; revoke role-specific grants explicitly.
REVOKE EXECUTE ON FUNCTION public._apply_confirmed_submission(uuid) FROM anon, authenticated;
