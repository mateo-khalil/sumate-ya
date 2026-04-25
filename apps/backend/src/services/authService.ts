/**
 * Auth service
 *
 * Decision Context:
 * - Why: Frontend must not access Supabase or the database directly. All auth and role
 *   resolution flows are brokered by the backend.
 * - Pattern: Uses anon client for credential login and user-scoped clients for session
 *   and profile resolution so RLS policies are enforced on every profiles read.
 * - Constraints: Errors for invalid credentials remain ambiguous (no email existence leak),
 *   but email_not_confirmed IS propagated as a distinct message so the frontend can show
 *   the correct banner without leaking whether the account exists.
 * - Previously fixed bugs:
 *   - login() used to throw 'Invalid login credentials' for ALL Supabase errors, including
 *     email_not_confirmed, so the frontend "confirm your email" banner never appeared.
 *     Fixed: inspect error.code / error.message before throwing the generic fallback.
 *   - getUserRole() used the service-role singleton client, bypassing RLS. Fixed: now
 *     accepts a user-scoped SupabaseClient and enforces RLS on the profiles read.
 *   - mapAuthenticatedUser() read displayName from user_metadata.nombre instead of
 *     profiles.displayName. Fixed: getUserProfile() now selects both role and displayName
 *     from profiles; user_metadata.nombre is kept only as a last-resort fallback.
 */

import type { User, SupabaseClient } from '@supabase/supabase-js';

import { createAnonClient, createUserClient, supabase } from '../config/supabase.js';

// P3: include displayName so mapAuthenticatedUser reads from profiles, not user_metadata.
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

interface UserProfile {
  role: AuthUserRole;
  displayName: string;
}

// P3: profiles.displayName is the authoritative source; user_metadata.nombre is last-resort fallback.
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

// M2: accepts user-scoped client so RLS enforces auth.uid() = id on the profiles read.
// P3: returns both role and displayName to avoid a second round-trip to profiles.
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
      // P1: preserve the email_not_confirmed signal so the frontend can show the correct
      // banner. All other Supabase errors collapse to the ambiguous fallback to avoid
      // leaking whether an account exists.
      const code = error.code ?? '';
      const msg = error.message ?? '';
      if (
        code === 'email_not_confirmed' ||
        msg.toLowerCase().includes('email not confirmed')
      ) {
        throw new Error('Email not confirmed');
      }
      throw new Error('Invalid login credentials');
    }

    if (!data.session || !data.user) {
      throw new Error('Invalid login credentials');
    }

    // M2: use user-scoped client so the profiles SELECT respects RLS.
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

    // M2: pass the existing user-scoped client so profiles read respects RLS.
    const profile = await getUserProfile(user.id, userClient);
    return mapAuthenticatedUser(user, profile);
  },

  // P3: exchanges a refresh token for a new session, returns fresh tokens + resolved profile.
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
};
