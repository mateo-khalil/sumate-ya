/**
 * Auth service
 *
 * Decision Context:
 * - Why: Frontend must not access Supabase or the database directly. All auth and role
 *   resolution flows are brokered by the backend.
 * - Pattern: Uses anon client for credential login and service-role client (supabase singleton)
 *   for admin operations (register). Profile and club inserts use service-role because the
 *   new user has no active session yet — RLS would block the insert otherwise.
 * - login(): Supabase signInWithPassword returns "Email not confirmed" as a distinct error.
 *   This is preserved and re-thrown so authController can return 403 with a clear message.
 *   All other auth failures remain ambiguous to avoid email enumeration.
 * - register(): Uses admin.createUser() with email_confirm: true so the user is immediately
 *   active. Bypasses the per-IP rate limit (~30/hr on the free tier) that auth.signUp() hits.
 *   Profile and club rows are created in the same request; orphaned auth users are cleaned up
 *   if either insert fails.
 * - Previously fixed bugs:
 *   - signUp() rate limit hit during testing → switched to admin.createUser() permanently.
 *   - login() masked "Email not confirmed" as generic error → now re-thrown distinctly.
 *   - getUserRole() used the service-role singleton, bypassing RLS for profile reads. Fixed:
 *     renamed to getUserProfile(), now accepts a user-scoped SupabaseClient so RLS enforces
 *     auth.uid() = id on every profiles read.
 *   - mapAuthenticatedUser() read displayName from user_metadata.nombre instead of
 *     profiles.displayName. Fixed: PROFILE_COLUMNS now includes displayName; user_metadata
 *     is kept only as a last-resort fallback.
 *   - register() rollback blocks were silently swallowing cleanup errors (P5 audit). Fixed:
 *     all cleanup failures now logged with console.error so orphaned rows are detectable.
 */

import type { User, SupabaseClient } from '@supabase/supabase-js';

import { createAnonClient, createUserClient, supabase } from '../config/supabase.js';

// P8: include displayName so mapAuthenticatedUser reads from profiles, not user_metadata.
const PROFILE_COLUMNS = 'role, displayName';

export type AuthUserRole = 'player' | 'club_admin';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: AuthUserRole;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  clubName: string;
  address: string;
  zone: string;
  phone: string;
  lat: number;
  lng: number;
}

interface UserProfile {
  role: AuthUserRole;
  displayName: string;
}

// P8: profiles.displayName is authoritative; user_metadata.nombre is last-resort fallback.
function mapAuthenticatedUser(user: User, profile: UserProfile): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName:
      profile.displayName ||
      (typeof user.user_metadata?.nombre === 'string'
        ? user.user_metadata.nombre
        : user.email ?? 'Usuario'),
    role: profile.role,
  };
}

