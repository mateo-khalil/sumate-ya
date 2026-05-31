/**
 * Tournament Service - creation, availability validation, and round-robin fixture planning.
 *
 * Decision Context:
 * - Creation delegates the tournament + fixture reservation write to Supabase RPC so the
 *   full insert happens transactionally under auth.uid() without direct table RLS friction.
 * - Once tournamentTeams reaches teamCount, generateFixtureIfRegistrationComplete() fills
 *   those fixture rows with round-robin pairings and marks the tournament in_progress.
 * - F9 (issue #137): solo capitanes de equipo permanente pueden crear torneos. La validación
 *   usa teamRepository.getTeamsByCaptainId para no introducir una dependencia circular entre
 *   servicios (tournamentService → teamRepository es aceptable; → teamService no lo es).
 * - Services return data only; resolvers decide how to shape success/error responses.
 * - Previously fixed bugs: none relevant.
 */

import { supabase } from '../config/supabase.js';
import { cacheDeletePattern, cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import {
  DurationMode,
  FixtureMatchStatus,
  FixturePhase,
  MatchFormat,
  PlayerPosition,
  TournamentInvitationStatus,
  TournamentStatus,
  TournamentType,
  type CreateTournamentInput,
  type CreateTournamentResult,
  type InviteTeamToTournamentInput,
  type JoinTournamentInput,
  type LeaveTournamentInput,
  type LeaveTournamentResult,
  type RegisterTournamentTeamInput,
  type SchedulePreviewInput,
  type Tournament,
  type TournamentFilters,
  type TournamentFixtureMatch,
  type TournamentInvitation,
  type TournamentInvitationResult,
  type TournamentMutationResult,
  type TournamentPlayer,
  type TournamentTeam,
  type TournamentTeamMemberInput,
  type TournamentTeamRegistrationResult,
} from '../graphql/generated/graphql.js';
import {
  tournamentRepository,
  type FixtureMatchRow,
  type TournamentFilterOptions,
  type TournamentPlayerRow,
  type TournamentRow,
  type TournamentSlotRow,
  type TournamentTeamRow,
} from '../repositories/tournamentRepository.js';
import { clubRepository } from '../repositories/clubRepository.js';
import { teamRepository } from '../repositories/teamRepository.js';
import { dateToDayOfWeek } from './clubService.js';
import type { ServiceContext } from '../types/context.js';
import {
  buildRoundRobinFixtureRows,
  buildSingleEliminationFixtureRows,
  buildGroupStageFixtureRows,
  buildSchedulePreview,
  calcTotalMatchdays,
  calcMatchesPerMatchday,
} from './tournamentFixtureService.js';

// =====================================================
// Enum Mapping
// =====================================================

const FORMAT_TO_DB: Record<MatchFormat, string> = {
  [MatchFormat.FiveVsFive]: '5v5',
  [MatchFormat.SevenVsSeven]: '7v7',
  [MatchFormat.TenVsTen]: '10v10',
  [MatchFormat.ElevenVsEleven]: '11v11',
};

const DB_TO_FORMAT: Record<string, MatchFormat> = {
  '5v5': MatchFormat.FiveVsFive,
  '7v7': MatchFormat.SevenVsSeven,
  '10v10': MatchFormat.TenVsTen,
  '11v11': MatchFormat.ElevenVsEleven,
};

const DB_TO_STATUS: Record<string, TournamentStatus> = {
  registration: TournamentStatus.Registration,
  in_progress: TournamentStatus.InProgress,
  completed: TournamentStatus.Completed,
  cancelled: TournamentStatus.Cancelled,
};

const STATUS_TO_DB: Record<TournamentStatus, string> = {
  [TournamentStatus.Registration]: 'registration',
  [TournamentStatus.InProgress]: 'in_progress',
  [TournamentStatus.Completed]: 'completed',
  [TournamentStatus.Cancelled]: 'cancelled',
};

const DB_TO_FIXTURE_STATUS: Record<string, FixtureMatchStatus> = {
  scheduled: FixtureMatchStatus.Scheduled,
  in_progress: FixtureMatchStatus.InProgress,
  completed: FixtureMatchStatus.Completed,
  cancelled: FixtureMatchStatus.Cancelled,
};

const DB_TO_PLAYER_POSITION: Record<string, PlayerPosition> = {
  goalkeeper: PlayerPosition.Goalkeeper,
  defender: PlayerPosition.Defender,
  midfielder: PlayerPosition.Midfielder,
  forward: PlayerPosition.Forward,
};

const FORMAT_ORDER: Record<string, number> = {
  '5v5': 1,
  '7v7': 2,
  '10v10': 3,
  '11v11': 4,
};

const TOURNAMENT_DETAIL_CACHE_PREFIX = `${CACHE_PREFIX.TOURNAMENTS_LIST}:detail:v2:`;

// =====================================================
// Helpers
// =====================================================

interface NormalizedScheduleSlot {
  slotId: string;
  date: string;
  slot: TournamentSlotRow;
  scheduledAt: string;
}

function roundRobinShape(teamCount: number): {
  rounds: number;
  matchesPerRound: number;
  requiredMatches: number;
} {
  const matchesPerRound = Math.floor(teamCount / 2);
  const rounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  return { rounds, matchesPerRound, requiredMatches: rounds * matchesPerRound };
}

function dateFromTimestamp(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? '';
}

function timeFromTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const timePart = value.includes('T') ? value.split('T')[1] : value.split(' ')[1];
  return (timePart ?? '').slice(0, 5);
}

function slotTimeKey(courtId: string | null | undefined, scheduledAt: string | null | undefined): string {
  return `${courtId ?? ''}|${dateFromTimestamp(scheduledAt)}|${timeFromTimestamp(scheduledAt)}`;
}

function toTournamentPlayer(row: TournamentPlayerRow | null | undefined): TournamentPlayer | null {
  if (!row) return null;

  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    preferredPosition: row.preferredPosition ? (DB_TO_PLAYER_POSITION[row.preferredPosition] ?? null) : null,
  };
}

function toTournamentTeam(row: TournamentTeamRow): TournamentTeam {
  const players = (row.members ?? [])
    .map((member) => toTournamentPlayer(member.player))
    .filter((player): player is TournamentPlayer => Boolean(player));

  return {
    id: row.id,
    name: row.name,
    captainId: row.captainId,
    captain: toTournamentPlayer(row.captain),
    players,
    createdAt: row.createdAt,
  };
}

