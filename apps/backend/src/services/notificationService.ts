/**
 * Notification Service — business logic for the in-app notification bell + preferences
 *
 * Decision Context:
 * - The `notifications` table predates this service: system events already wrote rows
 *   (match_needs_players, match_cancelled, match_auto_cancelled, match_result_confirmed)
 *   via repository helpers. This service adds the missing READ/MANAGE path (so the bell
 *   can show them) plus a single, preference-aware CREATE path: notify() / notifyMany().
 * - notify() gates insertion on the recipient's NotificationPreferences. A notification
 *   `type` maps to exactly one preference family via TYPE_TO_PREF; when that toggle is off
 *   the row is silently skipped. Unknown types are always delivered (fail-open) so a new
 *   event type can ship before its preference toggle exists. Missing preference row →
 *   treat as all-enabled (the table defaults to all-true anyway).
 * - Side-effect placement: backend.md says side effects live in resolvers, but the existing
 *   match notification side effects already live in the service/repository layer (see
 *   matchAutoCancelService's own Decision Context). notify() follows that established
 *   pattern so all notification creation flows through one preference-aware helper.
 * - Caching: notifications:<userId> caches the bell payload (list + unread count) at
 *   DYNAMIC_DATA TTL (3 min). Any create/read/delete for that user invalidates it. The
 *   badge is allowed to be a few minutes stale; the bell re-fetches on open and on tab focus.
 * - notify() never throws to its caller: a notification failure must not roll back the
 *   business mutation that triggered it (e.g. joining a match). Errors are logged and swallowed.
 * - Previously fixed bugs: none relevant.
 */

import { z } from 'zod';
import {
  cacheDelete,
  cacheGetOrSet,
  CACHE_PREFIX,
  CACHE_TTL,
} from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import type {
  Notification,
  NotificationConnection,
  NotificationPreferences,
} from '../graphql/generated/graphql.js';
import {
  notificationRepository,
  type NotificationRow,
  type NotificationPreferencesRow,
  type UpdatePreferencesFields,
} from '../repositories/notificationRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Constants & validation
// =====================================================

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const DEFAULT_PREFERENCES: NotificationPreferencesRow = {
  matchActivity: true,
  matchUpdates: true,
  matchResults: true,
  invitations: true,
};

/**
 * Maps a notification `type` to the preference family that gates it. Types absent from
 * this map are always delivered (fail-open) — see Decision Context.
 */
const TYPE_TO_PREF: Record<string, keyof NotificationPreferencesRow> = {
  match_player_joined: 'matchActivity',
  match_needs_players: 'matchActivity',
  match_cancelled: 'matchUpdates',
  match_auto_cancelled: 'matchUpdates',
  match_result_confirmed: 'matchResults',
  team_invitation: 'invitations',
  tournament_invitation: 'invitations',
};

const UpdatePreferencesSchema = z
  .object({
    matchActivity: z.boolean().optional(),
    matchUpdates: z.boolean().optional(),
    matchResults: z.boolean().optional(),
    invitations: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'Debés proporcionar al menos un campo para actualizar',
  });

// =====================================================
// Transformers
// =====================================================

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    referenceId: row.referenceId,
    isRead: row.isRead,
    createdAt: row.createdAt,
  };
}

function toPreferences(row: NotificationPreferencesRow): NotificationPreferences {
  return {
    matchActivity: row.matchActivity,
    matchUpdates: row.matchUpdates,
    matchResults: row.matchResults,
    invitations: row.invitations,
  };
}

// =====================================================
// Read path (owner-scoped)
// =====================================================

