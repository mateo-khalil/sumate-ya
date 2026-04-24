/**
 * Profile Repository — DB access for the `profiles` table
 *
 * Decision Context:
 * - Why: Explicit column list (PROFILE_COLUMNS) enforces backend.md egress-prevention rule
 *   "NEVER use select('*')". Future additions to the DB schema won't silently grow the
 *   response size until a field is added here intentionally.
 * - Accepts an optional `client` argument so the myProfile resolver can pass a user-scoped
 *   Supabase client — RLS policies on `profiles` must be able to verify auth.uid().
 * - camelCase identifiers are quoted because the DB uses quoted-camelCase naming (backend.md
 *   "Database (Supabase)" rule). Unquoted identifiers would be lowercased by Postgres and
 *   fail to match columns like "displayName".
 * - PGRST116 is Supabase's not-found code on `.single()`; we translate to `null` so the
 *   service can decide whether missing profile is a real error or an edge case.
 * - Previously fixed bugs: none relevant.
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions (NEVER use select('*'))
// =====================================================

const PROFILE_COLUMNS = `
  id,
  "displayName",
  "avatarUrl",
  role,
  "preferredPosition",
  division,
  "matchesPlayed",
  "matchesWon"
`;

// =====================================================
// Types
// =====================================================

export interface ProfileRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  preferredPosition: string | null;
  division: number;
  matchesPlayed: number;
  matchesWon: number;
}

// =====================================================
// Repository Functions
// =====================================================

export async function getProfileById(
  id: string,
  client: SupabaseClient = supabase,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error(
      `[profileRepository.getProfileById] Supabase error for profileId=${id}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ProfileRow;
}

export const profileRepository = {
  getProfileById,
};
