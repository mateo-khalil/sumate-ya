/**
 * Club Match — TypeScript operations and types for admin-initiated match creation
 *
 * Decision Context:
 * - Why: Frontend rules forbid inline GraphQL strings inside components.
 *   Operations live here; types mirror the backend schema manually.
 * - organizedByClub: included in MatchDetailData (in matches.ts) to drive the badge.
 *   This file focuses on the admin creation flow types and operations.
 * - ClubMatchSlotOccurrence: a concrete date occurrence of a weekly slot — the admin
 *   picks from these in the wizard Step 1 instead of abstract slot templates.
 * - Previously fixed bugs: none relevant (new feature).
 */

export type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';

export interface ClubMatchSlotOccurrence {
  slotId: string;
  courtId: string;
  courtName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  date: string;           // YYYY-MM-DD concrete occurrence date
  scheduledAt: string;    // ISO timestamp
  hasMatch: boolean;      // already has an active match — can't be used
  allowOnlineBooking: boolean;
}

export interface CreateClubMatchInput {
  slotId: string;
  scheduledDate: string; // YYYY-MM-DD
  format: MatchFormat;
  capacity: number;
  description?: string | null;
  autoEnrollOrganizer?: boolean;
}

export interface CreateClubMatchResult {
  success: boolean;
  matchId: string | null;
  message: string | null;
}

export interface BulkClubMatchItem {
  slotId: string;
  date: string;
  success: boolean;
  matchId: string | null;
  message: string | null;
}

export interface BulkClubMatchResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  results: BulkClubMatchItem[];
}

export interface AvailableSlotsFilters {
  startDate: string;
  endDate: string;
  courtIds?: string[];
  includeNonBookable?: boolean;
}

// Human-readable labels
export const FORMAT_LABELS: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5 vs 5',
  SEVEN_VS_SEVEN: '7 vs 7',
  TEN_VS_TEN: '10 vs 10',
  ELEVEN_VS_ELEVEN: '11 vs 11',
};

export const FORMAT_CAPACITY: Record<MatchFormat, number> = {
  FIVE_VS_FIVE: 10,
  SEVEN_VS_SEVEN: 14,
  TEN_VS_TEN: 20,
  ELEVEN_VS_ELEVEN: 22,
};

export const FORMAT_MAX_COURT: Record<string, MatchFormat> = {
  '5v5': 'FIVE_VS_FIVE',
  '7v7': 'SEVEN_VS_SEVEN',
  '10v10': 'TEN_VS_TEN',
  '11v11': 'ELEVEN_VS_ELEVEN',
};

const SLOT_FIELDS = `
  slotId courtId courtName dayOfWeek startTime endTime duration priceArs
  date scheduledAt hasMatch allowOnlineBooking
`;

export const AVAILABLE_SLOTS_QUERY = `
  query AvailableSlotsForClubMatch($filters: AvailableSlotsFilters!) {
    availableSlotsForClubMatch(filters: $filters) {
      ${SLOT_FIELDS}
    }
  }
`;

export const CREATE_CLUB_MATCH_MUTATION = `
  mutation CreateClubMatch($input: CreateClubMatchInput!) {
    createClubMatch(input: $input) {
      success
      matchId
      message
    }
  }
`;

export const BULK_CREATE_CLUB_MATCHES_MUTATION = `
  mutation BulkCreateClubMatches($input: BulkCreateClubMatchesInput!) {
    bulkCreateClubMatches(input: $input) {
      totalRequested
      successCount
      failureCount
      results {
        slotId
        date
        success
        matchId
        message
      }
    }
  }
`;
