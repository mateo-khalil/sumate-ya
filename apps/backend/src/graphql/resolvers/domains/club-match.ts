/**
 * Club Match Resolver — GraphQL resolvers for admin-initiated match creation
 *
 * Decision Context:
 * - Why: Thin resolver layer for club_admin match creation. Delegates all business logic
 *   to clubMatchService. Pattern is identical to club-slot.ts.
 * - requireClubAdminRole at the resolver level (defense-in-depth) even though the service
 *   also checks role. Prevents information leakage about slot IDs to non-admin callers.
 * - User-scoped client required for write operations (RLS enforces organizerId = auth.uid()).
 * - Zod validation: slotId UUID, scheduledDate format, format enum, capacity range.
 * - Error messages in Spanish per project UX conventions.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { z } from 'zod';
import { createUserClient } from '../../../config/supabase.js';
import { clubMatchService } from '../../../services/clubMatchService.js';
import { profileRepository } from '../../../repositories/profileRepository.js';
import { MatchFormat as GQLMatchFormat } from '../../generated/graphql.js';
import { requireAuth } from '../../../types/context.js';
import type { GraphQLContext } from '../../../types/context.js';

// =====================================================
// Validation
// =====================================================

const UUID_REGEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CreateClubMatchSchema = z.object({
  slotId: z.string().regex(UUID_REGEX, 'slotId inválido'),
  scheduledDate: z.string().regex(DATE_REGEX, 'scheduledDate debe ser YYYY-MM-DD'),
  format: z.enum([
    GQLMatchFormat.FiveVsFive,
    GQLMatchFormat.SevenVsSeven,
    GQLMatchFormat.TenVsTen,
    GQLMatchFormat.ElevenVsEleven,
  ]),
  capacity: z.number().int().min(2).max(22, 'La capacidad máxima es 22'),
  description: z.string().max(500, 'La descripción no puede superar 500 caracteres').optional().nullable(),
  autoEnrollOrganizer: z.boolean().optional(),
});

const AvailableSlotsSchema = z.object({
  startDate: z.string().regex(DATE_REGEX, 'startDate debe ser YYYY-MM-DD'),
  endDate: z.string().regex(DATE_REGEX, 'endDate debe ser YYYY-MM-DD'),
  courtIds: z.array(z.string().regex(UUID_REGEX, 'courtId inválido')).optional(),
  includeNonBookable: z.boolean().optional(),
}).refine((v) => {
  const days = (new Date(v.endDate).getTime() - new Date(v.startDate).getTime()) / 86_400_000;
  return days >= 0 && days <= 90;
}, { message: 'El rango no puede superar 90 días y endDate debe ser >= startDate' });

// =====================================================
// Auth helpers
// =====================================================

async function requireClubAdminRole(userId: string): Promise<void> {
  const profile = await profileRepository.getProfileById(userId);
  if (!profile || profile.role !== 'club_admin') {
    throw new Error('Solo administradores de club pueden realizar esta acción');
  }
}

function userClientFrom(ctx: GraphQLContext) {
  return ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;
}

// =====================================================
// Resolvers
// =====================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Query: Record<string, (...args: any[]) => Promise<unknown>> = {
  availableSlotsForClubMatch: async (
    _parent: unknown,
    args: { filters: Record<string, unknown> },
    ctx: GraphQLContext,
  ) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    const parsed = AvailableSlotsSchema.safeParse(args.filters);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      throw new Error(`Filtros inválidos: ${msg}`);
    }

    return clubMatchService.getAvailableSlots(
      { userId: ctx.user!.id, supabase: userClient },
      parsed.data,
    );
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Mutation: Record<string, (...args: any[]) => Promise<unknown>> = {
  createClubMatch: async (
    _parent: unknown,
    args: { input: Record<string, unknown> },
    ctx: GraphQLContext,
  ) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    const parsed = CreateClubMatchSchema.safeParse(args.input);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      return { success: false, matchId: null, message: `Datos inválidos: ${msg}`, match: null };
    }

    try {
      const result = await clubMatchService.createClubMatch(
        { userId: ctx.user!.id, supabase: userClient },
        parsed.data,
      );
      return { ...result, match: null };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al crear el partido';
      console.error('[club-match.resolver.createClubMatch] Error:', msg);
      return { success: false, matchId: null, message: msg, match: null };
    }
  },

  bulkCreateClubMatches: async (
    _parent: unknown,
    args: { input: { matches: Record<string, unknown>[] } },
    ctx: GraphQLContext,
  ) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    const validatedMatches = [];
    for (const m of args.input.matches) {
      const parsed = CreateClubMatchSchema.safeParse(m);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join('; ');
        return {
          totalRequested: args.input.matches.length,
          successCount: 0,
          failureCount: args.input.matches.length,
          results: args.input.matches.map((mi) => ({
            slotId: (mi.slotId as string) ?? '',
            date: (mi.scheduledDate as string) ?? '',
            success: false,
            matchId: null,
            message: `Datos inválidos: ${msg}`,
          })),
        };
      }
      validatedMatches.push(parsed.data);
    }

    try {
      return clubMatchService.bulkCreateClubMatches(
        { userId: ctx.user!.id, supabase: userClient },
        { matches: validatedMatches },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error en bulk create';
      console.error('[club-match.resolver.bulkCreateClubMatches] Error:', msg);
      throw new Error(msg);
    }
  },
};

export const clubMatchResolvers = { Query, Mutation };
