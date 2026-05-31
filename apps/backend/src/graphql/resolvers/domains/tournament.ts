/**
 * Tournament Resolver - GraphQL queries and mutations for tournament flows.
 *
 * Decision Context:
 * - leaveTournament: el resolver valida el input con Zod antes de pasar al service.
 *   El service aplica las 8 validaciones de negocio en orden estricto.
 *   El user-scoped client se pasa al service para que las escrituras respeten RLS.
 * Previously fixed bugs: none relevant.
 */

import { z } from 'zod';
import { createUserClient } from '../../../config/supabase.js';
import { tournamentService } from '../../../services/tournamentService.js';
import { requireAuth } from '../../../types/context.js';
import { MatchFormat } from '../../generated/graphql.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CreateTournamentSchema = z.object({
  clubId: z.string().regex(UUID_REGEX, 'clubId invalido'),
  name: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120),
  format: z.enum([
    MatchFormat.FiveVsFive,
    MatchFormat.SevenVsSeven,
    MatchFormat.TenVsTen,
    MatchFormat.ElevenVsEleven,
  ]),
  teamCount: z.number().int().min(2, 'Minimo 2 equipos').max(32, 'Maximo 32 equipos'),
  playersPerTeam: z.number().int().min(1, 'Minimo 1 jugador por equipo').max(30),
  description: z.string().max(700, 'La descripcion no puede superar 700 caracteres').optional().nullable(),
  // Issue #132: schedule ahora es OPCIONAL — si está vacío/ausente se usa auto-schedule
  schedule: z
    .array(
      z.object({
        slotId: z.string().regex(UUID_REGEX, 'slotId invalido'),
        date: z.string().regex(DATE_REGEX, 'date debe ser YYYY-MM-DD'),
      }),
    )
    .max(256, 'Demasiados horarios seleccionados')
    .optional()
    .nullable(),
  // Nuevos campos para auto-schedule (issue #132)
  tournamentType: z.enum(['ROUND_ROBIN', 'SINGLE_ELIMINATION', 'GROUP_STAGE_ELIMINATION']).optional().nullable(),
  durationMode: z.enum(['SINGLE_DAY', 'MULTI_DAY']).optional().nullable(),
  firstMatchday: z.string().regex(DATE_REGEX, 'firstMatchday debe ser YYYY-MM-DD').optional().nullable(),
  cadenceDays: z.number().int().min(1).max(365).optional().nullable(),
  specificDays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  groupCount: z.number().int().min(2).max(16).optional().nullable(),
  teamsPerGroup: z.number().int().min(2).max(8).optional().nullable(),
  advancingPerGroup: z.number().int().min(1).max(7).optional().nullable(),
});

const RegisterTournamentTeamSchema = z.object({
  tournamentId: z.string().regex(UUID_REGEX, 'tournamentId invalido'),
  name: z.string().trim().min(2, 'El nombre del equipo debe tener al menos 2 caracteres').max(80),
});

const JoinTournamentSchema = z.object({
  tournamentId: z.string().regex(UUID_REGEX, 'tournamentId invalido'),
  teamName: z.string().trim().min(2, 'El nombre del equipo debe tener al menos 2 caracteres').max(80),
  memberIds: z.array(z.string().regex(UUID_REGEX, 'memberId invalido')).max(30).optional().nullable(),
});

const TournamentTeamMemberSchema = z.object({
  tournamentId: z.string().regex(UUID_REGEX, 'tournamentId invalido'),
  teamId: z.string().regex(UUID_REGEX, 'teamId invalido'),
  playerId: z.string().regex(UUID_REGEX, 'playerId invalido'),
});

const LeaveTournamentSchema = z.object({
  tournamentId: z.string().regex(UUID_REGEX, 'tournamentId invalido'),
  teamId: z.string().regex(UUID_REGEX, 'teamId invalido'),
  reason: z.string().trim().max(500, 'El motivo no puede superar 500 caracteres').optional().nullable(),
});

function invalidTeamResult(message: string) {
  return { success: false, teamId: null, message: `Datos invalidos: ${message}`, tournament: null };
}

function invalidLeaveResult(message: string) {
  return { success: false, message: `Datos invalidos: ${message}`, tournamentStatus: null, remainingTeams: null };
}

const SchedulePreviewSchema = z.object({
  tournamentType: z.enum(['ROUND_ROBIN', 'SINGLE_ELIMINATION', 'GROUP_STAGE_ELIMINATION']),
  teamCount: z.number().int().min(2).max(32),
  firstMatchday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'firstMatchday debe ser YYYY-MM-DD'),
  cadenceDays: z.number().int().min(1).max(365).optional().nullable(),
  durationMode: z.enum(['SINGLE_DAY', 'MULTI_DAY']),
  groupCount: z.number().int().min(2).max(16).optional().nullable(),
  teamsPerGroup: z.number().int().min(2).max(8).optional().nullable(),
});

const InviteTeamSchema = z.object({
  tournamentId: z.string().regex(UUID_REGEX, 'tournamentId invalido'),
  teamId: z.string().regex(UUID_REGEX, 'teamId invalido'),
  message: z.string().max(500).optional().nullable(),
});

