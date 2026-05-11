-- ==================== Tournament RPC functions ====================
--
-- Supabase usage:
--   select public.create_tournament_with_fixture(
--     '<club_id>'::uuid,
--     'Copa Nocturna',
--     '7v7'::"matchFormat",
--     4,
--     8,
--     'Torneo abierto',
--     '[{"slotId":"<slot_uuid>","date":"2026-05-20"}]'::jsonb
--   );
--
--   select public.register_tournament_team('<tournament_id>'::uuid, 'Los Pibes');
--
-- Decision Context:
-- - The app uses Supabase Auth. These functions read auth.uid(), so they are intended
--   to be called as authenticated RPCs through Supabase/PostgREST or from the backend
--   with the user's JWT.
-- - SECURITY DEFINER is used so the complete operation can be atomic even when fixture
--   generation is triggered by the captain that fills the last team slot. Every function
--   performs explicit auth and business-rule checks before writing.
-- - Existing tournament tables already come from the initial schema. This file adds
--   RPC-level behavior and a small compatibility guard for clubSlots fields used by
--   current booking flows.

-- Compatibility for projects whose remote DB predates the slot-management columns.
ALTER TABLE public."clubSlots"
  ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowOnlineBooking" boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.tournament_required_matches(team_count integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (team_count * (team_count - 1)) / 2;
$$;

CREATE OR REPLACE FUNCTION public.tournament_day_of_week(slot_date date)
RETURNS "dayOfWeek"
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE EXTRACT(DOW FROM slot_date)::int
    WHEN 0 THEN 'sunday'::"dayOfWeek"
    WHEN 1 THEN 'monday'::"dayOfWeek"
    WHEN 2 THEN 'tuesday'::"dayOfWeek"
    WHEN 3 THEN 'wednesday'::"dayOfWeek"
    WHEN 4 THEN 'thursday'::"dayOfWeek"
    WHEN 5 THEN 'friday'::"dayOfWeek"
    WHEN 6 THEN 'saturday'::"dayOfWeek"
  END;
$$;

