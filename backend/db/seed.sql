INSERT INTO "clubs" ("id", "name", "zone") VALUES
  ('club-1', 'Club Parque Rivera', 'Este'),
  ('club-2', 'Club Pocitos Arena', 'Sur'),
  ('club-3', 'Complejo Belvedere', 'Oeste')
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "zone" = EXCLUDED."zone";

INSERT INTO "clubSlots" ("clubId", "slot") VALUES
  ('club-1', '2026-04-10T19:00:00.000Z'),
  ('club-1', '2026-04-10T20:00:00.000Z'),
  ('club-1', '2026-04-11T18:00:00.000Z'),
  ('club-2', '2026-04-10T21:00:00.000Z'),
  ('club-2', '2026-04-11T20:00:00.000Z'),
  ('club-2', '2026-04-12T19:00:00.000Z'),
  ('club-3', '2026-04-11T17:00:00.000Z'),
  ('club-3', '2026-04-12T18:00:00.000Z')
ON CONFLICT ("clubId", "slot") DO NOTHING;
