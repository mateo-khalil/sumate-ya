/**
 * Auth service
 *
 * Decision Context:
 * - Why: Frontend must not access Supabase or the database directly. All auth and role
 *   resolution flows are brokered by the backend.
 * - Pattern: Uses anon client for credential login and user-scoped clients for session
 *   and profile resolution so RLS policies are enforced on every profiles read.
 *   register() and registerPlayer() use the service-role singleton client because the
 *   new user has no active session yet — RLS would block the insert otherwise.
 * - login(): Supabase signInWithPassword returns "Email not confirmed" as a distinct error.
 *   This is preserved and re-thrown so authController can return 403 with a clear message.
 *   All other auth failures remain ambiguous to avoid email enumeration.
 * - register(): Uses admin.createUser() with email_confirm: true so the user is immediately
 *   active without email verification. This bypasses Supabase's per-IP rate limit (~30/hr on
 *   the free tier) that auth.signUp() is subject to — critical because the backend's single IP
 *   would exhaust that limit quickly. Profile and club rows are created in the same request;
 *   orphaned auth users are cleaned up if either insert fails. After a successful insert the
 *   backend sends a welcome email via Resend (emailService) — we no longer depend on Supabase
 *   SMTP/auth-triggered emails, so Resend is the single source of outbound mail. Email failure
 *   is logged but never rolls back registration (user must still be able to sign in).
 * - Previously fixed bugs:
 *   - signUp() rate limit hit during testing → switched to admin.createUser() permanently.
 *   - login() masked "Email not confirmed" as generic error → now re-thrown distinctly.
 *   - getUserRole() used the service-role singleton client, bypassing RLS. Fixed: renamed to
 *     getUserProfile(), now accepts a user-scoped SupabaseClient so RLS enforces auth.uid()=id.
 *   - mapAuthenticatedUser() read displayName from user_metadata.nombre instead of
 *     profiles.displayName. Fixed: PROFILE_COLUMNS now includes displayName; user_metadata
 *     is kept only as a last-resort fallback via resolveDisplayName().
 *   - register() rollback blocks were silently swallowing cleanup errors (P5 audit). Fixed:
 *     all cleanup failures now logged with console.error so orphaned rows are detectable.
 */

import type { User, SupabaseClient } from '@supabase/supabase-js';

import { createAnonClient, createUserClient, supabase } from '../config/supabase.js';
import { emailService } from './emailService.js';

const PROFILE_COLUMNS = 'role, displayName';

/**
 * Resolve display name from Supabase User object as last-resort fallback.
 * Priority: user_metadata.displayName > user_metadata.nombre (legacy) > email
 */
function resolveDisplayName(user: User): string {
  return (
    (typeof user.user_metadata?.displayName === 'string' ? user.user_metadata.displayName : null) ??
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null) ??
    (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null) ??
    (typeof user.user_metadata?.nombre === 'string' ? user.user_metadata.nombre : null) ??
    user.email ??
    'Usuario'
  );
}

function resolveAvatarUrl(user: User): string | null {
  return (
    (typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null) ??
    (typeof user.user_metadata?.picture === 'string' ? user.user_metadata.picture : null)
  );
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
  phone: string;
  department: string;
  lat: number;
  lng: number;
}

export interface RegisterPlayerInput {
  displayName: string;
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  accessToken: string;
  currentPassword: string;
  newPassword: string;
}

interface UserProfile {
  role: AuthUserRole;
  displayName: string;
}

// profiles.displayName is the authoritative source; resolveDisplayName() is last-resort fallback.
function mapAuthenticatedUser(user: User, profile: UserProfile): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: profile.displayName || resolveDisplayName(user),
    role: profile.role,
  };
}

// Accepts user-scoped client so RLS enforces auth.uid() = id on the profiles read.
// Returns both role and displayName in a single round-trip.
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

