/**
 * Profile Resolver — GraphQL resolvers for Profile queries
 *
 * Decision Context:
 * - Why: Lives under `resolvers/domains/` per backend.md MANDATORY resolver layout.
 * - Auth: `myProfile` requires auth — we call `requireAuth(context)` which throws a
 *   clean "Authentication required" error if the JWT was absent/invalid. The frontend
 *   SSR page catches this and redirects to /login.
 * - RLS: we build a user-scoped Supabase client from `context.accessToken` and pass it
 *   through `ServiceContext.supabase`. This lets the RLS policy on `profiles` verify
 *   `auth.uid()` against the requested row. Using the singleton service client here
 *   would bypass RLS and break the defense-in-depth posture required by backend.md.
 * - Thin resolver: no data shaping lives here — service/repo own the DB contract and
 *   the service owns winrate computation. Keep this file as a 1:1 mapping from GraphQL
 *   fields to service calls.
 * - Previously fixed bugs: none relevant.
 */

import { createUserClient } from '../../../config/supabase.js';
import { profileService } from '../../../services/profileService.js';
import { requireAuth } from '../../../types/context.js';
import type { QueryResolvers } from '../../generated/graphql.js';

const Query: QueryResolvers = {
  myProfile: async (_parent, _args, context) => {
    const user = requireAuth(context);
    const userClient = context.accessToken
      ? createUserClient(context.accessToken)
      : undefined;

    return profileService.getMyProfile({
      userId: user.id,
      supabase: userClient,
    });
  },
};

export const profileResolvers = { Query };
