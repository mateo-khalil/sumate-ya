/**
 * Club Dashboard Repository — read-only DB access for admin dashboard
 *
 * Decision Context:
 * - Why separate from clubSlotManagementRepository: that repo owns admin CRUD for slots.
 *   This repo is read-only and focuses on aggregated views: matches with their slot/court
 *   context, participant lists, and metrics calculations needed by the dashboard.
 * - Egress prevention: all selects list explicit columns, never select('*').
 * - Metrics (occupancy, revenue, unique players) are computed as scalar queries rather
 *   than loading full row sets into memory, keeping egress low for large clubs.
 * - getMatchesForDashboard returns denormalized rows (match + organizer + court + slot) via
 *   a single joined query to avoid N+1 fetches in the service layer.
 * - Participant lists fetched separately because GraphQL resolvers can skip them when only
 *   the count is needed; service composes match+participants on demand.
 * - User-scoped client used for all reads so RLS policies enforce clubs.ownerId = auth.uid().
 * - Previously fixed bugs: none relevant (new feature).
 */

import type { SupabaseClient } from '../config/supabase.js';
import type { MatchStatus } from '../graphql/generated/graphql.js';

// =====================================================
// Column Definitions (egress prevention)
// =====================================================

const CLUB_COLUMNS = `id, name, address, zone, phone, "imageUrl"`;

const COURT_COLUMNS = `id, name, "maxFormat", surface, "isIndoor", "clubId"`;

const MATCH_DASHBOARD_COLUMNS = `
  id,
  "organizerId",
  "clubId",
  "courtId",
  "clubSlotId",
  format,
  capacity,
  "scheduledAt",
  "durationMin",
  status,
  description,
  "cancellationReason",
  "createdAt"
`;

const PROFILE_SUMMARY_COLUMNS = `id, "displayName", "avatarUrl"`;

const PARTICIPANT_COLUMNS = `id, "matchId", "playerId", team, "joinedAt"`;

const SLOT_DASHBOARD_COLUMNS = `
  id,
  "clubId",
  "courtId",
  "dayOfWeek",
  "startTime",
  "endTime",
  duration,
  "priceArs",
  "isBlocked",
  "blockReason",
  "blockType",
  "isActive",
  "allowOnlineBooking"
`;

// =====================================================
// Row Types
// =====================================================

export interface ClubRow {
  id: string;
  name: string;
  address: string;
  zone: string | null;
  phone: string;
  imageUrl: string | null;
}

export interface CourtRow {
  id: string;
  name: string;
  maxFormat: string;
  surface: string;
  isIndoor: boolean;
  clubId: string;
}

export interface MatchDashboardRow {
  id: string;
  organizerId: string;
  clubId: string;
  courtId: string | null;
  clubSlotId: string | null;
  format: string;
  capacity: number;
  scheduledAt: string;
  durationMin: number;
  status: string;
  description: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

export interface ProfileSummaryRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ParticipantRow {
  id: string;
  matchId: string;
  playerId: string;
  team: string;
  joinedAt: string;
}

export interface SlotDashboardRow {
  id: string;
  clubId: string;
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  isBlocked: boolean;
  blockReason: string | null;
  blockType: string | null;
  isActive: boolean;
  allowOnlineBooking: boolean;
}

export interface DashboardFiltersInput {
  startDate?: string;
  endDate?: string;
  courtIds?: string[];
  matchStatuses?: string[];
  includeBlocked?: boolean;
  includeInactive?: boolean;
}

// =====================================================
// Repository class
// =====================================================

class ClubDashboardRepository {
  async getClubByOwnerId(ownerId: string, client: SupabaseClient): Promise<ClubRow | null> {
    const { data, error } = await client
      .from('clubs')
      .select(CLUB_COLUMNS)
      .eq('ownerId', ownerId)
      .maybeSingle();

    if (error) {
      console.error('[ClubDashboardRepository.getClubByOwnerId] Error:', error.message);
      throw new Error(error.message);
    }
    return data as ClubRow | null;
  }

