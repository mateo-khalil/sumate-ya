-- ==================== Resolve match result voting (deadline / all-voted) ====================
--
-- Decision Context:
-- - Why: the instant path (confirm_match_result_submission) only fires when a single
--   submission crosses a STRICT approve-majority. The US also requires resolution when the
--   24h window closes OR when every participant has voted — picking the proposal with the
--   MOST approvals. This RPC implements that "pick the winner" resolution.
-- - Shared cascade: the apply-result side effects (confirm submission, reject siblings,
--   write score onto the match, +matchesPlayed/+matchesWon, notify participants, return
--   participantIds) are factored into _apply_confirmed_submission so the instant path and
--   the resolution path stay byte-for-byte consistent on stats handling.
-- - confirm_match_result_submission keeps its OWN auth + strict-majority re-validation and
--   then delegates the cascade to the helper. Its external contract is unchanged; the
--   service layer still calls refresh_profile_competitive_stats_for_match afterwards.
-- - resolve_match_result_voting does NOT require auth.uid(): it is invoked by pg_cron (runs
--   as the table owner, no PostgREST session) and by the backend on the "all voted" path.
--   It self-contains the division refresh so the cron path needs no service layer.
-- - Tie-break: ORDER BY approveCount DESC, "createdAt" ASC — deterministic, oldest wins ties.
-- - No-approvals case: if the top pending proposal has zero approvals there is no mandate to
--   confirm any result, so the match goes to resultStatus='disputed' and NO stats are
--   touched. Returns resolved=false, reason='no_approvals'.
-- - Idempotency: locks the match FOR UPDATE and bails when resultStatus <> 'voting' (already
--   confirmed/disputed) or the match is cancelled, so concurrent cron + all-voted callers
--   resolve exactly once.
-- - Previously fixed bugs: none relevant (new capability). Reuses the FOR UPDATE locking
--   discipline that fixed the double-increment race in confirm_match_result_submission.

