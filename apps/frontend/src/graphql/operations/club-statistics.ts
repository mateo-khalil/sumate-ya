/**
 * Club Statistics — TypeScript companion to club-statistics.graphql (Estadísticas)
 *
 * Decision Context:
 * - Frontend rules forbid inline GraphQL; operations live here (same convention as the other
 *   club operation files). Types mirror the backend schema manually.
 * - MATCH_STATUS_LABELS maps the raw DB match-status strings (the backend returns them verbatim
 *   in matchesByStatus) to Spanish labels for the breakdown chart.
 * - Previously fixed bugs: none relevant (new feature).
 */

export interface StatsRange {
  startDate: string;
  endDate: string;
}

export interface StatsSummary {
  totalMatches: number;
  completedMatches: number;
  cancelledMatches: number;
  cancellationRate: number;
  totalReservations: number;
  uniquePlayers: number;
  estimatedRevenue: number;
  occupancyRate: number;
  activeCourts: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface CourtRevenue {
  courtId: string;
  courtName: string;
  matches: number;
  revenue: number;
}

export interface DayCount {
  dayOfWeek: number;
  label: string;
  count: number;
}

export interface HourCount {
  hour: number;
  count: number;
}

export interface DateCount {
  date: string;
  count: number;
}

export interface ClubStatistics {
  range: StatsRange;
  summary: StatsSummary;
  matchesByStatus: StatusCount[];
  revenueByCourt: CourtRevenue[];
  matchesByDayOfWeek: DayCount[];
  matchesByHour: HourCount[];
  matchesTrend: DateCount[];
}

export interface ClubStatisticsFilters {
  startDate?: string;
  endDate?: string;
}

export const MATCH_STATUS_LABELS: Record<string, string> = {
  open: 'Abiertos',
  full: 'Completos',
  in_progress: 'En curso',
  completed: 'Finalizados',
  cancelled: 'Cancelados',
};

export const GET_CLUB_STATISTICS = `
  query GET_CLUB_STATISTICS($filters: ClubStatisticsFilters) {
    clubStatistics(filters: $filters) {
      range { startDate endDate }
      summary {
        totalMatches completedMatches cancelledMatches cancellationRate
        totalReservations uniquePlayers estimatedRevenue occupancyRate activeCourts
      }
      matchesByStatus { status count }
      revenueByCourt { courtId courtName matches revenue }
      matchesByDayOfWeek { dayOfWeek label count }
      matchesByHour { hour count }
      matchesTrend { date count }
    }
  }
`;
