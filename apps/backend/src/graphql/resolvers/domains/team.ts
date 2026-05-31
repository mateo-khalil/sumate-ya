/**
 * Team Resolver - queries y mutations para equipos permanentes, invitaciones, disponibilidad.
 *
 * Decision Context:
 * - Issue #137: equipos permanentes (Opción A arquitectónica).
 * - Input validation con Zod en el resolver; validaciones de negocio en el service.
 * - UUID_REGEX permisivo: acepta UUIDs de cualquier versión.
 * - Todos los mutations crean un user-scoped client y lo pasan al service via ServiceContext.
 * - Previously fixed bugs: none relevant.
 */

import { z } from 'zod';
import { createUserClient } from '../../../config/supabase.js';
import { teamService } from '../../../services/teamService.js';
import { requireAuth } from '../../../types/context.js';
import { MatchFormat } from '../../generated/graphql.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID = z.string().regex(UUID_REGEX, 'ID inválido');

const FORMAT_ENUM = z.enum([
  MatchFormat.FiveVsFive,
  MatchFormat.SevenVsSeven,
  MatchFormat.TenVsTen,
  MatchFormat.ElevenVsEleven,
]);

const CreateTeamSchema = z.object({
  name: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(100, 'El nombre no puede superar 100 caracteres'),
  format: FORMAT_ENUM,
  description: z.string().max(500, 'La descripción no puede superar 500 caracteres').optional().nullable(),
});

const UpdateTeamSchema = z.object({
  teamId: UUID,
  name: z.string().trim().min(3).max(100).optional().nullable(),
  logoUrl: z.string().url('URL de logo inválida').max(500).optional().nullable(),
  format: FORMAT_ENUM.optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

const InvitePlayerSchema = z.object({
  teamId: UUID,
  playerId: UUID,
  message: z.string().max(300, 'El mensaje no puede superar 300 caracteres').optional().nullable(),
});

const RespondInvitationSchema = z.object({
  invitationId: UUID,
  accept: z.boolean(),
});

const AvailabilitySlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6, 'dayOfWeek debe estar entre 0 y 6'),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'startTime debe tener formato HH:mm'),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'endTime debe tener formato HH:mm'),
}).refine(s => s.endTime > s.startTime, { message: 'endTime debe ser posterior a startTime' });

const SetAvailabilitySchema = z.object({
  teamId: UUID,
  slots: z.array(AvailabilitySlotSchema).max(7 * 24, 'Demasiados horarios'),
});

function invalidTeamResult(message: string) {
  return { success: false, message: `Datos inválidos: ${message}`, team: null };
}

function invalidMutationResult(message: string) {
  return { success: false, message: `Datos inválidos: ${message}` };
}

function invalidInvitationResult(message: string) {
  return { success: false, message: `Datos inválidos: ${message}`, invitation: null };
}

const Query: QueryResolvers = {
  myTeams: async (_parent, _args, ctx) => {
    const user = requireAuth(ctx);
    try {
      return await teamService.myTeams({ userId: user.id, supabase: undefined });
    } catch (error) {
      console.error(`[teamResolver.myTeams] Failed for userId=${user.id}:`, error);
      return [];
    }
  },

  team: async (_parent, args, _ctx) => {
    const parsed = UUID.safeParse(args.id);
    if (!parsed.success) return null;
    try {
      return await teamService.getTeamById({}, parsed.data);
    } catch (error) {
      console.error(`[teamResolver.team] Failed for teamId=${args.id}:`, error);
      return null;
    }
  },

  myPendingInvitations: async (_parent, _args, ctx) => {
    const user = requireAuth(ctx);
    try {
      return await teamService.myPendingInvitations({ userId: user.id });
    } catch (error) {
      console.error(`[teamResolver.myPendingInvitations] Failed for userId=${user.id}:`, error);
      return [];
    }
  },

  teamAvailabilityMatrix: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const parsed = UUID.safeParse(args.teamId);
    if (!parsed.success) return [];
    try {
      return await teamService.getTeamAvailabilityMatrix(parsed.data, { userId: user.id });
    } catch (error) {
      console.error(`[teamResolver.teamAvailabilityMatrix] Failed for teamId=${args.teamId}:`, error);
      return [];
    }
  },

  searchPlayers: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const parsed = z.string().min(2, 'Mínimo 2 caracteres').max(80).safeParse(args.search);
    if (!parsed.success) return [];
    try {
      return await teamService.searchPlayers(parsed.data, { userId: user.id });
    } catch (error) {
      console.error(`[teamResolver.searchPlayers] Failed for userId=${user.id}:`, error);
      return [];
    }
  },

  searchTeams: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const parsed = z.string().min(2).max(80).safeParse(args.search);
    if (!parsed.success) return [];
    try {
      return await teamService.searchTeams(parsed.data, { userId: user.id });
    } catch (error) {
      console.error(`[teamResolver.searchTeams] Failed for userId=${user.id}:`, error);
      return [];
    }
  },

  teamInvitations: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const parsed = UUID.safeParse(args.teamId);
    if (!parsed.success) return [];
    try {
      return await teamService.listTeamInvitations(parsed.data, { userId: user.id });
    } catch (error) {
      console.error(`[teamResolver.teamInvitations] Failed for teamId=${args.teamId}:`, error);
      return [];
    }
  },

  myTeamAvailability: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const parsed = UUID.safeParse(args.teamId);
    if (!parsed.success) return [];
    try {
      return await teamService.getMyTeamAvailability(parsed.data, { userId: user.id });
    } catch (error) {
      console.error(`[teamResolver.myTeamAvailability] Failed for teamId=${args.teamId}:`, error);
      return [];
    }
  },

  teamEnrollments: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const parsed = UUID.safeParse(args.teamId);
    if (!parsed.success) return [];
    try {
      return await teamService.getTeamEnrollments(parsed.data, { userId: user.id });
    } catch (error) {
      console.error(`[teamResolver.teamEnrollments] Failed for teamId=${args.teamId}:`, error);
      return [];
    }
  },
};

