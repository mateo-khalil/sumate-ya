/**
 * Tournament Resolver - GraphQL queries and mutations for tournament flows.
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
  schedule: z
    .array(
      z.object({
        slotId: z.string().regex(UUID_REGEX, 'slotId invalido'),
        date: z.string().regex(DATE_REGEX, 'date debe ser YYYY-MM-DD'),
      }),
    )
    .min(1, 'Selecciona al menos un horario')
    .max(256, 'Demasiados horarios seleccionados'),
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

function invalidTeamResult(message: string) {
  return { success: false, teamId: null, message: `Datos invalidos: ${message}`, tournament: null };
}

const Query: QueryResolvers = {
  tournaments: async () => tournamentService.listRegistrationTournaments({}),

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
      return await tournamentService.createTournament(parsed.data, {
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
};

export const tournamentResolvers = { Query, Mutation };
