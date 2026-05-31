/**
 * Team Service - lógica de negocio para equipos permanentes, invitaciones, disponibilidad.
 *
 * Decision Context:
 * - Issue #137: equipos permanentes separados de tournamentTeams (Opción A arquitectónica).
 * - Cada método valida auth, luego permisos de negocio, luego ejecuta la operación.
 * - Escrituras usan ctx.supabase ?? supabase (user-scoped para RLS).
 * - Cache en lecturas pesadas (myTeams, team detail, availability matrix).
 * - leaveTeam transfiere capitanía al miembro más antiguo si el capitán se va con otros miembros;
 *   soft-deletes el equipo si el capitán era el último miembro.
 * - respondInvitation verifica race condition (equipo lleno) antes de agregar el miembro.
 * - Previously fixed bugs: none relevant.
 */

import { supabase } from '../config/supabase.js';
import { cacheDelete, cacheDeletePattern, cacheGetOrSet, CACHE_PREFIX, CACHE_TTL } from '../config/redis.js';
import {
  InvitationStatus,
  MatchFormat,
  PlayerPosition,
  TournamentStatus,
  TeamMemberRole,
  type AvailabilityMatrixCell,
  type CreateTeamInput,
  type EnrollTeamResult,
  type InvitePlayerInput,
  type PlayerAvailabilitySlot,
  type RespondInvitationInput,
  type SetAvailabilityInput,
  type Team,
  type TeamEnrollment,
  type TeamInvitation,
  type TeamInvitationResult,
  type TeamMutationResult,
  type TeamProfile,
  type TeamResult,
  type TeamRosterEntry,
  type UpdateTeamInput,
} from '../graphql/generated/graphql.js';
import {
  teamRepository,
  type PlayerAvailabilityRow,
  type ProfileRow,
  type TeamInvitationRow,
  type TeamMemberRow,
  type TeamRow,
} from '../repositories/teamRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Enum Mappings
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

const DB_TO_TOURNAMENT_STATUS: Record<string, TournamentStatus> = {
  registration: TournamentStatus.Registration,
  in_progress: TournamentStatus.InProgress,
  completed: TournamentStatus.Completed,
  cancelled: TournamentStatus.Cancelled,
};

// Mínimo de jugadores necesarios por formato (titulares)
const FORMAT_MIN_PLAYERS: Record<string, number> = {
  '5v5': 5, '7v7': 7, '10v10': 10, '11v11': 11,
};

const DB_TO_POSITION: Record<string, PlayerPosition> = {
  goalkeeper: PlayerPosition.Goalkeeper,
  defender: PlayerPosition.Defender,
  midfielder: PlayerPosition.Midfielder,
  forward: PlayerPosition.Forward,
};

const DB_TO_INVITATION_STATUS: Record<string, InvitationStatus> = {
  pending: InvitationStatus.Pending,
  accepted: InvitationStatus.Accepted,
  rejected: InvitationStatus.Rejected,
  expired: InvitationStatus.Expired,
};

const DB_TO_MEMBER_ROLE: Record<string, TeamMemberRole> = {
  captain: TeamMemberRole.Captain,
  member: TeamMemberRole.Member,
};

// Máximo de miembros por formato (jugadores titulares × 2 como tope razonable)
const FORMAT_MAX_MEMBERS: Record<string, number> = {
  '5v5': 10,
  '7v7': 14,
  '10v10': 20,
  '11v11': 22,
};

// =====================================================
// Row → GraphQL Mappers
// =====================================================

function rowToTeamProfile(profile: ProfileRow): TeamProfile {
  return {
    id: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? null,
    preferredPosition: profile.preferredPosition ? (DB_TO_POSITION[profile.preferredPosition] ?? null) : null,
  };
}

function rowToTeamRosterEntry(row: TeamMemberRow & { player: ProfileRow }): TeamRosterEntry {
  return {
    id: row.id,
    teamId: row.teamId,
    player: rowToTeamProfile(row.player),
    role: DB_TO_MEMBER_ROLE[row.role] ?? TeamMemberRole.Member,
    joinedAt: row.joinedAt,
  };
}

