/**
 * Club Statistics Resolver — read-only analytics for the Estadísticas page
 *
 * Decision Context:
 * - Thin resolver: auth + user-scoped client here; aggregation in clubStatisticsService.
 * - Query-only domain (no mutations). requireAuth() gates it; the service resolves the club via
 *   clubs.ownerId, so a non-owner gets an empty/`no club` path rather than another club's data.
 *   No requireClubAdminRole here because there are no writes and the ownership lookup already
 *   scopes the data to the caller's own club.
 * - Previously fixed bugs: none relevant (new resolver).
 */

import { createUserClient } from '../../../config/supabase.js';
import { clubStatisticsService } from '../../../services/clubStatisticsService.js';
import type { QueryResolvers } from '../../generated/graphql.js';
import { requireAuth } from '../../../types/context.js';

const Query: QueryResolvers = {
  clubStatistics: async (_parent, args, ctx) => {
    requireAuth(ctx);
    const userClient = ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;
    return clubStatisticsService.getClubStatistics(
      { userId: ctx.user!.id, supabase: userClient },
      args.filters,
    );
  },
};

export const clubStatisticsResolvers = { Query };
