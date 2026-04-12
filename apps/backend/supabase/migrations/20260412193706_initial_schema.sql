-- ============================================================
-- Sumate Ya - Initial Schema Migration
-- ============================================================

-- ==================== ENUMS ====================

CREATE TYPE "userRole" AS ENUM ('player', 'club_admin');
CREATE TYPE "matchFormat" AS ENUM ('5v5', '7v7', '10v10', '11v11');
CREATE TYPE "matchStatus" AS ENUM ('open', 'full', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "matchTeam" AS ENUM ('a', 'b');
CREATE TYPE "tournamentStatus" AS ENUM ('registration', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "fixtureMatchStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "playerPosition" AS ENUM ('goalkeeper', 'defender', 'midfielder', 'forward');
CREATE TYPE "dayOfWeek" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
CREATE TYPE "resultStatus" AS ENUM ('pending', 'voting', 'confirmed', 'disputed');
CREATE TYPE "voteValue" AS ENUM ('approve', 'reject');
CREATE TYPE "courtSurface" AS ENUM ('grass', 'synthetic', 'concrete', 'indoor');

-- ==================== TRIGGER FUNCTION ====================

CREATE OR REPLACE FUNCTION "setUpdatedAt"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;

-- ==================== TABLES ====================

CREATE TABLE "profiles" (
  "id"                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "displayName"       text NOT NULL,
  "avatarUrl"         text,
  "role"              "userRole" NOT NULL DEFAULT 'player',
  "preferredPosition" "playerPosition",
  "division"          smallint NOT NULL DEFAULT 1,
  "matchesPlayed"     int NOT NULL DEFAULT 0,
  "matchesWon"        int NOT NULL DEFAULT 0,
  "isPublic"          boolean NOT NULL DEFAULT true,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_profiles_role" ON "profiles" ("role");
CREATE INDEX "idx_profiles_division" ON "profiles" ("division");
CREATE TRIGGER "trg_profiles_updatedAt" BEFORE UPDATE ON "profiles" FOR EACH ROW EXECUTE FUNCTION "setUpdatedAt"();

CREATE TABLE "clubs" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId"     uuid NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "name"        text NOT NULL,
  "address"     text NOT NULL,
  "zone"        text NOT NULL,
  "lat"         double precision NOT NULL,
  "lng"         double precision NOT NULL,
  "phone"       text,
  "description" text,
  "imageUrl"    text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_clubs_zone" ON "clubs" ("zone");
CREATE INDEX "idx_clubs_owner" ON "clubs" ("ownerId");
CREATE INDEX "idx_clubs_location" ON "clubs" ("lat", "lng");
CREATE TRIGGER "trg_clubs_updatedAt" BEFORE UPDATE ON "clubs" FOR EACH ROW EXECUTE FUNCTION "setUpdatedAt"();

CREATE TABLE "courts" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clubId"    uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "name"      text NOT NULL,
  "surface"   "courtSurface" NOT NULL DEFAULT 'synthetic',
  "isIndoor"  boolean NOT NULL DEFAULT false,
  "maxFormat" "matchFormat" NOT NULL DEFAULT '11v11',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("clubId", "name")
);
CREATE INDEX "idx_courts_club" ON "courts" ("clubId");
CREATE TRIGGER "trg_courts_updatedAt" BEFORE UPDATE ON "courts" FOR EACH ROW EXECUTE FUNCTION "setUpdatedAt"();

CREATE TABLE "clubSlots" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clubId"    uuid NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "courtId"   uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "dayOfWeek" "dayOfWeek" NOT NULL,
  "startTime" time NOT NULL,
  "endTime"   time NOT NULL,
  "priceArs"  numeric(10,2),
  "isBlocked" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("courtId", "dayOfWeek", "startTime"),
  CHECK ("endTime" > "startTime")
);
CREATE INDEX "idx_clubSlots_club" ON "clubSlots" ("clubId");
CREATE INDEX "idx_clubSlots_court" ON "clubSlots" ("courtId");
CREATE INDEX "idx_clubSlots_day" ON "clubSlots" ("dayOfWeek");
CREATE TRIGGER "trg_clubSlots_updatedAt" BEFORE UPDATE ON "clubSlots" FOR EACH ROW EXECUTE FUNCTION "setUpdatedAt"();

CREATE TABLE "matches" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizerId"  uuid NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "clubId"       uuid NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT,
  "courtId"      uuid REFERENCES "courts"("id") ON DELETE SET NULL,
  "clubSlotId"   uuid REFERENCES "clubSlots"("id") ON DELETE SET NULL,
  "format"       "matchFormat" NOT NULL,
  "capacity"     smallint NOT NULL,
  "scheduledAt"  timestamptz NOT NULL,
  "durationMin"  smallint NOT NULL DEFAULT 60,
  "status"       "matchStatus" NOT NULL DEFAULT 'open',
  "description"  text,
  "resultStatus" "resultStatus" NOT NULL DEFAULT 'pending',
  "winningTeam"  "matchTeam",
  "scoreTeamA"   smallint,
  "scoreTeamB"   smallint,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  CHECK ("capacity" > 0 AND "capacity" <= 22),
  CHECK ("capacity" % 2 = 0)
);
CREATE INDEX "idx_matches_club" ON "matches" ("clubId");
CREATE INDEX "idx_matches_organizer" ON "matches" ("organizerId");
CREATE INDEX "idx_matches_status" ON "matches" ("status");
CREATE INDEX "idx_matches_format" ON "matches" ("format");
CREATE INDEX "idx_matches_scheduledAt" ON "matches" ("scheduledAt");
CREATE INDEX "idx_matches_clubSlot" ON "matches" ("clubSlotId");
CREATE INDEX "idx_matches_status_scheduled" ON "matches" ("status", "scheduledAt");
CREATE TRIGGER "trg_matches_updatedAt" BEFORE UPDATE ON "matches" FOR EACH ROW EXECUTE FUNCTION "setUpdatedAt"();

