CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "role" text NOT NULL CHECK ("role" IN ('player', 'club')),
  "password" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "phone" text NULL,
  "address" jsonb NULL,
  "servicesOffered" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "clubs" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "zone" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "clubSlots" (
  "id" bigserial PRIMARY KEY,
  "clubId" text NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "slot" timestamptz NOT NULL,
  UNIQUE ("clubId", "slot")
);

CREATE TABLE IF NOT EXISTS "matches" (
  "id" text PRIMARY KEY,
  "organizerId" text NOT NULL,
  "organizerName" text NOT NULL,
  "clubId" text NOT NULL REFERENCES "clubs"("id"),
  "clubName" text NOT NULL,
  "zone" text NOT NULL,
  "slot" timestamptz NOT NULL,
  "format" integer NOT NULL CHECK ("format" IN (5, 7, 10, 11)),
  "capacity" integer NOT NULL CHECK ("capacity" > 0),
  "invitedPlayerIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "requiresTeamSelection" boolean NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "matchParticipants" (
  "id" bigserial PRIMARY KEY,
  "matchId" text NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "playerId" text NOT NULL,
  "name" text NOT NULL,
  "team" text NULL CHECK ("team" IN ('A', 'B')),
  UNIQUE ("matchId", "playerId")
);

CREATE TABLE IF NOT EXISTS "tournaments" (
  "id" text PRIMARY KEY,
  "organizerId" text NOT NULL,
  "name" text NOT NULL,
  "format" integer NOT NULL CHECK ("format" IN (5, 7, 10, 11)),
  "teamCount" integer NOT NULL CHECK ("teamCount" >= 2),
  "playersPerTeam" integer NOT NULL CHECK ("playersPerTeam" > 0),
  "clubId" text NOT NULL REFERENCES "clubs"("id"),
  "clubName" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tournamentSlots" (
  "id" bigserial PRIMARY KEY,
  "tournamentId" text NOT NULL REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "slot" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_matches_slot" ON "matches"("slot");
CREATE INDEX IF NOT EXISTS "idx_matches_zone" ON "matches"("zone");
CREATE INDEX IF NOT EXISTS "idx_matches_format" ON "matches"("format");
CREATE INDEX IF NOT EXISTS "idx_matchParticipants_matchId" ON "matchParticipants"("matchId");
