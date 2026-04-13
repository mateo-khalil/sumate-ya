/**
 * Supabase client configuration
 *
 * Decision Context:
 * - Why: RLS requires user-scoped clients for write operations to enforce auth.uid() checks.
 * - Pattern: Default client for trusted server reads uses a Supabase secret key,
 *   while createUserClient() keeps authenticated writes scoped to the caller.
 * - Migration: PRIVATE_SUPABASE_SECRET_KEY is the canonical env var. Legacy names remain
 *   as temporary fallbacks so existing deployments do not break during rollout.
 * - Previously fixed bugs: none relevant.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.PRIVATE_SUPABASE_SECRET_KEY;
const legacySupabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const legacySupabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const serverSupabaseKey = supabaseSecretKey || legacySupabaseSecretKey || legacySupabaseServiceKey;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!serverSupabaseKey && !supabaseAnonKey) {
  throw new Error(
    'Missing PRIVATE_SUPABASE_SECRET_KEY (or legacy SUPABASE_SECRET_KEY / SUPABASE_SERVICE_KEY) or SUPABASE_ANON_KEY environment variable',
  );
}

/**
 * Default Supabase client - uses a server-only secret key for trusted reads
 * For write operations, use createUserClient() instead
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  serverSupabaseKey || supabaseAnonKey!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);

/**
 * Creates an anon Supabase client for auth flows like login.
 */
export function createAnonClient(): SupabaseClient {
  if (!supabaseAnonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY for anon client');
  }

  return createClient(supabaseUrl!, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Creates a user-scoped Supabase client for RLS-enforced operations
 * @param accessToken - JWT access token from authenticated user
 * @returns SupabaseClient scoped to the user's auth context
 */
export function createUserClient(accessToken: string): SupabaseClient {
  if (!supabaseAnonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY for user client');
  }

  return createClient(supabaseUrl!, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type { SupabaseClient };