function toFixtureMatch(row: FixtureMatchRow): TournamentFixtureMatch {
  const now = new Date();
  const isPast = row.scheduledAt ? new Date(row.scheduledAt) < now : false;
  const DB_TO_PHASE: Record<string, import('../graphql/generated/graphql.js').FixturePhase> = {
    group_stage: FixturePhase.GroupStage,
    round_of_16: FixturePhase.RoundOf_16,
    quarterfinal: FixturePhase.Quarterfinal,
    semifinal: FixturePhase.Semifinal,
    third_place: FixturePhase.ThirdPlace,
    final: FixturePhase.Final,
  };
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    round: row.round,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeTeam: row.homeTeam ? toTournamentTeam(row.homeTeam) : null,
    awayTeam: row.awayTeam ? toTournamentTeam(row.awayTeam) : null,
    courtId: row.courtId,
    scheduledAt: row.scheduledAt,
    status: DB_TO_FIXTURE_STATUS[row.status] ?? FixtureMatchStatus.Scheduled,
    scoreHome: row.scoreHome,
    scoreAway: row.scoreAway,
    // Issue #132: nuevos campos
    phase: row.phase ? (DB_TO_PHASE[row.phase] ?? null) : null,
    groupName: row.groupName ?? null,
    matchday: row.matchday ?? null,
    isPast,
  };
}

function toTournament(row: TournamentRow): Tournament {
  const fixtureMatches = [...(row.fixtureMatches ?? [])].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '');
  });

  // Filter withdrawn teams. When tournamentTeams rows are loaded (detail queries),
  // derive count from active rows only. Fall back to DB aggregate (list queries).
  const allTeamRows = row.tournamentTeams ?? [];
  const activeTeamRows = allTeamRows.filter((t) => !t.status || t.status === 'active');
  const registeredTeamsCount =
    allTeamRows.length > 0
      ? activeTeamRows.length
      : (row.registeredTeams?.[0]?.count ?? 0);

  return {
    id: row.id,
    organizerId: row.organizerId,
    organizer: toTournamentPlayer(row.organizer),
    name: row.name,
    format: DB_TO_FORMAT[row.format] ?? MatchFormat.FiveVsFive,
    teamCount: row.teamCount,
    playersPerTeam: row.playersPerTeam,
    registeredTeamsCount,
    status: DB_TO_STATUS[row.status] ?? TournamentStatus.Registration,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
    club: row.clubs
      ? {
          id: row.clubs.id,
          name: row.clubs.name,
          zone: row.clubs.zone,
          address: row.clubs.address,
          lat: row.clubs.lat ?? null,
          lng: row.clubs.lng ?? null,
          imageUrl: row.clubs.imageUrl,
        }
      : null,
    teams: activeTeamRows.map(toTournamentTeam),
    fixtureMatches: fixtureMatches.map(toFixtureMatch),
    // Issue #132: nuevos campos de tipo y scheduling
    tournamentType: DB_TO_TOURNAMENT_TYPE[row.tournamentType ?? 'round_robin'] ?? TournamentType.RoundRobin,
    durationMode: DB_TO_DURATION_MODE[row.durationMode ?? 'multi_day'] ?? DurationMode.MultiDay,
    firstMatchday: row.firstMatchday ?? null,
    cadenceDays: row.cadenceDays ?? null,
    groupCount: row.groupCount ?? null,
    teamsPerGroup: row.teamsPerGroup ?? null,
    advancingPerGroup: row.advancingPerGroup ?? null,
  };
}

function dateOnly(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : undefined;
}

function toTournamentFilterOptions(filters?: TournamentFilters | null): TournamentFilterOptions {
  if (!filters) return { status: 'registration' };

  return {
    status: filters.status ? STATUS_TO_DB[filters.status] : 'registration',
    format: filters.format ? FORMAT_TO_DB[filters.format] : undefined,
    zone: filters.zone?.trim() || undefined,
    dateFrom: dateOnly(filters.dateFrom),
    dateTo: dateOnly(filters.dateTo),
    search: filters.search?.trim() || undefined,
  };
}

function getTournamentFiltersCacheKey(filters: TournamentFilterOptions): string {
  const parts = [
    `status:${filters.status || 'registration'}`,
    filters.format ? `format:${filters.format}` : '',
    filters.zone ? `zone:${filters.zone}` : '',
    filters.dateFrom ? `from:${filters.dateFrom}` : '',
    filters.dateTo ? `to:${filters.dateTo}` : '',
    filters.search ? `search:${filters.search}` : '',
  ].filter(Boolean);

  return `${CACHE_PREFIX.TOURNAMENTS_LIST}:${parts.join('|')}:v3`;
}