CREATE OR REPLACE FUNCTION public.generate_round_robin_fixture(p_tournament_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_tournament record;
  v_team_ids uuid[];
  v_team_count integer;
  v_participants uuid[];
  v_participant_count integer;
  v_rounds integer;
  v_half integer;
  v_round integer;
  v_idx integer;
  v_home uuid;
  v_away uuid;
  v_fixture_ids uuid[];
  v_pair_index integer := 1;
  v_updated integer := 0;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_tournament
  FROM public."tournaments"
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;

  IF v_tournament.status <> 'registration'::"tournamentStatus" THEN
    RETURN 0;
  END IF;

  IF v_tournament."organizerId" <> v_auth_uid
    AND NOT EXISTS (
      SELECT 1
      FROM public."tournamentTeams" tt
      WHERE tt."tournamentId" = p_tournament_id
        AND tt."captainId" = v_auth_uid
    )
  THEN
    RAISE EXCEPTION 'No tenés permisos para generar el fixture de este torneo';
  END IF;

  SELECT array_agg(tt.id ORDER BY tt."createdAt", tt.id), count(*)
  INTO v_team_ids, v_team_count
  FROM public."tournamentTeams" tt
  WHERE tt."tournamentId" = p_tournament_id;

  IF COALESCE(v_team_count, 0) < v_tournament."teamCount" THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."fixtureMatches" fm
    WHERE fm."tournamentId" = p_tournament_id
      AND (fm."homeTeamId" IS NOT NULL OR fm."awayTeamId" IS NOT NULL)
  ) THEN
    RETURN 0;
  END IF;

  SELECT array_agg(fm.id ORDER BY fm.round, fm."scheduledAt" NULLS LAST, fm."createdAt", fm.id)
  INTO v_fixture_ids
  FROM public."fixtureMatches" fm
  WHERE fm."tournamentId" = p_tournament_id;

  IF COALESCE(array_length(v_fixture_ids, 1), 0) < public.tournament_required_matches(v_tournament."teamCount") THEN
    RAISE EXCEPTION 'El torneo no tiene suficientes horarios reservados para generar el fixture';
  END IF;

  v_participants := v_team_ids[1:v_tournament."teamCount"];
  IF v_tournament."teamCount" % 2 = 1 THEN
    v_participants := array_append(v_participants, NULL::uuid);
  END IF;

  v_participant_count := array_length(v_participants, 1);
  v_rounds := v_participant_count - 1;
  v_half := v_participant_count / 2;

  FOR v_round IN 1..v_rounds LOOP
    FOR v_idx IN 1..v_half LOOP
      v_home := v_participants[v_idx];
      v_away := v_participants[v_participant_count - v_idx + 1];

      IF v_home IS NOT NULL AND v_away IS NOT NULL THEN
        IF v_round % 2 = 0 THEN
          UPDATE public."fixtureMatches"
          SET "homeTeamId" = v_away,
              "awayTeamId" = v_home
          WHERE id = v_fixture_ids[v_pair_index];
        ELSE
          UPDATE public."fixtureMatches"
          SET "homeTeamId" = v_home,
              "awayTeamId" = v_away
          WHERE id = v_fixture_ids[v_pair_index];
        END IF;

        v_pair_index := v_pair_index + 1;
        v_updated := v_updated + 1;
      END IF;
    END LOOP;

    IF v_participant_count > 2 THEN
      v_participants :=
        ARRAY[v_participants[1], v_participants[v_participant_count]]
        || v_participants[2:v_participant_count - 1];
    END IF;
  END LOOP;

  UPDATE public."tournaments"
  SET status = 'in_progress'::"tournamentStatus"
  WHERE id = p_tournament_id;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tournament_with_fixture(
  p_club_id uuid,
  p_name text,
  p_format "matchFormat",
  p_team_count integer,
  p_players_per_team integer,
  p_description text,
  p_schedule jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_required_matches integer;
  v_matches_per_round integer;
  v_tournament_id uuid;
  v_start_date date;
  v_end_date date;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF trim(COALESCE(p_name, '')) = '' OR char_length(trim(p_name)) < 3 THEN
    RAISE EXCEPTION 'El nombre del torneo debe tener al menos 3 caracteres';
  END IF;

  IF p_team_count < 2 THEN
    RAISE EXCEPTION 'El torneo debe tener al menos 2 equipos';
  END IF;

  IF p_players_per_team < 1 THEN
    RAISE EXCEPTION 'Jugadores por equipo debe ser mayor a 0';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."clubs" c WHERE c.id = p_club_id) THEN
    RAISE EXCEPTION 'Club no encontrado';
  END IF;

  v_required_matches := public.tournament_required_matches(p_team_count);
  v_matches_per_round := floor(p_team_count / 2.0)::integer;

  CREATE TEMP TABLE IF NOT EXISTS _tournament_schedule_input (
    slot_id uuid NOT NULL,
    slot_date date NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE TABLE _tournament_schedule_input;

  INSERT INTO _tournament_schedule_input (slot_id, slot_date)
  SELECT raw."slotId"::uuid, raw."date"::date
  FROM jsonb_to_recordset(p_schedule) AS raw("slotId" text, "date" text);

  IF (SELECT count(*) FROM _tournament_schedule_input) < v_required_matches THEN
    RAISE EXCEPTION 'Necesitás seleccionar % horarios para este round-robin', v_required_matches;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _tournament_schedule_input tsi
    GROUP BY tsi.slot_id, tsi.slot_date
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay horarios repetidos en el fixture del torneo';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _tournament_schedule_validated (
    row_no bigint NOT NULL,
    slot_id uuid NOT NULL,
    slot_date date NOT NULL,
    court_id uuid NOT NULL,
    scheduled_at timestamptz NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE TABLE _tournament_schedule_validated;

  INSERT INTO _tournament_schedule_validated (row_no, slot_id, slot_date, court_id, scheduled_at)
  SELECT
    row_number() OVER (ORDER BY tsi.slot_date, cs."startTime", cs.id) AS row_no,
    cs.id,
    tsi.slot_date,
    cs."courtId",
    (tsi.slot_date::text || 'T' || cs."startTime"::text)::timestamptz AS scheduled_at
  FROM _tournament_schedule_input tsi
  JOIN public."clubSlots" cs ON cs.id = tsi.slot_id
  JOIN public."courts" c ON c.id = cs."courtId"
  WHERE cs."clubId" = p_club_id
    AND cs."isActive" = true
    AND cs."isBlocked" = false
    AND cs."allowOnlineBooking" = true
    AND cs."dayOfWeek" = public.tournament_day_of_week(tsi.slot_date)
    AND (CASE p_format
      WHEN '5v5'::"matchFormat" THEN 1
      WHEN '7v7'::"matchFormat" THEN 2
      WHEN '10v10'::"matchFormat" THEN 3
      WHEN '11v11'::"matchFormat" THEN 4
    END) <= (CASE c."maxFormat"
      WHEN '5v5'::"matchFormat" THEN 1
      WHEN '7v7'::"matchFormat" THEN 2
      WHEN '10v10'::"matchFormat" THEN 3
      WHEN '11v11'::"matchFormat" THEN 4
    END)
    AND (tsi.slot_date::text || 'T' || cs."startTime"::text)::timestamptz > now();

  IF (SELECT count(*) FROM _tournament_schedule_validated) < v_required_matches THEN
    RAISE EXCEPTION 'Algunos horarios no existen, no pertenecen al club, están bloqueados o no son compatibles';
  END IF;

  DELETE FROM _tournament_schedule_validated
  WHERE row_no > v_required_matches;

  IF EXISTS (
    SELECT 1
    FROM _tournament_schedule_validated v
    JOIN public."matches" m
      ON m."clubSlotId" = v.slot_id
     AND m.status <> 'cancelled'::"matchStatus"
     AND m."scheduledAt"::date = v.slot_date
  ) THEN
    RAISE EXCEPTION 'Ya existe un partido en uno de los horarios seleccionados';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _tournament_schedule_validated v
    JOIN public."fixtureMatches" fm
      ON fm."courtId" = v.court_id
     AND fm.status <> 'cancelled'::"fixtureMatchStatus"
     AND fm."scheduledAt"::date = v.slot_date
     AND fm."scheduledAt"::time = v.scheduled_at::time
  ) THEN
    RAISE EXCEPTION 'Ya existe un fixture de torneo en uno de los horarios seleccionados';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_club_id::text, 0));

  SELECT min(slot_date), max(slot_date)
  INTO v_start_date, v_end_date
  FROM _tournament_schedule_validated;

  INSERT INTO public."tournaments" (
    "organizerId",
    "clubId",
    name,
    format,
    "teamCount",
    "playersPerTeam",
    description,
    "startDate",
    "endDate"
  )
  VALUES (
    v_auth_uid,
    p_club_id,
    trim(p_name),
    p_format,
    p_team_count,
    p_players_per_team,
    NULLIF(trim(COALESCE(p_description, '')), ''),
    v_start_date,
    v_end_date
  )
  RETURNING id INTO v_tournament_id;

  INSERT INTO public."fixtureMatches" (
    "tournamentId",
    round,
    "courtId",
    "scheduledAt"
  )
  SELECT
    v_tournament_id,
    (((row_no - 1) / v_matches_per_round) + 1)::smallint,
    court_id,
    scheduled_at
  FROM _tournament_schedule_validated
  ORDER BY row_no;

  RETURN v_tournament_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_tournament_team(
  p_tournament_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_tournament record;
  v_team_id uuid;
  v_team_count integer;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF trim(COALESCE(p_name, '')) = '' OR char_length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'El nombre del equipo debe tener al menos 2 caracteres';
  END IF;

  SELECT *
  INTO v_tournament
  FROM public."tournaments"
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado';
  END IF;

  IF v_tournament.status <> 'registration'::"tournamentStatus" THEN
    RAISE EXCEPTION 'La inscripción de este torneo ya está cerrada';
  END IF;

  SELECT count(*)
  INTO v_team_count
  FROM public."tournamentTeams"
  WHERE "tournamentId" = p_tournament_id;

  IF v_team_count >= v_tournament."teamCount" THEN
    RAISE EXCEPTION 'El torneo ya completó todos sus cupos de equipos';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."tournamentTeams"
    WHERE "tournamentId" = p_tournament_id
      AND lower(name) = lower(trim(p_name))
  ) THEN
    RAISE EXCEPTION 'Ya existe un equipo con ese nombre en el torneo';
  END IF;

  INSERT INTO public."tournamentTeams" ("tournamentId", name, "captainId")
  VALUES (p_tournament_id, trim(p_name), v_auth_uid)
  RETURNING id INTO v_team_id;

  INSERT INTO public."tournamentTeamMembers" ("teamId", "playerId")
  VALUES (v_team_id, v_auth_uid);

  PERFORM public.generate_round_robin_fixture(p_tournament_id);

  RETURN v_team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_required_matches(integer) FROM public;
REVOKE ALL ON FUNCTION public.tournament_day_of_week(date) FROM public;
REVOKE ALL ON FUNCTION public.generate_round_robin_fixture(uuid) FROM public;
REVOKE ALL ON FUNCTION public.create_tournament_with_fixture(
  uuid,
  text,
  "matchFormat",
  integer,
  integer,
  text,
  jsonb
) FROM public;
REVOKE ALL ON FUNCTION public.register_tournament_team(uuid, text) FROM public;

GRANT EXECUTE ON FUNCTION public.tournament_required_matches(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_day_of_week(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_round_robin_fixture(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tournament_with_fixture(
  uuid,
  text,
  "matchFormat",
  integer,
  integer,
  text,
  jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_tournament_team(uuid, text) TO authenticated;
