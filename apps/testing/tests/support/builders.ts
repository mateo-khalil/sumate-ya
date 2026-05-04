/**
 * Mock data builders for GraphQL responses.
 *
 * Decision Context:
 * - Three different specs (matches-list, match-filters, matches-map) each had
 *   their own `MockMatch` type and `buildMatch()` factory with slightly drifted
 *   field shapes. Centralizing keeps the mock contract aligned with the real
 *   GraphQL schema and prevents one spec from masking a regression that would
 *   surface in another.
 * - `buildMatch` returns a sensible OPEN match in Centro by default; tests
 *   spread overrides for the fields that matter to them. We intentionally use
 *   a future date so date-range filter tests aren't affected by `Date.now()`.
 * - `buildMockSlot` mirrors clubSlots() responses for the create-match wizard.
 * - Previously fixed bugs: none relevant.
 */

export type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
export type MatchStatus = 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MatchTeam = 'A' | 'B';

export type MockClub = {
  __typename?: 'Club';
  name: string;
  zone: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type MockMatch = {
  __typename?: 'Match';
  id: string;
  title: string;
  startTime: string;
  format: MatchFormat;
  totalSlots: number;
  availableSlots: number;
  status: MatchStatus;
  club: MockClub | null;
};

export function buildMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    __typename: 'Match',
    id: 'match-default',
    title: 'Partido de prueba',
    startTime: '2026-05-01T20:00:00Z',
    format: 'FIVE_VS_FIVE',
    totalSlots: 10,
    availableSlots: 5,
    status: 'OPEN',
    club: { __typename: 'Club', name: 'Club Test', zone: 'Centro', address: 'Test 123' },
    ...overrides,
  };
}

export type CourtSurface = 'GRASS' | 'SYNTHETIC' | 'CONCRETE' | 'INDOOR';

export type MockSlot = {
  id: string;
  clubId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  priceArs: number | null;
  court: {
    id: string;
    name: string;
    maxFormat: MatchFormat;
    surface: CourtSurface;
    isIndoor: boolean;
  };
};

export const DEFAULT_MOCK_SLOT: MockSlot = {
  id: 'slot-e2e-1900',
  clubId: 'club-from-ui',
  dayOfWeek: 'monday',
  startTime: '19:00:00',
  endTime: '20:00:00',
  priceArs: 4200,
  court: {
    id: 'court-e2e-1',
    name: 'Cancha E2E',
    maxFormat: 'SEVEN_VS_SEVEN',
    surface: 'SYNTHETIC',
    isIndoor: false,
  },
};

type MockSlotOverrides = Partial<Omit<MockSlot, 'court'>> & { court?: Partial<MockSlot['court']> };

export function buildMockSlot(overrides: MockSlotOverrides = {}): MockSlot {
  const { court, ...rest } = overrides;
  return {
    ...DEFAULT_MOCK_SLOT,
    ...rest,
    court: { ...DEFAULT_MOCK_SLOT.court, ...(court ?? {}) },
  };
}
