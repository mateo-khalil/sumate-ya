/**
 * GraphQL Resolvers Index
 *
 * Decision Context:
 * - Why: Aggregates per-domain resolvers from `resolvers/domains/` per backend.md rule.
 * - Pattern: Each domain module exports `{ Query, Mutation }` partials; this file merges them.
 * - Previously fixed bugs: none relevant.
 */

import { clubResolvers } from './domains/club.js';
import { matchResolvers } from './domains/match.js';
import { profileResolvers } from './domains/profile.js';

export const resolvers = {
  Query: {
    ...matchResolvers.Query,
    ...profileResolvers.Query,
    ...clubResolvers.Query,
  },
  Mutation: {
    ...matchResolvers.Mutation,
  },
};
