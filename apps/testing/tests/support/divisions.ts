/**
 * Shared constants and pure helpers for division/ranking tests (US #41).
 *
 * Decision Context:
 * - Centralizes division level → CSS class and display name mappings so specs
 *   don't embed magic strings that could drift if the design system changes.
 * - DIVISION_THRESHOLDS mirrors the `calculate_profile_division` SQL function in
 *   20260518000000_profile_division_recalculation.sql. If thresholds change,
 *   update both the migration and this file to keep them in sync.
 * - computeExpectedDivision is a TS replica of the SQL logic used to assert
 *   that the API returns a division value consistent with matchesPlayed and
 *   matchesWon, without re-querying the DB.
 * - NO imports from @playwright/test: this module is pure data/logic so it can
 *   be loaded without risk of creating a second Playwright runtime instance in
 *   the pnpm module graph. Assertion helpers that need `expect` live in the Page
 *   Objects (ProfilePage.expectDivisionBadgeLevel, etc.).
 * - Previously fixed bugs: none relevant.
 */

export const DIVISION_CSS_CLASS = {
  1: 'division-bronze',
  2: 'division-silver',
  3: 'division-gold',
  4: 'division-diamond',
} as const;

export const DIVISION_NAME = {
  1: 'Bronce',
  2: 'Plata',
  3: 'Oro',
  4: 'Diamante',
} as const;

export type DivisionLevel = 1 | 2 | 3 | 4;

/**
 * Mirrors `calculate_profile_division` from the DB migration.
 * Thresholds: < 5 partidos → Bronce; winrate >= 75% → Diamante;
 *             >= 60% → Oro; >= 45% → Plata; else → Bronce.
 */
export const DIVISION_THRESHOLDS = {
  minMatches: 5,
  silver: 0.45,
  gold: 0.60,
  diamond: 0.75,
} as const;

export function computeExpectedDivision(
  matchesPlayed: number,
  matchesWon: number,
): DivisionLevel {
  if (matchesPlayed < DIVISION_THRESHOLDS.minMatches) return 1;
  const winrate = matchesWon / matchesPlayed;
  if (winrate >= DIVISION_THRESHOLDS.diamond) return 4;
  if (winrate >= DIVISION_THRESHOLDS.gold) return 3;
  if (winrate >= DIVISION_THRESHOLDS.silver) return 2;
  return 1;
}

