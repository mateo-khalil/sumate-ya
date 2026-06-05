/**
 * Profile Resolver — GraphQL resolvers for Profile queries and privacy mutations
 *
 * Decision Context:
 * - Lives under `resolvers/domains/` per backend.md MANDATORY resolver layout.
 * - myProfile: requires auth — owner always sees all their own fields, no privacy filter.
 * - profile(id): uses getProfile(id, requesterId) which applies field-level privacy
 *   filtering when the requester is not the profile owner. Auth required so we always
 *   have a requesterId; anonymous callers cannot access profile data.
 * - mySettings: requires auth — returns the caller's own PrivacySettings (isPublic,
 *   showStats, showHistory, showPosition, showDivision).
 * - updatePrivacy: requires auth + user-scoped client (RLS UPDATE policy). Zod
 *   validation lives in the service layer (messages in Spanish).
 * - Thin resolvers: no data shaping here — service owns all business logic.
 * - Previously fixed bugs: none relevant.
 */

import { createUserClient } from '../../../config/supabase.js';
import { profileService } from '../../../services/profileService.js';
import { requireAuth } from '../../../types/context.js';
import type {
  MutationResolvers,
  QueryResolvers,
} from '../../generated/graphql.js';

const Query: QueryResolvers = {
  myProfile: async (_parent, _args, context) => {
    const user = requireAuth(context);
    const userClient = context.accessToken
      ? createUserClient(context.accessToken)
      : undefined;

    return profileService.getMyProfile({
      userId: user.id,
      supabase: userClient,
    });
  },

  profile: async (_parent, args, context) => {
    const user = requireAuth(context);
    return profileService.getProfile(args.id as string, user.id);
  },

  // Public ranking — intentionally NOT gated by requireAuth. The service/RPC only
  // surface already-public data (isPublic + showStats + matchesPlayed >= 5), and the
  // /leaderboard page is reachable by anonymous visitors.
  leaderboard: async (_parent, args) => {
    return profileService.getLeaderboard(args.limit);
  },

  mySettings: async (_parent, _args, context) => {
    const user = requireAuth(context);
    const userClient = context.accessToken
      ? createUserClient(context.accessToken)
      : undefined;

    return profileService.getMySettings({
      userId: user.id,
      supabase: userClient,
    });
  },
};

const Mutation: MutationResolvers = {
  updatePrivacy: async (_parent, args, context) => {
    const user = requireAuth(context);
    const userClient = context.accessToken
      ? createUserClient(context.accessToken)
      : undefined;

    // Strip null values from InputMaybe<boolean> — service expects boolean | undefined
    const input = {
      isPublic: args.input.isPublic ?? undefined,
      showStats: args.input.showStats ?? undefined,
      showHistory: args.input.showHistory ?? undefined,
      showPosition: args.input.showPosition ?? undefined,
      showDivision: args.input.showDivision ?? undefined,
    };

    return profileService.updatePrivacy(input, {
      userId: user.id,
      supabase: userClient,
    });
  },
};

export const profileResolvers = { Query, Mutation };
