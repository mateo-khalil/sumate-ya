/**
 * Match Resolver - GraphQL resolvers for Match queries
 *
 * Decision Context:
 * - Why: Lives under `resolvers/domains/` per backend.md MANDATORY resolver layout —
 *   "All resolvers in `src/graphql/resolvers/domains/` organized by domain".
 * - Pattern: Resolvers are thin orchestration. They call services and handle side effects
 *   (none needed here yet). Public queries skip `requireAuth`; future mutations must
 *   create a user-scoped client via `createUserClient(context.accessToken)` and pass it
 *   through `ServiceContext.supabase` so RLS policies can verify `auth.uid()`.
 * - Uses codegen-generated types (`QueryResolvers`) so schema drift fails at build time
 *   — hand-rolled response types were removed per backend.md "Generated types" rule.
 * - Filter support: `matches` query now accepts `MatchFilters` input type for flexible
 *   filtering by status, format, zone, date range, and text search.
 * - Previously fixed bugs: none relevant.
 */

import { createUserClient } from '../../../config/supabase.js';
import { matchService } from '../../../services/matchService.js';
import { requireAuth } from '../../../types/context.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';

const Query: QueryResolvers = {
  /**
   * Get matches with optional filters. Defaults to open matches if no filters provided.
   * Public endpoint - no auth required.
   */
  matches: async (_parent, args, _ctx) => {
    return matchService.listMatches({}, args.filters);
  },

  /**
   * Get a single match by ID. Public endpoint - no auth required.
   */
  match: async (_parent, args, _ctx) => {
    return matchService.getMatchById({}, args.id);
  },
};

/**
 * createMatch mutation resolver.
 *
 * Decision Context:
 * - Auth required: calls requireAuth so unauthenticated requests get a clean error.
 * - User-scoped client: created from context.accessToken so Storage/DB RLS policies
 *   that check auth.uid() are enforced for both the INSERT on matches and matchParticipants.
 * - Service owns all business logic and validation — the resolver is intentionally thin.
 * - Error surfacing: caught errors are returned as `{ success: false, message }` instead
 *   of re-thrown so Apollo doesn't wrap them in a generic 500 wrapper. The client can then
 *   display the Spanish user-facing message directly.
 * - Previously fixed bugs: none relevant.
 */
const Mutation: MutationResolvers = {
  createMatch: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    try {
      return await matchService.createMatch(args.input, {
        userId: user.id,
        supabase: userClient,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al crear el partido';
      console.error(`[matchResolver.createMatch] Failed for userId=${user.id}:`, error);
      return { success: false, matchId: null, message };
    }
  },
};

export const matchResolvers = { Query, Mutation };
