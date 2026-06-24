/**
 * Court Management — TypeScript companion to court-management.graphql (Canchas)
 *
 * Decision Context:
 * - Frontend rules forbid inline GraphQL in components; operations live here as string
 *   constants (same convention as club-slots.ts). Types mirror the backend schema manually.
 * - Enum string values match the generated GraphQL enums exactly (GRASS, FIVE_VS_FIVE, …).
 * - Spanish labels live here so the UI never hardcodes enum-to-label maps inline.
 * - Previously fixed bugs: none relevant (new feature).
 */

export type CourtSurface = 'GRASS' | 'SYNTHETIC' | 'CONCRETE' | 'INDOOR';
export type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';

export interface ManagedCourt {
  id: string;
  clubId: string;
  name: string;
  surface: CourtSurface;
  isIndoor: boolean;
  maxFormat: MatchFormat;
  slotCount: number;
  activeSlotCount: number;
  upcomingMatchCount: number;
  createdAt: string | null;
}

export interface CreateCourtInput {
  name: string;
  surface: CourtSurface;
  isIndoor?: boolean;
  maxFormat: MatchFormat;
}

export interface UpdateCourtInput {
  courtId: string;
  name?: string;
  surface?: CourtSurface;
  isIndoor?: boolean;
  maxFormat?: MatchFormat;
}

export interface CourtMutationResult {
  success: boolean;
  court: ManagedCourt | null;
  message: string | null;
}

// =====================================================
// Labels & options
// =====================================================

export const SURFACE_LABELS: Record<CourtSurface, string> = {
  GRASS: 'Césped natural',
  SYNTHETIC: 'Césped sintético',
  CONCRETE: 'Cemento',
  INDOOR: 'Indoor',
};

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: 'Fútbol 5',
  SEVEN_VS_SEVEN: 'Fútbol 7',
  TEN_VS_TEN: 'Fútbol 10',
  ELEVEN_VS_ELEVEN: 'Fútbol 11',
};

export const SURFACE_OPTIONS: CourtSurface[] = ['GRASS', 'SYNTHETIC', 'CONCRETE', 'INDOOR'];
export const FORMAT_OPTIONS: MatchFormat[] = [
  'FIVE_VS_FIVE',
  'SEVEN_VS_SEVEN',
  'TEN_VS_TEN',
  'ELEVEN_VS_ELEVEN',
];

// =====================================================
// Operations
// =====================================================

const COURT_FIELDS = `
  id clubId name surface isIndoor maxFormat
  slotCount activeSlotCount upcomingMatchCount createdAt
`;

export const GET_MY_CLUB_COURTS = `
  query GET_MY_CLUB_COURTS {
    myClubCourts { ${COURT_FIELDS} }
  }
`;

export const CREATE_COURT = `
  mutation CREATE_COURT($input: CreateCourtInput!) {
    createCourt(input: $input) {
      success message
      court { ${COURT_FIELDS} }
    }
  }
`;

export const UPDATE_COURT = `
  mutation UPDATE_COURT($input: UpdateCourtInput!) {
    updateCourt(input: $input) {
      success message
      court { ${COURT_FIELDS} }
    }
  }
`;

export const DELETE_COURT = `
  mutation DELETE_COURT($courtId: ID!) {
    deleteCourt(courtId: $courtId) {
      success message
    }
  }
`;
