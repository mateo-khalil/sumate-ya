-- ==================== Result voting deadline + auto-open trigger ====================
--
-- Decision Context:
-- - Why: the result-voting flow needs a hard deadline so a pg_cron job can resolve the
--   winning proposal 24h after voting opened (US: "luego de 24 horas o si todos votaron").
-- - resultVotingClosesAt is set ONCE, when the FIRST submission for a match is inserted.
--   A trigger (not service code) guarantees the deadline is always stamped, even if a
--   future code path inserts a submission directly.
-- - SECURITY DEFINER: the trigger updates public."matches", whose authenticated UPDATE
--   policy only allows the organizer. The submitter is a participant (not necessarily the
--   organizer), so the trigger must run with owner privileges to stamp the deadline.
-- - Guard conditions: only stamp when the deadline is still NULL (first submission),
--   the match is not cancelled, and the result is not already confirmed — so re-proposals
--   never extend or reset the window.
-- - resultStatus moves pending -> voting here so the cron query can target voting matches.
-- - Previously fixed bugs: none relevant (new capability).

ALTER TABLE public."matches"
  ADD COLUMN IF NOT EXISTS "resultVotingClosesAt" timestamptz;

CREATE OR REPLACE FUNCTION public.set_match_voting_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public."matches"
  SET "resultStatus" = 'voting',
      "resultVotingClosesAt" = now() + interval '24 hours'
  WHERE id = NEW."matchId"
    AND "resultVotingClosesAt" IS NULL
    AND status <> 'cancelled'
    AND "resultStatus" <> 'confirmed';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_match_voting_deadline ON public."matchResultSubmissions";
CREATE TRIGGER trg_set_match_voting_deadline
AFTER INSERT ON public."matchResultSubmissions"
FOR EACH ROW
EXECUTE FUNCTION public.set_match_voting_deadline();
