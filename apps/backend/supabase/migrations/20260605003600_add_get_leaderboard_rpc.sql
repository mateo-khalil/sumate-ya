-- Leaderboard RPC: ranks public players by winrate.
--
-- Decision Context:
-- - Why an RPC (not a PostgREST query): the leaderboard must ORDER BY a *computed*
--   winrate (matchesWon / matchesPlayed) and apply a LIMIT at the DB level. PostgREST
--   cannot order by an arbitrary expression, and sorting in JS would force fetching
--   every qualifying row (egress cost). The RPC keeps both the computation and the
--   bounded result set in Postgres.
-- - Eligibility: isPublic = true AND showStats = true AND matchesPlayed >= 5.
--   The story asks for isPublic only, but showStats = false means the owner opted out
--   of exposing stats publicly; ranking them by winrate would leak exactly that data,
--   so we honour the same privacy contract the profileService enforces elsewhere.
-- - SECURITY DEFINER + fixed search_path: the leaderboard is public (callable by the
--   anon/service path without per-user RLS), and we read only already-public columns.
--   Pinning search_path to public hardens the definer function against shadowing.
-- - Tie-breaking: winrate DESC, then matchesWon DESC, then matchesPlayed DESC so the
--   ordering is deterministic (stable ranks between requests / cache refreshes).
-- - p_limit is clamped to [1, 100] to bound egress regardless of caller input.
-- - Enum columns cast to text so the JSON payload is plain strings, matching how the
--   profileRepository already types role / preferredPosition.
-- - Previously fixed bugs: none relevant.
create or replace function public.get_leaderboard(p_limit integer default 50)
returns table (
  id uuid,
  "displayName" text,
  "avatarUrl" text,
  role text,
  "preferredPosition" text,
  division smallint,
  "matchesPlayed" integer,
  "matchesWon" integer,
  winrate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p."displayName",
    p."avatarUrl",
    p.role::text,
    p."preferredPosition"::text,
    p.division,
    p."matchesPlayed",
    p."matchesWon",
    round((p."matchesWon"::numeric / p."matchesPlayed") * 100, 2) as winrate
  from public.profiles p
  where p."isPublic" = true
    and p."showStats" = true
    and p."matchesPlayed" >= 5
  order by winrate desc, p."matchesWon" desc, p."matchesPlayed" desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

comment on function public.get_leaderboard(integer) is
  'Returns the top public players ranked by winrate (matchesWon/matchesPlayed). Eligibility: isPublic AND showStats AND matchesPlayed >= 5. Limit clamped to [1,100].';

grant execute on function public.get_leaderboard(integer) to anon, authenticated, service_role;
