/**
 * Context types for service and resolver layers
 *
 * Decision Context:
 * - Why: ServiceContext threads auth and DB client through service calls for RLS enforcement.
 * - Pattern: Resolver creates user-scoped client, passes via context to services.
 * - Previously fixed bugs: none relevant.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Context passed to service functions
 * Contains auth info and optionally a user-scoped Supabase client
 */
export interface ServiceContext {
  /** Authenticated user's ID (from JWT) */
  userId?: string;
  /** User-scoped Supabase client for RLS-enforced operations */
  supabase?: SupabaseClient;
}

/**
 * GraphQL resolver context
 * Populated by Apollo Server context function from request JWT
 */
export interface GraphQLContext {
  /** Authenticated user info (null if not authenticated) */
  user: {
    id: string;
    email: string;
  } | null;
  /** Raw JWT access token for creating user-scoped clients */
  accessToken?: string;
}

/**
 * Helper to require authentication in resolvers
 * Throws if user is not authenticated
 */
export function requireAuth(ctx: GraphQLContext): { id: string; email: string } {
  if (!ctx.user) {
    throw new Error('Authentication required');
  }
  return ctx.user;
}