function rowToTeam(
  row: TeamRow & { captain?: ProfileRow | null; members?: (TeamMemberRow & { player: ProfileRow })[] },
): Team {
  const members = row.members ?? [];
  return {
    id: row.id,
    name: row.name,
    captainId: row.captainId ?? null,
    captain: row.captain ? rowToTeamProfile(row.captain) : null,
    logoUrl: row.logoUrl ?? null,
    format: DB_TO_FORMAT[row.format] ?? MatchFormat.SevenVsSeven,
    description: row.description ?? null,
    isActive: row.isActive,
    memberCount: members.length,
    members: members.map(rowToTeamRosterEntry),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToTeamInvitation(
  row: TeamInvitationRow & {
    team: TeamRow & { captain?: ProfileRow | null; members?: (TeamMemberRow & { player: ProfileRow })[] };
    invitedPlayer: ProfileRow;
    invitedByProfile: ProfileRow;
  },
): TeamInvitation {
  return {
    id: row.id,
    team: rowToTeam(row.team),
    invitedPlayer: rowToTeamProfile(row.invitedPlayer),
    invitedBy: rowToTeamProfile(row.invitedByProfile),
    status: DB_TO_INVITATION_STATUS[row.status] ?? InvitationStatus.Pending,
    message: row.message ?? null,
    expiresAt: row.expiresAt,
    respondedAt: row.respondedAt ?? null,
    createdAt: row.createdAt,
  };
}

// =====================================================
// Helpers
// =====================================================

function getUserIdOrThrow(ctx: ServiceContext): string {
  if (!ctx.userId) throw new Error('Autenticación requerida');
  return ctx.userId;
}

function hasTimeOverlap(slots: { dayOfWeek: number; startTime: string; endTime: string }[]): boolean {
  const byDay = new Map<number, { start: string; end: string }[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push({ start: slot.startTime, end: slot.endTime });
    byDay.set(slot.dayOfWeek, list);
  }
  for (const [, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].end > sorted[i + 1].start) return true;
    }
  }
  return false;
}

function computeAvailabilityMatrix(
  slots: (PlayerAvailabilityRow & { player: ProfileRow })[],
): AvailabilityMatrixCell[] {
  const map = new Map<string, { dayOfWeek: number; startTime: string; players: ProfileRow[] }>();
  for (const slot of slots) {
    const key = `${slot.dayOfWeek}:${slot.startTime}`;
    const cell = map.get(key) ?? { dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, players: [] };
    cell.players.push(slot.player);
    map.set(key, cell);
  }
  return [...map.values()]
    .sort((a, b) => a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.startTime.localeCompare(b.startTime))
    .map(cell => ({
      dayOfWeek: cell.dayOfWeek,
      startTime: cell.startTime,
      availableCount: cell.players.length,
      availablePlayers: cell.players.map(rowToTeamProfile),
    }));
}

async function invalidateTeamCaches(teamId: string, userId?: string): Promise<void> {
  await Promise.all([
    cacheDelete(`${CACHE_PREFIX.TEAM_DETAIL}${teamId}`),
    cacheDelete(`${CACHE_PREFIX.TEAM_AVAILABILITY}${teamId}`),
    cacheDeletePattern(`${CACHE_PREFIX.USER_TEAMS}*`),
    ...(userId ? [cacheDelete(`${CACHE_PREFIX.USER_TEAMS}${userId}`)] : []),
  ]);
}

// =====================================================
// Service
// =====================================================

async function myTeams(ctx: ServiceContext): Promise<Team[]> {
  const userId = getUserIdOrThrow(ctx);
  const cacheKey = `${CACHE_PREFIX.USER_TEAMS}${userId}`;
  return cacheGetOrSet<Team[]>(
    cacheKey,
    async () => {
      const ids = await teamRepository.getTeamIdsByMemberId(userId);
      const rows = await teamRepository.getTeamsByIds(ids);
      return rows.map(rowToTeam);
    },
    CACHE_TTL.USER_DATA,
  );
}

async function getTeamById(ctx: ServiceContext, id: string): Promise<Team | null> {
  const cacheKey = `${CACHE_PREFIX.TEAM_DETAIL}${id}`;
  return cacheGetOrSet<Team | null>(
    cacheKey,
    async () => {
      const row = await teamRepository.getTeamWithDetails(id);
      return row ? rowToTeam(row) : null;
    },
    CACHE_TTL.SINGLE_ENTITY,
  );
}