-- ---- Shared cascade helper -------------------------------------------------
-- Applies all confirmation side effects for an ALREADY-VALIDATED pending submission.
-- Callers MUST have locked the submission + match rows and validated state first.
-- INTERNAL ONLY: EXECUTE is revoked from anon/authenticated; reachable only from the
-- owner-running SECURITY DEFINER functions below.
CREATE OR REPLACE FUNCTION public._apply_confirmed_submission(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission record;
  v_participant_count integer := 0;
  v_winners_count integer := 0;
  v_notification_body text;
  v_participant_ids jsonb;
BEGIN
  SELECT
    s.id,
    s."matchId",
    s."scoreTeamA",
    s."scoreTeamB",
    s."winningTeam"
  INTO v_submission
  FROM public."matchResultSubmissions" s
  WHERE s.id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission no encontrada';
  END IF;

  -- 1) Confirm this submission.
  UPDATE public."matchResultSubmissions"
  SET "submissionStatus" = 'confirmed',
      "isConfirmed" = true
  WHERE id = p_submission_id;

  -- 2) Reject all other pending submissions for the same match.
  UPDATE public."matchResultSubmissions"
  SET "submissionStatus" = 'rejected'
  WHERE "matchId" = v_submission."matchId"
    AND "submissionStatus" = 'pending'
    AND id <> p_submission_id;

  -- 3) Write the result onto the match itself and mark it completed.
  UPDATE public."matches"
  SET "scoreTeamA" = v_submission."scoreTeamA",
      "scoreTeamB" = v_submission."scoreTeamB",
      "winningTeam" = v_submission."winningTeam",
      "resultStatus" = 'confirmed',
      status = 'completed'
  WHERE id = v_submission."matchId";

  -- 4) Increment matchesPlayed for every participant of this match.
  UPDATE public."profiles"
  SET "matchesPlayed" = "matchesPlayed" + 1
  WHERE id IN (
    SELECT "playerId"
    FROM public."matchParticipants"
    WHERE "matchId" = v_submission."matchId"
  );
  GET DIAGNOSTICS v_participant_count = ROW_COUNT;

  -- 5) Increment matchesWon only when there is a winning side (skip on draws).
  IF v_submission."winningTeam"::text IN ('a', 'b') THEN
    UPDATE public."profiles"
    SET "matchesWon" = "matchesWon" + 1
    WHERE id IN (
      SELECT "playerId"
      FROM public."matchParticipants"
      WHERE "matchId" = v_submission."matchId"
        AND team::text = v_submission."winningTeam"::text
    );
    GET DIAGNOSTICS v_winners_count = ROW_COUNT;
  ELSE
    v_winners_count := 0;
  END IF;

  -- 6) Notification body (Spanish copy).
  v_notification_body :=
    'Se confirmó el resultado de tu partido: '
    || v_submission."scoreTeamA"::text
    || '-'
    || v_submission."scoreTeamB"::text
    || '. '
    || CASE v_submission."winningTeam"
         WHEN 'a' THEN 'Ganó el equipo local.'
         WHEN 'b' THEN 'Ganó el equipo visitante.'
         ELSE 'Empate.'
       END;

  -- 7) Notify every participant.
  INSERT INTO public."notifications" (
    "userId", title, body, type, "referenceId", "isRead"
  )
  SELECT
    "playerId",
    'Resultado confirmado',
    v_notification_body,
    'match_result_confirmed',
    v_submission."matchId",
    false
  FROM public."matchParticipants"
  WHERE "matchId" = v_submission."matchId";

  -- 8) Serialize participant list for cache invalidation.
  SELECT COALESCE(jsonb_agg("playerId"), '[]'::jsonb)
  INTO v_participant_ids
  FROM public."matchParticipants"
  WHERE "matchId" = v_submission."matchId";

  RETURN jsonb_build_object(
    'participantCount', v_participant_count,
    'winnersCount', v_winners_count,
    'matchId', v_submission."matchId"::text,
    'participantIds', v_participant_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public._apply_confirmed_submission(uuid) FROM public;

-- ---- Refactor the instant-majority path to delegate to the helper ----------
CREATE OR REPLACE FUNCTION public.confirm_match_result_submission(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_submission record;
  v_match_status text;
  v_approve_count integer;
  v_total_participants integer;
  v_result jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT s.id, s."matchId", s."submissionStatus"
  INTO v_submission
  FROM public."matchResultSubmissions" s
  WHERE s.id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission no encontrada';
  END IF;

  -- Idempotency: a concurrent caller already confirmed this submission.
  IF v_submission."submissionStatus" = 'confirmed' THEN
    RETURN jsonb_build_object(
      'alreadyConfirmed', true,
      'participantCount', 0,
      'winnersCount', 0,
      'matchId', v_submission."matchId"::text,
      'participantIds', '[]'::jsonb
    );
  END IF;

  IF v_submission."submissionStatus" <> 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden confirmar propuestas pendientes';
  END IF;

  SELECT m.status INTO v_match_status
  FROM public."matches" m
  WHERE m.id = v_submission."matchId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF v_match_status = 'cancelled' THEN
    RAISE EXCEPTION 'El partido fue cancelado';
  END IF;

  -- Re-validate STRICT majority inside the lock against live data.
  SELECT count(*) INTO v_approve_count
  FROM public."matchResultVotes" v
  WHERE v."submissionId" = p_submission_id AND v.vote = 'approve';

  SELECT count(*) INTO v_total_participants
  FROM public."matchParticipants" p
  WHERE p."matchId" = v_submission."matchId";

  IF v_approve_count * 2 <= v_total_participants THEN
    RAISE EXCEPTION 'No hay mayoría suficiente para confirmar';
  END IF;

  v_result := public._apply_confirmed_submission(p_submission_id);

  RETURN jsonb_build_object('alreadyConfirmed', false) || v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_match_result_submission(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_match_result_submission(uuid) TO authenticated;

-- ---- Resolution path (deadline / all-voted) -------------------------------
CREATE OR REPLACE FUNCTION public.resolve_match_result_voting(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_winner record;
  v_result jsonb;
BEGIN
  SELECT m.id, m.status, m."resultStatus"
  INTO v_match
  FROM public."matches" m
  WHERE m.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'not_found');
  END IF;

  IF v_match.status = 'cancelled' THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'cancelled');
  END IF;

  -- Only voting matches are resolvable; confirmed/disputed are terminal.
  IF v_match."resultStatus" <> 'voting' THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'not_voting');
  END IF;

  -- Pick the pending submission with the most approvals (oldest wins ties).
  SELECT s.id AS submission_id,
         count(v.id) FILTER (WHERE v.vote = 'approve') AS approve_count
  INTO v_winner
  FROM public."matchResultSubmissions" s
  LEFT JOIN public."matchResultVotes" v ON v."submissionId" = s.id
  WHERE s."matchId" = p_match_id
    AND s."submissionStatus" = 'pending'
  GROUP BY s.id, s."createdAt"
  ORDER BY count(v.id) FILTER (WHERE v.vote = 'approve') DESC, s."createdAt" ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'no_pending');
  END IF;

  -- No mandate: nobody approved any proposal. Mark disputed, touch no stats.
  IF v_winner.approve_count = 0 THEN
    UPDATE public."matches"
    SET "resultStatus" = 'disputed'
    WHERE id = p_match_id;
    RETURN jsonb_build_object('resolved', false, 'reason', 'no_approvals');
  END IF;

  -- Lock the winning submission, then apply the shared cascade.
  PERFORM 1 FROM public."matchResultSubmissions"
  WHERE id = v_winner.submission_id FOR UPDATE;

  v_result := public._apply_confirmed_submission(v_winner.submission_id);

  -- Self-contained division refresh (cron path has no service layer).
  PERFORM public.refresh_profile_competitive_stats_for_match(p_match_id);

  RETURN jsonb_build_object('resolved', true) || v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_match_result_voting(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_match_result_voting(uuid) TO authenticated;
