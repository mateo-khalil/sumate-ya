-- ==================== Confirm Match Result RPC ====================
--
-- Supabase usage:
--   select public.confirm_match_result_submission('<submission_id>'::uuid);
--
-- Decision Context:
-- - The match result confirmation flow used to be 4 sequential client-side
--   calls (confirm submission, reject siblings, update match, fetch
--   participants for cache invalidation). That sequence is not atomic: if any
--   call failed midway the DB could be left with a confirmed submission but a
--   match still flagged as open, or vice versa. It also opened a race where
--   two concurrent "last votes" could both observe `approveCount > N/2` and
--   each independently fire the cascade, double-incrementing player stats.
-- - This RPC collapses the entire cascade — including the new "increment
--   matchesPlayed / matchesWon" and "insert notifications for all
--   participants" requirements — into a single transactional PL/pgSQL body.
-- - SECURITY DEFINER is required because the authenticated UPDATE policy on
--   `matches` only allows the organizer; the function performs an explicit
--   `auth.uid()` check at the top so anonymous calls are rejected (defense in
--   depth — PostgREST already requires auth via the GRANT to `authenticated`).
-- - FOR UPDATE locks on both the submission row and the match row serialize
--   the two-vote race: the second caller waits until the first commits, then
--   sees `submissionStatus = 'confirmed'` and returns idempotently
--   (`alreadyConfirmed: true`) without re-incrementing stats or re-emitting
--   notifications.
-- - The majority check is re-validated inside the lock against live data —
--   the caller's count is advisory only. If a vote was retracted between the
--   service-side count and this RPC, we still refuse to confirm.
-- - Stats handling:
--     winningTeam IN ('a','b') → matchesPlayed +1 for every participant,
--                                matchesWon  +1 only for participants whose
--                                `team` matches the winning side.
--     winningTeam = 'draw'     → matchesPlayed +1 for every participant,
--                                no matchesWon update (no `matchesDrawn`
--                                column yet — out of scope here).
-- - Notification payload uses a free-text `type` column (`notifications.type`
--   is `text`, not an enum — see initial_schema.sql:232). The string
--   `match_result_confirmed` is the canonical type for this event.
-- - Cancelled matches must never transition to `completed`; if a vote race
--   reaches this RPC after the organizer cancelled the match we raise
--   instead of silently overwriting.
-- - The returned `participantIds` JSON array is consumed by the service
--   layer to invalidate `user:matches:{uid}*` cache keys; encoding it inside
--   the same RPC avoids the extra round-trip the old `getParticipantIds`
--   helper required.
-- - Previously fixed bugs: stats could double-increment under concurrent
--   final votes, and the cascade could partially apply on a transient
--   Supabase failure. Both are eliminated by the single transactional body
--   here.

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
  v_participant_count integer := 0;
  v_winners_count integer := 0;
  v_notification_body text;
  v_participant_ids jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    s.id,
    s."matchId",
    s."scoreTeamA",
    s."scoreTeamB",
    s."winningTeam",
    s."submissionStatus"
  INTO v_submission
  FROM public."matchResultSubmissions" s
  WHERE s.id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission no encontrada';
  END IF;

  -- Idempotency: a concurrent caller already confirmed this submission.
  -- Return without touching stats/notifications so the cascade runs exactly once.
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

  SELECT m.status
  INTO v_match_status
  FROM public."matches" m
  WHERE m.id = v_submission."matchId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partido no encontrado';
  END IF;

  IF v_match_status = 'cancelled' THEN
    RAISE EXCEPTION 'El partido fue cancelado';
  END IF;

  -- Re-validate majority inside the lock against live data; don't trust caller counts.
  SELECT count(*)
  INTO v_approve_count
  FROM public."matchResultVotes" v
  WHERE v."submissionId" = p_submission_id
    AND v.vote = 'approve';

  SELECT count(*)
  INTO v_total_participants
  FROM public."matchParticipants" p
  WHERE p."matchId" = v_submission."matchId";

  IF v_approve_count * 2 <= v_total_participants THEN
    RAISE EXCEPTION 'No hay mayoría suficiente para confirmar';
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
  --    NOTE: matchParticipants.team is the legacy `matchTeam` enum (a/b) while
  --    matchResultSubmissions.winningTeam was migrated to the newer `winnerTeamValue`
  --    enum (a/b/draw). Postgres won't compare two different enum types directly, so
  --    we cast both sides to text to bridge them. The IN ('a','b') guard above ensures
  --    we never reach the WHERE with 'draw' (which has no matching team row anyway).
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

  -- 6) Build the notification body (Spanish copy, mirrors the spec).
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

  -- 7) Notify every participant. Free-text `type` keeps this independent of enums.
  INSERT INTO public."notifications" (
    "userId",
    title,
    body,
    type,
    "referenceId",
    "isRead"
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

  -- 8) Serialize the participant list for the caller (used to invalidate
  --    per-user cache keys without an extra round-trip).
  SELECT COALESCE(jsonb_agg("playerId"), '[]'::jsonb)
  INTO v_participant_ids
  FROM public."matchParticipants"
  WHERE "matchId" = v_submission."matchId";

  RETURN jsonb_build_object(
    'alreadyConfirmed', false,
    'participantCount', v_participant_count,
    'winnersCount', v_winners_count,
    'matchId', v_submission."matchId"::text,
    'participantIds', v_participant_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_match_result_submission(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_match_result_submission(uuid) TO authenticated;
