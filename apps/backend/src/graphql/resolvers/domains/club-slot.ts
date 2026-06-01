/**
 * Club Slot Management Resolver — GraphQL resolvers for club admin slot operations
 *
 * Decision Context:
 * - Why: Thin resolver layer. Auth enforcement + user-scoped client creation happen here;
 *   business logic lives exclusively in clubSlotManagementService.
 * - Auth: every query/mutation calls requireAuth() then requireClubAdminRole().
 *   requireClubAdminRole does a profile lookup to verify role=club_admin explicitly,
 *   providing defense-in-depth beyond the service-layer club ownership check (P7 audit fix).
 * - User-scoped client: created from context.accessToken on every mutation so RLS policies
 *   on clubSlots, slotAuditLog, courtPricing enforce clubs.ownerId = auth.uid().
 * - toggleSlotBlock returns a ClubSlotMutationResult with either `slot` (applied) or
 *   `impactPreview` (needs confirmation). cancelledMatchesCount and notifiedPlayersCount
 *   are populated when confirmForce=true (improvement 19 complete).
 * - updateCourtPricing wrapped in try/catch for consistent { success, message } format
 *   on errors — matches the pattern of all other mutations (P6 audit fix).
 * - Error messages are in Spanish to match project UX conventions.
 * - Previously fixed bugs:
 *   - updateCourtPricing had no try/catch: errors propagated as raw Apollo errors
 *     without the { success, message } contract. Fixed.
 *   - No explicit role=club_admin check: a player who somehow had a club record could
 *     call these mutations. Fixed with requireClubAdminRole at the start of each mutation.
 */

import { createUserClient } from '../../../config/supabase.js';
import { clubSlotManagementService } from '../../../services/clubSlotManagementService.js';
import { profileRepository } from '../../../repositories/profileRepository.js';
import type {
  MutationResolvers,
  QueryResolvers,
} from '../../generated/graphql.js';
import { requireAuth } from '../../../types/context.js';
import type { GraphQLContext } from '../../../types/context.js';

// =====================================================
// Auth helpers
// =====================================================

/**
 * Verifies that the authenticated user has role=club_admin.
 * Called at the start of every mutation (after requireAuth) as defense-in-depth.
 * The service layer also verifies club ownership, but this adds an explicit role gate.
 */
async function requireClubAdminRole(userId: string): Promise<void> {
  const profile = await profileRepository.getProfileById(userId);
  if (!profile || profile.role !== 'club_admin') {
    throw new Error('Solo administradores de club pueden realizar esta acción');
  }
}

// Patterns that mark a raw database/Postgres/RLS error. When a thrown message matches one of
// these, we return a generic message instead of leaking table names, constraint names, or the
// existence of RLS policies to the client. Service-layer validation errors (friendly Spanish)
// do not match these patterns and pass through unchanged.
// Previously fixed bugs: raw errors like 'violates foreign key constraint "clubSlots_courtId_fkey"',
// 'new row violates row-level security policy for table "courtPricing"', and
// 'date/time field value out of range' were surfaced verbatim to the client.
const DB_ERROR_MARKERS = [
  'violates',
  'constraint',
  'row-level security',
  'duplicate key',
  'date/time field',
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
  if (DB_ERROR_MARKERS.some((m) => lower.includes(m.toLowerCase()))) {
    return fallback;
  }
  return error.message;
}

function userClientFrom(ctx: GraphQLContext) {
  return ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;
}

// =====================================================
// Queries
// =====================================================

const Query: QueryResolvers = {
  myClubSlots: async (_parent, _args, ctx) => {
    requireAuth(ctx);
    const userClient = userClientFrom(ctx);
    return clubSlotManagementService.getManagedSlots({ userId: ctx.user!.id, supabase: userClient });
  },

  clubSlotsByCourt: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const userClient = userClientFrom(ctx);
    return clubSlotManagementService.getManagedSlotsByCourt(
      { userId: ctx.user!.id, supabase: userClient },
      args.courtId,
    );
  },

  slotAuditLog: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const userClient = userClientFrom(ctx);
    return clubSlotManagementService.getSlotAuditLog(
      { userId: ctx.user!.id, supabase: userClient },
      args.slotId,
      args.limit ?? 20,
      args.offset ?? 0,
    );
  },

  slotImpactPreview: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const userClient = userClientFrom(ctx);
    return clubSlotManagementService.getSlotImpactPreview(
      { userId: ctx.user!.id, supabase: userClient },
      args.slotIds,
    );
  },

  courtPricing: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const userClient = userClientFrom(ctx);
    return clubSlotManagementService.getCourtPricingForAdmin(
      { userId: ctx.user!.id, supabase: userClient },
      args.courtId,
    );
  },
};