async function createTeam(input: CreateTeamInput, ctx: ServiceContext): Promise<TeamResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;
  const formatDb = FORMAT_TO_DB[input.format];

  const teamRow = await teamRepository.createTeam(
    { name: input.name.trim(), format: formatDb, description: input.description ?? null, captainId: userId, createdBy: userId },
    db,
  );
  await teamRepository.addTeamMember(teamRow.id, userId, 'captain', db);
  await cacheDeletePattern(`${CACHE_PREFIX.USER_TEAMS}*`);

  console.info(`[teamService.createTeam] Team created: teamId=${teamRow.id}, captainId=${userId}`);
  const team = await teamRepository.getTeamWithDetails(teamRow.id, db);
  return { success: true, message: 'Equipo creado exitosamente', team: team ? rowToTeam(team) : null };
}

async function updateTeam(input: UpdateTeamInput, ctx: ServiceContext): Promise<TeamResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await teamRepository.getTeamById(input.teamId);
  if (!existing) throw new Error('Equipo no encontrado');
  if (!existing.isActive) throw new Error('El equipo no está activo');
  if (existing.captainId !== userId) throw new Error('Solo el capitán puede modificar el equipo');

  const patch: Partial<Pick<TeamRow, 'name' | 'logoUrl' | 'format' | 'description'>> = {};
  if (input.name !== null && input.name !== undefined) patch.name = input.name.trim();
  if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl ?? null;
  if (input.format !== null && input.format !== undefined) patch.format = FORMAT_TO_DB[input.format];
  if (input.description !== undefined) patch.description = input.description ?? null;

  const updated = await teamRepository.updateTeam(input.teamId, patch, db);
  await invalidateTeamCaches(input.teamId, userId);

  console.info(`[teamService.updateTeam] Updated teamId=${input.teamId}`);
  return { success: true, message: 'Equipo actualizado', team: updated ? rowToTeam(updated) : null };
}

async function deleteTeam(teamId: string, ctx: ServiceContext): Promise<TeamMutationResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await teamRepository.getTeamById(teamId);
  if (!existing) throw new Error('Equipo no encontrado');
  if (existing.captainId !== userId) throw new Error('Solo el capitán puede eliminar el equipo');

  await teamRepository.updateTeam(teamId, { isActive: false }, db);
  await invalidateTeamCaches(teamId, userId);

  console.info(`[teamService.deleteTeam] Soft-deleted teamId=${teamId} by userId=${userId}`);
  return { success: true, message: 'Equipo eliminado' };
}

async function invitePlayer(input: InvitePlayerInput, ctx: ServiceContext): Promise<TeamInvitationResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const team = await teamRepository.getTeamById(input.teamId);
  if (!team) throw new Error('Equipo no encontrado');
  if (!team.isActive) throw new Error('El equipo no está activo');
  if (team.captainId !== userId) throw new Error('Solo el capitán puede invitar jugadores');
  if (input.playerId === userId) throw new Error('No podés invitarte a vos mismo');

  const alreadyMember = await teamRepository.getMemberRecord(input.teamId, input.playerId);
  if (alreadyMember) throw new Error('El jugador ya es miembro del equipo');

  const pendingInvite = await teamRepository.getPendingInvitation(input.teamId, input.playerId);
  if (pendingInvite) throw new Error('Ya existe una invitación pendiente para este jugador');

  const members = await teamRepository.getActiveMembers(input.teamId);
  const maxMembers = FORMAT_MAX_MEMBERS[team.format] ?? 22;
  if (members.length >= maxMembers) throw new Error(`El equipo ya tiene el máximo de ${maxMembers} miembros para el formato ${team.format}`);

  const invitationRow = await teamRepository.createInvitation(
    { teamId: input.teamId, invitedPlayerId: input.playerId, invitedBy: userId, message: input.message ?? null },
    db,
  );

  console.info(`[teamService.invitePlayer] Invitation sent: teamId=${input.teamId}, invitedPlayerId=${input.playerId}`);
  const full = await teamRepository.getInvitationById(invitationRow.id);
  if (!full) return { success: true, message: 'Invitación enviada', invitation: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { success: true, message: 'Invitación enviada', invitation: rowToTeamInvitation(full as any) };
}

