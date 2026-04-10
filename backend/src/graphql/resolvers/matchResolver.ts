/**
 * Match Resolver - GraphQL resolvers for Match queries
 *
 * Decision Context:
 * - Why: Resolvers orchestrate services and handle side effects per backend.md rules.
 * - Pattern: Public queries don't require auth; mutations would use createUserClient().
 * - Previously fixed bugs: none relevant.
 */

import { matchService } from '../../services/matchService.js';
import type { GraphQLContext } from '../../types/context.js';

export const matchResolvers = {
  Query: {
    /**
     * Get matches filtered by status
     * Defaults to 'open' if no status provided
     * Public endpoint - no auth required
     */
    matches: async (
      _parent: unknown,
      args: { status?: string },
      _ctx: GraphQLContext
    ) => {
      console.log('[MatchResolver] matches query called with args:', args);
      const status = args.status || 'open';

      try {
        let result;
        if (status === 'open') {
          result = await matchService.listOpenMatches({});
        } else {
          result = await matchService.listMatchesByStatus({}, status);
        }
        console.log('[MatchResolver] Returning', result.length, 'matches');
        return result;
      } catch (error) {
        console.error('[MatchResolver] Error:', error);
        throw error;
      }
    },

    /**
     * Get a single match by ID
     * Public endpoint - no auth required
     */
    match: async (
      _parent: unknown,
      args: { id: string },
      _ctx: GraphQLContext
    ) => {
      return matchService.getMatchById({}, args.id);
    },
  },
};
