/**
 * Tournament Repository - DB access for tournaments and fixtureMatches.
 *
 * Decision Context:
 * - Explicit column lists keep tournament reads small and predictable.
 * - Writes accept an optional user-scoped client so RLS can enforce organizer ownership.
 * - Availability checks read from both matches and fixtureMatches because tournament
 *   creation reserves club/court time before the participating teams are known.
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
  "createdAt"
`;

const TOURNAMENT_CLUB_COLUMNS = `
  id,
  name,
  zone,
  address,
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
  imageUrl: string | null;
}

export interface FixtureMatchRow {
  id: string;
  tournamentId: string;
  round: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  courtId: string | null;
  scheduledAt: string | null;
  status: string;
  createdAt: string;
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
  fixtureMatches?: FixtureMatchRow[];
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
  captainId?: string;
  createdAt?: string;
}

function isMissingTournamentRpcError(message: string): boolean {
  return (
    message.includes('Could not find the function public.create_tournament_with_fixture') ||
    message.includes('Could not find the function public.register_tournament_team') ||
    message.includes('function public.create_tournament_with_fixture') ||
    message.includes('function public.register_tournament_team')
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
    .select(`${TOURNAMENT_COLUMNS}, clubs(${TOURNAMENT_CLUB_COLUMNS}), fixtureMatches(${FIXTURE_COLUMNS})`)
    .eq('id', tournamentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[tournamentRepository.getTournamentById] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return data as unknown as TournamentRow;
}

export async function getTournamentTeams(
  tournamentId: string,
  client: SupabaseClient = supabase,
): Promise<TournamentTeamRow[]> {
  const { data, error } = await client
    .from('tournamentTeams')
    .select('id, name')
    .eq('tournamentId', tournamentId)
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('[tournamentRepository.getTournamentTeams] Supabase error:', error.message);
    throw new Error(error.message);
  }

  return (data as unknown as TournamentTeamRow[]) ?? [];
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
    .select('id, "tournamentId", name, "captainId", "createdAt"')
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

export const tournamentRepository = {
  getSlotsByIds,
  getMatchesForSlotDates,
  getFixtureReservationsForCourts,
  createTournament,
  createTournamentWithFixtureRpc,
  registerTournamentTeamRpc,
  insertFixtureMatches,
  getTournamentById,
  getTournamentTeams,
  createTournamentTeam,
  createTournamentTeamMember,
  updateFixtureTeams,
  updateTournamentStatus,
};
