/**
 * Tournament Repository - DB access for tournaments and fixtureMatches.
 *
 * Decision Context:
 * - Explicit column lists keep tournament reads small and predictable.
 * - Writes accept an optional user-scoped client so RLS can enforce organizer ownership.
 * - Availability checks read from both matches and fixtureMatches because tournament
 *   creation reserves club/court time before the participating teams are known.
 * - tournamentTeams soft-delete: status column ('active'|'withdrawn') added via migration.
 *   All queries that list teams should filter by status='active' at the service layer.
 *   REQUIRES MIGRATION: ALTER TABLE "tournamentTeams" ADD COLUMN status, withdrawnAt, withdrawalReason.
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions
// =====================================================

const TOURNAMENT_COLUMNS = `
  id,
  "organizerId",
  "clubId",
  name,
  format,
  "teamCount",
  "playersPerTeam",
  status,
  description,
  "startDate",
  "endDate",
  "createdAt",
  "tournamentType",
  "durationMode",
  "firstMatchday",
  "cadenceDays",
  "groupCount",
  "teamsPerGroup",
  "advancingPerGroup"
`;

const TOURNAMENT_CLUB_COLUMNS = `
  id,
  name,
  zone,
  address,
  lat,
  lng,
  "imageUrl"
`;

const FIXTURE_COLUMNS = `
  id,
  "tournamentId",
  round,
  "homeTeamId",
  "awayTeamId",
  "courtId",
  "scheduledAt",
  status,
  "scoreHome",
  "scoreAway",
  "createdAt",
  phase,
  "groupName",
  matchday
`;

const TOURNAMENT_PLAYER_COLUMNS = `
  id,
  "displayName",
  "avatarUrl",
  "preferredPosition"
`;

const TOURNAMENT_TEAM_COLUMNS = `
  id,
  "tournamentId",
  name,
  "captainId",
  status,
  "withdrawnAt",
  "withdrawalReason",
  "createdAt"
`;

const SLOT_COLUMNS = `
  id,
  "clubId",
  "courtId",
  "dayOfWeek",
  "startTime",
  "endTime",
  "isBlocked",
  "isActive",
  "allowOnlineBooking",
  courts(id, name, "maxFormat")
`;

// =====================================================
// Types
// =====================================================

export interface TournamentClubRow {
  id: string;
  name: string;
  zone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
}

export interface FixtureMatchRow {
  id: string;
  tournamentId: string;
  round: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam?: TournamentTeamRow | null;
  awayTeam?: TournamentTeamRow | null;
  courtId: string | null;
  scheduledAt: string | null;
  status: string;
  scoreHome: number | null;
  scoreAway: number | null;
  createdAt: string;
  // Issue #132: nuevos campos de tipo y scheduling
  phase?: string | null;
  groupName?: string | null;
  matchday?: number | null;
}

export interface TournamentTeamCountRow {
  count: number;
}

export interface TournamentRow {
  id: string;
  organizerId: string;
  clubId: string;
  name: string;
  format: string;
  teamCount: number;
  playersPerTeam: number;
  status: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  clubs?: TournamentClubRow | null;
  organizer?: TournamentPlayerRow | null;
  fixtureMatches?: FixtureMatchRow[];
  registeredTeams?: TournamentTeamCountRow[];
  tournamentTeams?: TournamentTeamRow[];
  // Issue #132: nuevos campos
  tournamentType?: string;
  durationMode?: string;
  firstMatchday?: string | null;
  cadenceDays?: number | null;
  groupCount?: number | null;
  teamsPerGroup?: number | null;
  advancingPerGroup?: number | null;
}

export interface TournamentSlotCourtRow {
  id: string;
  name: string;
  maxFormat: string;
}

export interface TournamentSlotRow {
  id: string;
  clubId: string;
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isBlocked: boolean;
  isActive: boolean;
  allowOnlineBooking: boolean;
  courts: TournamentSlotCourtRow | null;
}

export interface CreateTournamentRowInput {
  organizerId: string;
  clubId: string;
  name: string;
  format: string;
  teamCount: number;
  playersPerTeam: number;
  description?: string | null;
  startDate: string;
  endDate: string;
}

export interface CreateFixtureMatchInput {
  tournamentId: string;
  round: number;
  courtId: string;
  scheduledAt: string;
}

export interface CreateTournamentWithFixtureRpcInput {
  clubId: string;
  name: string;
  format: string;
  teamCount: number;
  playersPerTeam: number;
  description?: string | null;
  schedule: Array<{
    slotId: string;
    date: string;
  }>;
}

export interface RegisterTournamentTeamRpcInput {
  tournamentId: string;
  name: string;
}

export interface JoinTournamentRpcInput {
  tournamentId: string;
  teamName: string;
  memberIds: string[];
}

export interface MatchSlotReservationRow {
  id: string;
  clubSlotId: string | null;
  scheduledAt: string;
}

export interface FixtureReservationRow {
  id: string;
  courtId: string | null;
  scheduledAt: string | null;
}

export interface TournamentTeamRow {
  id: string;
  tournamentId?: string;
  name: string;
  captainId: string;
  /** Added by migration: 'active' | 'withdrawn'. Absent on rows from queries without status column. */
  status?: string;
  withdrawnAt?: string | null;
  withdrawalReason?: string | null;
  captain?: TournamentPlayerRow | null;
  members?: TournamentTeamMemberRow[];
  createdAt: string;
}