const Query: QueryResolvers = {
  tournaments: async (_parent, args) => tournamentService.listTournaments({}, args.filters),

  tournament: async (_parent, args) => {
    const parsed = z.string().regex(UUID_REGEX, 'id invalido').safeParse(args.id);
    if (!parsed.success) return null;

    return tournamentService.getTournamentById({}, parsed.data);
  },

  tournamentEligiblePlayers: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const parsed = z.string().regex(UUID_REGEX, 'tournamentId invalido').safeParse(args.tournamentId);
    if (!parsed.success) return [];

    return tournamentService.searchTournamentEligiblePlayers({}, parsed.data, args.search ?? null);
  },

  schedulePreview: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const parsed = SchedulePreviewSchema.safeParse(args.input);
    if (!parsed.success) return [];
    try {
      return tournamentService.getSchedulePreview(parsed.data as Parameters<typeof tournamentService.getSchedulePreview>[0]);
    } catch (e) {
      console.error('[tournamentResolver.schedulePreview]', e);
      return [];
    }
  },

  myTournamentInvitations: async (_parent, _args, ctx) => {
    const user = requireAuth(ctx);
    try {
      return await tournamentService.getMyTournamentInvitations({ userId: user.id });
    } catch (e) {
      console.error('[tournamentResolver.myTournamentInvitations]', e);
      return [];
    }
  },
};

const Mutation: MutationResolvers = {
  createTournament: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = CreateTournamentSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return { success: false, tournamentId: null, message: `Datos invalidos: ${message}`, tournament: null };
    }

    try {
      // Issue #132: si tiene firstMatchday y NO tiene schedule → auto-schedule path
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputData = parsed.data as any;
      const useAutoSchedule = !!inputData.firstMatchday && (!inputData.schedule || inputData.schedule.length === 0);
      if (useAutoSchedule) {
        return await tournamentService.createTournamentAutoSchedule(inputData, { userId: user.id, supabase: userClient });
      }
      return await tournamentService.createTournament(inputData, {
        userId: user.id,
        supabase: userClient,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear el torneo';
      console.error(`[tournamentResolver.createTournament] Failed for userId=${user.id}:`, error);
      return { success: false, tournamentId: null, message, tournament: null };
    }
  },

  registerTournamentTeam: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);

    const parsed = RegisterTournamentTeamSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return invalidTeamResult(message);
    }

    try {
      return await tournamentService.registerTournamentTeam(parsed.data, { userId: user.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al inscribir el equipo';
      console.error(`[tournamentResolver.registerTournamentTeam] Failed for userId=${user.id}:`, error);
      return { success: false, teamId: null, message, tournament: null };
    }
  },

  joinTournament: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);

    const parsed = JoinTournamentSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return invalidTeamResult(message);
    }

    try {
      return await tournamentService.joinTournament(
        { ...parsed.data, memberIds: parsed.data.memberIds ?? [] },
        { userId: user.id },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al inscribir el equipo';
      console.error(`[tournamentResolver.joinTournament] Failed for userId=${user.id}:`, error);
      return { success: false, teamId: null, message, tournament: null };
    }
  },

  addTournamentTeamMember: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);

    const parsed = TournamentTeamMemberSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return invalidTeamResult(message);
    }

    try {
      return await tournamentService.addTournamentTeamMember(parsed.data, { userId: user.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al agregar jugador';
      console.error(`[tournamentResolver.addTournamentTeamMember] Failed for userId=${user.id}:`, error);
      return { success: false, teamId: null, message, tournament: null };
    }
  },

  removeTournamentTeamMember: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);

    const parsed = TournamentTeamMemberSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return invalidTeamResult(message);
    }

    try {
      return await tournamentService.removeTournamentTeamMember(parsed.data, { userId: user.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al quitar jugador';
      console.error(`[tournamentResolver.removeTournamentTeamMember] Failed for userId=${user.id}:`, error);
      return { success: false, teamId: null, message, tournament: null };
    }
  },

  leaveTournament: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = LeaveTournamentSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return invalidLeaveResult(message);
    }

    try {
      return await tournamentService.leaveTournament(
        {
          tournamentId: parsed.data.tournamentId,
          teamId: parsed.data.teamId,
          reason: parsed.data.reason ?? null,
        },
        { userId: user.id, supabase: userClient },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al retirar el equipo del torneo';
      console.error(`[tournamentResolver.leaveTournament] Failed for userId=${user.id}:`, error);
      return { success: false, message, tournamentStatus: null, remainingTeams: null };
    }
  },

  // Issue #132: invitar equipo a torneo
  inviteTeamToTournament: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = InviteTeamSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return { success: false, message: `Datos inválidos: ${message}`, invitation: null };
    }
    try {
      return await tournamentService.inviteTeamToTournament(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al enviar la invitación';
      console.error(`[tournamentResolver.inviteTeamToTournament] Failed for userId=${user.id}:`, error);
      return { success: false, message, invitation: null };
    }
  },

  // Issue #132: responder invitación (aceptar/rechazar)
  respondTournamentInvitation: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const invParsed = z.string().regex(UUID_REGEX, 'invitationId inválido').safeParse(args.invitationId);
    if (!invParsed.success) return { success: false, message: 'invitationId inválido' };
    try {
      return await tournamentService.respondTournamentInvitation(invParsed.data, args.accept, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al responder la invitación';
      console.error(`[tournamentResolver.respondTournamentInvitation] Failed for userId=${user.id}:`, error);
      return { success: false, message };
    }
  },
};

export const tournamentResolvers = { Query, Mutation };
