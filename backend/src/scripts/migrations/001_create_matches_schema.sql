-- =====================================================
-- Migration: 001_create_matches_schema
-- Description: Creates clubs and matches tables with RLS
-- Run this in Supabase SQL Editor or via psql
-- =====================================================

-- 1. Create clubs table
CREATE TABLE IF NOT EXISTS "clubs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "zone" text,
  "imageUrl" text,
  "createdAt" timestamptz DEFAULT now()
);

ALTER TABLE "clubs" ENABLE ROW LEVEL SECURITY;

-- Public read for clubs
CREATE POLICY "Public read clubs" ON "clubs"
  FOR SELECT USING (true);

-- 2. Create matches table
CREATE TABLE IF NOT EXISTS "matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "startTime" timestamptz NOT NULL,
  "format" text NOT NULL DEFAULT 'futbol-5',
  "totalSlots" int NOT NULL DEFAULT 10,
  "availableSlots" int NOT NULL DEFAULT 10,
  "clubId" uuid REFERENCES "clubs"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'open',
  "createdBy" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "createdAt" timestamptz DEFAULT now()
);

ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;

-- Public read for open matches
CREATE POLICY "Public read open matches" ON "matches"
  FOR SELECT USING (status = 'open');

-- Owners can update their own matches
CREATE POLICY "Owners can update matches" ON "matches"
  FOR UPDATE USING (auth.uid() = "createdBy");

-- Owners can delete their own matches
CREATE POLICY "Owners can delete matches" ON "matches"
  FOR DELETE USING (auth.uid() = "createdBy");

-- Authenticated users can create matches
CREATE POLICY "Authenticated can create matches" ON "matches"
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_matches_status" ON "matches"("status");
CREATE INDEX IF NOT EXISTS "idx_matches_clubId" ON "matches"("clubId");
CREATE INDEX IF NOT EXISTS "idx_matches_startTime" ON "matches"("startTime");

-- =====================================================
-- SEED DATA (optional - for testing)
-- =====================================================

-- Insert sample clubs
INSERT INTO "clubs" ("id", "name", "zone") VALUES
  ('11111111-1111-1111-1111-111111111111', 'Club Deportivo Norte', 'Zona Norte'),
  ('22222222-2222-2222-2222-222222222222', 'Cancha Los Amigos', 'Zona Centro'),
  ('33333333-3333-3333-3333-333333333333', 'Complejo Sur FC', 'Zona Sur')
ON CONFLICT (id) DO NOTHING;

-- Insert sample matches
INSERT INTO "matches" ("title", "startTime", "format", "totalSlots", "availableSlots", "clubId", "status") VALUES
  ('Partido de miércoles', NOW() + INTERVAL '2 days', 'futbol-5', 10, 4, '11111111-1111-1111-1111-111111111111', 'open'),
  ('Futbol 7 nocturno', NOW() + INTERVAL '3 days', 'futbol-7', 14, 6, '22222222-2222-2222-2222-222222222222', 'open'),
  ('Partido express', NOW() + INTERVAL '1 day', 'futbol-5', 10, 2, '33333333-3333-3333-3333-333333333333', 'open'),
  ('Clásico del domingo', NOW() + INTERVAL '5 days', 'futbol-11', 22, 10, '11111111-1111-1111-1111-111111111111', 'open'),
  ('Entrenamiento libre', NOW() + INTERVAL '4 days', 'futbol-5', 10, 8, '22222222-2222-2222-2222-222222222222', 'open');
