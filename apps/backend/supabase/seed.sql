-- ============================================================
-- Sumate Ya - Seed test data for local development
-- Run via: supabase db reset (auto-applies migrations + this seed)
-- ============================================================

-- Auth users (local dev only — Supabase cloud projects should
-- use the Auth API instead of raw inserts into auth.users).
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lucas@test.com',       crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mati@test.com',        crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sofi@test.com',        crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nico@test.com',        crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('a1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vale@test.com',        crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('a1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tomi@test.com',        crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('a1000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@clubsur.com',    crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('a1000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@canchaok.com',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Profiles
INSERT INTO "profiles" ("id", "displayName", "role", "preferredPosition", "division", "matchesPlayed", "matchesWon") VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Lucas Fernández',  'player',     'midfielder', 2, 12, 7),
  ('a1000000-0000-0000-0000-000000000002', 'Mati Rodríguez',   'player',     'forward',    3, 18, 11),
  ('a1000000-0000-0000-0000-000000000003', 'Sofi Gómez',       'player',     'defender',   1, 5,  2),
  ('a1000000-0000-0000-0000-000000000004', 'Nico Pérez',       'player',     'goalkeeper', 2, 10, 6),
  ('a1000000-0000-0000-0000-000000000005', 'Vale Martínez',    'player',     'midfielder', 3, 22, 14),
  ('a1000000-0000-0000-0000-000000000006', 'Tomi López',       'player',     'forward',    1, 7,  3),
  ('a1000000-0000-0000-0000-000000000007', 'Admin Club Sur',   'club_admin', NULL,         1, 0,  0),
  ('a1000000-0000-0000-0000-000000000008', 'Admin Cancha OK',  'club_admin', NULL,         1, 0,  0)
ON CONFLICT (id) DO NOTHING;

-- Clubs (1:1 with club_admin — clubs_ownerid_unique enforces this at DB level)
INSERT INTO "clubs" ("id", "ownerId", "name", "address", "zone", "lat", "lng", "phone", "description") VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'Club Sur Fútbol',   'Av. Mitre 1234, Avellaneda', 'Sur',   -34.6628, -58.3651, '+54 11 4222-1111', 'Complejo con 3 canchas sintéticas techadas'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000008', 'Cancha OK Palermo', 'Av. Dorrego 3400, Palermo',  'Norte', -34.5731, -58.4262, '+54 11 4777-2222', '2 canchas sintéticas 7v7 al aire libre')
ON CONFLICT (id) DO NOTHING;

-- Courts (c6 removed — belonged to the deleted duplicate club b3)
INSERT INTO "courts" ("id", "clubId", "name", "surface", "isIndoor", "maxFormat") VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Cancha 1 (11v11)', 'grass',     false, '11v11'),
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Cancha 2 (7v7)',   'synthetic', true,  '7v7'),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Cancha 3 (5v5)',   'synthetic', true,  '5v5'),
  ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'Cancha A (7v7)',   'synthetic', false, '7v7'),
  ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002', 'Cancha B (7v7)',   'synthetic', false, '7v7')
ON CONFLICT (id) DO NOTHING;

-- Club slots (d6 removed — belonged to the deleted duplicate club b3)
INSERT INTO "clubSlots" ("id", "clubId", "courtId", "dayOfWeek", "startTime", "endTime", "priceArs") VALUES
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'monday',    '19:00', '20:00', 40000),
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'wednesday', '20:00', '21:00', 40000),
  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'friday',    '21:00', '22:00', 30000),
  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'tuesday',   '20:00', '21:00', 35000),
  ('d1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000005', 'thursday',  '21:00', '22:00', 35000)
ON CONFLICT (id) DO NOTHING;