async function normalizeAndValidateSchedule(
  input: CreateTournamentInput,
  dbFormat: string,
): Promise<NormalizedScheduleSlot[]> {
  const schedule = input.schedule ?? [];
  const shape = roundRobinShape(input.teamCount);

  if (schedule.length < shape.requiredMatches) {
    throw new Error(
      `Necesitás seleccionar ${shape.requiredMatches} horarios para un round-robin de ${input.teamCount} equipos.`,
    );
  }

  const occurrenceKeys = new Set<string>();
  for (const occurrence of schedule) {
    const key = `${occurrence.slotId}|${occurrence.date}`;
    if (occurrenceKeys.has(key)) {
      throw new Error('Hay horarios repetidos en el fixture del torneo');
    }
    occurrenceKeys.add(key);
  }

  const uniqueSlotIds = [...new Set(schedule.map((s) => s.slotId))];
  const slots = await tournamentRepository.getSlotsByIds(uniqueSlotIds);
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  const normalized = schedule.map((occurrence) => {
    const slot = slotsById.get(occurrence.slotId);
    if (!slot) throw new Error('Uno de los horarios seleccionados ya no existe');
    if (slot.clubId !== input.clubId) {
      throw new Error('Uno de los horarios no pertenece al club seleccionado');
    }
    if (!slot.isActive) throw new Error('Uno de los horarios seleccionados fue eliminado');
    if (slot.isBlocked) throw new Error('Uno de los horarios seleccionados está bloqueado');
    if (!slot.allowOnlineBooking) {
      throw new Error('Uno de los horarios no permite reservas online');
    }
    if (!slot.courts) throw new Error('No se pudo validar la cancha del horario seleccionado');

    const expectedDay = dateToDayOfWeek(occurrence.date);
    if (slot.dayOfWeek !== expectedDay) {
      throw new Error(
        `El horario ${slot.startTime.slice(0, 5)} corresponde a ${slot.dayOfWeek}, pero la fecha elegida es ${expectedDay}`,
      );
    }

    if ((FORMAT_ORDER[dbFormat] ?? 0) > (FORMAT_ORDER[slot.courts.maxFormat] ?? 0)) {
      throw new Error(
        `La cancha ${slot.courts.name} soporta hasta ${slot.courts.maxFormat}. El formato ${dbFormat} no es compatible.`,
      );
    }

    const scheduledAt = `${occurrence.date}T${slot.startTime}`;
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      throw new Error('Todos los horarios del torneo deben ser futuros');
    }

    return {
      slotId: occurrence.slotId,
      date: occurrence.date,
      slot,
      scheduledAt,
    };
  });

  normalized.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const selected = normalized.slice(0, shape.requiredMatches);
  const selectedSlotIds = [...new Set(selected.map((s) => s.slotId))];
  const selectedCourtIds = [...new Set(selected.map((s) => s.slot.courtId))];
  const startDate = selected[0]?.date;
  const endDate = selected[selected.length - 1]?.date;
  if (!startDate || !endDate) throw new Error('Seleccioná al menos un horario');

  const [matches, fixtureReservations] = await Promise.all([
    tournamentRepository.getMatchesForSlotDates(selectedSlotIds, startDate, endDate),
    tournamentRepository.getFixtureReservationsForCourts(selectedCourtIds, startDate, endDate),
  ]);

  const matchKeys = new Set(
    matches
      .filter((match) => match.clubSlotId)
      .map((match) => `${match.clubSlotId}|${dateFromTimestamp(match.scheduledAt)}`),
  );
  const fixtureKeys = new Set(
    fixtureReservations.map((fixture) => slotTimeKey(fixture.courtId, fixture.scheduledAt)),
  );

  for (const occurrence of selected) {
    if (matchKeys.has(`${occurrence.slotId}|${occurrence.date}`)) {
      throw new Error('Ya existe un partido en uno de los horarios seleccionados');
    }
    if (fixtureKeys.has(slotTimeKey(occurrence.slot.courtId, occurrence.scheduledAt))) {
      throw new Error('Ya existe un fixture de torneo en uno de los horarios seleccionados');
    }
  }

  return selected;
}

function buildRoundRobinPairings(teamIds: string[]): Array<{
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}> {
  const participants: Array<string | null> =
    teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const rounds = participants.length - 1;
  const half = participants.length / 2;
  const pairings: Array<{ round: number; homeTeamId: string; awayTeamId: string }> = [];

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = participants[i];
      const away = participants[participants.length - 1 - i];
      if (!home || !away) continue;

      pairings.push(
        round % 2 === 0
          ? { round, homeTeamId: away, awayTeamId: home }
          : { round, homeTeamId: home, awayTeamId: away },
      );
    }

    const fixed = participants[0];
    const rotated = [fixed, participants[participants.length - 1], ...participants.slice(1, -1)];
    participants.splice(0, participants.length, ...rotated);
  }

  return pairings;
}

