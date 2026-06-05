-- matchReminders: idempotency markers for "players still missing" reminder notifications.
-- Why: the auto-cancel/reminder worker ticks every ~5 min, so without a durable marker a
-- match sitting in the 4h/3h/2h reminder window would be notified on every tick (and again
-- after a process restart). The UNIQUE(matchId, kind) constraint makes a reminder send a
-- one-shot, idempotent operation across ticks AND across multiple backend instances: the
-- second insert hits a 23505 unique violation and the worker treats that as "already sent".
-- RLS: only the service-role worker touches this table; players never read/write it.
-- Previously fixed bugs: none relevant (new table).
CREATE TABLE "matchReminders" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "matchId"   uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "kind"      text NOT NULL CHECK ("kind" IN ('reminder_4h', 'reminder_3h', 'reminder_2h')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("matchId", "kind")
);

CREATE INDEX "idx_matchReminders_match" ON "matchReminders" ("matchId");

ALTER TABLE "matchReminders" ENABLE ROW LEVEL SECURITY;

-- service_role: full access. The worker runs with the service-role key and must read/write
-- markers freely. (service_role bypasses RLS anyway; policy documents intent.)
CREATE POLICY "matchReminders_service_role_all"
  ON "matchReminders"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No `authenticated` policy on purpose: players have no reason to read or write reminder
-- markers, so the default deny for authenticated/anon is the desired posture.
