/**
 * Notification GraphQL operations (TypeScript companion to notifications.graphql).
 *
 * Decision Context:
 * - Why: frontend.md forbids inline GraphQL inside UI components — operations live here.
 *   Frontend codegen isn't wired up yet, so we keep a hand-typed mirror of the schema.
 *   If you edit a query, update BOTH `notifications.graphql` (backend) and this file.
 * - The bell uses GET_MY_NOTIFICATIONS (list + unreadCount in one round-trip). The settings
 *   page uses GET_MY_NOTIFICATION_PREFERENCES + UPDATE_NOTIFICATION_PREFERENCES.
 * - All operations require auth and operate on the caller's own rows (enforced by RLS).
 * - Previously fixed bugs: none relevant.
 */

// =====================================================
// Types (mirror backend GraphQL schema)
// =====================================================

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  referenceId: string | null;
  isRead: boolean;
  /** ISO-8601 timestamp. */
  createdAt: string;
}

export interface NotificationConnection {
  items: AppNotification[];
  unreadCount: number;
}

export interface NotificationPreferences {
  matchActivity: boolean;
  matchUpdates: boolean;
  matchResults: boolean;
  invitations: boolean;
}

export interface UpdateNotificationPreferencesInput {
  matchActivity?: boolean;
  matchUpdates?: boolean;
  matchResults?: boolean;
  invitations?: boolean;
}

// =====================================================
// GraphQL Operations
// =====================================================

export const GET_MY_NOTIFICATIONS = /* GraphQL */ `
  query GetMyNotifications($limit: Int) {
    myNotifications(limit: $limit) {
      items {
        id
        type
        title
        body
        referenceId
        isRead
        createdAt
      }
      unreadCount
    }
  }
`;

export const MARK_NOTIFICATION_READ = /* GraphQL */ `
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id)
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = /* GraphQL */ `
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export const DELETE_NOTIFICATION = /* GraphQL */ `
  mutation DeleteNotification($id: ID!) {
    deleteNotification(id: $id)
  }
`;

export const GET_MY_NOTIFICATION_PREFERENCES = /* GraphQL */ `
  query GetMyNotificationPreferences {
    myNotificationPreferences {
      matchActivity
      matchUpdates
      matchResults
      invitations
    }
  }
`;

export const UPDATE_NOTIFICATION_PREFERENCES = /* GraphQL */ `
  mutation UpdateNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
    updateNotificationPreferences(input: $input) {
      matchActivity
      matchUpdates
      matchResults
      invitations
    }
  }
`;