export interface TournamentPlayerRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
}

export interface TournamentTeamMemberRow {
  id: string;
  joinedAt: string;
  player: TournamentPlayerRow | null;
}

export interface TournamentMemberPlayerRow {
  playerId: string;
  tournamentTeams: {
    tournamentId: string;
  } | null;
}

export interface TournamentFilterOptions {
  status?: string;
  format?: string;
  zone?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

function isMissingTournamentRpcError(message: string): boolean {
  return (
    message.includes('Could not find the function public.create_tournament_with_fixture') ||
    message.includes('Could not find the function public.register_tournament_team') ||
    message.includes('Could not find the function public.join_tournament') ||
    message.includes('function public.create_tournament_with_fixture') ||
    message.includes('function public.register_tournament_team') ||
    message.includes('function public.join_tournament')
  );
}

// =====================================================
// Repository Functions
// =====================================================

export async function getSlotsByIds(
  slotIds: string[],
  client: SupabaseClient = supabase,
): Promise<TournamentSlotRow[]> {
  if (slotIds.length === 0) return [];

  const { data, error } = await client
    .from('clubSlots')
    .select(SLOT_COLUMNS)
    .in('id', slotIds);

  if (error) {
    console.error('[tournamentRepository.getSlotsByIds] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as TournamentSlotRow[]) ?? [];
}

export async function getMatchesForSlotDates(
  slotIds: string[],
  startDate: string,
  endDate: string,
  client: SupabaseClient = supabase,
): Promise<MatchSlotReservationRow[]> {
  if (slotIds.length === 0) return [];

  const { data, error } = await client
    .from('matches')
    .select('id, "clubSlotId", "scheduledAt"')
    .in('clubSlotId', slotIds)
    .neq('status', 'cancelled')
    .gte('scheduledAt', `${startDate}T00:00:00`)
    .lte('scheduledAt', `${endDate}T23:59:59`);

  if (error) {
    console.error('[tournamentRepository.getMatchesForSlotDates] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as MatchSlotReservationRow[]) ?? [];
}

export async function getFixtureReservationsForCourts(
  courtIds: string[],
  startDate: string,
  endDate: string,
  client: SupabaseClient = supabase,
): Promise<FixtureReservationRow[]> {
  if (courtIds.length === 0) return [];

  const { data, error } = await client
    .from('fixtureMatches')
    .select('id, "courtId", "scheduledAt"')
    .in('courtId', courtIds)
    .neq('status', 'cancelled')
    .gte('scheduledAt', `${startDate}T00:00:00`)
    .lte('scheduledAt', `${endDate}T23:59:59`);

  if (error) {
    console.error(
      '[tournamentRepository.getFixtureReservationsForCourts] Supabase error:',
      error.message,
    );
    throw new Error(error.message);
  }

  return (data as unknown as FixtureReservationRow[]) ?? [];
}

export async function createTournament(
  input: CreateTournamentRowInput,
  client: SupabaseClient = supabase,
): Promise<TournamentRow> {
  const { data, error } = await client
    .from('tournaments')
    .insert({
      organizerId: input.organizerId,
      clubId: input.clubId,
      name: input.name,
      format: input.format,
      teamCount: input.teamCount,
      playersPerTeam: input.playersPerTeam,
      description: input.description ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
    })
    .select(TOURNAMENT_COLUMNS)
    .single();

  if (error) {
    console.error('[tournamentRepository.createTournament] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return data as unknown as TournamentRow;
}

export async function createTournamentWithFixtureRpc(
  input: CreateTournamentWithFixtureRpcInput,
  client: SupabaseClient,
): Promise<string> {
  const { data, error } = await client.rpc('create_tournament_with_fixture', {
    p_club_id: input.clubId,
    p_name: input.name,
    p_format: input.format,
    p_team_count: input.teamCount,
    p_players_per_team: input.playersPerTeam,
    p_description: input.description ?? null,
    p_schedule: input.schedule,
  });

  if (error) {
    console.error('[tournamentRepository.createTournamentWithFixtureRpc] Supabase error:', error.message);
    if (isMissingTournamentRpcError(error.message)) {
      throw new Error('Falta aplicar la migracion SQL de torneos en Supabase');
    }
    throw new Error(error.message);
  }

  if (!data || typeof data !== 'string') {
    throw new Error('No se pudo crear el torneo en Supabase');
  }

  return data;
}

export async function registerTournamentTeamRpc(
  input: RegisterTournamentTeamRpcInput,
  client: SupabaseClient,
): Promise<string> {
  const { data, error } = await client.rpc('register_tournament_team', {
    p_tournament_id: input.tournamentId,
    p_name: input.name,
  });

  if (error) {
    console.error('[tournamentRepository.registerTournamentTeamRpc] Supabase error:', error.message);
    if (isMissingTournamentRpcError(error.message)) {
      throw new Error('Falta aplicar la migracion SQL de torneos en Supabase');
    }
    throw new Error(error.message);
  }

  if (!data || typeof data !== 'string') {
    throw new Error('No se pudo inscribir el equipo en Supabase');
  }

  return data;
}

export async function joinTournamentRpc(
  input: JoinTournamentRpcInput,
  client: SupabaseClient,
): Promise<string> {
  const { data, error } = await client.rpc('join_tournament', {
    p_tournament_id: input.tournamentId,
    p_team_name: input.teamName,
    p_member_ids: input.memberIds,
  });

  if (error) {
    console.error('[tournamentRepository.joinTournamentRpc] Supabase error:', error.message);
    if (isMissingTournamentRpcError(error.message)) {
      throw new Error('Falta aplicar la migracion SQL de unirse a torneos en Supabase');
    }
    throw new Error(error.message);
  }

  if (!data || typeof data !== 'string') {
    throw new Error('No se pudo inscribir el equipo en Supabase');
  }

  return data;
}

export async function insertFixtureMatches(
  rows: CreateFixtureMatchInput[],
  client: SupabaseClient = supabase,
): Promise<FixtureMatchRow[]> {
  if (rows.length === 0) return [];

  const { data, error } = await client
    .from('fixtureMatches')
    .insert(rows.map((row) => ({
      tournamentId: row.tournamentId,
      round: row.round,
      courtId: row.courtId,
      scheduledAt: row.scheduledAt,
    })))
    .select(FIXTURE_COLUMNS);

  if (error) {
    console.error('[tournamentRepository.insertFixtureMatches] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as FixtureMatchRow[]) ?? [];
}

export async function getTournamentById(
  tournamentId: string,
  client: SupabaseClient = supabase,
): Promise<TournamentRow | null> {
  const { data, error } = await client
    .from('tournaments')
    .select(
      `
        ${TOURNAMENT_COLUMNS},
        clubs(${TOURNAMENT_CLUB_COLUMNS}),
        organizer:profiles!tournaments_organizerId_fkey(${TOURNAMENT_PLAYER_COLUMNS}),
        registeredTeams:tournamentTeams(count),
        tournamentTeams(
          ${TOURNAMENT_TEAM_COLUMNS},
          captain:profiles!tournamentTeams_captainId_fkey(${TOURNAMENT_PLAYER_COLUMNS}),
          members:tournamentTeamMembers(
            id,
            "joinedAt",
            player:profiles!tournamentTeamMembers_playerId_fkey(${TOURNAMENT_PLAYER_COLUMNS})
          )
        ),
        fixtureMatches(
          ${FIXTURE_COLUMNS},
          homeTeam:tournamentTeams!fixtureMatches_homeTeamId_fkey(id, name, "captainId", "createdAt"),
          awayTeam:tournamentTeams!fixtureMatches_awayTeamId_fkey(id, name, "captainId", "createdAt")
        )
      `,
    )
    .eq('id', tournamentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[tournamentRepository.getTournamentById] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return data as unknown as TournamentRow;
}

export async function getTournamentsWithFilters(
  filters: TournamentFilterOptions = {},
  client: SupabaseClient = supabase,
): Promise<TournamentRow[]> {
  if (filters.search) {
    return getTournamentsWithSearch(filters, client);
  }

  const clubJoin = filters.zone ? `clubs!inner(${TOURNAMENT_CLUB_COLUMNS})` : `clubs(${TOURNAMENT_CLUB_COLUMNS})`;

  let query = client
    .from('tournaments')
    .select(`${TOURNAMENT_COLUMNS}, ${clubJoin}, registeredTeams:tournamentTeams(count)`);

  query = query.eq('status', filters.status || 'registration');

  if (filters.format) {
    query = query.eq('format', filters.format);
  }

  if (filters.zone) {
    query = query.eq('clubs.zone', filters.zone);
  }

  if (filters.dateFrom) {
    query = query.gte('startDate', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte('startDate', filters.dateTo);
  }

  query = query.order('startDate', { ascending: true }).order('createdAt', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('[tournamentRepository.getTournamentsWithFilters] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as TournamentRow[]) ?? [];
}

async function getTournamentsWithSearch(
  filters: TournamentFilterOptions,
  client: SupabaseClient,
): Promise<TournamentRow[]> {
  const searchTerm = `%${filters.search}%`;
  const baseStatus = filters.status || 'registration';

  let nameQuery = client
    .from('tournaments')
    .select(`${TOURNAMENT_COLUMNS}, clubs(${TOURNAMENT_CLUB_COLUMNS}), registeredTeams:tournamentTeams(count)`)
    .eq('status', baseStatus);

  if (filters.format) {
    nameQuery = nameQuery.eq('format', filters.format);
  }
  if (filters.dateFrom) {
    nameQuery = nameQuery.gte('startDate', filters.dateFrom);
  }
  if (filters.dateTo) {
    nameQuery = nameQuery.lte('startDate', filters.dateTo);
  }

  let clubQuery = client
    .from('tournaments')
    .select(`${TOURNAMENT_COLUMNS}, clubs!inner(${TOURNAMENT_CLUB_COLUMNS}), registeredTeams:tournamentTeams(count)`)
    .eq('status', baseStatus);

  if (filters.format) {
    clubQuery = clubQuery.eq('format', filters.format);
  }
  if (filters.dateFrom) {
    clubQuery = clubQuery.gte('startDate', filters.dateFrom);
  }
  if (filters.dateTo) {
    clubQuery = clubQuery.lte('startDate', filters.dateTo);
  }

  let q1 = nameQuery.ilike('name', searchTerm).order('startDate', { ascending: true }).order('createdAt', { ascending: false });
  let q2 = clubQuery.ilike('clubs.name', searchTerm).order('startDate', { ascending: true }).order('createdAt', { ascending: false });

  if (filters.zone) {
    let nameZoneQuery = client
      .from('tournaments')
      .select(`${TOURNAMENT_COLUMNS}, clubs!inner(${TOURNAMENT_CLUB_COLUMNS}), registeredTeams:tournamentTeams(count)`)
      .eq('status', baseStatus);

    if (filters.format) {
      nameZoneQuery = nameZoneQuery.eq('format', filters.format);
    }
    if (filters.dateFrom) {
      nameZoneQuery = nameZoneQuery.gte('startDate', filters.dateFrom);
    }
    if (filters.dateTo) {
      nameZoneQuery = nameZoneQuery.lte('startDate', filters.dateTo);
    }

    q1 = nameZoneQuery
      .ilike('name', searchTerm)
      .eq('clubs.zone', filters.zone)
      .order('startDate', { ascending: true })
      .order('createdAt', { ascending: false });
    q2 = q2.eq('clubs.zone', filters.zone);
  }

  const [nameResult, clubResult] = await Promise.all([q1, q2]);

  if (nameResult.error) {
    throw new Error(`Failed to fetch tournaments by name: ${nameResult.error.message}`);
  }
  if (clubResult.error) {
    throw new Error(`Failed to fetch tournaments by club: ${clubResult.error.message}`);
  }

  const tournamentMap = new Map<string, TournamentRow>();
  for (const tournament of (nameResult.data as unknown as TournamentRow[]) ?? []) {
    tournamentMap.set(tournament.id, tournament);
  }
  for (const tournament of (clubResult.data as unknown as TournamentRow[]) ?? []) {
    if (!tournamentMap.has(tournament.id)) {
      tournamentMap.set(tournament.id, tournament);
    }
  }

  return Array.from(tournamentMap.values()).sort((a, b) => {
    const byStartDate = (a.startDate ?? '').localeCompare(b.startDate ?? '');
    if (byStartDate !== 0) return byStartDate;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}

export async function getRegistrationTournaments(
  client: SupabaseClient = supabase,
): Promise<TournamentRow[]> {
  return getTournamentsWithFilters({ status: 'registration' }, client);
}

export async function getTournamentTeams(
  tournamentId: string,
  client: SupabaseClient = supabase,
): Promise<TournamentTeamRow[]> {
  const { data, error } = await client
    .from('tournamentTeams')
    .select(TOURNAMENT_TEAM_COLUMNS)
    .eq('tournamentId', tournamentId)
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('[tournamentRepository.getTournamentTeams] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as TournamentTeamRow[]) ?? [];
}

export async function getTournamentMemberPlayerIds(
  tournamentId: string,
  client: SupabaseClient = supabase,
): Promise<string[]> {
  const { data, error } = await client
    .from('tournamentTeamMembers')
    .select('playerId, tournamentTeams!inner("tournamentId")')
    .eq('tournamentTeams.tournamentId', tournamentId);

  if (error) {
    console.error('[tournamentRepository.getTournamentMemberPlayerIds] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return ((data as unknown as TournamentMemberPlayerRow[]) ?? []).map((row) => row.playerId);
}

export async function getTournamentTeamById(
  teamId: string,
  client: SupabaseClient = supabase,
): Promise<TournamentTeamRow | null> {
  const { data, error } = await client
    .from('tournamentTeams')
    .select(TOURNAMENT_TEAM_COLUMNS)
    .eq('id', teamId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[tournamentRepository.getTournamentTeamById] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return data as unknown as TournamentTeamRow;
}

export async function getTournamentTeamMemberIds(
  teamId: string,
  client: SupabaseClient = supabase,
): Promise<string[]> {
  const { data, error } = await client
    .from('tournamentTeamMembers')
    .select('"playerId"')
    .eq('teamId', teamId);

  if (error) {
    console.error('[tournamentRepository.getTournamentTeamMemberIds] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return ((data as Array<{ playerId: string }> | null) ?? []).map((row) => row.playerId);
}

export async function getPlayerProfilesByIds(
  playerIds: string[],
  client: SupabaseClient = supabase,
): Promise<TournamentPlayerRow[]> {
  if (playerIds.length === 0) return [];

  // Decision Context (fix): filtro .eq('role','player') eliminado intencionalmente.
  // Un club_admin puede ser capitán de un equipo permanente (issue #137) y por tanto
  // debe poder inscribir a su equipo en torneos. El spec dice explícitamente:
  // "Tanto un player como un club_admin pueden ser capitán de un equipo."
  // Previously fixed bugs: la restricción de rol bloqueaba al club_admin de anotar su equipo.
  const { data, error } = await client
    .from('profiles')
    .select(TOURNAMENT_PLAYER_COLUMNS)
    .in('id', playerIds);

  if (error) {
    console.error('[tournamentRepository.getPlayerProfilesByIds] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as TournamentPlayerRow[]) ?? [];
}

export async function searchEligiblePlayers(
  tournamentId: string,
  search: string | null,
  limit = 12,
  client: SupabaseClient = supabase,
): Promise<TournamentPlayerRow[]> {
  const usedPlayerIds = await getTournamentMemberPlayerIds(tournamentId, client);
  let query = client
    .from('profiles')
    .select(TOURNAMENT_PLAYER_COLUMNS)
    .eq('role', 'player')
    .order('displayName', { ascending: true })
    .limit(limit);

  if (usedPlayerIds.length > 0) {
    query = query.not('id', 'in', `(${usedPlayerIds.join(',')})`);
  }

  const term = search?.trim();
  if (term) {
    query = query.ilike('displayName', `%${term}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[tournamentRepository.searchEligiblePlayers] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as TournamentPlayerRow[]) ?? [];
}

export async function createTournamentTeam(
  tournamentId: string,
  name: string,
  captainId: string,
  client: SupabaseClient = supabase,
): Promise<TournamentTeamRow> {
  const { data, error } = await client
    .from('tournamentTeams')
    .insert({
      tournamentId,
      name,
      captainId,
    })
    .select(TOURNAMENT_TEAM_COLUMNS)
    .single();

  if (error) {
    console.error('[tournamentRepository.createTournamentTeam] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return data as unknown as TournamentTeamRow;
}

export async function createTournamentTeamMember(
  teamId: string,
  playerId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('tournamentTeamMembers')
    .insert({ teamId, playerId });

  if (error) {
    console.error('[tournamentRepository.createTournamentTeamMember] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

export async function createTournamentTeamMembers(
  teamId: string,
  playerIds: string[],
  client: SupabaseClient = supabase,
): Promise<void> {
  if (playerIds.length === 0) return;

  const { error } = await client
    .from('tournamentTeamMembers')
    .insert(playerIds.map((playerId) => ({ teamId, playerId })));

  if (error) {
    console.error('[tournamentRepository.createTournamentTeamMembers] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

export async function deleteTournamentTeamMember(
  teamId: string,
  playerId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('tournamentTeamMembers')
    .delete()
    .eq('teamId', teamId)
    .eq('playerId', playerId);

  if (error) {
    console.error('[tournamentRepository.deleteTournamentTeamMember] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

export async function updateFixtureTeams(
  fixtureId: string,
  homeTeamId: string,
  awayTeamId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('fixtureMatches')
    .update({ homeTeamId, awayTeamId })
    .eq('id', fixtureId);

  if (error) {
    console.error('[tournamentRepository.updateFixtureTeams] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

export async function updateTournamentStatus(
  tournamentId: string,
  status: 'registration' | 'in_progress' | 'completed' | 'cancelled',
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('tournaments')
    .update({ status })
    .eq('id', tournamentId);

  if (error) {
    console.error('[tournamentRepository.updateTournamentStatus] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

// =====================================================
// Withdrawal / Leave Tournament Functions
// =====================================================

/**
 * Soft-delete a team by setting status='withdrawn'.
 * Uses .eq('status', 'active') guard to handle race conditions gracefully —
 * if two requests fire simultaneously, the second will update 0 rows.
 * REQUIRES MIGRATION: tournamentTeams must have status, withdrawnAt, withdrawalReason columns.
 */
export async function withdrawTeamById(
  teamId: string,
  reason: string | null | undefined,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('tournamentTeams')
    .update({
      status: 'withdrawn',
      withdrawnAt: new Date().toISOString(),
      withdrawalReason: reason ?? null,
    })
    .eq('id', teamId)
    .eq('status', 'active');

  if (error) {
    console.error('[tournamentRepository.withdrawTeamById] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

/** Hard-delete all members of a team from tournamentTeamMembers. */
export async function deleteTeamMembersById(
  teamId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('tournamentTeamMembers')
    .delete()
    .eq('teamId', teamId);

  if (error) {
    console.error('[tournamentRepository.deleteTeamMembersById] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

const FIXTURE_TEAM_CHECK_COLUMNS = `id, "tournamentId", round, "homeTeamId", "awayTeamId", status`;

/** Get all fixture matches where this team is home or away (for defense-in-depth checks). */
export async function getFixtureMatchesByTeam(
  teamId: string,
  client: SupabaseClient = supabase,
): Promise<Pick<FixtureMatchRow, 'id' | 'tournamentId' | 'round' | 'homeTeamId' | 'awayTeamId' | 'status'>[]> {
  const { data, error } = await client
    .from('fixtureMatches')
    .select(FIXTURE_TEAM_CHECK_COLUMNS)
    .or(`homeTeamId.eq.${teamId},awayTeamId.eq.${teamId}`);

  if (error) {
    console.error('[tournamentRepository.getFixtureMatchesByTeam] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as Pick<FixtureMatchRow, 'id' | 'tournamentId' | 'round' | 'homeTeamId' | 'awayTeamId' | 'status'>[]) ?? [];
}

/**
 * Null-out team references in fixture matches for non-completed/in-progress fixtures.
 * Edge case: fixture was generated (registration was briefly complete) before the team withdrew.
 * Previously fixed bugs: none relevant.
 */
export async function clearTeamFromFixtureMatches(
  teamId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const [{ error: homeError }, { error: awayError }] = await Promise.all([
    client
      .from('fixtureMatches')
      .update({ homeTeamId: null })
      .eq('homeTeamId', teamId)
      .not('status', 'in', '(completed,in_progress)'),
    client
      .from('fixtureMatches')
      .update({ awayTeamId: null })
      .eq('awayTeamId', teamId)
      .not('status', 'in', '(completed,in_progress)'),
  ]);

  if (homeError) {
    console.error('[tournamentRepository.clearTeamFromFixtureMatches] homeTeamId error:', homeError.message);
    throw new Error(homeError.message);
  }
  if (awayError) {
    console.error('[tournamentRepository.clearTeamFromFixtureMatches] awayTeamId error:', awayError.message);
    throw new Error(awayError.message);
  }
}

/** Count teams with status='active' for a tournament. */
export async function countActiveTeams(
  tournamentId: string,
  client: SupabaseClient = supabase,
): Promise<number> {
  const { count, error } = await client
    .from('tournamentTeams')
    .select('id', { count: 'exact', head: true })
    .eq('tournamentId', tournamentId)
    .eq('status', 'active');

  if (error) {
    console.error('[tournamentRepository.countActiveTeams] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return count ?? 0;
}

// =====================================================
// Issue #132: Nuevas interfaces y funciones
// =====================================================

/** Input para crear torneo por fecha (sin slots de club) */
export interface CreateTournamentDirectInput {
  organizerId: string;
  clubId: string;
  name: string;
  format: string;
  teamCount: number;
  playersPerTeam: number;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  tournamentType: string;
  durationMode: string;
  firstMatchday?: string | null;
  cadenceDays?: number | null;
  specificDays?: number[] | null;
  groupCount?: number | null;
  teamsPerGroup?: number | null;
  advancingPerGroup?: number | null;
}

/** Input para insertar fixtures con campos de fase y jornada */
export interface CreateFixtureMatchWithPhaseInput {
  tournamentId: string;
  round: number;
  matchday: number;
  courtId?: string | null;
  scheduledAt?: string | null;
  phase?: string | null;
  groupName?: string | null;
}

export interface TournamentGroupRow {
  id: string;
  tournamentId: string;
  groupName: string;
  createdAt: string;
}

export interface TournamentInvitationRow {
  id: string;
  tournamentId: string;
  teamId: string | null;
  invitedBy: string;
  captainId: string;
  status: string;
  message: string | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
  // joins opcionales
  tournament?: { name: string } | null;
  invitedByProfile?: { id: string; displayName: string; avatarUrl: string | null } | null;
  captainProfile?: { id: string; displayName: string; avatarUrl: string | null } | null;
  team?: { id: string; name: string } | null;
}

const TOURNAMENT_INVITATION_COLUMNS = `
  id, "tournamentId", "teamId", "invitedBy", "captainId",
  status, message, "respondedAt", "expiresAt", "createdAt"
`;

/** Crea un torneo directamente (sin RPC de slots) para auto-scheduling */
export async function createTournamentDirect(
  input: CreateTournamentDirectInput,
  client: SupabaseClient,
): Promise<string> {
  const { data, error } = await client
    .from('tournaments')
    .insert({
      organizerId: input.organizerId,
      clubId: input.clubId,
      name: input.name,
      format: input.format,
      teamCount: input.teamCount,
      playersPerTeam: input.playersPerTeam,
      description: input.description ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      tournamentType: input.tournamentType,
      durationMode: input.durationMode,
      firstMatchday: input.firstMatchday ?? null,
      cadenceDays: input.cadenceDays ?? null,
      specificDays: input.specificDays ?? null,
      groupCount: input.groupCount ?? null,
      teamsPerGroup: input.teamsPerGroup ?? null,
      advancingPerGroup: input.advancingPerGroup ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[tournamentRepository.createTournamentDirect] Supabase error:', error.message);
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

/** Inserta fixture matches con campos de fase, grupo y jornada */
export async function insertFixtureMatchesWithPhase(
  rows: CreateFixtureMatchWithPhaseInput[],
  client: SupabaseClient = supabase,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client
    .from('fixtureMatches')
    .insert(rows.map(r => ({
      tournamentId: r.tournamentId,
      round: r.round,
      matchday: r.matchday,
      courtId: r.courtId ?? null,
      scheduledAt: r.scheduledAt ?? null,
      phase: r.phase ?? null,
      groupName: r.groupName ?? null,
    })));

  if (error) {
    console.error('[tournamentRepository.insertFixtureMatchesWithPhase] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

// ── Grupos ────────────────────────────────────────────────────

export async function createTournamentGroup(
  tournamentId: string,
  groupName: string,
  client: SupabaseClient = supabase,
): Promise<TournamentGroupRow> {
  const { data, error } = await client
    .from('tournamentGroups')
    .insert({ tournamentId, groupName })
    .select('id, "tournamentId", "groupName", "createdAt"')
    .single();

  if (error) {
    console.error('[tournamentRepository.createTournamentGroup] Supabase error:', error.message);
    throw new Error(error.message);
  }
  return data as TournamentGroupRow;
}

export async function assignTeamToGroup(
  groupId: string,
  teamId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('tournamentGroupTeams')
    .insert({ groupId, teamId });

  if (error) {
    console.error('[tournamentRepository.assignTeamToGroup] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

// ── Invitaciones de torneo ─────────────────────────────────────

export async function createTournamentInvitation(
  input: { tournamentId: string; teamId: string | null; invitedBy: string; captainId: string; message?: string | null },
  client: SupabaseClient,
): Promise<TournamentInvitationRow> {
  const { data, error } = await client
    .from('tournamentInvitations')
    .insert({
      tournamentId: input.tournamentId,
      teamId: input.teamId ?? null,
      invitedBy: input.invitedBy,
      captainId: input.captainId,
      message: input.message ?? null,
    })
    .select(TOURNAMENT_INVITATION_COLUMNS)
    .single();

  if (error) {
    console.error('[tournamentRepository.createTournamentInvitation] Supabase error:', error.message);
    if (error.code === '23505') throw new Error('Ya existe una invitación pendiente para este equipo en este torneo');
    throw new Error(error.message);
  }
  return data as TournamentInvitationRow;
}

export async function getTournamentInvitationById(
  id: string,
  client: SupabaseClient = supabase,
): Promise<TournamentInvitationRow | null> {
  const { data, error } = await client
    .from('tournamentInvitations')
    .select(`
      ${TOURNAMENT_INVITATION_COLUMNS},
      tournament:tournaments!tournamentInvitations_tournamentId_fkey(name),
      invitedByProfile:profiles!tournamentInvitations_invitedBy_fkey(id, "displayName", "avatarUrl"),
      captainProfile:profiles!tournamentInvitations_captainId_fkey(id, "displayName", "avatarUrl"),
      team:teams!tournamentInvitations_teamId_fkey(id, name)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[tournamentRepository.getTournamentInvitationById] Supabase error:', error.message);
    throw new Error(error.message);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data as any;
}

export async function getPendingTournamentInvitation(
  tournamentId: string,
  teamId: string,
  client: SupabaseClient = supabase,
): Promise<TournamentInvitationRow | null> {
  const { data, error } = await client
    .from('tournamentInvitations')
    .select(TOURNAMENT_INVITATION_COLUMNS)
    .eq('tournamentId', tournamentId)
    .eq('teamId', teamId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
    console.error('[tournamentRepository.getPendingTournamentInvitation] Supabase error:', error.message);
    throw new Error(error.message);
  }
  return data as TournamentInvitationRow | null;
}

export async function getMyTournamentInvitations(
  captainId: string,
  client: SupabaseClient = supabase,
): Promise<TournamentInvitationRow[]> {
  const { data, error } = await client
    .from('tournamentInvitations')
    .select(`
      ${TOURNAMENT_INVITATION_COLUMNS},
      tournament:tournaments!tournamentInvitations_tournamentId_fkey(name),
      invitedByProfile:profiles!tournamentInvitations_invitedBy_fkey(id, "displayName", "avatarUrl"),
      team:teams!tournamentInvitations_teamId_fkey(id, name)
    `)
    .eq('captainId', captainId)
    .eq('status', 'pending')
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('[tournamentRepository.getMyTournamentInvitations] Supabase error:', error.message);
    throw new Error(error.message);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any[];
}

export async function updateTournamentInvitationStatus(
  id: string,
  status: string,
  respondedAt: string | null,
  client: SupabaseClient,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (respondedAt) patch.respondedAt = respondedAt;

  const { error } = await client.from('tournamentInvitations').update(patch).eq('id', id);

  if (error) {
    console.error('[tournamentRepository.updateTournamentInvitationStatus] Supabase error:', error.message);
    throw new Error(error.message);
  }
}

export const tournamentRepository = {
  getSlotsByIds,
  getMatchesForSlotDates,
  getFixtureReservationsForCourts,
  createTournament,
  createTournamentWithFixtureRpc,
  registerTournamentTeamRpc,
  joinTournamentRpc,
  insertFixtureMatches,
  getTournamentById,
  getTournamentsWithFilters,
  getRegistrationTournaments,
  getTournamentTeams,
  getTournamentMemberPlayerIds,
  getTournamentTeamById,
  getTournamentTeamMemberIds,
  getPlayerProfilesByIds,
  searchEligiblePlayers,
  createTournamentTeam,
  createTournamentTeamMember,
  createTournamentTeamMembers,
  deleteTournamentTeamMember,
  updateFixtureTeams,
  updateTournamentStatus,
  withdrawTeamById,
  deleteTeamMembersById,
  getFixtureMatchesByTeam,
  clearTeamFromFixtureMatches,
  countActiveTeams,
  // Issue #132
  createTournamentDirect,
  insertFixtureMatchesWithPhase,
  createTournamentGroup,
  assignTeamToGroup,
  createTournamentInvitation,
  getTournamentInvitationById,
  getPendingTournamentInvitation,
  getMyTournamentInvitations,
  updateTournamentInvitationStatus,
};
