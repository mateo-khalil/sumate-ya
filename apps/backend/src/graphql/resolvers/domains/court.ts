/**
 * Court Management Resolver — GraphQL resolvers for club admin court CRUD (Canchas)
 *
 * Decision Context:
 * - Thin resolver: auth enforcement + user-scoped client creation here; all business logic in
 *   courtService. Mirrors club-slot.ts exactly (the established admin-resolver shape).
 * - Auth: every query/mutation runs requireAuth() then requireClubAdminRole() (explicit
 *   role=club_admin lookup) as defense-in-depth on top of the service-layer ownership check
 *   and the courts RLS policies.
 * - toClientMessage hides raw DB/RLS errors (table names, constraints) behind a generic
 *   fallback while letting friendly Spanish service errors pass through unchanged — same
 *   DB_ERROR_MARKERS list as club-slot.ts.
 * - Mutations always return { success, court, message } so frontend hooks stay uniform.
 * - Previously fixed bugs: none relevant (new resolver). The courts table previously lacked
 *   write RLS policies (added in migration courts_admin_rls_policies) — without them every
 *   mutation here would have failed with a row-level-security error masked as the fallback.
 */

import { createUserClient } from '../../../config/supabase.js';
import { courtService } from '../../../services/courtService.js';
import { profileRepository } from '../../../repositories/profileRepository.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';
import { requireAuth } from '../../../types/context.js';
import type { GraphQLContext } from '../../../types/context.js';

// =====================================================
// Auth + error helpers (shared shape with club-slot.ts)
// =====================================================

async function requireClubAdminRole(userId: string): Promise<void> {
  const profile = await profileRepository.getProfileById(userId);
  if (!profile || profile.role !== 'club_admin') {
    throw new Error('Solo administradores de club pueden realizar esta acción');
  }
}

const DB_ERROR_MARKERS = [
  'violates',
  'constraint',
  'row-level security',
  'duplicate key',
  'invalid input syntax',
  'null value in column',
  'permission denied',
  'PGRST',
  'relation "',
  'column "',
];

function toClientMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const lower = error.message.toLowerCase();
  if (DB_ERROR_MARKERS.some((m) => lower.includes(m.toLowerCase()))) return fallback;
  return error.message;
}

function userClientFrom(ctx: GraphQLContext) {
  return ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;
}

// =====================================================
// Queries
// =====================================================

const Query: QueryResolvers = {
  myClubCourts: async (_parent, _args, ctx) => {
    requireAuth(ctx);
    const userClient = userClientFrom(ctx);
    return courtService.getManagedCourts({ userId: ctx.user!.id, supabase: userClient });
  },
};

// =====================================================
// Mutations
// =====================================================

const Mutation: MutationResolvers = {
  createCourt: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const court = await courtService.createCourt(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );
      return { success: true, court, message: 'Cancha creada correctamente' };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al crear la cancha');
      console.error('[court.resolver.createCourt] Error:', msg);
      return { success: false, court: null, message: msg };
    }
  },

  updateCourt: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const court = await courtService.updateCourt(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );
      return { success: true, court, message: 'Cancha actualizada correctamente' };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al actualizar la cancha');
      console.error('[court.resolver.updateCourt] Error:', msg);
      return { success: false, court: null, message: msg };
    }
  },

  deleteCourt: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      await courtService.deleteCourt({ userId: ctx.user!.id, supabase: userClient }, args.courtId);
      return { success: true, court: null, message: 'Cancha eliminada correctamente' };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al eliminar la cancha');
      console.error('[court.resolver.deleteCourt] Error:', msg);
      return { success: false, court: null, message: msg };
    }
  },
};

export const courtResolvers = { Query, Mutation };
