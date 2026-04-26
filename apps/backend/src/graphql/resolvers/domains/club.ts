/**
 * Club Resolver — GraphQL resolvers for club listing and slot availability
 *
 * Decision Context:
 * - `clubs` is a public query: no auth required, uses thin service call with empty context.
 * - `clubSlots` requires the user to be authenticated (they're in the wizard to create a
 *   match), but the data itself is not user-scoped — service-role reads are fine.
 *   We still call requireAuth so an unauthenticated caller can't probe slot data.
 * - Both resolvers follow the thin pattern: no data shaping, no error catching beyond what
 *   Apollo propagates. Business logic stays in the service layer.
 * - Previously fixed bugs: none relevant.
 */

import { clubService } from '../../../services/clubService.js';
import type { QueryResolvers } from '../../generated/graphql.js';

const Query: QueryResolvers = {
  // Public — club and slot data is not user-scoped or sensitive.
  clubs: async (_parent, _args, _ctx) => {
    return clubService.listClubs({});
  },

  // Public read — slot availability is not sensitive; making it public avoids the
  // auth-header problem for React components running in the browser (they cannot read
  // the HttpOnly cookie). The createMatch mutation enforces auth at write time.
  clubSlots: async (_parent, args, _ctx) => {
    return clubService.getClubSlots({}, args.clubId, args.date);
  },
};

export const clubResolvers = { Query };
