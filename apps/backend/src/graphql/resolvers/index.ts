/**
 * GraphQL Resolvers Index
 *
 * Decision Context:
 * - Why: Aggregates per-domain resolvers from `resolvers/domains/` per backend.md rule.
 * - Pattern: Each domain module exports `{ Query, Mutation }` partials; this file merges them.
 * - clubSlotResolvers: club admin slot management feature (Phase 1).
 * - clubMatchResolvers: admin-initiated match creation from the club panel (Phase 3).
 * - Note: club-dashboard resolver was removed from this version; it will be re-added
 *   when the dashboard.astro page is restored.
 * - Previously fixed bugs: none relevant.
 */

import { clubResolvers } from './domains/club.js';
import { clubSlotResolvers } from './domains/club-slot.js';
import { clubMatchResolvers } from './domains/club-match.js';
import { matchResolvers } from './domains/match.js';
import { matchResultResolvers } from './domains/match-result.js';
import { profileResolvers } from './domains/profile.js';

export const resolvers = {
  Query: {
    ...matchResolvers.Query,
    ...matchResultResolvers.Query,
    ...profileResolvers.Query,
    ...clubResolvers.Query,
    ...clubSlotResolvers.Query,
    ...clubMatchResolvers.Query,
  },
  Mutation: {
    ...matchResolvers.Mutation,
    ...matchResultResolvers.Mutation,
    ...clubSlotResolvers.Mutation,
    ...clubMatchResolvers.Mutation,
  },
};
