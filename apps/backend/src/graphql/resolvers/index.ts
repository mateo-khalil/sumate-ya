/**
 * GraphQL Resolvers Index
 *
 * Decision Context:
 * - Why: Aggregates per-domain resolvers from `resolvers/domains/` per backend.md rule.
 * - Pattern: Each domain module exports `{ Query, Mutation }` partials; this file merges them.
 * - clubSlotResolvers: club admin slot management feature (Phase 1).
 * - clubDashboardResolvers: club admin dashboard with KPIs and schedule view (Phase 2).
 * - clubMatchResolvers: admin-initiated match creation from the club panel (Phase 3).
 * - Previously fixed bugs: none relevant.
 */

import { clubResolvers } from './domains/club.js';
import { clubSlotResolvers } from './domains/club-slot.js';
import { clubDashboardResolvers } from './domains/club-dashboard.js';
import { clubMatchResolvers } from './domains/club-match.js';
import { matchResolvers } from './domains/match.js';
import { matchResultResolvers } from './domains/match-result.js';
import { profileResolvers } from './domains/profile.js';
import { tournamentResolvers } from './domains/tournament.js';
import { teamResolvers } from './domains/team.js';

export const resolvers = {
  Query: {
    ...matchResolvers.Query,
    ...matchResultResolvers.Query,
    ...profileResolvers.Query,
    ...clubResolvers.Query,
    ...clubSlotResolvers.Query,
    ...clubDashboardResolvers.Query,
    ...clubMatchResolvers.Query,
    ...tournamentResolvers.Query,
    ...teamResolvers.Query,
  },
  Mutation: {
    ...matchResolvers.Mutation,
    ...matchResultResolvers.Mutation,
    ...profileResolvers.Mutation,
    ...clubSlotResolvers.Mutation,
    ...clubMatchResolvers.Mutation,
    ...tournamentResolvers.Mutation,
    ...teamResolvers.Mutation,
  },
};
