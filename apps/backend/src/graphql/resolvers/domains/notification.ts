/**
 * Notification Resolver — GraphQL resolvers for the notification bell + preferences
 *
 * Decision Context:
 * - Lives under `resolvers/domains/` per backend.md MANDATORY resolver layout.
 * - Every operation here is owner-scoped: a user-scoped client is created from the JWT and
 *   passed via ServiceContext so the notifications/notificationPreferences RLS policies
 *   (auth.uid() = userId) enforce ownership as defense-in-depth on top of the service's
 *   explicit `.eq('userId', ...)` filters.
 * - Thin resolvers: no data shaping — the service owns transformation and caching.
 * - These resolvers only READ/MANAGE the caller's own rows. Notification CREATION happens
 *   inside the domain services that fire the underlying events (e.g. matchService.joinMatch),
 *   via notificationService.notify(), not here.
 * - Previously fixed bugs: none relevant.
 */

import { createUserClient } from '../../../config/supabase.js';
import { notificationService } from '../../../services/notificationService.js';
import { requireAuth } from '../../../types/context.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';

function userClientFrom(accessToken?: string) {
  return accessToken ? createUserClient(accessToken) : undefined;
}

const Query: QueryResolvers = {
  myNotifications: async (_parent, args, context) => {
    const user = requireAuth(context);
    return notificationService.getMyNotifications(
      { userId: user.id, supabase: userClientFrom(context.accessToken) },
      args.limit,
    );
  },

  unreadNotificationCount: async (_parent, _args, context) => {
    const user = requireAuth(context);
    return notificationService.getUnreadCount({
      userId: user.id,
      supabase: userClientFrom(context.accessToken),
    });
  },

  myNotificationPreferences: async (_parent, _args, context) => {
    const user = requireAuth(context);
    return notificationService.getMyPreferences({
      userId: user.id,
      supabase: userClientFrom(context.accessToken),
    });
  },
};

const Mutation: MutationResolvers = {
  markNotificationRead: async (_parent, args, context) => {
    const user = requireAuth(context);
    return notificationService.markRead(args.id as string, {
      userId: user.id,
      supabase: userClientFrom(context.accessToken),
    });
  },

  markAllNotificationsRead: async (_parent, _args, context) => {
    const user = requireAuth(context);
    return notificationService.markAllRead({
      userId: user.id,
      supabase: userClientFrom(context.accessToken),
    });
  },

  deleteNotification: async (_parent, args, context) => {
    const user = requireAuth(context);
    return notificationService.deleteNotification(args.id as string, {
      userId: user.id,
      supabase: userClientFrom(context.accessToken),
    });
  },

  updateNotificationPreferences: async (_parent, args, context) => {
    const user = requireAuth(context);
    // Strip null values from InputMaybe<boolean> — service expects boolean | undefined.
    const input = {
      matchActivity: args.input.matchActivity ?? undefined,
      matchUpdates: args.input.matchUpdates ?? undefined,
      matchResults: args.input.matchResults ?? undefined,
      invitations: args.input.invitations ?? undefined,
    };
    return notificationService.updatePreferences(input, {
      userId: user.id,
      supabase: userClientFrom(context.accessToken),
    });
  },
};

export const notificationResolvers = { Query, Mutation };