async function invalidateTournamentListCaches(): Promise<void> {
  await cacheDeletePattern(`${CACHE_PREFIX.TOURNAMENTS_LIST}:*`);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

async function validateJoinRoster(
  tournament: TournamentRow,
  captainId: string,
  memberIds: string[],
): Promise<string[]> {
  const playerIds = uniqueIds([captainId, ...memberIds]);
  if (playerIds.length > tournament.playersPerTeam) {
    throw new Error(`El equipo no puede superar ${tournament.playersPerTeam} jugadores`);
  }

  const players = await tournamentRepository.getPlayerProfilesByIds(playerIds);
  const foundIds = new Set(players.map((player) => player.id));
  const missing = playerIds.filter((playerId) => !foundIds.has(playerId));
  if (missing.length > 0) {
    throw new Error('Uno o más jugadores no se encontraron en el sistema');
  }

  const usedPlayerIds = await tournamentRepository.getTournamentMemberPlayerIds(tournament.id);
  const alreadyInTournament = playerIds.filter((playerId) => usedPlayerIds.includes(playerId));
  if (alreadyInTournament.length > 0) {
    throw new Error('Uno o mas jugadores ya estan anotados en otro equipo de este torneo');
  }

  return playerIds;
}

// =====================================================
// Service Functions
// =====================================================

export async function listTournaments(
  _ctx: ServiceContext,
  filters?: TournamentFilters | null,
): Promise<Tournament[]> {
  const filterOptions = toTournamentFilterOptions(filters);
  const cacheKey = getTournamentFiltersCacheKey(filterOptions);

  const tournaments = await cacheGetOrSet<TournamentRow[]>(
    cacheKey,
    () => tournamentRepository.getTournamentsWithFilters(filterOptions),
    CACHE_TTL.DYNAMIC_DATA,
  );

  return tournaments.map(toTournament);
}

export async function listRegistrationTournaments(ctx: ServiceContext): Promise<Tournament[]> {
  return listTournaments(ctx, { status: TournamentStatus.Registration });
}

export async function getTournamentById(
  _ctx: ServiceContext,
  tournamentId: string,
): Promise<Tournament | null> {
  const tournament = await cacheGetOrSet<TournamentRow | null>(
    `${TOURNAMENT_DETAIL_CACHE_PREFIX}${tournamentId}`,
    () => tournamentRepository.getTournamentById(tournamentId),
    CACHE_TTL.DYNAMIC_DATA,
  );

  return tournament ? toTournament(tournament) : null;
}

export async function searchTournamentEligiblePlayers(
  _ctx: ServiceContext,
  tournamentId: string,
  search?: string | null,
): Promise<TournamentPlayer[]> {
  const tournament = await tournamentRepository.getTournamentById(tournamentId);
  if (!tournament) throw new Error('Torneo no encontrado');
  if (tournament.status !== 'registration') return [];

  const players = await tournamentRepository.searchEligiblePlayers(tournamentId, search ?? null);
  return players
    .map((player) => toTournamentPlayer(player))
    .filter((player): player is TournamentPlayer => Boolean(player));
}

export async function createTournament(
  input: CreateTournamentInput,
  ctx: ServiceContext,
): Promise<CreateTournamentResult> {
  if (!ctx.userId) throw new Error('Authentication required');
  const db = ctx.supabase;
  if (!db) throw new Error('User-scoped client required for write operations');

  // F9: solo capitanes de equipo permanente pueden crear torneos
  const captainTeams = await teamRepository.getTeamsByCaptainId(ctx.userId);
  if (captainTeams.length === 0) {
    throw new Error('Solo capitanes de equipo pueden crear torneos. Primero creá un equipo y convertite en capitán.');
  }

  const name = input.name.trim();
  if (name.length < 3) throw new Error('El nombre del torneo debe tener al menos 3 caracteres');
  if (input.teamCount < 2) throw new Error('El torneo debe tener al menos 2 equipos');
  if (input.teamCount > 32) throw new Error('El torneo no puede superar los 32 equipos');
  if (input.playersPerTeam < 1) throw new Error('Jugadores por equipo debe ser mayor a 0');
  if (input.playersPerTeam > 30) throw new Error('Jugadores por equipo no puede superar 30');

  const dbFormat = FORMAT_TO_DB[input.format];
  if (!dbFormat) throw new Error('Formato de torneo inválido');

  const club = await clubRepository.getClubById(input.clubId);
  if (!club) throw new Error('Club no encontrado');

  const selectedSlots = await normalizeAndValidateSchedule(input, dbFormat);

  const tournamentId = await tournamentRepository.createTournamentWithFixtureRpc(
    {
      clubId: input.clubId,
      name,
      format: dbFormat,
      teamCount: input.teamCount,
      playersPerTeam: input.playersPerTeam,
      description: input.description?.trim() || null,
      schedule: selectedSlots.map((slot) => ({
        slotId: slot.slotId,
        date: slot.date,
      })),
    },
    db,
  );

  // Auto-inscripción: si el creador es capitán de un equipo permanente, se lo anota
  // automáticamente al torneo que acaba de crear. Comportamiento solicitado en issue #137.
  // Falla silenciosamente (solo log) para no impedir la creación del torneo.
  if (ctx.userId && db) {
    const captainTeams = await teamRepository.getTeamsByCaptainId(ctx.userId);
    if (captainTeams.length > 0) {
      const captainTeam = captainTeams[0];
      try {
        await teamRepository.enrollPermanentTeamInTournament(
          { teamId: captainTeam.id, tournamentId, name: captainTeam.name, captainId: ctx.userId },
          db,
        );
        console.info(`[tournamentService.createTournament] Auto-inscripto teamId=${captainTeam.id} en tournamentId=${tournamentId}`);
      } catch (enrollErr) {
        console.warn(`[tournamentService.createTournament] Auto-inscripción fallida para teamId=${captainTeam.id}:`, enrollErr);
      }
    }
  }

  await generateFixtureIfRegistrationComplete({ userId: ctx.userId, supabase: db }, tournamentId);
  await invalidateTournamentListCaches();

  const created = await tournamentRepository.getTournamentById(tournamentId);
  if (!created) throw new Error('No se pudo cargar el torneo creado');

  return {
    success: true,
    tournamentId: created.id,
    message: null,
    tournament: toTournament(created),
  };
}

export async function generateFixtureIfRegistrationComplete(
  ctx: ServiceContext,
  tournamentId: string,
): Promise<boolean> {
  if (!ctx.userId) throw new Error('Authentication required');
  const tournament = await tournamentRepository.getTournamentById(tournamentId);
  if (!tournament) throw new Error('Torneo no encontrado');

  const teams = await tournamentRepository.getTournamentTeams(tournamentId);
  if (teams.length < tournament.teamCount) return false;

  const fixtures = [...(tournament.fixtureMatches ?? [])].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '');
  });

  if (fixtures.some((fixture) => fixture.homeTeamId && fixture.awayTeamId)) {
    return false;
  }

  const pairings = buildRoundRobinPairings(teams.slice(0, tournament.teamCount).map((team) => team.id));
  if (fixtures.length < pairings.length) {
    throw new Error('El torneo no tiene suficientes horarios reservados para generar el fixture');
  }

  // System-side generation may be triggered by the captain who completes registration,
  // not necessarily by the organizer. Use the service-role client after business checks.
  const writeClient = supabase;
  await Promise.all(
    pairings.map((pairing, index) =>
      tournamentRepository.updateFixtureTeams(
        fixtures[index].id,
        pairing.homeTeamId,
        pairing.awayTeamId,
        writeClient,
      ),
    ),
  );

  await tournamentRepository.updateTournamentStatus(tournamentId, 'in_progress', writeClient);
  await invalidateTournamentListCaches();
  return true;
}

export async function registerTournamentTeam(
  input: RegisterTournamentTeamInput,
  ctx: ServiceContext,
): Promise<TournamentTeamRegistrationResult> {
  return joinTournament(
    {
      tournamentId: input.tournamentId,
      teamName: input.name,
      memberIds: [],
    },
    ctx,
  );
}

export async function joinTournament(
  input: JoinTournamentInput,
  ctx: ServiceContext,
): Promise<TournamentTeamRegistrationResult> {
  if (!ctx.userId) throw new Error('Authentication required');

  const teamName = input.teamName.trim();
  if (teamName.length < 2) throw new Error('El nombre del equipo debe tener al menos 2 caracteres');
  if (teamName.length > 80) throw new Error('El nombre del equipo no puede superar 80 caracteres');

  const tournament = await tournamentRepository.getTournamentById(input.tournamentId);
  if (!tournament) throw new Error('Torneo no encontrado');
  if (tournament.status !== 'registration') {
    throw new Error('La inscripción de este torneo ya está cerrada');
  }

  const currentTeams = await tournamentRepository.getTournamentTeams(input.tournamentId);
  if (currentTeams.length >= tournament.teamCount) {
    throw new Error('El torneo ya completó todos sus cupos de equipos');
  }
  if (currentTeams.some((team) => team.name.toLowerCase() === teamName.toLowerCase())) {
    throw new Error('Ya existe un equipo con ese nombre en el torneo');
  }

  const playerIds = await validateJoinRoster(tournament, ctx.userId, input.memberIds ?? []);
  const team = await tournamentRepository.createTournamentTeam(input.tournamentId, teamName, ctx.userId, supabase);
  await tournamentRepository.createTournamentTeamMembers(team.id, playerIds, supabase);
  await generateFixtureIfRegistrationComplete({ userId: ctx.userId, supabase }, input.tournamentId);

  const updatedTournament = await tournamentRepository.getTournamentById(input.tournamentId);
  if (!updatedTournament) throw new Error('No se pudo cargar el torneo actualizado');
  await invalidateTournamentListCaches();

  return {
    success: true,
    teamId: team.id,
    message: null,
    tournament: toTournament(updatedTournament),
  };
}