// =====================================================
// Mutations
// =====================================================

const Mutation: MutationResolvers = {
  createClubSlot: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const { slot } = await clubSlotManagementService.createClubSlot(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );
      return { success: true, slot, message: 'Slot creado correctamente', impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al crear el slot');
      console.error('[club-slot.resolver.createClubSlot] Error:', msg);
      return { success: false, slot: null, message: msg, impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    }
  },

  updateClubSlot: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const { slot, consumedCount } = await clubSlotManagementService.updateClubSlot(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );
      const message =
        consumedCount > 0
          ? `Slot actualizado correctamente. Se absorbieron ${consumedCount} horario(s) disponible(s) contiguo(s).`
          : 'Slot actualizado correctamente';
      return { success: true, slot, message, impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al actualizar el slot');
      console.error('[club-slot.resolver.updateClubSlot] Error:', msg);
      return { success: false, slot: null, message: msg, impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    }
  },

  deleteClubSlot: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const { slot } = await clubSlotManagementService.deleteClubSlot(
        { userId: ctx.user!.id, supabase: userClient },
        args.slotId,
      );
      return { success: true, slot, message: 'Slot eliminado correctamente', impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al eliminar el slot');
      console.error('[club-slot.resolver.deleteClubSlot] Error:', msg);
      return { success: false, slot: null, message: msg, impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    }
  },

  toggleSlotBlock: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const result = await clubSlotManagementService.toggleSlotBlock(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );

      if (result.impactPreview !== null) {
        // Matches exist — returned preview without applying block
        return {
          success: false,
          slot: null,
          message: `Hay ${result.impactPreview.matchesAffected} partido(s) programado(s). Confirmá con confirmForce=true para cancelarlos y bloquear.`,
          impactPreview: result.impactPreview,
          cancelledMatchesCount: 0,
          notifiedPlayersCount: 0,
        };
      }

      const msg = args.input.isBlocked
        ? result.cancelledMatchesCount > 0
          ? `Slot bloqueado. Se cancelaron ${result.cancelledMatchesCount} partido(s) y se notificó a ${result.notifiedPlayersCount} jugador(es).`
          : 'Slot bloqueado'
        : 'Slot desbloqueado';

      return {
        success: true,
        slot: result.slot,
        message: msg,
        impactPreview: null,
        cancelledMatchesCount: result.cancelledMatchesCount,
        notifiedPlayersCount: result.notifiedPlayersCount,
      };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al cambiar estado del slot');
      console.error('[club-slot.resolver.toggleSlotBlock] Error:', msg);
      return { success: false, slot: null, message: msg, impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    }
  },

  bulkBlockSlots: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const result = await clubSlotManagementService.bulkBlockSlots(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );

      const message =
        result.affectedCount === 0 && result.impactPreview
          ? `${result.impactPreview.matchesAffected} partido(s) afectado(s). Confirmá con confirmForce=true.`
          : result.cancelledMatchesCount > 0
            ? `${result.affectedCount} slot(s) procesado(s). Se cancelaron ${result.cancelledMatchesCount} partido(s) y se notificó a ${result.notifiedPlayersCount} jugador(es).`
            : `${result.affectedCount} slot(s) procesado(s), ${result.skippedCount} omitido(s)`;

      return {
        success: result.affectedCount > 0 || result.skippedCount === 0,
        affectedCount: result.affectedCount,
        skippedCount: result.skippedCount,
        message,
        impactPreview: result.impactPreview,
        cancelledMatchesCount: result.cancelledMatchesCount,
        notifiedPlayersCount: result.notifiedPlayersCount,
      };
    } catch (error) {
      const msg = toClientMessage(error, 'Error en operación masiva');
      console.error('[club-slot.resolver.bulkBlockSlots] Error:', msg);
      return { success: false, affectedCount: 0, skippedCount: 0, message: msg, impactPreview: null, cancelledMatchesCount: 0, notifiedPlayersCount: 0 };
    }
  },

  updateCourtPricing: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const courtPricing = await clubSlotManagementService.updateCourtPricing(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );
      return { success: true, courtPricing, message: null };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al actualizar el precio de la cancha');
      console.error('[club-slot.resolver.updateCourtPricing] Error:', msg);
      return { success: false, courtPricing: null, message: msg };
    }
  },
};

export const clubSlotResolvers = { Query, Mutation };
