/**
 * Match Result Resolver — GraphQL resolvers for result voting
 *
 * Decision Context:
 * - Why: Lives under resolvers/domains/ per backend.md mandatory layout.
 * - All resolvers require authentication (requireAuth throws for unauthenticated callers).
 * - matchResultSubmissions: read query — user-scoped client not strictly needed since the
 *   service-role is used in the repository, but we pass userId for per-user DTO fields.
 * - proposeMatchResult and voteMatchResult: write mutations — user-scoped client created
 *   from context.accessToken so DB RLS INSERT policies are enforced.
 * - Errors are returned via Apollo's thrown-error path so the client gets a clean Spanish
 *   message in the errors array. The result types carry real data (no success/message shape)
 *   because the mutations always return the updated submission or throw.
 * - Previously fixed bugs: none relevant.
 */

import { createUserClient } from '../../../config/supabase.js';
import { matchResultVoteService } from '../../../services/matchResultVoteService.js';
import { requireAuth } from '../../../types/context.js';
import type { MutationResolvers, QueryResolvers } from '../../generated/graphql.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Query: QueryResolvers = {
  /**
   * Returns all result submissions for a match with per-user voting context.
   * Requires auth. Caller must be a participant of the match.
   */
  matchResultSubmissions: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);

    if (!UUID_REGEX.test(args.matchId)) {
      console.warn(`[matchResultResolver.matchResultSubmissions] Invalid UUID: ${args.matchId}`);
      return [];
    }

    return matchResultVoteService.getMatchResultSubmissions(args.matchId, { userId: user.id });
  },
};

const Mutation: MutationResolvers = {
  /**
   * Create a new result proposal for a match.
   * Requires auth + participant. User-scoped client enforces RLS INSERT policy.
   */
  proposeMatchResult: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    return matchResultVoteService.proposeMatchResult(
      {
        matchId: args.input.matchId,
        scoreA: args.input.scoreA,
        scoreB: args.input.scoreB,
        winnerTeam: args.input.winnerTeam ?? undefined,
      },
      { userId: user.id, supabase: userClient },
    );
  },

  /**
   * Cast or update a vote on a result submission.
   * Requires auth + participant. UPSERT allows changing vote (Caso E).
   */
  voteMatchResult: async (_parent, args, ctx) => {
    const user = requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;

    return matchResultVoteService.voteMatchResult(
      {
        submissionId: args.input.submissionId,
        vote: args.input.vote,
      },
      { userId: user.id, supabase: userClient },
    );
  },
};

export const matchResultResolvers = { Query, Mutation };