export async function addTournamentTeamMember(
  input: TournamentTeamMemberInput,
  ctx: ServiceContext,
): Promise<TournamentTeamRegistrationResult> {
  if (!ctx.userId) throw new Error('Authentication required');

  const [tournament, team] = await Promise.all([
    tournamentRepository.getTournamentById(input.tournamentId),
    tournamentRepository.getTournamentTeamById(input.teamId),
  ]);
  if (!tournament) throw new Error('Torneo no encontrado');
  if (!team || team.tournamentId !== input.tournamentId) throw new Error('Equipo no encontrado');
  if (team.captainId !== ctx.userId) throw new Error('Solo el capitan puede modificar este equipo');
  if (tournament.status !== 'registration') throw new Error('La inscripcion de este torneo ya esta cerrada');

  const currentMemberIds = await tournamentRepository.getTournamentTeamMemberIds(input.teamId);
  if (currentMemberIds.includes(input.playerId)) {
    throw new Error('Ese jugador ya integra el equipo');
  }
  if (currentMemberIds.length >= tournament.playersPerTeam) {
    throw new Error(`El equipo no puede superar ${tournament.playersPerTeam} jugadores`);
  }

  const [player] = await tournamentRepository.getPlayerProfilesByIds([input.playerId]);
  if (!player) throw new Error('Jugador no encontrado');

  const usedPlayerIds = await tournamentRepository.getTournamentMemberPlayerIds(input.tournamentId);
  if (usedPlayerIds.includes(input.playerId)) {
    throw new Error('Ese jugador ya esta anotado en otro equipo de este torneo');
  }

  await tournamentRepository.createTournamentTeamMember(input.teamId, input.playerId, supabase);
  await invalidateTournamentListCaches();
  const updatedTournament = await tournamentRepository.getTournamentById(input.tournamentId);
  if (!updatedTournament) throw new Error('No se pudo cargar el torneo actualizado');

  return { success: true, teamId: input.teamId, message: null, tournament: toTournament(updatedTournament) };
}

export async function removeTournamentTeamMember(
  input: TournamentTeamMemberInput,
  ctx: ServiceContext,
): Promise<TournamentTeamRegistrationResult> {
  if (!ctx.userId) throw new Error('Authentication required');

  const [tournament, team] = await Promise.all([
    tournamentRepository.getTournamentById(input.tournamentId),
    tournamentRepository.getTournamentTeamById(input.teamId),
  ]);
  if (!tournament) throw new Error('Torneo no encontrado');
  if (!team || team.tournamentId !== input.tournamentId) throw new Error('Equipo no encontrado');
  if (team.captainId !== ctx.userId) throw new Error('Solo el capitan puede modificar este equipo');
  if (tournament.status !== 'registration') throw new Error('La inscripcion de este torneo ya esta cerrada');
  if (input.playerId === team.captainId) throw new Error('El capitan no puede quitarse del equipo');

  await tournamentRepository.deleteTournamentTeamMember(input.teamId, input.playerId, supabase);
  await invalidateTournamentListCaches();
  const updatedTournament = await tournamentRepository.getTournamentById(input.tournamentId);
  if (!updatedTournament) throw new Error('No se pudo cargar el torneo actualizado');

  return { success: true, teamId: input.teamId, message: null, tournament: toTournament(updatedTournament) };
}

/**
 * leaveTournament — retirar un equipo de un torneo en inscripción.
 *
 * Decision Context:
 * - Soft delete (status='withdrawn') para preservar historial del equipo en el torneo.
 * - Los miembros se eliminan (hard delete) porque su inscripción deja de ser válida.
 * - Si quedan 0 equipos activos, el torneo se cancela automáticamente.
 * - Si queda 1 equipo, se retorna warning sin cancelar (el organizador decide).
 * - Las 8 validaciones se aplican en orden estricto para fail-fast con mensajes claros.
 * - La validación de captainId es la única que autoriza el retiro: ni el organizer del
 *   torneo ni un miembro del equipo pueden retirar equipos ajenos a su capitanía.
 * - Validación 8 (fixtures jugados) es defense-in-depth: si el torneo está en
 *   registration no debería haber fixtures completados, pero se verifica igual.
 * - Race condition: withdrawTeamById usa .eq('status','active') para que la segunda
 *   llamada concurrente actualice 0 filas y el service lo detecte via Validación 7.
 * Previously fixed bugs: none relevant.
 */
