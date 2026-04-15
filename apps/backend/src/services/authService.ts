/**
 * Auth service
 *
 * Decision Context:
 * - Why: Frontend must not access Supabase or the database directly. All auth and role
 *   resolution flows are brokered by the backend.
 * - Pattern: Uses anon client for credential login and backend-only clients for verified
 *   session/profile resolution.
 * - Constraints: Errors for invalid credentials remain ambiguous.
 * - Previously fixed bugs: none relevant.
 */

import type { User } from '@supabase/supabase-js';

import { createAnonClient, createUserClient, supabase } from '../config/supabase.js';

const PROFILE_ROLE_COLUMNS = 'role';

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

function mapAuthenticatedUser(user: User, role: AuthUserRole): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName:
      typeof user.user_metadata?.nombre === 'string'
        ? user.user_metadata.nombre
        : user.email ?? 'Usuario',
    role,
  };
}

async function getUserRole(userId: string): Promise<AuthUserRole> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_ROLE_COLUMNS)
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to resolve user role');
  }

  return data.role as AuthUserRole;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResult> {
    const authClient = createAnonClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      throw new Error('Invalid login credentials');
    }

    const role = await getUserRole(data.user.id);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: mapAuthenticatedUser(data.user, role),
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

    const role = await getUserRole(user.id);
    return mapAuthenticatedUser(user, role);
  },

  /**
   * Logout: Invalidates the user's session via Supabase Auth.
   *
   * Decision Context:
   * - Why: Explicitly invalidates the JWT with Supabase so it cannot be reused.
   * - Pattern: Uses user-scoped client to sign out the specific session.
   * - Constraints: If accessToken is invalid/expired, signOut may fail silently — that's acceptable
   *   because the token is already unusable.
   * - Previously fixed bugs: none relevant.
   */
  async logout(accessToken: string): Promise<void> {
    const userClient = createUserClient(accessToken);
    const { error } = await userClient.auth.signOut();

    if (error) {
      // Log but don't throw — session may already be invalid
      console.warn('[authService.logout] signOut error:', error.message);
    }
  },
};