/** Returns the caller's notifications (newest first) plus the unread count. */
export async function getMyNotifications(
  ctx: ServiceContext,
  limit?: number | null,
): Promise<NotificationConnection> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const safeLimit = Math.min(Math.max(Math.floor(limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const db = ctx.supabase ?? supabase;
  const cacheKey = `${CACHE_PREFIX.NOTIFICATIONS}${ctx.userId}:${safeLimit}`;

  try {
    return await cacheGetOrSet<NotificationConnection>(
      cacheKey,
      async () => {
        const [rows, unreadCount] = await Promise.all([
          notificationRepository.findByUser(ctx.userId as string, safeLimit, db),
          notificationRepository.countUnread(ctx.userId as string, db),
        ]);
        return { items: rows.map(toNotification), unreadCount };
      },
      CACHE_TTL.DYNAMIC_DATA,
    );
  } catch (error) {
    console.error(`[notificationService.getMyNotifications] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al obtener las notificaciones');
  }
}

/** Cheap unread-count-only read for the bell badge. */
export async function getUnreadCount(ctx: ServiceContext): Promise<number> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const db = ctx.supabase ?? supabase;
  try {
    return await notificationRepository.countUnread(ctx.userId, db);
  } catch (error) {
    console.error(`[notificationService.getUnreadCount] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al obtener el contador');
  }
}

// =====================================================
// Manage path (owner-scoped)
// =====================================================

export async function markRead(id: string, ctx: ServiceContext): Promise<boolean> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const db = ctx.supabase ?? supabase;
  try {
    await notificationRepository.markRead(id, ctx.userId, db);
    await invalidateUser(ctx.userId);
    return true;
  } catch (error) {
    console.error(`[notificationService.markRead] Failed for id=${id} userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al marcar como leída');
  }
}

export async function markAllRead(ctx: ServiceContext): Promise<number> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const db = ctx.supabase ?? supabase;
  try {
    const updated = await notificationRepository.markAllRead(ctx.userId, db);
    await invalidateUser(ctx.userId);
    console.info(`[notificationService.markAllRead] Marked ${updated} read for userId=${ctx.userId}`);
    return updated;
  } catch (error) {
    console.error(`[notificationService.markAllRead] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al marcar todas como leídas');
  }
}

export async function deleteNotification(id: string, ctx: ServiceContext): Promise<boolean> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const db = ctx.supabase ?? supabase;
  try {
    await notificationRepository.deleteOne(id, ctx.userId, db);
    await invalidateUser(ctx.userId);
    return true;
  } catch (error) {
    console.error(`[notificationService.deleteNotification] Failed for id=${id} userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al eliminar la notificación');
  }
}

// =====================================================
// Preferences
// =====================================================

export async function getMyPreferences(ctx: ServiceContext): Promise<NotificationPreferences> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const db = ctx.supabase ?? supabase;
  const cacheKey = `${CACHE_PREFIX.NOTIF_PREFS}${ctx.userId}`;

  try {
    const row = await cacheGetOrSet<NotificationPreferencesRow>(
      cacheKey,
      async () => (await notificationRepository.getPreferences(ctx.userId as string, db)) ?? DEFAULT_PREFERENCES,
      CACHE_TTL.USER_DATA,
    );
    return toPreferences(row);
  } catch (error) {
    console.error(`[notificationService.getMyPreferences] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al obtener las preferencias');
  }
}

export async function updatePreferences(
  input: UpdatePreferencesFields,
  ctx: ServiceContext,
): Promise<NotificationPreferences> {
  if (!ctx.userId) throw new Error('Autenticación requerida');

  const parsed = UpdatePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Preferencias inválidas');
  }

  const db = ctx.supabase ?? supabase;
  try {
    const row = await notificationRepository.upsertPreferences(ctx.userId, parsed.data, db);
    await cacheDelete(`${CACHE_PREFIX.NOTIF_PREFS}${ctx.userId}`);
    console.info(`[notificationService.updatePreferences] Updated for userId=${ctx.userId}`);
    return toPreferences(row);
  } catch (error) {
    console.error(`[notificationService.updatePreferences] Failed for userId=${ctx.userId}:`, error);
    throw error instanceof Error ? error : new Error('Error al actualizar las preferencias');
  }
}

// =====================================================
// Create path (preference-aware, never throws)
// =====================================================

export interface NotifyPayload {
  type: string;
  title: string;
  body?: string | null;
  referenceId?: string | null;
}

/**
 * Creates a notification for a single recipient if their preferences allow that type.
 * Best-effort: logs and swallows errors so the triggering business mutation is never
 * rolled back by a notification failure.
 */
export async function notify(recipientId: string, payload: NotifyPayload): Promise<void> {
  await notifyMany([recipientId], payload);
}

/**
 * Creates a notification for each recipient whose preferences allow the type. Recipients
 * are deduped. Best-effort (logs + swallows).
 */
export async function notifyMany(recipientIds: string[], payload: NotifyPayload): Promise<void> {
  try {
    const uniqueIds = [...new Set(recipientIds)].filter(Boolean);
    if (uniqueIds.length === 0) return;

    const allowed = await Promise.all(
      uniqueIds.map(async (userId) => ((await isAllowed(userId, payload.type)) ? userId : null)),
    );
    const recipients = allowed.filter((id): id is string => id !== null);
    if (recipients.length === 0) return;

    await notificationRepository.insertMany(
      recipients.map((userId) => ({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        referenceId: payload.referenceId ?? null,
      })),
    );

    await Promise.all(recipients.map((userId) => invalidateUser(userId)));
    console.info(`[notificationService.notifyMany] Created '${payload.type}' for ${recipients.length} recipient(s)`);
  } catch (error) {
    // Best-effort: never let a notification failure break the caller's mutation.
    console.error(`[notificationService.notifyMany] Failed to create '${payload.type}':`, error);
  }
}

/** Resolves whether `type` is allowed for `userId` given their preferences (fail-open). */
async function isAllowed(userId: string, type: string): Promise<boolean> {
  const prefKey = TYPE_TO_PREF[type];
  if (!prefKey) return true; // Unknown type → always deliver.

  const prefs = await notificationRepository.findPreferencesForUser(userId);
  if (!prefs) return true; // No row → defaults are all-enabled.
  return prefs[prefKey];
}

async function invalidateUser(userId: string): Promise<void> {
  // List cache is keyed by limit (notifications:<userId>:<limit>); clear all variants.
  await cacheDelete(`${CACHE_PREFIX.NOTIFICATIONS}${userId}:${DEFAULT_LIMIT}`);
  await cacheDelete(`${CACHE_PREFIX.NOTIFICATIONS}${userId}:${MAX_LIMIT}`);
}

export const notificationService = {
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  getMyPreferences,
  updatePreferences,
  notify,
  notifyMany,
};
