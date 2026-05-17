/**
 * Tournament Service - creation, availability validation, and round-robin fixture planning.
 *
 * Decision Context:
 * - Creation delegates the tournament + fixture reservation write to Supabase RPC so the
 *   full insert happens transactionally under auth.uid() without direct table RLS friction.
 * - Once tournamentTeams reaches teamCount, generateFixtureIfRegistrationComplete() fills
 *   those fixture rows with round-robin pairings and marks the tournament in_progress.
 * - Services return data only; resolvers decide how to shape success/error responses.
 */

import { supabase } from '../config/supabase.js';
import { cacheDeletePattern, cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import {
  FixtureMatchStatus,
  MatchFormat,
  PlayerPosition,
  TournamentStatus,
  type CreateTournamentInput,
  type CreateTournamentResult,
  type RegisterTournamentTeamInput,
  type Tournament,
  type TournamentFixtureMatch,
  type TournamentPlayer,
  type TournamentTeam,
  type TournamentTeamRegistrationResult,
} from '../graphql/generated/graphql.js';
import {
  tournamentRepository,
  type FixtureMatchRow,
  type TournamentPlayerRow,
  type TournamentRow,
  type TournamentSlotRow,
  type TournamentTeamRow,
} from '../repositories/tournamentRepository.js';
import { clubRepository } from '../repositories/clubRepository.js';
import { dateToDayOfWeek } from './clubService.js';
import type { ServiceContext } from '../types/context.js';

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

const TOURNAMENTS_REGISTRATION_CACHE_KEY = `${CACHE_PREFIX.TOURNAMENTS_LIST}:status:registration`;
const TOURNAMENT_DETAIL_CACHE_PREFIX = `${CACHE_PREFIX.TOURNAMENTS_LIST}:detail:`;

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
  };
}

function toTournament(row: TournamentRow): Tournament {
  const fixtureMatches = [...(row.fixtureMatches ?? [])].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '');
  });
  const registeredTeamsCount = row.registeredTeams?.[0]?.count ?? row.tournamentTeams?.length ?? 0;

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
          imageUrl: row.clubs.imageUrl,
        }
      : null,
    teams: (row.tournamentTeams ?? []).map(toTournamentTeam),
    fixtureMatches: fixtureMatches.map(toFixtureMatch),
  };
}

async function normalizeAndValidateSchedule(
  input: CreateTournamentInput,
  dbFormat: string,
): Promise<NormalizedScheduleSlot[]> {
  const shape = roundRobinShape(input.teamCount);

  if (input.schedule.length < shape.requiredMatches) {
    throw new Error(
      `Necesitás seleccionar ${shape.requiredMatches} horarios para un round-robin de ${input.teamCount} equipos.`,
    );
  }

  const occurrenceKeys = new Set<string>();
  for (const occurrence of input.schedule) {
    const key = `${occurrence.slotId}|${occurrence.date}`;
    if (occurrenceKeys.has(key)) {
      throw new Error('Hay horarios repetidos en el fixture del torneo');
    }
    occurrenceKeys.add(key);
  }

  const uniqueSlotIds = [...new Set(input.schedule.map((s) => s.slotId))];
  const slots = await tournamentRepository.getSlotsByIds(uniqueSlotIds);
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  const normalized = input.schedule.map((occurrence) => {
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

// =====================================================
// Service Functions
// =====================================================

export async function listRegistrationTournaments(_ctx: ServiceContext): Promise<Tournament[]> {
  const tournaments = await cacheGetOrSet<TournamentRow[]>(
    TOURNAMENTS_REGISTRATION_CACHE_KEY,
    () => tournamentRepository.getRegistrationTournaments(),
    CACHE_TTL.DYNAMIC_DATA,
  );

  return tournaments.map(toTournament);
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

export async function createTournament(
  input: CreateTournamentInput,
  ctx: ServiceContext,
): Promise<CreateTournamentResult> {
  if (!ctx.userId) throw new Error('Authentication required');
  const db = ctx.supabase;
  if (!db) throw new Error('User-scoped client required for write operations');

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
  if (!ctx.userId) throw new Error('Authentication required');
  const db = ctx.supabase;
  if (!db) throw new Error('User-scoped client required for write operations');

  const teamName = input.name.trim();
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

  const teamId = await tournamentRepository.registerTournamentTeamRpc(
    {
      tournamentId: input.tournamentId,
      name: teamName,
    },
    db,
  );

  const updatedTournament = await tournamentRepository.getTournamentById(input.tournamentId);
  if (!updatedTournament) throw new Error('No se pudo cargar el torneo actualizado');
  await invalidateTournamentListCaches();

  return {
    success: true,
    teamId,
    message: null,
    tournament: toTournament(updatedTournament),
  };
}

export const tournamentService = {
  listRegistrationTournaments,
  getTournamentById,
  createTournament,
  generateFixtureIfRegistrationComplete,
  registerTournamentTeam,
};
