/**
 * Reservations — TypeScript companion to reservation.graphql (Reservas)
 *
 * Decision Context:
 * - Frontend rules forbid inline GraphQL in components; operations live here (same convention
 *   as club-slots.ts / courts.ts). Types mirror the backend schema manually.
 * - A reservation's booker is EITHER an app user (player) OR manual contact details — the form
 *   reuses the existing SEARCH_PLAYERS query (teams.ts) for the user picker.
 * - Enum string values match the generated GraphQL enums (CONFIRMED/CANCELLED/COMPLETED).
 * - Previously fixed bugs: none relevant (new feature).
 */

export type ReservationStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface ReservationPlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Reservation {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  reservedAt: string;
  durationMin: number;
  status: ReservationStatus;
  player: ReservationPlayer | null;
  contactName: string | null;
  contactPhone: string | null;
  priceArs: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationFilters {
  startDate?: string;
  endDate?: string;
  courtId?: string;
  status?: ReservationStatus;
}

export interface CreateReservationInput {
  courtId: string;
  reservedAt: string;
  durationMin?: number;
  playerId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  priceArs?: number | null;
  notes?: string | null;
}

export interface UpdateReservationInput {
  reservationId: string;
  courtId?: string;
  reservedAt?: string;
  durationMin?: number;
  playerId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  status?: ReservationStatus;
  priceArs?: number | null;
  notes?: string | null;
}

export interface ReservationMutationResult {
  success: boolean;
  reservation: Reservation | null;
  message: string | null;
}

// =====================================================
// Labels
// =====================================================

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
};

export const STATUS_OPTIONS: ReservationStatus[] = ['CONFIRMED', 'COMPLETED', 'CANCELLED'];

// =====================================================
// Operations
// =====================================================

const RESERVATION_FIELDS = `
  id clubId courtId courtName reservedAt durationMin status
  player { id displayName avatarUrl }
  contactName contactPhone priceArs notes createdAt updatedAt
`;

export const GET_MY_CLUB_RESERVATIONS = `
  query GET_MY_CLUB_RESERVATIONS($filters: ReservationFilters) {
    myClubReservations(filters: $filters) { ${RESERVATION_FIELDS} }
  }
`;

export const CREATE_RESERVATION = `
  mutation CREATE_RESERVATION($input: CreateReservationInput!) {
    createReservation(input: $input) {
      success message
      reservation { ${RESERVATION_FIELDS} }
    }
  }
`;

export const UPDATE_RESERVATION = `
  mutation UPDATE_RESERVATION($input: UpdateReservationInput!) {
    updateReservation(input: $input) {
      success message
      reservation { ${RESERVATION_FIELDS} }
    }
  }
`;

export const CANCEL_RESERVATION = `
  mutation CANCEL_RESERVATION($reservationId: ID!) {
    cancelReservation(reservationId: $reservationId) {
      success message
      reservation { ${RESERVATION_FIELDS} }
    }
  }
`;

export const DELETE_RESERVATION = `
  mutation DELETE_RESERVATION($reservationId: ID!) {
    deleteReservation(reservationId: $reservationId) {
      success message
    }
  }
`;
