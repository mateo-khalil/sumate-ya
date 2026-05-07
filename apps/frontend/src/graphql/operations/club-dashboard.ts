/**
 * Club Dashboard — TypeScript operations and types for the admin dashboard
 *
 * Decision Context:
 * - Why: Frontend rules forbid inline GraphQL strings in components.
 *   Operations live here as string constants; types mirror backend GraphQL schema manually.
 * - TimeStatus and ScheduleSlotStatus enums mirror club-dashboard.graphql exactly.
 * - DashboardMatch.format and .status use their GraphQL enum string values
 *   (FIVE_VS_FIVE, OPEN, etc.) as received from the resolver.
 * - ClubDashboardFilters matches the input type in the schema — all fields optional.
 * - Export query returns a raw string (CSV or JSON).
 * - Previously fixed bugs: none relevant (new feature).
 */

// =====================================================
// Enums
// =====================================================

export type ScheduleSlotStatus =
  | 'AVAILABLE'
  | 'MATCH_OPEN'
  | 'MATCH_FULL'
  | 'MATCH_IN_PROGRESS'
  | 'MATCH_COMPLETED'
  | 'BLOCKED'
  | 'INACTIVE'
  | 'PAST';

export type TimeStatus =
  | 'PAST'
  | 'FINISHED_RECENTLY'
  | 'NOW'
  | 'UPCOMING_SOON'
  | 'UPCOMING'
  | 'FAR_FUTURE';

export type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
export type MatchStatus = 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// =====================================================
// Interfaces
// =====================================================

export interface Club {
  id: string;
  name: string;
  zone: string | null;
  address: string | null;
  imageUrl: string | null;
  phone: string | null;
}

export interface ClubMetrics {
  matchesThisWeek: number;
  occupancyRate: number;
  estimatedRevenue: number;
  uniquePlayersThisMonth: number;
  totalActiveCourts: number;
  blockedSlotsCount: number;
}

export interface ProfileSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface DashboardMatch {
  id: string;
  format: MatchFormat;
  capacity: number;
  status: MatchStatus;
  scheduledAt: string;
  description: string | null;
  organizer: ProfileSummary;
  participants: ProfileSummary[];
  participantCount: number;
  spotsLeft: number;
  timeStatus: TimeStatus;
  timeStatusLabel: string;
  courtId: string | null;
  courtName: string | null;
  clubSlotId: string | null;
}

export interface ScheduleSlot {
  slotId: string;
  courtId: string;
  courtName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: ScheduleSlotStatus;
  match: DashboardMatch | null;
  blockReason: string | null;
  blockType: string | null;
  isActive: boolean;
  allowOnlineBooking: boolean;
  priceArs: number | null;
}

export interface ConflictAlert {
  matchId: string;
  type: string;
  description: string;
  scheduledAt: string;
  courtName: string;
}

export interface ClubDashboardData {
  club: Club;
  metrics: ClubMetrics;
  schedule: ScheduleSlot[];
  matches: DashboardMatch[];
  conflicts: ConflictAlert[];
}

export interface ClubDashboardFilters {
  startDate?: string;
  endDate?: string;
  courtIds?: string[];
  matchStatuses?: MatchStatus[];
  includeBlocked?: boolean;
  includeInactive?: boolean;
}

// =====================================================
// Human-readable labels
// =====================================================

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5 vs 5',
  SEVEN_VS_SEVEN: '7 vs 7',
  TEN_VS_TEN: '10 vs 10',
  ELEVEN_VS_ELEVEN: '11 vs 11',
};

export const STATUS_LABELS: Record<MatchStatus, string> = {
  OPEN: 'Abierto',
  FULL: 'Completo',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export const SLOT_STATUS_LABELS: Record<ScheduleSlotStatus, string> = {
  AVAILABLE: 'Disponible',
  MATCH_OPEN: 'Partido abierto',
  MATCH_FULL: 'Partido completo',
  MATCH_IN_PROGRESS: 'En curso',
  MATCH_COMPLETED: 'Finalizado',
  BLOCKED: 'Bloqueado',
  INACTIVE: 'Inactivo',
  PAST: 'Pasado',
};

// Semantic color classes aligned with horarios.astro palette
export const SLOT_STATUS_COLOR: Record<ScheduleSlotStatus, string> = {
  AVAILABLE: 'slot-available',       // green
  MATCH_OPEN: 'slot-match-open',     // yellow
  MATCH_FULL: 'slot-match-full',     // yellow-orange
  MATCH_IN_PROGRESS: 'slot-in-progress', // blue
  MATCH_COMPLETED: 'slot-completed', // gray light
  BLOCKED: 'slot-blocked',           // red
  INACTIVE: 'slot-inactive',         // gray dark
  PAST: 'slot-past',                 // gray dark
};

// =====================================================
// GraphQL operation strings
// =====================================================

const MATCH_FIELDS = `
  id format capacity status scheduledAt description
  organizer { id displayName avatarUrl }
  participants { id displayName avatarUrl }
  participantCount spotsLeft
  timeStatus timeStatusLabel
  courtId courtName clubSlotId
`;

const SLOT_FIELDS = `
  slotId courtId courtName dayOfWeek startTime endTime duration
  status match { ${MATCH_FIELDS} }
  blockReason blockType isActive allowOnlineBooking priceArs
`;

const METRICS_FIELDS = `
  matchesThisWeek occupancyRate estimatedRevenue
  uniquePlayersThisMonth totalActiveCourts blockedSlotsCount
`;

export const CLUB_DASHBOARD_QUERY = `
  query CLUB_DASHBOARD($filters: ClubDashboardFilters) {
    clubDashboard(filters: $filters) {
      club { id name zone address imageUrl phone }
      metrics { ${METRICS_FIELDS} }
      schedule { ${SLOT_FIELDS} }
      matches { ${MATCH_FIELDS} }
      conflicts { matchId type description scheduledAt courtName }
    }
  }
`;

export const CLUB_METRICS_QUERY = `
  query CLUB_METRICS {
    clubMetrics { ${METRICS_FIELDS} }
  }
`;

export const EXPORT_CLUB_SCHEDULE_QUERY = `
  query EXPORT_CLUB_SCHEDULE($filters: ClubDashboardFilters, $format: String) {
    exportClubSchedule(filters: $filters, format: $format)
  }
`;