export async function leaveTournament(
  input: LeaveTournamentInput,
  ctx: ServiceContext,
): Promise<LeaveTournamentResult> {
  /*
   * Decision Context:
   * - withdrawTeamById usa ctx.supabase (user-scoped) para respetar RLS.
   * - REQUIERE política UPDATE en tournamentTeams: "captainId = auth.uid()".
   *   Sin esa política, Supabase devuelve { error: null, data: [] } (0 rows)
   *   silenciosamente — countActiveTeams sigue retornando > 0 y el torneo
   *   nunca se cancela aunque queden 0 equipos activos.
   * - Fix aplicado 2026-05-31: migración fix_tournament_teams_update_delete_rls
   *   agrega las políticas UPDATE/DELETE faltantes en tournamentTeams y
   *   DELETE en tournamentTeamMembers.
   * - Previously fixed bugs: policies RLS faltantes → retiro silencioso sin cancelación.
   */
  // VALIDACIÓN 1 — Autenticación (requireAuth en resolver, pero se verifica acá también)
  if (!ctx.userId) throw new Error('Authentication required');

  // VALIDACIÓN 2 — El torneo existe
  const tournament = await tournamentRepository.getTournamentById(input.tournamentId);
  if (!tournament) throw new Error('El torneo no existe');

  // VALIDACIÓN 3 — El equipo existe
  const team = await tournamentRepository.getTournamentTeamById(input.teamId);
  if (!team) throw new Error('El equipo no existe');

  // VALIDACIÓN 4 — El equipo pertenece a este torneo
  if (team.tournamentId !== input.tournamentId) {
    throw new Error('Este equipo no pertenece a este torneo');
  }

  // VALIDACIÓN 5 — El usuario es el capitán (administrador) del equipo
  // Ningún otro usuario puede retirar: ni miembro, ni organizer del torneo, ni club_admin
  if (team.captainId !== ctx.userId) {
    throw new Error('Solo el capitán (administrador) del equipo puede retirarlo del torneo');
  }

  // VALIDACIÓN 6 — Estado del torneo permite retiro
  const statusBlockMessages: Record<string, string> = {
    in_progress: 'No se puede abandonar un torneo en curso. El torneo ya comenzó y los partidos están programados',
    completed: 'El torneo ya finalizó',
    cancelled: 'El torneo fue cancelado',
  };
  if (tournament.status !== 'registration') {
    const msg = statusBlockMessages[tournament.status];
    throw new Error(msg ?? 'El torneo no está en estado de inscripción');
  }

  // VALIDACIÓN 7 — El equipo no fue ya retirado (previene race condition + doble retiro)
  if (team.status === 'withdrawn') {
    throw new Error('Este equipo ya fue retirado del torneo');
  }

  // VALIDACIÓN 8 — Defense-in-depth: no hay fixtures jugados del equipo
  const teamFixtures = await tournamentRepository.getFixtureMatchesByTeam(input.teamId);
  const hasPlayedFixture = teamFixtures.some(
    (match) => match.status === 'completed' || match.status === 'in_progress',
  );
  if (hasPlayedFixture) {
    throw new Error('No se puede retirar porque el equipo ya jugó partidos del fixture');
  }

  // ACCIÓN — Ejecutar retiro (escribir con user-scoped client para respetar RLS)
  const writeClient = ctx.supabase ?? supabase;

  // 1. Soft delete del equipo (status → withdrawn, guarda timestamp y motivo)
  await tournamentRepository.withdrawTeamById(input.teamId, input.reason ?? null, writeClient);

  // 2. Hard delete de los miembros (su inscripción queda invalidada)
  await tournamentRepository.deleteTeamMembersById(input.teamId, writeClient);

  // 3. Limpiar referencias del equipo en fixtures (edge case: fixture fue generado durante registration)
  if (teamFixtures.length > 0) {
    await tournamentRepository.clearTeamFromFixtureMatches(input.teamId, supabase);
  }

  // 4. Calcular equipos activos restantes con service-role client (no user-scoped necesario para lectura)
  const remainingTeams = await tournamentRepository.countActiveTeams(input.tournamentId, supabase);

  // 5. Invalidar todos los caches del torneo y del listado
  await invalidateTournamentListCaches();

  console.info(
    `[tournamentService.leaveTournament] teamId=${input.teamId} retirado de tournamentId=${input.tournamentId} por userId=${ctx.userId}. remainingTeams=${remainingTeams}`,
  );

  // POST-ACCIÓN — Consecuencias según cantidad de equipos restantes

  // Caso C: 0 equipos → torneo se cancela automáticamente
  if (remainingTeams === 0) {
    await tournamentRepository.updateTournamentStatus(input.tournamentId, 'cancelled', supabase);
    await invalidateTournamentListCaches();
    console.info(
      `[tournamentService.leaveTournament] tournamentId=${input.tournamentId} cancelado automáticamente (0 equipos restantes)`,
    );
    return {
      success: true,
      message: 'El torneo fue cancelado porque no quedan equipos inscriptos',
      tournamentStatus: 'CANCELLED',
      remainingTeams: 0,
    };
  }

  // Caso B: 1 equipo → warning (el torneo no se cancela pero está en riesgo)
  if (remainingTeams === 1) {
    return {
      success: true,
      message:
        'Atención: el torneo tiene solo 1 equipo inscripto. Si no se inscriben más equipos antes de la fecha límite, el torneo podría cancelarse',
      tournamentStatus: 'REGISTRATION',
      remainingTeams: 1,
    };
  }

  // Caso A: 2+ equipos → torneo sigue normal
  return {
    success: true,
    message: 'Tu equipo fue retirado del torneo exitosamente',
    tournamentStatus: 'REGISTRATION',
    remainingTeams,
  };
}

// =====================================================
// Issue #132: nuevos mapeos de enum
// =====================================================

const DB_TO_TOURNAMENT_TYPE: Record<string, TournamentType> = {
  round_robin: TournamentType.RoundRobin,
  single_elimination: TournamentType.SingleElimination,
  group_stage_elimination: TournamentType.GroupStageElimination,
};

const DB_TO_DURATION_MODE: Record<string, DurationMode> = {
  single_day: DurationMode.SingleDay,
  multi_day: DurationMode.MultiDay,
};

const DB_TO_FIXTURE_PHASE: Record<string, FixturePhase> = {
  group_stage: FixturePhase.GroupStage,
  round_of_16: FixturePhase.RoundOf_16,
  quarterfinal: FixturePhase.Quarterfinal,
  semifinal: FixturePhase.Semifinal,
  third_place: FixturePhase.ThirdPlace,
  final: FixturePhase.Final,
};

const DB_TO_INVITATION_STATUS: Record<string, TournamentInvitationStatus> = {
  pending: TournamentInvitationStatus.Pending,
  accepted: TournamentInvitationStatus.Accepted,
  rejected: TournamentInvitationStatus.Rejected,
  expired: TournamentInvitationStatus.Expired,
};

// =====================================================
// Issue #132: crear torneo con auto-scheduling (date-based)
// =====================================================

/**
 * Crear torneo usando fechas automáticas (sin slots de club).
 * Camino: firstMatchday + cadenceDays → calcular scheduledAt de cada fixture.
 */