// P7: accepts user-scoped client so RLS enforces auth.uid() = id on the profiles read.
// P8: returns both role and displayName in a single round-trip.
async function getUserProfile(userId: string, client: SupabaseClient): Promise<UserProfile> {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to resolve user profile');
  }

  return {
    role: data.role as AuthUserRole,
    displayName: data.displayName as string,
  };
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResult> {
    const authClient = createAnonClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = error.message ?? '';
      if (
        msg.toLowerCase().includes('email not confirmed') ||
        msg.toLowerCase().includes('email_not_confirmed')
      ) {
        throw new Error('Email not confirmed');
      }
      throw new Error('Invalid login credentials');
    }

    if (!data.session || !data.user) {
      throw new Error('Invalid login credentials');
    }

    // P7: use user-scoped client so the profiles SELECT respects RLS.
    const userClient = createUserClient(data.session.access_token);
    const profile = await getUserProfile(data.user.id, userClient);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: mapAuthenticatedUser(data.user, profile),
    };
  },

  async getSession(accessToken: string): Promise<AuthenticatedUser> {
    const userClient = createUserClient(accessToken);
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser();

    if (error || !user) {
      throw new Error('Invalid or expired token');
    }

    // P7: pass the existing user-scoped client so profiles read respects RLS.
    const profile = await getUserProfile(user.id, userClient);
    return mapAuthenticatedUser(user, profile);
  },

  // P3: exchanges a refresh token for a new session pair + resolved user profile.
  async refresh(refreshToken: string): Promise<LoginResult> {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session || !data.user) {
      throw new Error('Invalid or expired refresh token');
    }

    const userClient = createUserClient(data.session.access_token);
    const profile = await getUserProfile(data.user.id, userClient);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: mapAuthenticatedUser(data.user, profile),
    };
  },

  /**
   * Logout: Invalidates the user's session via Supabase Auth.
   *
   * Decision Context:
   * - Why: Explicitly invalidates the JWT so it cannot be reused after the user logs out.
   * - Pattern: Uses user-scoped client to sign out the specific session.
   * - Constraints: If the token is already invalid/expired, signOut fails silently — acceptable
   *   because the token is already unusable.
   * - Previously fixed bugs: none relevant.
   */
  async logout(accessToken: string): Promise<void> {
    const userClient = createUserClient(accessToken);
    const { error } = await userClient.auth.signOut();

    if (error) {
      console.warn('[authService.logout] signOut error:', error.message);
    }
  },

  async register(input: RegisterInput): Promise<void> {
    // Step 1: Create user via admin API (service role).
    // admin.createUser() bypasses Supabase's per-IP rate limit that auth.signUp() is subject
    // to (~30/hr on the free tier). email_confirm: true makes the user immediately active.
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      user_metadata: { nombre: input.displayName },
      email_confirm: true,
    });

    if (createError) {
      const msg = createError.message ?? '';
      if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already exists') ||
        msg.toLowerCase().includes('duplicate') ||
        msg.toLowerCase().includes('unique')
      ) {
        throw new Error('User already registered');
      }
      throw new Error(msg || 'No se pudo crear el usuario.');
    }

    if (!data.user) {
      throw new Error('No se pudo crear el usuario. Intentá de nuevo.');
    }

    const userId = data.user.id;

    // Step 2: Insert profile with service-role client to bypass RLS.
    // The new user has no active session yet, so user-scoped RLS would block the insert.
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      displayName: input.displayName,
      role: 'club_admin',
      matchesPlayed: 0,
      matchesWon: 0,
      isPublic: true,
    });

    if (profileError) {
      console.error(`[authService.register] Profile insert failed for userId=${userId}:`, profileError.message);
      // P5: log cleanup attempts so orphaned auth users are detectable in production logs.
      await supabase.auth.admin.deleteUser(userId).catch((cleanupErr: unknown) => {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(`[authService.register] Cleanup deleteUser failed for userId=${userId}:`, msg);
      });
      throw new Error(`Error al crear el perfil: ${profileError.message}`);
    }

    // Step 3: Insert club linked to the new profile.
    const { error: clubError } = await supabase.from('clubs').insert({
      ownerId: userId,
      name: input.clubName,
      address: input.address,
      zone: input.zone,
      phone: input.phone,
      lat: input.lat,
      lng: input.lng,
    });

    if (clubError) {
      console.error(`[authService.register] Club insert failed for userId=${userId}:`, clubError.message);
      // P5: log each cleanup step so partial-rollback failures surface in logs.
      const { error: delProfileErr } = await supabase.from('profiles').delete().eq('id', userId);
      if (delProfileErr) {
        console.error(`[authService.register] Cleanup deleteProfile failed for userId=${userId}:`, delProfileErr.message);
      }
      await supabase.auth.admin.deleteUser(userId).catch((cleanupErr: unknown) => {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        console.error(`[authService.register] Cleanup deleteUser failed for userId=${userId}:`, msg);
      });
      throw new Error(`Error al crear el club: ${clubError.message}`);
    }
  },
};
