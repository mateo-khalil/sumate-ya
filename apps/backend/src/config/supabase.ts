/**
 * Supabase client configuration
 *
 * Decision Context:
 * - Why: RLS requires user-scoped clients for write operations to enforce auth.uid() checks.
 * - Pattern: Default client for public reads, createUserClient() for authenticated writes.
 * - Previously fixed bugs: none relevant.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!supabaseServiceKey && !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY environment variable');
}

/**
 * Default Supabase client - uses service role for reads
 * For write operations, use createUserClient() instead
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

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
