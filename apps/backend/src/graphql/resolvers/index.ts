/**
 * GraphQL Resolvers Index
 *
 * Decision Context:
 * - Why: Aggregates per-domain resolvers from `resolvers/domains/` per backend.md rule.
 * - Pattern: Each domain module exports `{ Query, Mutation }` partials; this file merges them.
 * - Previously fixed bugs: none relevant.
 */

import { matchResolvers } from './domains/match.js';

export const resolvers = {
  Query: {
    ...matchResolvers.Query,
  },
};
