-- ==================== pg_cron: auto-resolve expired result voting ====================
--
-- Decision Context:
-- - Why pg_cron: the 24h auto-resolution must fire without any user action and without a
--   long-lived Node worker. pg_cron runs inside Postgres as the table owner, so it can call
--   the SECURITY DEFINER resolve_match_result_voting and bypass the organizer-only RLS on
--   matches. Chosen over node-cron (process must stay alive) and lazy-on-read (never fires
--   if nobody opens the match).
-- - Cadence: every 5 minutes. Resolution latency of <=5 min after the 24h window closes is
--   well within product tolerance and keeps cron load negligible.
-- - The job scans only matches still in 'voting' whose window has closed, so it is a cheap
--   indexed scan; each match is resolved exactly once (resolve_* flips resultStatus).
-- - cron.schedule upserts by job name, so re-running this migration is idempotent.
-- - Previously fixed bugs: none relevant (new capability).

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'resolve-match-results',
  '*/5 * * * *',
  $$ SELECT public.resolve_match_result_voting(id)
     FROM public."matches"
     WHERE "resultStatus" = 'voting'
       AND "resultVotingClosesAt" IS NOT NULL
       AND "resultVotingClosesAt" < now(); $$
);

-- Helpful partial index for the cron scan.
CREATE INDEX IF NOT EXISTS "idx_matches_voting_deadline"
  ON public."matches" ("resultVotingClosesAt")
  WHERE "resultStatus" = 'voting';
