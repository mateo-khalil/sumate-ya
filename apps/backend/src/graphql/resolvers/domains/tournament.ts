/**
 * Tournament Resolver - GraphQL mutation for tournament creation.
 *
 * Decision Context:
 * - Both players and club_admins can create tournaments, so the resolver only requires
 *   authentication and delegates business authorization to the service.
 * - User-scoped client is passed into writes so RLS can enforce organizerId = auth.uid().
 * - Errors are returned in the CreateTournamentResult shape for consistent form UX.
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
  clubId: z.string().regex(UUID_REGEX, 'clubId inválido'),
  name: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(120),
  format: z.enum([
    MatchFormat.FiveVsFive,
    MatchFormat.SevenVsSeven,
    MatchFormat.TenVsTen,
    MatchFormat.ElevenVsEleven,
  ]),
  teamCount: z.number().int().min(2, 'Mínimo 2 equipos').max(32, 'Máximo 32 equipos'),
  playersPerTeam: z.number().int().min(1, 'Mínimo 1 jugador por equipo').max(30),
  description: z.string().max(700, 'La descripción no puede superar 700 caracteres').optional().nullable(),
  schedule: z
    .array(
      z.object({
        slotId: z.string().regex(UUID_REGEX, 'slotId inválido'),
        date: z.string().regex(DATE_REGEX, 'date debe ser YYYY-MM-DD'),
      }),
    )
    .min(1, 'Seleccioná al menos un horario')
    .max(256, 'Demasiados horarios seleccionados'),
});

const RegisterTournamentTeamSchema = z.object({
  tournamentId: z.string().regex(UUID_REGEX, 'tournamentId inválido'),
  name: z.string().trim().min(2, 'El nombre del equipo debe tener al menos 2 caracteres').max(80),
});

const Query: QueryResolvers = {
  tournaments: async () => tournamentService.listRegistrationTournaments({}),
  tournament: async (_parent, args) => {
    const parsed = z.string().regex(UUID_REGEX, 'id invÃ¡lido').safeParse(args.id);
    if (!parsed.success) return null;

    return tournamentService.getTournamentById({}, parsed.data);
  },
};

const Mutation: MutationResolvers = {
  createTournament: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = CreateTournamentSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return { success: false, tournamentId: null, message: `Datos inválidos: ${message}`, tournament: null };
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
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    const parsed = RegisterTournamentTeamSchema.safeParse(args.input);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      return { success: false, teamId: null, message: `Datos inválidos: ${message}`, tournament: null };
    }

    try {
      return await tournamentService.registerTournamentTeam(parsed.data, {
        userId: user.id,
        supabase: userClient,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al inscribir el equipo';
      console.error(`[tournamentResolver.registerTournamentTeam] Failed for userId=${user.id}:`, error);
      return { success: false, teamId: null, message, tournament: null };
    }
  },
};

export const tournamentResolvers = { Query, Mutation };
