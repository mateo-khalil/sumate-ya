/**
 * Notification Repository — DB access for `notifications` and `notificationPreferences`
 *
 * Decision Context:
 * - Why: Explicit column lists enforce backend.md egress-prevention ("NEVER select('*')").
 * - Two access modes:
 *     · Owner read/manage (find/count/markRead/markAllRead/deleteOne, getPreferences,
 *       upsertPreferences) take a user-scoped client so RLS (auth.uid() = userId) applies.
 *     · System write (insertMany) and the preference lookup used while NOTIFYING another
 *       user (findPreferencesForUser) use the service-role singleton, because a system
 *       event (e.g. "someone joined organizer X's match") must read X's prefs and insert
 *       a row for X even though the acting user is a different player.
 * - markAllRead / markRead / deleteOne all re-scope on "userId" in addition to RLS as
 *   defense-in-depth: even with the service-role singleton these would never touch another
 *   user's rows.
 * - camelCase identifiers are quoted because the DB uses quoted-camelCase naming.
 * - Previously fixed bugs: none relevant.
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions (NEVER use select('*'))
// =====================================================

const NOTIFICATION_COLUMNS = `
  id,
  type,
  title,
  body,
  "referenceId",
  "isRead",
  "createdAt"
`;

const PREFERENCES_COLUMNS = `
  "matchActivity",
  "matchUpdates",
  "matchResults",
  "invitations"
`;

// =====================================================
// Types
// =====================================================

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreferencesRow {
  matchActivity: boolean;
  matchUpdates: boolean;
  matchResults: boolean;
  invitations: boolean;
}

export interface UpdatePreferencesFields {
  matchActivity?: boolean;
  matchUpdates?: boolean;
  matchResults?: boolean;
  invitations?: boolean;
}

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  referenceId?: string | null;
}

// =====================================================
// Notification reads / mutations (owner-scoped)
// =====================================================

export async function findByUser(
  userId: string,
  limit: number,
  client: SupabaseClient = supabase,
): Promise<NotificationRow[]> {
  const { data, error } = await client
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[notificationRepository.findByUser] Supabase error for userId=${userId}:`, error.message);
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as NotificationRow[];
}

export async function countUnread(
  userId: string,
  client: SupabaseClient = supabase,
): Promise<number> {
  const { count, error } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('userId', userId)
    .eq('isRead', false);

  if (error) {
    console.error(`[notificationRepository.countUnread] Supabase error for userId=${userId}:`, error.message);
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function markRead(
  id: string,
  userId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('notifications')
    .update({ isRead: true })
    .eq('id', id)
    .eq('userId', userId);

  if (error) {
    console.error(`[notificationRepository.markRead] Supabase error for id=${id} userId=${userId}:`, error.message);
    throw new Error(error.message);
  }
}

/** Marks every unread notification read; returns how many rows were updated. */
export async function markAllRead(
  userId: string,
  client: SupabaseClient = supabase,
): Promise<number> {
  const { data, error } = await client
    .from('notifications')
    .update({ isRead: true })
    .eq('userId', userId)
    .eq('isRead', false)
    .select('id');

  if (error) {
    console.error(`[notificationRepository.markAllRead] Supabase error for userId=${userId}:`, error.message);
    throw new Error(error.message);
  }

  return (data ?? []).length;
}

export async function deleteOne(
  id: string,
  userId: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('userId', userId);

  if (error) {
    console.error(`[notificationRepository.deleteOne] Supabase error for id=${id} userId=${userId}:`, error.message);
    throw new Error(error.message);
  }
}

// =====================================================
// System write (service-role)
// =====================================================

/**
 * Bulk-inserts system notifications. Uses the service-role singleton because the acting
 * user is usually not the recipient (e.g. a join event notifies the organizer).
 */
export async function insertMany(records: NewNotification[]): Promise<void> {
  if (records.length === 0) return;

  const rows = records.map((r) => ({
    userId: r.userId,
    type: r.type,
    title: r.title,
    body: r.body ?? null,
    referenceId: r.referenceId ?? null,
    isRead: false,
  }));

  const { error } = await supabase.from('notifications').insert(rows);

  if (error) {
    console.error(`[notificationRepository.insertMany] Supabase error inserting ${rows.length} rows:`, error.message);
    throw new Error(error.message);
  }
}

// =====================================================
// Preferences
// =====================================================

/** Owner-scoped preference read (user-scoped client → RLS). Null when no row exists yet. */
export async function getPreferences(
  userId: string,
  client: SupabaseClient = supabase,
): Promise<NotificationPreferencesRow | null> {
  const { data, error } = await client
    .from('notificationPreferences')
    .select(PREFERENCES_COLUMNS)
    .eq('userId', userId)
    .maybeSingle();

  if (error) {
    console.error(`[notificationRepository.getPreferences] Supabase error for userId=${userId}:`, error.message);
    throw new Error(error.message);
  }

  return (data as unknown as NotificationPreferencesRow) ?? null;
}

/**
 * Service-role preference lookup used while deciding whether to NOTIFY a user. Reads
 * another user's row, so it must bypass RLS. Returns null when no row exists (treat as
 * all-enabled at the service layer).
 */
export async function findPreferencesForUser(
  userId: string,
): Promise<NotificationPreferencesRow | null> {
  const { data, error } = await supabase
    .from('notificationPreferences')
    .select(PREFERENCES_COLUMNS)
    .eq('userId', userId)
    .maybeSingle();

  if (error) {
    console.error(`[notificationRepository.findPreferencesForUser] Supabase error for userId=${userId}:`, error.message);
    throw new Error(error.message);
  }

  return (data as unknown as NotificationPreferencesRow) ?? null;
}

/**
 * Upserts the caller's preference row (user-scoped client → RLS INSERT/UPDATE policy).
 * Returns the resulting row.
 */
export async function upsertPreferences(
  userId: string,
  fields: UpdatePreferencesFields,
  client: SupabaseClient = supabase,
): Promise<NotificationPreferencesRow> {
  const { data, error } = await client
    .from('notificationPreferences')
    .upsert(
      { userId, ...fields, updatedAt: new Date().toISOString() },
      { onConflict: 'userId' },
    )
    .select(PREFERENCES_COLUMNS)
    .single();

  if (error) {
    console.error(`[notificationRepository.upsertPreferences] Supabase error for userId=${userId}:`, error.message);
    throw new Error(error.message);
  }

  return data as unknown as NotificationPreferencesRow;
}

export const notificationRepository = {
  findByUser,
  countUnread,
  markRead,
  markAllRead,
  deleteOne,
  insertMany,
  getPreferences,
  findPreferencesForUser,
  upsertPreferences,
};
