/**
 * Match Resolver - GraphQL resolvers for Match queries and mutations
 *
 * Decision Context:
 * - Why: Lives under `resolvers/domains/` per backend.md MANDATORY resolver layout.
 * - Pattern: Resolvers are thin orchestration. They call services and handle side effects.
 * - match(id): upgraded to return participant data (see getMatchDetail). Auth context is
 *   passed so isCurrentUserJoined / canJoin flags are computed per-user.
 *   Public callers (no token) still get the match data; flags are null.
 * - joinMatch: requires authentication + player role (enforced in service). Returns the
 *   updated Match with participants so the frontend can re-render without a second query.
 * - leaveMatch: requires authentication. Errors are returned via Apollo's errors array
 *   (thrown from the service) so the client receives a clean Spanish message. The result
 *   type always has matchDeleted to tell the frontend whether to redirect or reload.
 * - createMatch: unchanged from previous implementation.
 * - Previously fixed bugs:
 *   - match(id) used getMatchById which returned no participant data — upgraded to
 *     getMatchDetail so the detail page can show team rosters and join buttons.
 */

import { createUserClient } from '../../../config/supabase.js';
import { matchService } from '../../../services/matchService.js';
import { requireAuth } from '../../../types/context.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';

const Query: QueryResolvers = {
  /**
   * Get matches with optional filters. Public endpoint - no auth required.
   * Returns lightweight Match objects (no participant data) for list performance.
   */
  matches: async (_parent, args, _ctx) => {
    return matchService.listMatches({}, args.filters);
  },

  /**
   * Get a single match by ID with full participant data.
   * Public endpoint — auth context is optional; if present, populates isCurrentUserJoined.
   */
  match: async (_parent, args, ctx) => {
    return matchService.getMatchDetail(
      {
        userId: ctx.user?.id,
        supabase: ctx.user && ctx.accessToken ? createUserClient(ctx.accessToken) : undefined,
      },
      args.id,
    );
  },
};

const Mutation: MutationResolvers = {
  /**
   * createMatch mutation resolver.
   *
   * Decision Context:
   * - Auth required: calls requireAuth so unauthenticated requests get a clean error.
   * - User-scoped client: created from context.accessToken so DB RLS policies that check
   *   auth.uid() are enforced for the INSERT on matches and matchParticipants.
   * - Previously fixed bugs: none relevant.
   */
  createMatch: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    try {
      return await matchService.createMatch(args.input, {
        userId: user.id,
        supabase: userClient,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear el partido';
      console.error(`[matchResolver.createMatch] Failed for userId=${user.id}:`, error);
      return { success: false, matchId: null, message };
    }
  },

  /**
   * joinMatch mutation resolver.
   *
   * Decision Context:
   * - Auth required: requireAuth throws for unauthenticated requests.
   * - User-scoped client: passed to service so the INSERT on matchParticipants satisfies
   *   the RLS policy (playerId = auth.uid()).
   * - Errors are returned as { success: false, message } rather than thrown so Apollo does
   *   not wrap them in a generic 500 — the client can display the Spanish message directly.
   * - Previously fixed bugs: none relevant.
   */
  joinMatch: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    try {
      return await matchService.joinMatch(args.input, {
        userId: user.id,
        supabase: userClient,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al sumarse al partido';
      console.error(`[matchResolver.joinMatch] Failed for userId=${user.id}:`, error);
      return { success: false, message, match: null };
    }
  },
  /**
   * leaveMatch mutation resolver.
   *
   * Decision Context:
   * - Auth required: requireAuth throws for unauthenticated requests.
   * - User-scoped client: passed to service so DELETE on matchParticipants satisfies
   *   the RLS policy (auth.uid() = playerId). The service-role singleton is used internally
   *   for the auto-delete and status update operations that require bypassing RLS.
   * - Errors are re-thrown (not caught into a result shape) so Apollo wraps them in the
   *   `errors` array. LeaveMatchResult only carries data, not error state — this keeps
   *   the schema cleaner and avoids a parallel success/message pattern.
   * - Previously fixed bugs: none relevant.
   */
  leaveMatch: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    return await matchService.leaveMatch(args.input, {
      userId: user.id,
      supabase: userClient,
    });
  },
};

export const matchResolvers = { Query, Mutation };