const Mutation: MutationResolvers = {
  createTeam: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = CreateTeamSchema.safeParse(args.input);
    if (!parsed.success) {
      return invalidTeamResult(parsed.error.issues.map(i => i.message).join('; '));
    }
    try {
      return await teamService.createTeam(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear el equipo';
      console.error(`[teamResolver.createTeam] Failed for userId=${user.id}:`, error);
      return { success: false, message, team: null };
    }
  },

  updateTeam: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = UpdateTeamSchema.safeParse(args.input);
    if (!parsed.success) {
      return invalidTeamResult(parsed.error.issues.map(i => i.message).join('; '));
    }
    try {
      return await teamService.updateTeam(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar el equipo';
      console.error(`[teamResolver.updateTeam] Failed for userId=${user.id}:`, error);
      return { success: false, message, team: null };
    }
  },

  deleteTeam: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = UUID.safeParse(args.teamId);
    if (!parsed.success) return invalidMutationResult('teamId inválido');
    try {
      return await teamService.deleteTeam(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al eliminar el equipo';
      console.error(`[teamResolver.deleteTeam] Failed for userId=${user.id}:`, error);
      return { success: false, message };
    }
  },

  invitePlayer: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = InvitePlayerSchema.safeParse(args.input);
    if (!parsed.success) {
      return invalidInvitationResult(parsed.error.issues.map(i => i.message).join('; '));
    }
    try {
      return await teamService.invitePlayer(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al enviar la invitación';
      console.error(`[teamResolver.invitePlayer] Failed for userId=${user.id}:`, error);
      return { success: false, message, invitation: null };
    }
  },

  cancelInvitation: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = UUID.safeParse(args.invitationId);
    if (!parsed.success) return invalidMutationResult('invitationId inválido');
    try {
      return await teamService.cancelInvitation(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cancelar la invitación';
      console.error(`[teamResolver.cancelInvitation] Failed for userId=${user.id}:`, error);
      return { success: false, message };
    }
  },

  respondInvitation: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = RespondInvitationSchema.safeParse(args.input);
    if (!parsed.success) {
      return invalidMutationResult(parsed.error.issues.map(i => i.message).join('; '));
    }
    try {
      return await teamService.respondInvitation(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al responder la invitación';
      console.error(`[teamResolver.respondInvitation] Failed for userId=${user.id}:`, error);
      return { success: false, message };
    }
  },

  claimCaptain: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = UUID.safeParse(args.teamId);
    if (!parsed.success) return invalidTeamResult('teamId inválido');
    try {
      return await teamService.claimCaptain(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al reclamar la capitanía';
      console.error(`[teamResolver.claimCaptain] Failed for userId=${user.id}:`, error);
      return { success: false, message, team: null };
    }
  },

  removeMember: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const teamParsed = UUID.safeParse(args.teamId);
    const playerParsed = UUID.safeParse(args.playerId);
    if (!teamParsed.success || !playerParsed.success) return invalidMutationResult('IDs inválidos');
    try {
      return await teamService.removeMember(teamParsed.data, playerParsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al remover el miembro';
      console.error(`[teamResolver.removeMember] Failed for userId=${user.id}:`, error);
      return { success: false, message };
    }
  },

  leaveTeam: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = UUID.safeParse(args.teamId);
    if (!parsed.success) return invalidMutationResult('teamId inválido');
    try {
      return await teamService.leaveTeam(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al abandonar el equipo';
      console.error(`[teamResolver.leaveTeam] Failed for userId=${user.id}:`, error);
      return { success: false, message };
    }
  },

  setMyAvailability: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = SetAvailabilitySchema.safeParse(args.input);
    if (!parsed.success) {
      return invalidMutationResult(parsed.error.issues.map(i => i.message).join('; '));
    }
    try {
      return await teamService.setMyAvailability(parsed.data, { userId: user.id, supabase: userClient });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al guardar la disponibilidad';
      console.error(`[teamResolver.setMyAvailability] Failed for userId=${user.id}:`, error);
      return { success: false, message };
    }
  },

  enrollTeamInTournament: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;
    const teamParsed = UUID.safeParse(args.teamId);
    const tournParsed = UUID.safeParse(args.tournamentId);
    if (!teamParsed.success || !tournParsed.success) {
      return { success: false, message: 'IDs inválidos', warnings: [] };
    }
    try {
      return await teamService.enrollTeamInTournament(
        teamParsed.data, tournParsed.data, { userId: user.id, supabase: userClient }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al inscribir el equipo';
      console.error(`[teamResolver.enrollTeamInTournament] Failed for userId=${user.id}:`, error);
      return { success: false, message, warnings: [] };
    }
  },
};

export const teamResolvers = { Query, Mutation };
