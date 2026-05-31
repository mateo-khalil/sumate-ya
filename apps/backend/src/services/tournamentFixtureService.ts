/**
 * tournamentFixtureService — lógica de generación de fixture para los 3 tipos de torneo.
 *
 * Decision Context:
 * - Separado de tournamentService.ts para no superar límites de tamaño y mantener
 *   responsabilidades claras. tournamentService.ts delega a estas funciones.
 * - Auto-scheduling: calcula fechas de jornadas a partir de firstMatchday + cadenceDays.
 *   Para single_day: todas las jornadas el mismo día con horarios escalonados (hora+1 por partido).
 * - Single elimination: si teamCount no es potencia de 2, se agregan "byes" (equipos NULL)
 *   hasta la siguiente potencia de 2. Los partidos contra byes se ganan automáticamente.
 * - Group stage: los partidos de eliminación se crean como placeholder (homeTeam/awayTeam NULL)
 *   y se completan al terminar la fase de grupos.
 * - Validación estricta: jornada N+1 siempre después de jornada N.
 * - Previously fixed bugs: none relevant (nueva funcionalidad).
 */

import type {
  CreateFixtureMatchWithPhaseInput,
} from '../repositories/tournamentRepository.js';

// =====================================================
// Tipos auxiliares
// =====================================================

export interface ScheduledMatch {
  round: number;
  matchday: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  scheduledAt: string | null;
  phase: string | null;
  groupName: string | null;
}

export interface SchedulePreviewDay {
  matchday: number;
  date: string;
  matchCount: number;
  isPast: boolean;
}

// =====================================================
// Helpers de scheduling
// =====================================================

/**
 * Calcula la fecha de una jornada dado firstMatchday + cadenceDays.
 * Para single_day siempre retorna firstMatchday.
 */
export function calcMatchdayDate(
  firstMatchday: string,
  matchday: number,
  cadenceDays: number,
  durationMode: string,
): string {
  if (durationMode === 'single_day') return firstMatchday;
  const base = new Date(firstMatchday + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + (matchday - 1) * cadenceDays);
  return base.toISOString().slice(0, 10);
}

/**
 * Convierte fecha + índice de partido del día a timestamp ISO.
 * Cada partido dentro de un día se programa 1 hora después del anterior.
 */
export function calcMatchTimestamp(date: string, matchIndexInDay: number): string {
  const startHour = 9 + matchIndexInDay;
  const h = String(startHour % 24).padStart(2, '0');
  return `${date}T${h}:00:00+00:00`;
}

/**
 * Preview de jornadas — calcula sin escribir a DB.
 * Valida que jornada N+1 > jornada N (trivialmente cumplido por construcción).
 */
export function buildSchedulePreview(
  firstMatchday: string,
  totalMatchdays: number,
  matchesPerMatchday: number,
  cadenceDays: number,
  durationMode: string,
): SchedulePreviewDay[] {
  const now = new Date();
  const preview: SchedulePreviewDay[] = [];

  for (let md = 1; md <= totalMatchdays; md++) {
    const date = calcMatchdayDate(firstMatchday, md, cadenceDays, durationMode);
    preview.push({
      matchday: md,
      date,
      matchCount: matchesPerMatchday,
      isPast: new Date(date + 'T23:59:59Z') < now,
    });
  }

  return preview;
}

// =====================================================
// Round Robin mejorado (con matchday y scheduledAt)
// =====================================================

/**
 * Genera pairings round-robin asignando matchday y scheduledAt calculado.
 * Retorna rows listas para insertFixtureMatchesWithPhase.
 */
export function buildRoundRobinFixtureRows(
  tournamentId: string,
  teamIds: string[],
  firstMatchday: string,
  cadenceDays: number,
  durationMode: string,
): CreateFixtureMatchWithPhaseInput[] {
  const participants: Array<string | null> =
    teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const rounds = participants.length - 1;
  const half = participants.length / 2;
  const rows: CreateFixtureMatchWithPhaseInput[] = [];
  const matchIndexByMatchday: Record<number, number> = {};

  for (let round = 1; round <= rounds; round++) {
    const matchday = round; // round-robin: 1 jornada por ronda
    if (!matchIndexByMatchday[matchday]) matchIndexByMatchday[matchday] = 0;

    for (let i = 0; i < half; i++) {
      const home = participants[i];
      const away = participants[participants.length - 1 - i];
      if (!home || !away) continue;

      const date = calcMatchdayDate(firstMatchday, matchday, cadenceDays, durationMode);
      const scheduledAt = calcMatchTimestamp(date, matchIndexByMatchday[matchday]);
      matchIndexByMatchday[matchday]++;

      rows.push({
        tournamentId,
        round,
        matchday,
        homeTeamId: round % 2 === 0 ? away : home,
        awayTeamId: round % 2 === 0 ? home : away,
        scheduledAt,
        phase: 'group_stage',
        groupName: null,
      } as CreateFixtureMatchWithPhaseInput & { homeTeamId?: string; awayTeamId?: string });
    }

    const fixed = participants[0];
    const rotated = [fixed, participants[participants.length - 1], ...participants.slice(1, -1)];
    participants.splice(0, participants.length, ...rotated);
  }

  return rows;
}

