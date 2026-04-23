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
 *   orphaned auth users are cleaned up if either insert fails. After a successful insert the
 *   backend sends a welcome email via Resend (emailService) — we no longer depend on Supabase
 *   SMTP/auth-triggered emails, so Resend is the single source of outbound mail. Email failure
 *   is logged but never rolls back registration (user must still be able to sign in).
 * - Previously fixed bugs:
 *   - signUp() rate limit hit during testing → switched to admin.createUser() permanently
 *   - login() masked "Email not confirmed" as generic error → now re-thrown distinctly
 */

import type { User } from '@supabase/supabase-js';

import { createAnonClient, createUserClient, supabase } from '../config/supabase.js';
import { emailService } from './emailService.js';

const PROFILE_ROLE_COLUMNS = 'role';

/**
 * Resolve display name from Supabase User object
 * Priority: user_metadata.displayName > email
 */
function resolveDisplayName(user: User): string {
  const displayName = user.user_metadata?.displayName ?? user.email ?? 'Usuario';
  return displayName;
}

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

export interface RegisterPlayerInput {
  displayName: string;
  email: string;
  password: string;
}

function mapAuthenticatedUser(user: User, role: AuthUserRole): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: resolveDisplayName(user),
    role,
  };
}

async function ensureProfileAndGetRole(user: User): Promise<AuthUserRole> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_ROLE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.role) {
    return data.role as AuthUserRole;
  }

  const defaultRole: AuthUserRole = 'player';
  const { error: insertError } = await supabase.from('profiles').insert({
    id: user.id,
    displayName: resolveDisplayName(user),
    role: defaultRole,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return defaultRole;
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

    const role = await ensureProfileAndGetRole(data.user);

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

    const role = await ensureProfileAndGetRole(user);
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

    // Step 4: Send welcome email via Resend. Non-blocking: a Resend outage must not
    // roll back a successful registration — the user has a valid account at this point.
    const mailResult = await emailService.sendWelcomeEmail(
      input.email,
      input.displayName,
      input.clubName,
    );
    if (!mailResult.success) {
      console.warn(
        `[authService.register] Welcome email failed for userId=${userId}:`,
        mailResult.error,
      );
    }
  },

  /**
   * Register a new player (role = 'player').
   *
   * Decision Context:
   * - Why: Players sign up to find pickup matches and join teams. Unlike club_admin
   *   registration, no club row is created and no additional business data is captured —
   *   displayName, email, and password are the minimum viable profile.
   * - Pattern: Mirrors register() — admin.createUser() with email_confirm: true (bypasses
   *   the per-IP signUp rate limit) followed by a service-role insert into profiles with
   *   role='player'. If the profile insert fails, the auth.users row is removed so the
   *   email is not orphaned and the user can retry with the same credentials.
   * - Constraints: Does NOT touch the clubs table — that is the sole differentiator vs.
   *   the club_admin flow. matchesPlayed/matchesWon/isPublic default to the same values
   *   used for club_admin so RLS-scoped reads of public profiles keep working uniformly.
   * - Email: No welcome email is sent yet because emailService only has a club-flavored
   *   template. Adding a player-specific template is out of scope for this story.
   * - Previously fixed bugs: none relevant.
   */
  async registerPlayer(input: RegisterPlayerInput): Promise<void> {
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      user_metadata: { nombre: input.displayName },
      email_confirm: true,
    });

    if (createError) {
      const msg = createError.message ?? '';
      console.error(
        `[authService.registerPlayer] createUser failed for email=${input.email}:`,
        msg,
      );
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

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      displayName: input.displayName,
      role: 'player',
      matchesPlayed: 0,
      matchesWon: 0,
      isPublic: true,
    });

    if (profileError) {
      console.error(
        `[authService.registerPlayer] profile insert failed for userId=${userId}:`,
        profileError.message,
      );
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new Error(`Error al crear el perfil: ${profileError.message}`);
    }

    console.info(`[authService.registerPlayer] Player registered userId=${userId}`);
  },
};