export async function createTournamentAutoSchedule(
  input: CreateTournamentInput,
  ctx: ServiceContext,
): Promise<CreateTournamentResult> {
  /*
   * Decision Context:
   * - Este camino se activa cuando input.firstMatchday está presente y schedule está vacío.
   * - No usa el RPC create_tournament_with_fixture (que requiere slots de club).
   * - Los fixtures se crean sin courtId — el organizador puede asignar cancha después.
   * - Genera fixture según tournamentType:
   *   round_robin → buildRoundRobinFixtureRows
   *   single_elimination → buildSingleEliminationFixtureRows
   *   group_stage_elimination → buildGroupStageFixtureRows (grupos + eliminación)
   * - Para group_stage: los fixtures de eliminación son placeholders (homeTeamId/awayTeamId NULL).
   * - Validación: firstMatchday >= hoy.
   * - Previously fixed bugs: none relevant (nueva funcionalidad).
   */
  if (!ctx.userId) throw new Error('Authentication required');
  const db = ctx.supabase;
  if (!db) throw new Error('User-scoped client required');

  const captainTeams = await teamRepository.getTeamsByCaptainId(ctx.userId);
  if (captainTeams.length === 0) {
    throw new Error('Solo capitanes de equipo pueden crear torneos. Primero creá un equipo y convertite en capitán.');
  }

  const name = input.name.trim();
  if (name.length < 3) throw new Error('El nombre del torneo debe tener al menos 3 caracteres');
  if (!input.firstMatchday) throw new Error('firstMatchday es requerido para auto-scheduling');

  const today = new Date().toISOString().slice(0, 10);
  if (input.firstMatchday < today) throw new Error('La primera jornada debe ser a partir de hoy');

  const tournamentType = input.tournamentType ?? TournamentType.RoundRobin;
  const durationMode = input.durationMode ?? DurationMode.MultiDay;
  const cadenceDays = input.cadenceDays ?? 7;

  if (durationMode === 'MULTI_DAY' && !cadenceDays) {
    throw new Error('cadenceDays es requerido para torneos de varios días');
  }

  const typeDb = {
    [TournamentType.RoundRobin]: 'round_robin',
    [TournamentType.SingleElimination]: 'single_elimination',
    [TournamentType.GroupStageElimination]: 'group_stage_elimination',
  }[tournamentType] ?? 'round_robin';

  const modeDb = durationMode === DurationMode.SingleDay ? 'single_day' : 'multi_day';

  if (typeDb === 'group_stage_elimination') {
    if (!input.groupCount || input.groupCount < 2) throw new Error('groupCount mínimo es 2 para torneos por grupos');
    const tpg = input.teamsPerGroup ?? Math.ceil(input.teamCount / input.groupCount);
    if (input.teamCount !== input.groupCount * tpg) {
      throw new Error(`teamCount (${input.teamCount}) debe ser groupCount × teamsPerGroup (${input.groupCount} × ${tpg})`);
    }
  }

  const dbFormat = FORMAT_TO_DB[input.format as MatchFormat];
  if (!dbFormat) throw new Error('Formato de torneo inválido');

  const club = await clubRepository.getClubById(input.clubId);
  if (!club) throw new Error('Club no encontrado');

  // Calcular startDate y endDate para el torneo
  const totalMatchdays = calcTotalMatchdays(typeDb, input.teamCount, input.groupCount, input.teamsPerGroup);
  const endDateObj = new Date(input.firstMatchday + 'T12:00:00Z');
  endDateObj.setUTCDate(endDateObj.getUTCDate() + (totalMatchdays - 1) * cadenceDays);
  const endDate = endDateObj.toISOString().slice(0, 10);

  const tournamentId = await tournamentRepository.createTournamentDirect(
    {
      organizerId: ctx.userId,
      clubId: input.clubId,
      name,
      format: dbFormat,
      teamCount: input.teamCount,
      playersPerTeam: input.playersPerTeam,
      description: input.description?.trim() || null,
      startDate: input.firstMatchday,
      endDate,
      tournamentType: typeDb,
      durationMode: modeDb,
      firstMatchday: input.firstMatchday,
      cadenceDays,
      specificDays: (input.specificDays?.filter((d): d is number => d != null)) ?? null,
      groupCount: input.groupCount ?? null,
      teamsPerGroup: input.teamsPerGroup ?? null,
      advancingPerGroup: input.advancingPerGroup ?? null,
    },
    db,
  );

  // Para round_robin y single_elimination: los fixture rows se crean con equipos placeholder.
  // Los equipos reales se asignan al completar la inscripción en generateFixtureIfRegistrationComplete.
  // Para group_stage: igual, pero se crean los grupos cuando se completa la inscripción.
  // Los fixtures se crean ahora como PLACEHOLDER para reservar las jornadas.
  if (typeDb === 'single_elimination') {
    // Crear placeholder de matches por ronda (sin equipos asignados aún)
    const totalMatchdays2 = calcTotalMatchdays('single_elimination', input.teamCount);
    const placeholderRows = [];
    const bracket = nextPow2(input.teamCount);

    for (let round = 1; round <= Math.log2(bracket); round++) {
      const matchesThisRound = bracket / Math.pow(2, round);
      for (let m = 0; m < matchesThisRound; m++) {
        const date = calcMatchdayDateHelper(input.firstMatchday, round, cadenceDays, modeDb);
        placeholderRows.push({
          tournamentId,
          round,
          matchday: round,
          scheduledAt: `${date}T${String(9 + m).padStart(2, '0')}:00:00+00:00`,
          phase: phaseHelper(round, Math.log2(bracket)),
          groupName: null,
        });
      }
    }
    await tournamentRepository.insertFixtureMatchesWithPhase(placeholderRows, supabase);
  }

  // Auto-inscripción del creador
  if (db) {
    try {
      const team = captainTeams[0];
      await teamRepository.enrollPermanentTeamInTournament(
        { teamId: team.id, tournamentId, name: team.name, captainId: ctx.userId },
        db,
      );
    } catch (e) {
      console.warn('[tournamentService.createTournamentAutoSchedule] Auto-inscripción fallida:', e);
    }
  }

  await invalidateTournamentListCaches();
  const created = await tournamentRepository.getTournamentById(tournamentId);
  if (!created) throw new Error('No se pudo cargar el torneo creado');

  return { success: true, tournamentId: created.id, message: null, tournament: toTournament(created) };
}

// Helpers locales para evitar imports circulares
function nextPow2(n: number): number {
  let p = 1; while (p < n) p *= 2; return p;
}
function calcMatchdayDateHelper(firstMatchday: string, matchday: number, cadenceDays: number, durationMode: string): string {
  if (durationMode === 'single_day') return firstMatchday;
  const d = new Date(firstMatchday + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (matchday - 1) * cadenceDays);
  return d.toISOString().slice(0, 10);
}
function phaseHelper(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  switch (fromEnd) {
    case 0: return 'final'; case 1: return 'semifinal';
    case 2: return 'quarterfinal'; case 3: return 'round_of_16';
    default: return 'group_stage';
  }
}

// =====================================================
// Issue #132: schedulePreview — sin escritura a DB
// =====================================================

export function getSchedulePreview(
  input: SchedulePreviewInput,
): Array<{ matchday: number; date: string; matchCount: number; isPast: boolean }> {
  const typeDb = {
    [TournamentType.RoundRobin]: 'round_robin',
    [TournamentType.SingleElimination]: 'single_elimination',
    [TournamentType.GroupStageElimination]: 'group_stage_elimination',
  }[input.tournamentType] ?? 'round_robin';

  const modeDb = input.durationMode === DurationMode.SingleDay ? 'single_day' : 'multi_day';
  const cadenceDays = input.cadenceDays ?? 7;
  const totalMatchdays = calcTotalMatchdays(typeDb, input.teamCount, input.groupCount, input.teamsPerGroup);
  const matchesPerMatchday = calcMatchesPerMatchday(typeDb, input.teamCount, input.groupCount, input.teamsPerGroup);

  return buildSchedulePreview(input.firstMatchday, totalMatchdays, matchesPerMatchday, cadenceDays, modeDb);
}

