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
 * - Debug console.log spam removed; if logging is needed later use a structured logger,
 *   not ad-hoc console calls in the request path.
 * - Previously fixed bugs: none relevant.
 */

import { matchService } from '../../../services/matchService.js';
import type { QueryResolvers } from '../../generated/graphql.js';

const Query: QueryResolvers = {
  /**
   * Get matches filtered by status. Defaults to 'open' if no status provided.
   * Public endpoint - no auth required.
   */
  matches: async (_parent, args, _ctx) => {
    const status = args.status ?? 'open';
    if (status === 'open') {
      return matchService.listOpenMatches({});
    }
    return matchService.listMatchesByStatus({}, status);
  },

  /**
   * Get a single match by ID. Public endpoint - no auth required.
   */
  match: async (_parent, args, _ctx) => {
    return matchService.getMatchById({}, args.id);
  },
};

export const matchResolvers = { Query };