async function ensureGooglePlayerProfileExists(user: User): Promise<void> {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      displayName: resolveDisplayName(user),
      avatarUrl: resolveAvatarUrl(user),
      role: 'player',
      matchesPlayed: 0,
      matchesWon: 0,
      isPublic: true,
    },
    {
      onConflict: 'id',
      ignoreDuplicates: true,
    },
  );

  if (error) {
    console.error(
      `[authService.loginWithGoogle] Profile upsert failed for userId=${user.id}:`,
      error.message,
    );
    throw new Error(`Error al crear el perfil: ${error.message}`);
  }
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResult> {
    const authClient = createAnonClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = error.message ?? '';
      // Preserve email confirmation errors so the frontend can show a helpful message.
      // All other Supabase errors collapse to the ambiguous fallback to avoid email enumeration.
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

    // Use user-scoped client so the profiles SELECT respects RLS.
    const userClient = createUserClient(data.session.access_token);
    const profile = await getUserProfile(data.user.id, userClient);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: mapAuthenticatedUser(data.user, profile),
    };
  },

  /**
   * Login with a Google ID token.
   *
   * Decision Context:
   * - The browser only obtains the Google credential. The backend exchanges it through
   *   Supabase Auth, so the frontend never talks to Supabase or handles secrets directly.
   * - First-time Google users receive a minimal player profile. Existing profiles are not
   *   updated because club_admin accounts must keep their role and club ownership.
   * - The final profile read still uses a user-scoped client, matching the password login
   *   flow and proving RLS can resolve the authenticated user's own profile.
   */
  async loginWithGoogle(idToken: string): Promise<LoginResult> {
    const authClient = createAnonClient();
    const { data, error } = await authClient.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      console.error('[authService.loginWithGoogle] signInWithIdToken failed:', error.message);
      throw new Error('Invalid Google credentials');
    }

    if (!data.session || !data.user) {
      throw new Error('Invalid Google credentials');
    }

    await ensureGooglePlayerProfileExists(data.user);

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

    // Pass the existing user-scoped client so profiles read respects RLS.
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

  /**
   * Change the authenticated user's password.
   *
   * Decision Context:
   * - Supabase Auth owns password storage; profiles is never touched.
   * - updateUser({ password }) only needs a valid session, but the product flow asks for
   *   current password. We verify it with signInWithPassword before updating.
   * - Uses the existing access token for getUser/updateUser so the mutation is scoped to
   *   the caller's session.
   */
  async changePassword(input: ChangePasswordInput): Promise<void> {
    const userClient = createUserClient(input.accessToken);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.email) {
      throw new Error('Invalid or expired token');
    }

    const anonClient = createAnonClient();
    const { error: verifyError } = await anonClient.auth.signInWithPassword({
      email: user.email,
      password: input.currentPassword,
    });

    if (verifyError) {
      throw new Error('Current password is incorrect');
    }

    const { error: updateError } = await userClient.auth.updateUser({
      password: input.newPassword,
    });

    if (updateError) {
      throw new Error(updateError.message || 'Password update failed');
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
    // Decision Context:
    // - department: one of the 19 Uruguayan departments; validated by Zod in the controller.
    // - zone = department: the zone column drives the zone filter on the match-listing page.
    //   Setting it to department ensures newly registered clubs appear in the zone filter
    //   without requiring a separate "edit club" flow. Backward-compat: existing clubs
    //   that have null zone are simply omitted from the filter dropdown, which was already
    //   the behavior before this change.
    // - lat/lng: validated within Uruguay bounds by Zod; set to department capital by the
    //   frontend ClubLocationPicker if the admin doesn't drag the pin.
    // Previously fixed bugs: zone/lat/lng were omitted from registration, leaving new clubs
    //   invisible on the match-listing map. Now all three are captured at signup.
    const { error: clubError } = await supabase.from('clubs').insert({
      ownerId: userId,
      name: input.clubName,
      address: input.address,
      phone: input.phone,
      department: input.department,
      zone: input.department,
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
   * - Pattern: Mirrors register() — admin.createUser() with email_confirm: true followed
   *   by a service-role insert into profiles with role='player'. If the profile insert
   *   fails, the auth.users row is removed so the email is not orphaned.
   * - Constraints: Does NOT touch the clubs table. No welcome email yet — emailService
   *   only has a club-flavored template.
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