-- Matches (e3 removed — referenced deleted duplicate club b3)
INSERT INTO "matches" ("id", "organizerId", "clubId", "courtId", "clubSlotId", "format", "capacity", "scheduledAt", "durationMin", "status", "description", "resultStatus", "winningTeam", "scoreTeamA", "scoreTeamB") VALUES
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '7v7',   14, now() + interval '3 days',  60, 'open',      'Partido amistoso nivel intermedio', 'pending',   NULL, NULL, NULL),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004', '7v7',   14, now() + interval '5 days',  60, 'open',      'Buscamos arquero',                    'pending',   NULL, NULL, NULL),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', '5v5',   10, now() - interval '2 days',  60, 'completed', 'Finalizado y votado',                 'confirmed', 'a',  5, 3),
  ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', '7v7',   14, now() - interval '7 days',  60, 'completed', 'Partido histórico',                   'confirmed', 'b',  2, 4),
  ('e1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', NULL,                                    '11v11', 22, now() + interval '10 days', 90, 'open',      'Cancha grande - nivel avanzado',      'pending',   NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Match participants (e3 participants removed along with the match)
INSERT INTO "matchParticipants" ("matchId", "playerId", "team") VALUES
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a'),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'a'),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'a'),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'b'),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'b'),
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 'b'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'a'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'a'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000005', 'a'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'b'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'b'),
  ('e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000006', 'b'),
  ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'a'),
  ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000004', 'a'),
  ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'b'),
  ('e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', 'b')
ON CONFLICT ("matchId", "playerId") DO NOTHING;

-- Result submissions for completed matches
INSERT INTO "matchResultSubmissions" ("id", "matchId", "submitterId", "winningTeam", "scoreTeamA", "scoreTeamB", "isConfirmed") VALUES
  ('f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'a', 5, 3, true),
  ('f1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'b', 2, 4, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "matchResultVotes" ("submissionId", "voterId", "vote") VALUES
  ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'approve'),
  ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'approve'),
  ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'approve')
ON CONFLICT ("submissionId", "voterId") DO NOTHING;

-- Tournament + teams
INSERT INTO "tournaments" ("id", "organizerId", "clubId", "name", "format", "teamCount", "playersPerTeam", "status", "description", "startDate", "endDate") VALUES
  ('aa100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000001', 'Copa Otoño 2026', '7v7', 4, 8, 'registration', 'Torneo de 4 equipos formato eliminación directa', '2026-05-01', '2026-05-15')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "tournamentTeams" ("id", "tournamentId", "name", "captainId") VALUES
  ('ab100000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'Los Tigres',    'a1000000-0000-0000-0000-000000000001'),
  ('ab100000-0000-0000-0000-000000000002', 'aa100000-0000-0000-0000-000000000001', 'FC Palermo',    'a1000000-0000-0000-0000-000000000002'),
  ('ab100000-0000-0000-0000-000000000003', 'aa100000-0000-0000-0000-000000000001', 'Real Sur',      'a1000000-0000-0000-0000-000000000005'),
  ('ab100000-0000-0000-0000-000000000004', 'aa100000-0000-0000-0000-000000000001', 'Atlético Oeste','a1000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO "tournamentTeamMembers" ("teamId", "playerId") VALUES
  ('ab100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('ab100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003'),
  ('ab100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002'),
  ('ab100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000006'),
  ('ab100000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000005'),
  ('ab100000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004')
ON CONFLICT ("teamId", "playerId") DO NOTHING;

INSERT INTO "fixtureMatches" ("tournamentId", "round", "homeTeamId", "awayTeamId", "courtId", "scheduledAt", "status") VALUES
  ('aa100000-0000-0000-0000-000000000001', 1, 'ab100000-0000-0000-0000-000000000001', 'ab100000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', '2026-05-01 19:00+00', 'scheduled'),
  ('aa100000-0000-0000-0000-000000000001', 1, 'ab100000-0000-0000-0000-000000000002', 'ab100000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', '2026-05-01 20:30+00', 'scheduled'),
  ('aa100000-0000-0000-0000-000000000001', 2, NULL, NULL, 'c1000000-0000-0000-0000-000000000002', '2026-05-15 20:00+00', 'scheduled');

INSERT INTO "notifications" ("userId", "title", "body", "type", "referenceId", "isRead") VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Nuevo partido cerca tuyo', 'Hay un 7v7 el viernes en Palermo',     'match_suggestion',  'e1000000-0000-0000-0000-000000000002', false),
  ('a1000000-0000-0000-0000-000000000002', 'Te sumaron a un equipo',   'FC Palermo - Copa Otoño 2026',         'tournament_invite', 'ab100000-0000-0000-0000-000000000002', false),
  ('a1000000-0000-0000-0000-000000000005', 'Resultado confirmado',     'Se confirmó el resultado del partido', 'result_confirmed',  'e1000000-0000-0000-0000-000000000004', true);