// =====================================================
// Issue #132: invitaciones de equipos a torneos (T5)
// =====================================================

export async function inviteTeamToTournament(
  input: InviteTeamToTournamentInput,
  ctx: ServiceContext,
): Promise<TournamentInvitationResult> {
  const userId = ctx.userId;
  if (!userId) throw new Error('Autenticación requerida');
  const db = ctx.supabase ?? supabase;

  const tournament = await tournamentRepository.getTournamentById(input.tournamentId);
  if (!tournament) throw new Error('Torneo no encontrado');
  if (tournament.organizerId !== userId) throw new Error('Solo el organizador puede invitar equipos');
  if (tournament.status !== 'registration') throw new Error('El torneo no está en período de inscripción');

  const team = await teamRepository.getTeamById(input.teamId);
  if (!team) throw new Error('Equipo no encontrado');
  if (!team.isActive) throw new Error('El equipo no está activo');

  // Verificar que el equipo no está ya inscripto
  const existing = await teamRepository.getEnrollmentByPermanentTeamAndTournament(input.teamId, input.tournamentId);
  if (existing) throw new Error('El equipo ya está inscripto en este torneo');

  // Verificar que no hay invitación pendiente
  const pending = await tournamentRepository.getPendingTournamentInvitation(input.tournamentId, input.teamId);
  if (pending) throw new Error('Ya existe una invitación pendiente para este equipo');

  if (!team.captainId) throw new Error('El equipo no tiene capitán asignado');

  const invitation = await tournamentRepository.createTournamentInvitation(
    { tournamentId: input.tournamentId, teamId: input.teamId, invitedBy: userId, captainId: team.captainId, message: input.message ?? null },
    db,
  );

  console.info(`[tournamentService.inviteTeamToTournament] Invitación enviada: tournamentId=${input.tournamentId}, teamId=${input.teamId}`);
  const full = await tournamentRepository.getTournamentInvitationById(invitation.id);

  return {
    success: true,
    message: 'Invitación enviada correctamente',
    invitation: full ? toTournamentInvitation(full) : null,
  };
}

export async function respondTournamentInvitation(
  invitationId: string,
  accept: boolean,
  ctx: ServiceContext,
): Promise<TournamentMutationResult> {
  const userId = ctx.userId;
  if (!userId) throw new Error('Autenticación requerida');
  const db = ctx.supabase ?? supabase;

  const inv = await tournamentRepository.getTournamentInvitationById(invitationId);
  if (!inv) throw new Error('Invitación no encontrada');
  if (inv.captainId !== userId) throw new Error('Solo el capitán del equipo puede responder esta invitación');
  if (inv.status !== 'pending') throw new Error('Esta invitación ya fue respondida');
  if (new Date(inv.expiresAt) < new Date()) throw new Error('La invitación expiró');

  const now = new Date().toISOString();

  if (accept) {
    if (inv.teamId) {
      const team = await teamRepository.getTeamById(inv.teamId);
      if (team) {
        try {
          await teamRepository.enrollPermanentTeamInTournament(
            { teamId: inv.teamId, tournamentId: inv.tournamentId, name: team.name, captainId: userId },
            db,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Error al inscribir el equipo';
          throw new Error(msg);
        }
      }
    }
    await tournamentRepository.updateTournamentInvitationStatus(invitationId, 'accepted', now, db);
    await generateFixtureIfRegistrationComplete({ userId, supabase: db }, inv.tournamentId);
    await invalidateTournamentListCaches();
    console.info(`[tournamentService.respondTournamentInvitation] Aceptada: ${invitationId}`);
    return { success: true, message: '¡Equipo inscripto al torneo exitosamente!' };
  } else {
    await tournamentRepository.updateTournamentInvitationStatus(invitationId, 'rejected', now, db);
    console.info(`[tournamentService.respondTournamentInvitation] Rechazada: ${invitationId}`);
    return { success: true, message: 'Invitación rechazada' };
  }
}

export async function getMyTournamentInvitations(ctx: ServiceContext): Promise<TournamentInvitation[]> {
  if (!ctx.userId) throw new Error('Autenticación requerida');
  const rows = await tournamentRepository.getMyTournamentInvitations(ctx.userId);
  return rows.map(toTournamentInvitation);
}

// Mapper de invitación DB → GraphQL
function toTournamentInvitation(row: import('../repositories/tournamentRepository.js').TournamentInvitationRow): TournamentInvitation {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = row as any;
  return {
    id: r.id,
    tournamentId: r.tournamentId,
    tournamentName: r.tournament?.name ?? '',
    teamId: r.teamId ?? null,
    teamName: r.team?.name ?? '',
    invitedBy: {
      id: r.invitedByProfile?.id ?? r.invitedBy,
      displayName: r.invitedByProfile?.displayName ?? '',
      avatarUrl: r.invitedByProfile?.avatarUrl ?? null,
      preferredPosition: null,
    },
    captain: {
      id: r.captainProfile?.id ?? r.captainId,
      displayName: r.captainProfile?.displayName ?? '',
      avatarUrl: r.captainProfile?.avatarUrl ?? null,
      preferredPosition: null,
    },
    status: DB_TO_INVITATION_STATUS[r.status] ?? TournamentInvitationStatus.Pending,
    message: r.message ?? null,
    expiresAt: r.expiresAt,
    respondedAt: r.respondedAt ?? null,
    createdAt: r.createdAt,
  };
}

// =====================================================
// Actualizar toTournament y toFixtureMatch con nuevos campos
// =====================================================

// Nota: toTournament y toFixtureMatch ya están definidos en el service.
// Los nuevos campos (tournamentType, durationMode, isPast, phase, etc.)
// se agregan en el mixin below que se usa en los mappers existentes.
// Ver parche en toTournament y toFixtureMatch abajo.

export const tournamentService = {
  listTournaments,
  listRegistrationTournaments,
  getTournamentById,
  searchTournamentEligiblePlayers,
  createTournament,
  createTournamentAutoSchedule,
  generateFixtureIfRegistrationComplete,
  registerTournamentTeam,
  joinTournament,
  addTournamentTeamMember,
  removeTournamentTeamMember,
  leaveTournament,
  getSchedulePreview,
  inviteTeamToTournament,
  respondTournamentInvitation,
  getMyTournamentInvitations,
};