async function cancelInvitation(invitationId: string, ctx: ServiceContext): Promise<TeamMutationResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const inv = await teamRepository.getInvitationById(invitationId);
  if (!inv) throw new Error('Invitación no encontrada');
  if (inv.invitedBy !== userId) throw new Error('Solo quien envió la invitación puede cancelarla');
  if (inv.status !== 'pending') throw new Error('Solo se pueden cancelar invitaciones pendientes');

  await teamRepository.deleteInvitation(invitationId, db);
  console.info(`[teamService.cancelInvitation] Cancelled invitationId=${invitationId}`);
  return { success: true, message: 'Invitación cancelada' };
}

async function respondInvitation(input: RespondInvitationInput, ctx: ServiceContext): Promise<TeamMutationResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const inv = await teamRepository.getInvitationById(input.invitationId);
  if (!inv) throw new Error('Invitación no encontrada');
  if (inv.invitedPlayerId !== userId) throw new Error('No podés responder invitaciones de otros usuarios');
  if (inv.status !== 'pending') throw new Error('Esta invitación ya fue respondida');
  if (new Date(inv.expiresAt) < new Date()) throw new Error('La invitación expiró');

  const now = new Date().toISOString();

  if (input.accept) {
    const team = await teamRepository.getTeamById(inv.teamId);
    if (!team || !team.isActive) throw new Error('El equipo ya no está disponible');

    // Race condition check: validar que el equipo no se llenó mientras la invitación estaba pendiente
    const members = await teamRepository.getActiveMembers(inv.teamId);
    const maxMembers = FORMAT_MAX_MEMBERS[team.format] ?? 22;
    if (members.length >= maxMembers) throw new Error('El equipo se llenó antes de que pudieras aceptar');

    await teamRepository.addTeamMember(inv.teamId, userId, 'member', db);
    await teamRepository.updateInvitationStatus(input.invitationId, 'accepted', now, db);
    await invalidateTeamCaches(inv.teamId, userId);

    console.info(`[teamService.respondInvitation] Accepted: invitationId=${input.invitationId}, userId=${userId}`);
    return { success: true, message: 'Invitación aceptada. ¡Bienvenido al equipo!' };
  } else {
    await teamRepository.updateInvitationStatus(input.invitationId, 'rejected', now, db);
    console.info(`[teamService.respondInvitation] Rejected: invitationId=${input.invitationId}, userId=${userId}`);
    return { success: true, message: 'Invitación rechazada' };
  }
}

async function claimCaptain(teamId: string, ctx: ServiceContext): Promise<TeamResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const team = await teamRepository.getTeamById(teamId);
  if (!team) throw new Error('Equipo no encontrado');
  if (!team.isActive) throw new Error('El equipo no está activo');
  if (team.captainId !== null) throw new Error('El equipo ya tiene un capitán');

  const memberRecord = await teamRepository.getMemberRecord(teamId, userId);
  if (!memberRecord) throw new Error('Debes ser miembro del equipo para reclamar la capitanía');

  await teamRepository.updateTeam(teamId, { captainId: userId }, db);
  await teamRepository.updateMemberRole(teamId, userId, 'captain', db);
  await invalidateTeamCaches(teamId, userId);

  console.info(`[teamService.claimCaptain] userId=${userId} claimed captain of teamId=${teamId}`);
  const updated = await teamRepository.getTeamWithDetails(teamId);
  return { success: true, message: 'Ahora sos el capitán del equipo', team: updated ? rowToTeam(updated) : null };
}

async function removeMember(teamId: string, playerId: string, ctx: ServiceContext): Promise<TeamMutationResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const team = await teamRepository.getTeamById(teamId);
  if (!team) throw new Error('Equipo no encontrado');
  if (team.captainId !== userId) throw new Error('Solo el capitán puede remover miembros');
  if (playerId === userId) throw new Error('No podés removerte a vos mismo. Usá "Abandonar equipo" en su lugar');

  const targetMember = await teamRepository.getMemberRecord(teamId, playerId);
  if (!targetMember) throw new Error('El jugador no es miembro del equipo');

  await teamRepository.removeTeamMember(teamId, playerId, db);
  await teamRepository.deleteAvailabilityByPlayerTeam(playerId, teamId, db);
  await invalidateTeamCaches(teamId, userId);

  console.info(`[teamService.removeMember] Removed playerId=${playerId} from teamId=${teamId} by captainId=${userId}`);
  return { success: true, message: 'Miembro removido del equipo' };
}