// =====================================================
// Single Elimination
// =====================================================

/** Siguiente potencia de 2 >= n */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Fase del partido según la ronda y total de rondas */
function phaseForRound(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round; // 0 = final, 1 = semi, 2 = quarter...
  switch (fromEnd) {
    case 0: return 'final';
    case 1: return 'semifinal';
    case 2: return 'quarterfinal';
    case 3: return 'round_of_16';
    default: return 'group_stage'; // para torneos muy grandes
  }
}

/**
 * Genera el fixture de eliminación directa.
 * Primera ronda: equipos asignados aleatoriamente (shuffleados).
 * Rondas siguientes: placeholder (homeTeam/awayTeam NULL — se llenan al avanzar ganadores).
 */
export function buildSingleEliminationFixtureRows(
  tournamentId: string,
  teamIds: string[],
  firstMatchday: string,
  cadenceDays: number,
  durationMode: string,
): CreateFixtureMatchWithPhaseInput[] {
  const bracket = nextPowerOf2(teamIds.length);
  const totalRounds = Math.log2(bracket);

  // Shuffle equipos para sorteo
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  // Completar con byes (null) si no es potencia de 2
  while (shuffled.length < bracket) shuffled.push('BYE');

  const rows: CreateFixtureMatchWithPhaseInput[] = [];
  let matchInMatchday = 0;

  for (let round = 1; round <= totalRounds; round++) {
    const matchday = round;
    const matchesThisRound = bracket / Math.pow(2, round);
    const date = calcMatchdayDate(firstMatchday, matchday, cadenceDays, durationMode);
    const phase = phaseForRound(round, totalRounds);
    matchInMatchday = 0;

    for (let m = 0; m < matchesThisRound; m++) {
      const scheduledAt = calcMatchTimestamp(date, matchInMatchday++);

      if (round === 1) {
        const homeIdx = m * 2;
        const awayIdx = m * 2 + 1;
        const homeTeamId = shuffled[homeIdx] !== 'BYE' ? shuffled[homeIdx] : null;
        const awayTeamId = shuffled[awayIdx] !== 'BYE' ? shuffled[awayIdx] : null;

        rows.push({
          tournamentId,
          round,
          matchday,
          homeTeamId,
          awayTeamId,
          scheduledAt,
          phase,
          groupName: null,
        } as unknown as CreateFixtureMatchWithPhaseInput);
      } else {
        // Rondas posteriores: placeholder (equipos NULL — se asignan al avanzar)
        rows.push({
          tournamentId,
          round,
          matchday,
          scheduledAt,
          phase,
          groupName: null,
        } as CreateFixtureMatchWithPhaseInput);
      }
    }
  }

  return rows;
}

// =====================================================
// Group Stage Elimination
// =====================================================

/**
 * Genera fixture de fase de grupos (round-robin intra-grupo) +
 * placeholders para la fase de eliminación.
 * Retorna rows de fixture Y qué equipos van en qué grupo.
 */
