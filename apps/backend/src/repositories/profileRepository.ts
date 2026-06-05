/**
 * Profile Repository — DB access for the `profiles` and `privacyAuditLog` tables
 *
 * Decision Context:
 * - Why: Explicit column lists (PROFILE_COLUMNS, PROFILE_WITH_PRIVACY_COLUMNS) enforce
 *   backend.md egress-prevention rule "NEVER use select('*')".
 * - Privacy columns (showStats, showHistory, showPosition, showDivision, isPublic) are
 *   fetched in PROFILE_WITH_PRIVACY_COLUMNS — used for both own-profile reads and for
 *   reads of other users' profiles where the service must apply privacy filtering.
 * - getProfileById: lightweight fetch without privacy flags — used for myProfile (owner
 *   always sees everything, no need to fetch privacy flags for filtering).
 * - getProfileWithPrivacy: includes all privacy flags — used when fetching another user's
 *   profile so the service can decide which fields to redact.
 * - updatePrivacyFields: updates privacy columns + sets privacyUpdatedAt automatically.
 *   Uses the service-role singleton (writes go through the resolver with ownership check).
 * - insertPrivacyAuditLog: records each privacy change. The singleton supabase client is
 *   used here because the backend writes on behalf of the user; the owner check happens
 *   in the service (userId must match the authenticated caller's ID).
 * - PGRST116 is Supabase's not-found code on `.single()`; we translate to `null` so the
 *   service can decide whether missing profile is a real error or an edge case.
 * - camelCase identifiers are quoted because DB uses quoted-camelCase naming.
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

const PROFILE_WITH_PRIVACY_COLUMNS = `
  id,
  "displayName",
  "avatarUrl",
  role,
  "preferredPosition",
  division,
  "matchesPlayed",
  "matchesWon",
  "isPublic",
  "showStats",
  "showHistory",
  "showPosition",
  "showDivision"
`;

const PRIVACY_SETTINGS_COLUMNS = `
  "isPublic",
  "showStats",
  "showHistory",
  "showPosition",
  "showDivision"
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

export interface ProfileWithPrivacyRow extends ProfileRow {
  isPublic: boolean;
  showStats: boolean;
  showHistory: boolean;
  showPosition: boolean;
  showDivision: boolean;
}

export interface PrivacySettingsRow {
  isPublic: boolean;
  showStats: boolean;
  showHistory: boolean;
  showPosition: boolean;
  showDivision: boolean;
}

export interface UpdatePrivacyFields {
  isPublic?: boolean;
  showStats?: boolean;
  showHistory?: boolean;
  showPosition?: boolean;
  showDivision?: boolean;
}

export interface LeaderboardRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
  division: number;
  matchesPlayed: number;
  matchesWon: number;
  winrate: number;
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

/**
 * Fetches a profile including all privacy flags.
 * Used when reading another user's profile to apply service-layer privacy filtering.
 * Uses the service-role singleton to bypass RLS (ownership enforced at service layer).
 */
export async function getProfileWithPrivacy(
  id: string,
  client: SupabaseClient = supabase,
): Promise<ProfileWithPrivacyRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_WITH_PRIVACY_COLUMNS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error(
      `[profileRepository.getProfileWithPrivacy] Supabase error for profileId=${id}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as ProfileWithPrivacyRow;
}

/**
 * Fetches only the privacy settings for a given profile.
 * Used by mySettings resolver — owner-only.
 */
export async function getPrivacySettings(
  userId: string,
  client: SupabaseClient = supabase,
): Promise<PrivacySettingsRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select(PRIVACY_SETTINGS_COLUMNS)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error(
      `[profileRepository.getPrivacySettings] Supabase error for userId=${userId}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return data as unknown as PrivacySettingsRow;
}

/**
 * Updates privacy fields for a given profile.
 * Sets privacyUpdatedAt to now() automatically.
 * Uses the user-scoped client so RLS UPDATE policy enforces auth.uid() = id.
 */
export async function updatePrivacyFields(
  userId: string,
  fields: UpdatePrivacyFields,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({
      ...fields,
      privacyUpdatedAt: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error(
      `[profileRepository.updatePrivacyFields] Supabase error for userId=${userId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Updates the avatarUrl column for a given profile.
 *
 * Decision Context:
 * - Uses a user-scoped client by default so the UPDATE must satisfy the RLS policy
 *   that gates writes to `auth.uid() = id`. Passing the service-role client (singleton)
 *   here would bypass RLS and allow any backend code to overwrite any profile's avatar.
 * - avatarUrl is an absolute public Storage URL. The calling service is responsible for
 *   verifying the bucket exists before generating this URL (egress prevention rule).
 * - Previously fixed bugs: none relevant.
 */
export async function updateAvatarUrl(
  id: string,
  avatarUrl: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .update({ avatarUrl })
    .eq('id', id);

  if (error) {
    console.error(
      `[profileRepository.updateAvatarUrl] Supabase error for profileId=${id}:`,
      error.message,
    );
    throw new Error(error.message);
  }
}

/**
 * Inserts a privacy audit log entry.
 * Uses the singleton (service-role) because the privacyAuditLog INSERT policy
 * requires auth.uid() = userId, which is enforced at the service layer before calling here.
 */
export async function insertPrivacyAuditLog(
  userId: string,
  previousSettings: PrivacySettingsRow,
  newSettings: PrivacySettingsRow,
): Promise<void> {
  const { error } = await supabase.from('privacyAuditLog').insert({
    userId,
    previousSettings,
    newSettings,
  });

  if (error) {
    console.error(
      `[profileRepository.insertPrivacyAuditLog] Supabase error for userId=${userId}:`,
      error.message,
    );
    // Non-critical: audit log failure should not block the main operation
    console.warn('[profileRepository.insertPrivacyAuditLog] Audit log write failed — continuing');
  }
}

/**
 * Fetches the public leaderboard via the get_leaderboard RPC.
 *
 * Decision Context:
 * - Why an RPC (not a PostgREST select): the ranking orders by a *computed* winrate
 *   (matchesWon/matchesPlayed) and applies a LIMIT in Postgres. PostgREST cannot order
 *   by an arbitrary expression, and sorting client-side would mean fetching every
 *   eligible row (egress cost). The RPC keeps computation + bounding in the DB.
 * - Eligibility (isPublic, showStats, matchesPlayed >= 5) and limit clamping [1,100]
 *   live inside the SQL function — see migration add_get_leaderboard_rpc.
 * - Uses the service-role singleton: the data returned is already public, and the RPC is
 *   SECURITY DEFINER, so no user-scoped client is required for this read path.
 * - Previously fixed bugs: none relevant.
 */
export async function getLeaderboard(
  limit: number,
  client: SupabaseClient = supabase,
): Promise<LeaderboardRow[]> {
  const { data, error } = await client.rpc('get_leaderboard', { p_limit: limit });

  if (error) {
    console.error(
      `[profileRepository.getLeaderboard] Supabase RPC error for limit=${limit}:`,
      error.message,
    );
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as LeaderboardRow[];
}

export const profileRepository = {
  getProfileById,
  getProfileWithPrivacy,
  getPrivacySettings,
  updatePrivacyFields,
  updateAvatarUrl,
  insertPrivacyAuditLog,
  getLeaderboard,
};