async function leaveTeam(teamId: string, ctx: ServiceContext): Promise<TeamMutationResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const team = await teamRepository.getTeamById(teamId);
  if (!team) throw new Error('Equipo no encontrado');
  if (!team.isActive) throw new Error('El equipo no está activo');

  const memberRecord = await teamRepository.getMemberRecord(teamId, userId);
  if (!memberRecord) throw new Error('No sos miembro de este equipo');

  const isCaptain = team.captainId === userId;

  if (isCaptain) {
    const allMembers = await teamRepository.getActiveMembers(teamId);
    const otherMembers = allMembers.filter(m => m.playerId !== userId);

    if (otherMembers.length === 0) {
      // Último miembro: soft-delete del equipo
      await teamRepository.updateTeam(teamId, { isActive: false, captainId: null }, db);
      await teamRepository.removeTeamMember(teamId, userId, db);
      await teamRepository.deleteAvailabilityByPlayerTeam(userId, teamId, db);
      await invalidateTeamCaches(teamId, userId);
      console.info(`[teamService.leaveTeam] Last member left, team soft-deleted: teamId=${teamId}`);
      return { success: true, message: 'Abandonaste el equipo. El equipo fue disuelto por no tener más miembros.' };
    }

    // Transferir capitanía al miembro más antiguo (primer resultado de getActiveMembers, ordenado por joinedAt ASC)
    const newCaptain = otherMembers[0];
    await teamRepository.updateTeam(teamId, { captainId: newCaptain.playerId }, db);
    await teamRepository.updateMemberRole(teamId, newCaptain.playerId, 'captain', db);
    console.info(`[teamService.leaveTeam] Captain transferred to playerId=${newCaptain.playerId} in teamId=${teamId}`);
  }

  await teamRepository.removeTeamMember(teamId, userId, db);
  await teamRepository.deleteAvailabilityByPlayerTeam(userId, teamId, db);
  await invalidateTeamCaches(teamId, userId);

  console.info(`[teamService.leaveTeam] userId=${userId} left teamId=${teamId}`);
  return { success: true, message: 'Abandonaste el equipo exitosamente' };
}

async function setMyAvailability(input: SetAvailabilityInput, ctx: ServiceContext): Promise<TeamMutationResult> {
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const team = await teamRepository.getTeamById(input.teamId);
  if (!team) throw new Error('Equipo no encontrado');
  if (!team.isActive) throw new Error('El equipo no está activo');

  const memberRecord = await teamRepository.getMemberRecord(input.teamId, userId);
  if (!memberRecord) throw new Error('Debes ser miembro del equipo para configurar disponibilidad');

  if (input.slots.length > 7 * 24) throw new Error('Demasiados horarios definidos');

  if (hasTimeOverlap(input.slots)) throw new Error('Los horarios de disponibilidad no pueden superponerse dentro del mismo día');

  await teamRepository.deleteAvailabilityByPlayerTeam(userId, input.teamId, db);

  if (input.slots.length > 0) {
    await teamRepository.insertAvailabilitySlots(
      input.slots.map(s => ({
        playerId: userId,
        teamId: input.teamId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        isRecurrent: true,
      })),
      db,
    );
  }

  await cacheDelete(`${CACHE_PREFIX.TEAM_AVAILABILITY}${input.teamId}`);
  console.info(`[teamService.setMyAvailability] Saved ${input.slots.length} slots for userId=${userId} in teamId=${input.teamId}`);
  return { success: true, message: 'Disponibilidad guardada exitosamente' };
}

async function getTeamAvailabilityMatrix(teamId: string, ctx: ServiceContext): Promise<AvailabilityMatrixCell[]> {
  const userId = getUserIdOrThrow(ctx);

  const team = await teamRepository.getTeamById(teamId);
  if (!team) throw new Error('Equipo no encontrado');

  const member = await teamRepository.getMemberRecord(teamId, userId);
  if (!member) throw new Error('No tenés acceso a la disponibilidad de este equipo');

  const cacheKey = `${CACHE_PREFIX.TEAM_AVAILABILITY}${teamId}`;
  return cacheGetOrSet<AvailabilityMatrixCell[]>(
    cacheKey,
    async () => {
      const slots = await teamRepository.getAvailabilityByTeam(teamId);
      return computeAvailabilityMatrix(slots);
    },
    CACHE_TTL.DYNAMIC_DATA,
  );
}

