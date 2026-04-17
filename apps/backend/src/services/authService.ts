/**
 * Auth service
 *
 * Decision Context:
 * - Why: Frontend must not access Supabase or the database directly. All auth and role
 *   resolution flows are brokered by the backend.
 * - Pattern: Uses anon client for credential login and service-role client (supabase singleton)
 *   for admin operations. Profile and club inserts use the service-role client because the
 *   new user has no active session yet — RLS would block the insert otherwise.
 * - login(): Supabase signInWithPassword returns "Email not confirmed" as a distinct error
 *   message when the user hasn't confirmed their email. This error is preserved and re-thrown
 *   so authController can return 403 with a clear Spanish message. All other auth failures
 *   remain ambiguous ("Invalid login credentials") to avoid email enumeration.
 * - register(): Uses admin.createUser() with email_confirm: true so the user is immediately
 *   active without email verification. This bypasses Supabase's per-IP rate limit (~30/hr on
 *   the free tier) that auth.signUp() is subject to — critical because the backend's single IP
 *   would exhaust that limit quickly. Profile and club rows are created in the same request;
 *   orphaned auth users are cleaned up if either insert fails.
 * - Previously fixed bugs:
 *   - signUp() rate limit hit during testing → switched to admin.createUser() permanently
 *   - login() masked "Email not confirmed" as generic error → now re-thrown distinctly
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

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  clubName: string;
  address: string;
  zone: string;
  phone: string;
  lat?: number;
  lng?: number;
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

    if (error) {
      const msg = error.message ?? '';
      // Preserve email confirmation errors so the frontend can show a helpful message
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

  async register(input: RegisterInput): Promise<void> {
    // Step 1: Create user via admin API (service role).
    // admin.createUser() bypasses Supabase's per-IP rate limit that auth.signUp() is subject
    // to (~30/hr on the free tier). With the backend as a single IP origin, signUp() would
    // exhaust that limit quickly under normal load. email_confirm: true makes the user
    // immediately active — no email verification step required.
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
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new Error(`Error al crear el perfil: ${profileError.message}`);
    }

    // Step 3: Insert club linked to the new profile.
    const { error: clubError } = await supabase.from('clubs').insert({
      ownerId: userId,
      name: input.clubName,
      address: input.address,
      zone: input.zone,
      phone: input.phone,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    });

    if (clubError) {
      await supabase.from('profiles').delete().eq('id', userId).then(
        () => undefined,
        () => undefined,
      );
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new Error(`Error al crear el club: ${clubError.message}`);
    }
  },
};