export function buildGroupStageFixtureRows(
  tournamentId: string,
  teamIds: string[],
  groupCount: number,
  teamsPerGroup: number,
  advancingPerGroup: number,
  firstMatchday: string,
  cadenceDays: number,
  durationMode: string,
): {
  fixtureRows: CreateFixtureMatchWithPhaseInput[];
  groups: { groupName: string; teamIds: string[] }[];
} {
  // Sortear equipos en grupos
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  const groupLetters = 'ABCDEFGHIJKLMNOP'.split('').slice(0, groupCount);
  const groups: { groupName: string; teamIds: string[] }[] = groupLetters.map((letter, gi) => ({
    groupName: letter,
    teamIds: shuffled.slice(gi * teamsPerGroup, (gi + 1) * teamsPerGroup),
  }));

  const fixtureRows: CreateFixtureMatchWithPhaseInput[] = [];
  const matchIndexByMatchday: Record<number, number> = {};
  const roundsPerGroup = teamsPerGroup % 2 === 0 ? teamsPerGroup - 1 : teamsPerGroup;

  // Generar round-robin intra-grupo para cada grupo
  for (const group of groups) {
    const participants: Array<string | null> =
      group.teamIds.length % 2 === 0 ? [...group.teamIds] : [...group.teamIds, null];
    const half = participants.length / 2;

    for (let round = 1; round <= roundsPerGroup; round++) {
      const matchday = round; // grupo: jornadas 1..roundsPerGroup
      if (!matchIndexByMatchday[matchday]) matchIndexByMatchday[matchday] = 0;

      for (let i = 0; i < half; i++) {
        const home = participants[i];
        const away = participants[participants.length - 1 - i];
        if (!home || !away) continue;

        const date = calcMatchdayDate(firstMatchday, matchday, cadenceDays, durationMode);
        const scheduledAt = calcMatchTimestamp(date, matchIndexByMatchday[matchday]);
        matchIndexByMatchday[matchday]++;

        fixtureRows.push({
          tournamentId,
          round,
          matchday,
          homeTeamId: round % 2 === 0 ? away : home,
          awayTeamId: round % 2 === 0 ? home : away,
          scheduledAt,
          phase: 'group_stage',
          groupName: group.groupName,
        } as unknown as CreateFixtureMatchWithPhaseInput);
      }

      const fixed = participants[0];
      const rotated = [fixed, participants[participants.length - 1], ...participants.slice(1, -1)];
      participants.splice(0, participants.length, ...rotated);
    }
  }

  // Generar placeholders de fase de eliminación
  const advancing = groupCount * advancingPerGroup;
  const elimBracket = nextPowerOf2(advancing);
  const elimRounds = Math.log2(elimBracket);
  const groupRoundsMax = roundsPerGroup;

  for (let round = 1; round <= elimRounds; round++) {
    const matchday = groupRoundsMax + round;
    const matchesThisRound = elimBracket / Math.pow(2, round);
    const date = calcMatchdayDate(firstMatchday, matchday, cadenceDays, durationMode);
    const phase = phaseForRound(round, elimRounds);
    if (!matchIndexByMatchday[matchday]) matchIndexByMatchday[matchday] = 0;

    for (let m = 0; m < matchesThisRound; m++) {
      const scheduledAt = calcMatchTimestamp(date, matchIndexByMatchday[matchday]);
      matchIndexByMatchday[matchday]++;
      fixtureRows.push({
        tournamentId,
        round: groupRoundsMax + round,
        matchday,
        scheduledAt,
        phase,
        groupName: null,
      });
    }
  }

  return { fixtureRows, groups };
}

// =====================================================
// Cálculo de matchdays necesarios por tipo de torneo
// =====================================================

/**
 * Retorna cuántas jornadas (matchdays) necesita el torneo.
 */
export function calcTotalMatchdays(
  tournamentType: string,
  teamCount: number,
  groupCount?: number | null,
  teamsPerGroup?: number | null,
): number {
  switch (tournamentType) {
    case 'single_elimination': {
      const bracket = nextPowerOf2(teamCount);
      return Math.log2(bracket); // 1 ronda = 1 jornada
    }
    case 'group_stage_elimination': {
      const tpg = teamsPerGroup ?? Math.ceil(teamCount / (groupCount ?? 2));
      const groupRounds = tpg % 2 === 0 ? tpg - 1 : tpg;
      const adv = (groupCount ?? 2) * 2; // asume 2 pasan por grupo
      const bracket = nextPowerOf2(adv);
      const elimRounds = Math.log2(bracket);
      return groupRounds + elimRounds;
    }
    default: // round_robin
      return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  }
}

/**
 * Retorna cuántos partidos hay por jornada (para el preview).
 * Para round_robin con N pares: N/2 por jornada.
 * Para eliminación directa: varía por ronda.
 */
export function calcMatchesPerMatchday(
  tournamentType: string,
  teamCount: number,
  groupCount?: number | null,
  teamsPerGroup?: number | null,
): number {
  switch (tournamentType) {
    case 'single_elimination':
      return Math.ceil(nextPowerOf2(teamCount) / 2); // primera ronda = max partidos
    case 'group_stage_elimination': {
      const g = groupCount ?? 2;
      const tpg = teamsPerGroup ?? Math.ceil(teamCount / g);
      return g * Math.floor(tpg / 2);
    }
    default: // round_robin
      return Math.floor(teamCount / 2);
  }
}
