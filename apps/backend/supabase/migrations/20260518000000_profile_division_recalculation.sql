-- ============================================================
-- Profile divisions and ranking stats recalculation
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_profile_division(
  p_matches_played int,
  p_matches_won int
)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_matches_played < 5 THEN 1
    WHEN (p_matches_won::numeric / NULLIF(p_matches_played, 0)) >= 0.75 THEN 4
    WHEN (p_matches_won::numeric / NULLIF(p_matches_played, 0)) >= 0.60 THEN 3
    WHEN (p_matches_won::numeric / NULLIF(p_matches_played, 0)) >= 0.45 THEN 2
    ELSE 1
  END::smallint;
$$;

CREATE OR REPLACE FUNCTION public.refresh_profile_competitive_stats_for_match(
  p_match_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH affected_players AS (
    SELECT DISTINCT mp."playerId"
    FROM public."matchParticipants" mp
    WHERE mp."matchId" = p_match_id
  ),
  stats AS (
    SELECT
      ap."playerId",
      COUNT(m.id)::int AS matches_played,
      COUNT(m.id) FILTER (WHERE m."winningTeam"::text = mp.team::text)::int AS matches_won
    FROM affected_players ap
    LEFT JOIN public."matchParticipants" mp
      ON mp."playerId" = ap."playerId"
    LEFT JOIN public.matches m
      ON m.id = mp."matchId"
      AND m.status = 'completed'
      AND m."resultStatus" = 'confirmed'
      AND m."winningTeam" IS NOT NULL
    GROUP BY ap."playerId"
  )
  UPDATE public.profiles p
  SET
    "matchesPlayed" = stats.matches_played,
    "matchesWon" = stats.matches_won,
    division = public.calculate_profile_division(stats.matches_played, stats.matches_won)
  FROM stats
  WHERE p.id = stats."playerId";
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_profile_competitive_stats_for_match(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_profile_competitive_stats_for_match(uuid)
TO service_role;

WITH stats AS (
  SELECT
    p.id AS "playerId",
    COUNT(m.id)::int AS matches_played,
    COUNT(m.id) FILTER (WHERE m."winningTeam"::text = mp.team::text)::int AS matches_won
  FROM public.profiles p
  LEFT JOIN public."matchParticipants" mp
    ON mp."playerId" = p.id
  LEFT JOIN public.matches m
    ON m.id = mp."matchId"
    AND m.status = 'completed'
    AND m."resultStatus" = 'confirmed'
    AND m."winningTeam" IS NOT NULL
  WHERE p.role = 'player'
  GROUP BY p.id
)
UPDATE public.profiles p
SET
  "matchesPlayed" = stats.matches_played,
  "matchesWon" = stats.matches_won,
  division = public.calculate_profile_division(stats.matches_played, stats.matches_won)
FROM stats
WHERE p.id = stats."playerId";