async function myPendingInvitations(ctx: ServiceContext): Promise<TeamInvitation[]> {
  const userId = getUserIdOrThrow(ctx);
  const rows = await teamRepository.getPendingInvitationsByPlayerId(userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map(r => rowToTeamInvitation(r as any));
}

async function getMyTeamAvailability(teamId: string, ctx: ServiceContext): Promise<PlayerAvailabilitySlot[]> {
  const userId = getUserIdOrThrow(ctx);

  const member = await teamRepository.getMemberRecord(teamId, userId);
  if (!member) throw new Error('No sos miembro de este equipo');

  const rows = await teamRepository.getAvailabilityByPlayerAndTeam(userId, teamId);
  return rows.map(r => ({
    id: r.id,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
    isRecurrent: r.isRecurrent,
  }));
}

async function searchPlayers(search: string, ctx: ServiceContext): Promise<TeamProfile[]> {
  getUserIdOrThrow(ctx);
  const trimmed = search.trim();
  if (trimmed.length < 2) return [];
  const rows = await teamRepository.searchProfiles(trimmed, 10);
  return rows.map(rowToTeamProfile);
}

async function searchTeams(search: string, ctx: ServiceContext): Promise<Team[]> {
  getUserIdOrThrow(ctx);
  const trimmed = search.trim();
  if (trimmed.length < 2) return [];
  // Reutiliza getTeamsByIds luego de buscar por nombre en la tabla teams
  const { data } = await supabase
    .from('teams')
    .select(`
      id, name, "captainId", "logoUrl", format, description, "isActive", "createdBy", "createdAt", "updatedAt",
      captain:profiles!teams_captainId_fkey(id, "displayName", "avatarUrl", "preferredPosition"),
      members:teamMembers!teamMembers_teamId_fkey(
        id, "teamId", "playerId", role, "joinedAt",
        player:profiles!teamMembers_playerId_fkey(id, "displayName", "avatarUrl", "preferredPosition")
      )
    `)
    .eq('isActive', true)
    .ilike('name', `%${trimmed}%`)
    .limit(10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(rowToTeam);
}

async function listTeamInvitations(teamId: string, ctx: ServiceContext): Promise<TeamInvitation[]> {
  const userId = getUserIdOrThrow(ctx);

  const teamRow = await teamRepository.getTeamWithDetails(teamId);
  if (!teamRow) throw new Error('Equipo no encontrado');
  if (teamRow.captainId !== userId) throw new Error('Solo el capitán puede ver las invitaciones del equipo');

  const teamGql = rowToTeam(teamRow);
  const rows = await teamRepository.getInvitationsByTeamId(teamId);

  return rows.map(row => ({
    id: row.id,
    team: teamGql,
    invitedPlayer: rowToTeamProfile(row.invitedPlayer),
    invitedBy: rowToTeamProfile(row.invitedByProfile),
    status: DB_TO_INVITATION_STATUS[row.status] ?? InvitationStatus.Pending,
    message: row.message ?? null,
    expiresAt: row.expiresAt,
    respondedAt: row.respondedAt ?? null,
    createdAt: row.createdAt,
  }));
}

async function getTeamEnrollments(teamId: string, ctx: ServiceContext): Promise<TeamEnrollment[]> {
  getUserIdOrThrow(ctx);
  const rows = await teamRepository.getTeamEnrollments(teamId);
  return rows.map(r => ({
    id: r.id,
    teamId,
    tournamentId: r.tournamentId,
    tournamentName: r.tournament.name,
    tournamentStatus: DB_TO_TOURNAMENT_STATUS[r.tournament.status] ?? TournamentStatus.Registration,
    format: DB_TO_FORMAT[r.tournament.format] ?? MatchFormat.SevenVsSeven,
    teamCount: r.tournament.teamCount,
    enrolledAt: r.createdAt,
  }));
}

async function enrollTeamInTournament(
  teamId: string,
  tournamentId: string,
  ctx: ServiceContext,
): Promise<EnrollTeamResult> {
  /*
   * Decision Context (F10):
   * - Inscribe el equipo permanente en un torneo y computa warnings de disponibilidad.
   * - La inscripción NO se bloquea por baja disponibilidad: el warning es solo informativo.
   * - La verificación de disponibilidad compara playerAvailability del equipo vs
   *   scheduledAt de los fixtureMatches del torneo (día de semana + hora).
   * - Si scheduledAt es null en algunos fixtures (torneo sin fechas asignadas aún),
   *   esas jornadas se omiten del cálculo de warnings.
   * - Previously fixed bugs: none relevant.
   */
  const userId = getUserIdOrThrow(ctx);
  const db = ctx.supabase ?? supabase;

  const team = await teamRepository.getTeamWithDetails(teamId);
  if (!team) throw new Error('Equipo no encontrado');
  if (!team.isActive) throw new Error('El equipo no está activo');
  if (team.captainId !== userId) throw new Error('Solo el capitán puede inscribir el equipo a torneos');

  const tournament = await teamRepository.getTournamentBasic(tournamentId);
  if (!tournament) throw new Error('Torneo no encontrado');
  if (tournament.status !== 'registration') throw new Error('El torneo no está en período de inscripción');

  const existing = await teamRepository.getEnrollmentByPermanentTeamAndTournament(teamId, tournamentId);
  if (existing) throw new Error('El equipo ya está inscripto en este torneo');

  // Compute availability warnings (F10)
  const [fixtures, availability] = await Promise.all([
    teamRepository.getFixturesByTournament(tournamentId),
    teamRepository.getAvailabilityByTeam(teamId),
  ]);

  const minPlayers = FORMAT_MIN_PLAYERS[tournament.format] ?? tournament.playersPerTeam;
  const memberCount = team.members?.length ?? 0;
  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const warnings: string[] = [];

  for (const fixture of fixtures) {
    if (!fixture.scheduledAt) continue;
    const date = new Date(fixture.scheduledAt);
    const dayOfWeek = date.getUTCDay();
    const hour = date.getUTCHours();
    const timeStr = `${String(hour).padStart(2, '0')}:00`;

    const availablePlayers = new Set(
      availability
        .filter(a =>
          a.dayOfWeek === dayOfWeek &&
          a.startTime.slice(0, 5) <= timeStr &&
          a.endTime.slice(0, 5) > timeStr,
        )
        .map(a => a.playerId),
    );

    if (availablePlayers.size < minPlayers) {
      warnings.push(
        `Ronda ${fixture.round} (${DAY_NAMES[dayOfWeek]} ${timeStr}): ` +
        `solo ${availablePlayers.size} de ${memberCount} jugadores disponibles ` +
        `(mínimo requerido: ${minPlayers})`,
      );
    }
  }

  await teamRepository.enrollPermanentTeamInTournament(
    { teamId, tournamentId, name: team.name, captainId: userId },
    db,
  );

  await cacheDelete(`${CACHE_PREFIX.USER_TEAMS}${userId}`);
  console.info(`[teamService.enrollTeamInTournament] teamId=${teamId} enrolled in tournamentId=${tournamentId}, warnings=${warnings.length}`);

  return {
    success: true,
    message: warnings.length > 0
      ? 'Equipo inscripto. Revisá las advertencias de disponibilidad.'
      : 'Equipo inscripto exitosamente al torneo.',
    warnings,
  };
}

/** Usado por tournamentService para validar F9: solo capitanes pueden crear torneos. */
export async function isCaptainOfAnyTeam(userId: string): Promise<boolean> {
  const teams = await teamRepository.getTeamsByCaptainId(userId);
  return teams.length > 0;
}

export const teamService = {
  myTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  invitePlayer,
  cancelInvitation,
  respondInvitation,
  claimCaptain,
  removeMember,
  leaveTeam,
  setMyAvailability,
  getTeamAvailabilityMatrix,
  myPendingInvitations,
  searchPlayers,
  searchTeams,
  listTeamInvitations,
  getMyTeamAvailability,
  getTeamEnrollments,
  enrollTeamInTournament,
};
