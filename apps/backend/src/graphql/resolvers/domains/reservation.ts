/**
 * Reservation Resolver — GraphQL resolvers for club admin manual bookings (Reservas)
 *
 * Decision Context:
 * - Thin resolver: auth + user-scoped client here, all logic in reservationService. Mirrors
 *   club-slot.ts / court.ts (the established admin-resolver shape).
 * - Auth: requireAuth() then requireClubAdminRole() on every operation (defense-in-depth over
 *   the service ownership check and the reservations RLS policies).
 * - toClientMessage masks raw DB/RLS errors; friendly Spanish service errors (overlap, missing
 *   booker, court-not-found) pass through unchanged.
 * - All mutations return { success, reservation, message } for uniform frontend hooks.
 * - Previously fixed bugs: none relevant (new resolver).
 */

import { createUserClient } from '../../../config/supabase.js';
import { reservationService } from '../../../services/reservationService.js';
import { profileRepository } from '../../../repositories/profileRepository.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';
import { requireAuth } from '../../../types/context.js';
import type { GraphQLContext } from '../../../types/context.js';

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

const Query: QueryResolvers = {
  myClubReservations: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const userClient = userClientFrom(ctx);
    return reservationService.getReservations(
      { userId: ctx.user!.id, supabase: userClient },
      args.filters,
    );
  },
};

const Mutation: MutationResolvers = {
  createReservation: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const reservation = await reservationService.createReservation(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );
      return { success: true, reservation, message: 'Reserva creada correctamente' };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al crear la reserva');
      console.error('[reservation.resolver.createReservation] Error:', msg);
      return { success: false, reservation: null, message: msg };
    }
  },

  updateReservation: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const reservation = await reservationService.updateReservation(
        { userId: ctx.user!.id, supabase: userClient },
        args.input,
      );
      return { success: true, reservation, message: 'Reserva actualizada correctamente' };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al actualizar la reserva');
      console.error('[reservation.resolver.updateReservation] Error:', msg);
      return { success: false, reservation: null, message: msg };
    }
  },

  cancelReservation: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      const reservation = await reservationService.cancelReservation(
        { userId: ctx.user!.id, supabase: userClient },
        args.reservationId,
      );
      return { success: true, reservation, message: 'Reserva cancelada' };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al cancelar la reserva');
      console.error('[reservation.resolver.cancelReservation] Error:', msg);
      return { success: false, reservation: null, message: msg };
    }
  },

  deleteReservation: async (_parent, args, ctx) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      await reservationService.deleteReservation(
        { userId: ctx.user!.id, supabase: userClient },
        args.reservationId,
      );
      return { success: true, reservation: null, message: 'Reserva eliminada' };
    } catch (error) {
      const msg = toClientMessage(error, 'Error al eliminar la reserva');
      console.error('[reservation.resolver.deleteReservation] Error:', msg);
      return { success: false, reservation: null, message: msg };
    }
  },
};

export const reservationResolvers = { Query, Mutation };