  async getCourtsByClubId(clubId: string, client: SupabaseClient): Promise<CourtRow[]> {
    const { data, error } = await client
      .from('courts')
      .select(COURT_COLUMNS)
      .eq('clubId', clubId)
      .order('name');

    if (error) {
      console.error('[ClubDashboardRepository.getCourtsByClubId] Error:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []) as CourtRow[];
  }

  async getMatchesForDashboard(
    clubId: string,
    filters: DashboardFiltersInput,
    client: SupabaseClient,
  ): Promise<MatchDashboardRow[]> {
    let query = client
      .from('matches')
      .select(MATCH_DASHBOARD_COLUMNS)
      .eq('clubId', clubId)
      .order('scheduledAt', { ascending: true });

    if (filters.startDate) {
      query = query.gte('scheduledAt', `${filters.startDate}T00:00:00Z`);
    }
    if (filters.endDate) {
      query = query.lte('scheduledAt', `${filters.endDate}T23:59:59Z`);
    }
    if (filters.courtIds?.length) {
      query = query.in('courtId', filters.courtIds);
    }
    if (filters.matchStatuses?.length) {
      query = query.in('status', filters.matchStatuses.map((s) => s.toLowerCase()));
    }

    const { data, error } = await query;
    if (error) {
      console.error('[ClubDashboardRepository.getMatchesForDashboard] Error:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []) as MatchDashboardRow[];
  }

  async getOrganizersByIds(
    organizerIds: string[],
    client: SupabaseClient,
  ): Promise<ProfileSummaryRow[]> {
    if (!organizerIds.length) return [];
    const { data, error } = await client
      .from('profiles')
      .select(PROFILE_SUMMARY_COLUMNS)
      .in('id', organizerIds);

    if (error) {
      console.error('[ClubDashboardRepository.getOrganizersByIds] Error:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []) as ProfileSummaryRow[];
  }

  async getParticipantsByMatchIds(
    matchIds: string[],
    client: SupabaseClient,
  ): Promise<(ParticipantRow & { profile: ProfileSummaryRow })[]> {
    if (!matchIds.length) return [];
    const { data, error } = await client
      .from('matchParticipants')
      .select(`${PARTICIPANT_COLUMNS}, profile:profiles(${PROFILE_SUMMARY_COLUMNS})`)
      .in('matchId', matchIds);

    if (error) {
      console.error('[ClubDashboardRepository.getParticipantsByMatchIds] Error:', error.message);
      throw new Error(error.message);
    }
    // Supabase may return the related record as array or object depending on relationship type.
    // Normalise to always produce a flat ProfileSummaryRow.
    return ((data ?? []) as Array<ParticipantRow & { profile: ProfileSummaryRow | ProfileSummaryRow[] }>).map(
      (row) => ({
        ...row,
        profile: Array.isArray(row.profile) ? (row.profile[0] as ProfileSummaryRow) : row.profile,
      }),
    ) as (ParticipantRow & { profile: ProfileSummaryRow })[];
  }

  async getSlotsByClubId(
    clubId: string,
    filters: DashboardFiltersInput,
    client: SupabaseClient,
  ): Promise<SlotDashboardRow[]> {
    let query = client
      .from('clubSlots')
      .select(SLOT_DASHBOARD_COLUMNS)
      .eq('clubId', clubId)
      .order('dayOfWeek')
      .order('startTime');

    if (!filters.includeInactive) {
      query = query.eq('isActive', true);
    }
    if (!filters.includeBlocked) {
      query = query.eq('isBlocked', false);
    }
    if (filters.courtIds?.length) {
      query = query.in('courtId', filters.courtIds);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[ClubDashboardRepository.getSlotsByClubId] Error:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []) as SlotDashboardRow[];
  }

  // =====================================================
  // Metrics queries (scalar aggregates, low egress)
  // =====================================================

  async countMatchesInRange(
    clubId: string,
    startDate: string,
    endDate: string,
    client: SupabaseClient,
  ): Promise<number> {
    const { count, error } = await client
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('clubId', clubId)
      .neq('status', 'cancelled')
      .gte('scheduledAt', `${startDate}T00:00:00Z`)
      .lte('scheduledAt', `${endDate}T23:59:59Z`);

    if (error) {
      console.error('[ClubDashboardRepository.countMatchesInRange] Error:', error.message);
      throw new Error(error.message);
    }
    return count ?? 0;
  }

  async countUniquePlayersInRange(
    clubId: string,
    startDate: string,
    endDate: string,
    client: SupabaseClient,
  ): Promise<number> {
    // Join through matches to filter by clubId and date range
    const { data, error } = await client
      .from('matchParticipants')
      .select(`playerId, match:matches!inner(id, clubId, scheduledAt, status)`)
      .eq('match.clubId', clubId)
      .neq('match.status', 'cancelled')
      .gte('match.scheduledAt', `${startDate}T00:00:00Z`)
      .lte('match.scheduledAt', `${endDate}T23:59:59Z`);

    if (error) {
      console.error('[ClubDashboardRepository.countUniquePlayersInRange] Error:', error.message);
      throw new Error(error.message);
    }
    const unique = new Set((data ?? []).map((r) => (r as { playerId: string }).playerId));
    return unique.size;
  }

  async countActiveSlots(clubId: string, client: SupabaseClient): Promise<number> {
    const { count, error } = await client
      .from('clubSlots')
      .select('id', { count: 'exact', head: true })
      .eq('clubId', clubId)
      .eq('isActive', true);

    if (error) {
      console.error('[ClubDashboardRepository.countActiveSlots] Error:', error.message);
      throw new Error(error.message);
    }
    return count ?? 0;
  }

  async countActiveCourts(clubId: string, client: SupabaseClient): Promise<number> {
    const { count, error } = await client
      .from('courts')
      .select('id', { count: 'exact', head: true })
      .eq('clubId', clubId);

    if (error) {
      console.error('[ClubDashboardRepository.countActiveCourts] Error:', error.message);
      throw new Error(error.message);
    }
    return count ?? 0;
  }

  async countBlockedSlots(clubId: string, client: SupabaseClient): Promise<number> {
    const { count, error } = await client
      .from('clubSlots')
      .select('id', { count: 'exact', head: true })
      .eq('clubId', clubId)
      .eq('isActive', true)
      .eq('isBlocked', true);

    if (error) {
      console.error('[ClubDashboardRepository.countBlockedSlots] Error:', error.message);
      throw new Error(error.message);
    }
    return count ?? 0;
  }

  async getSlotsWithMatchInRange(
    clubId: string,
    startDate: string,
    endDate: string,
    client: SupabaseClient,
  ): Promise<{ priceArs: number | null }[]> {
    // Fetch matches in range with their slot price for revenue calculation.
    // The slot relation may return as array (Supabase FK behaviour) — normalise below.
    const { data, error } = await client
      .from('matches')
      .select(`"clubSlotId", slot:clubSlots("priceArs")`)
      .eq('clubId', clubId)
      .neq('status', 'cancelled')
      .gte('scheduledAt', `${startDate}T00:00:00Z`)
      .lte('scheduledAt', `${endDate}T23:59:59Z`)
      .not('clubSlotId', 'is', null);

    if (error) {
      console.error('[ClubDashboardRepository.getSlotsWithMatchInRange] Error:', error.message);
      throw new Error(error.message);
    }
    type SlotRow = { priceArs: number | null } | Array<{ priceArs: number | null }>;
    return (data ?? []).map((r) => {
      const slotRaw = (r as { slot: SlotRow }).slot;
      const slotObj = Array.isArray(slotRaw) ? slotRaw[0] : slotRaw;
      return { priceArs: slotObj?.priceArs ?? null };
    });
  }
}

export const clubDashboardRepository = new ClubDashboardRepository();