CREATE TABLE "matchParticipants" (
  "id"       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "matchId"  uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "playerId" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "team"     "matchTeam" NOT NULL,
  "joinedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("matchId", "playerId")
);
CREATE INDEX "idx_matchParticipants_match" ON "matchParticipants" ("matchId");
CREATE INDEX "idx_matchParticipants_player" ON "matchParticipants" ("playerId");

CREATE TABLE "matchResultSubmissions" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "matchId"     uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "submitterId" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "winningTeam" "matchTeam" NOT NULL,
  "scoreTeamA"  smallint NOT NULL CHECK ("scoreTeamA" >= 0),
  "scoreTeamB"  smallint NOT NULL CHECK ("scoreTeamB" >= 0),
  "isConfirmed" boolean NOT NULL DEFAULT false,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_matchResultSubmissions_match" ON "matchResultSubmissions" ("matchId");

CREATE TABLE "matchResultVotes" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "submissionId" uuid NOT NULL REFERENCES "matchResultSubmissions"("id") ON DELETE CASCADE,
  "voterId"      uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "vote"         "voteValue" NOT NULL,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("submissionId", "voterId")
);
CREATE INDEX "idx_matchResultVotes_submission" ON "matchResultVotes" ("submissionId");

CREATE TABLE "tournaments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizerId"    uuid NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "clubId"         uuid NOT NULL REFERENCES "clubs"("id") ON DELETE RESTRICT,
  "name"           text NOT NULL,
  "format"         "matchFormat" NOT NULL,
  "teamCount"      smallint NOT NULL CHECK ("teamCount" >= 2),
  "playersPerTeam" smallint NOT NULL CHECK ("playersPerTeam" >= 1),
  "status"         "tournamentStatus" NOT NULL DEFAULT 'registration',
  "description"    text,
  "startDate"      date,
  "endDate"        date,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_tournaments_club" ON "tournaments" ("clubId");
CREATE INDEX "idx_tournaments_organizer" ON "tournaments" ("organizerId");
CREATE INDEX "idx_tournaments_status" ON "tournaments" ("status");
CREATE TRIGGER "trg_tournaments_updatedAt" BEFORE UPDATE ON "tournaments" FOR EACH ROW EXECUTE FUNCTION "setUpdatedAt"();

CREATE TABLE "tournamentTeams" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tournamentId" uuid NOT NULL REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "captainId"    uuid NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tournamentId", "name")
);
CREATE INDEX "idx_tournamentTeams_tournament" ON "tournamentTeams" ("tournamentId");
CREATE INDEX "idx_tournamentTeams_captain" ON "tournamentTeams" ("captainId");

CREATE TABLE "tournamentTeamMembers" (
  "id"       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "teamId"   uuid NOT NULL REFERENCES "tournamentTeams"("id") ON DELETE CASCADE,
  "playerId" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "joinedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("teamId", "playerId")
);
CREATE INDEX "idx_tournamentTeamMembers_team" ON "tournamentTeamMembers" ("teamId");
CREATE INDEX "idx_tournamentTeamMembers_player" ON "tournamentTeamMembers" ("playerId");

CREATE TABLE "fixtureMatches" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tournamentId" uuid NOT NULL REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "round"        smallint NOT NULL,
  "homeTeamId"   uuid REFERENCES "tournamentTeams"("id") ON DELETE SET NULL,
  "awayTeamId"   uuid REFERENCES "tournamentTeams"("id") ON DELETE SET NULL,
  "courtId"      uuid REFERENCES "courts"("id") ON DELETE SET NULL,
  "scheduledAt"  timestamptz,
  "status"       "fixtureMatchStatus" NOT NULL DEFAULT 'scheduled',
  "scoreHome"    smallint,
  "scoreAway"    smallint,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_fixtureMatches_tournament" ON "fixtureMatches" ("tournamentId");
CREATE INDEX "idx_fixtureMatches_round" ON "fixtureMatches" ("tournamentId", "round");
CREATE INDEX "idx_fixtureMatches_homeTeam" ON "fixtureMatches" ("homeTeamId");
CREATE INDEX "idx_fixtureMatches_awayTeam" ON "fixtureMatches" ("awayTeamId");
CREATE TRIGGER "trg_fixtureMatches_updatedAt" BEFORE UPDATE ON "fixtureMatches" FOR EACH ROW EXECUTE FUNCTION "setUpdatedAt"();

CREATE TABLE "notifications" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"      uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "title"       text NOT NULL,
  "body"        text,
  "type"        text NOT NULL,
  "referenceId" uuid,
  "isRead"      boolean NOT NULL DEFAULT false,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_notifications_user" ON "notifications" ("userId", "isRead");
CREATE INDEX "idx_notifications_created" ON "notifications" ("createdAt");

-- ==================== RLS ====================

ALTER TABLE "profiles"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clubs"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "courts"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clubSlots"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matches"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matchParticipants"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matchResultSubmissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matchResultVotes"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tournaments"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tournamentTeams"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tournamentTeamMembers"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixtureMatches"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"          ENABLE ROW LEVEL SECURITY;
