/**
 * Club Slot Management — TypeScript companion to club-slots.graphql
 *
 * Decision Context:
 * - Why: Frontend rules forbid inline GraphQL strings inside UI components.
 *   Operations live in this file as string constants for urql usage until
 *   frontend codegen is wired up.
 * - Types mirror the backend GraphQL schema (club-slot-management.graphql) manually.
 *   When frontend codegen is added, delete this file and import generated documents.
 * - BlockType and SlotAction enums match the backend schema exactly.
 * - ManagedClubSlot omits resolver-only fields (hasScheduledMatch is fetched from backend).
 * - Previously fixed bugs: none relevant.
 */

// =====================================================
// Enums (mirror GraphQL schema)
// =====================================================

export type BlockType = 'ADMIN' | 'MAINTENANCE' | 'EVENT' | 'WEATHER' | 'HOLIDAY' | 'OTHER';
export type SlotAction = 'CREATED' | 'UPDATED' | 'BLOCKED' | 'UNBLOCKED' | 'DELETED' | 'PRICE_CHANGED';
export type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
export type CourtSurface = 'GRASS' | 'SYNTHETIC' | 'CONCRETE' | 'INDOOR';

// =====================================================
// Interfaces
// =====================================================

export interface AdminCourt {
  id: string;
  name: string;
  maxFormat: MatchFormat;
  surface: CourtSurface;
  isIndoor: boolean;
}

export interface ManagedClubSlot {
  id: string;
  clubId: string;
  courtId: string;
  court: AdminCourt;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  isBlocked: boolean;
  blockReason: string | null;
  blockType: BlockType | null;
  isActive: boolean;
  allowOnlineBooking: boolean;
  hasScheduledMatch: boolean;
  updatedAt: string | null;
}

export interface AuditProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SlotAuditLog {
  id: string;
  slotId: string | null;
  action: SlotAction;
  previousValue: string | null;
  newValue: string | null;
  changedBy: AuditProfile | null;
  reason: string | null;
  createdAt: string;
}

export interface CourtPricing {
  id: string;
  courtId: string;
  basePrice: number;
  peakStart: string | null;
  peakEnd: string | null;
  peakDays: number[];
  peakMultiplier: number;
  offPeakDiscount: number;
  createdAt: string;
}

export interface AffectedMatch {
  matchId: string;
  title: string;
  scheduledAt: string;
  participantCount: number;
}

export interface SlotImpactPreview {
  totalSlotsAffected: number;
  matchesAffected: number;
  playersToNotify: number;
  matchDetails: AffectedMatch[];
}

export interface ClubSlotMutationResult {
  success: boolean;
  slot: ManagedClubSlot | null;
  message: string | null;
  impactPreview: SlotImpactPreview | null;
  cancelledMatchesCount: number;
  notifiedPlayersCount: number;
}

export interface BulkSlotMutationResult {
  success: boolean;
  affectedCount: number;
  skippedCount: number;
  message: string | null;
  impactPreview: SlotImpactPreview | null;
  cancelledMatchesCount: number;
  notifiedPlayersCount: number;
}

export interface CourtPricingMutationResult {
  success: boolean;
  courtPricing: CourtPricing | null;
  message: string | null;
}

// =====================================================
// Input types
// =====================================================

export interface CreateClubSlotInput {
  courtId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration?: number;
  priceArs?: number | null;
  allowOnlineBooking?: boolean;
}

export interface UpdateClubSlotInput {
  slotId: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  priceArs?: number | null;
  allowOnlineBooking?: boolean;
}

export interface BlockSlotInput {
  slotId: string;
  isBlocked: boolean;
  blockReason?: string;
  blockType?: BlockType;
  confirmForce?: boolean;
}

export interface BulkBlockSlotsInput {
  slotIds: string[];
  isBlocked: boolean;
  blockReason?: string;
  blockType?: BlockType;
  confirmForce?: boolean;
}

export interface UpdateCourtPricingInput {
  courtId: string;
  basePrice: number;
  peakStart?: string | null;
  peakEnd?: string | null;
  peakDays?: number[];
  peakMultiplier?: number;
  offPeakDiscount?: number;
}

// =====================================================
// Spanish labels for display
// =====================================================

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  ADMIN: 'Administración',
  MAINTENANCE: 'Mantenimiento',
  EVENT: 'Evento especial',
  WEATHER: 'Condiciones climáticas',
  HOLIDAY: 'Feriado / vacaciones',
  OTHER: 'Otro',
};

export const SLOT_ACTION_LABELS: Record<SlotAction, string> = {
  CREATED: 'Creado',
  UPDATED: 'Actualizado',
  BLOCKED: 'Bloqueado',
  UNBLOCKED: 'Desbloqueado',
  DELETED: 'Eliminado',
  PRICE_CHANGED: 'Precio modificado',
};

export const DAY_OF_WEEK_LABELS: Record<string, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

export const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// =====================================================
// Operation strings (for urql)
// =====================================================

const MANAGED_SLOT_FIELDS = `
  fragment ManagedSlotFields on ManagedClubSlot {
    id clubId courtId
    court { id name maxFormat surface isIndoor }
    dayOfWeek startTime endTime duration priceArs
    isBlocked blockReason blockType
    isActive allowOnlineBooking hasScheduledMatch updatedAt
  }
`;

const IMPACT_PREVIEW_FIELDS = `
  fragment ImpactPreviewFields on SlotImpactPreview {
    totalSlotsAffected matchesAffected playersToNotify
    matchDetails { matchId title scheduledAt participantCount }
  }
`;

export const GET_MY_CLUB_SLOTS = `
  ${MANAGED_SLOT_FIELDS}
  query MY_CLUB_SLOTS {
    myClubSlots { ...ManagedSlotFields }
  }
`;

export const GET_CLUB_SLOTS_BY_COURT = `
  ${MANAGED_SLOT_FIELDS}
  query CLUB_SLOTS_BY_COURT($courtId: ID!) {
    clubSlotsByCourt(courtId: $courtId) { ...ManagedSlotFields }
  }
`;

export const SLOT_AUDIT_LOG = `
  query SLOT_AUDIT_LOG($slotId: ID!, $limit: Int, $offset: Int) {
    slotAuditLog(slotId: $slotId, limit: $limit, offset: $offset) {
      id slotId action previousValue newValue
      changedBy { id displayName avatarUrl }
      reason createdAt
    }
  }
`;

export const GET_SLOT_IMPACT_PREVIEW = `
  ${IMPACT_PREVIEW_FIELDS}
  query SLOT_IMPACT_PREVIEW($slotIds: [ID!]!) {
    slotImpactPreview(slotIds: $slotIds) { ...ImpactPreviewFields }
  }
`;

export const GET_COURT_PRICING = `
  query COURT_PRICING($courtId: ID!) {
    courtPricing(courtId: $courtId) {
      id courtId basePrice peakStart peakEnd peakDays
      peakMultiplier offPeakDiscount createdAt
    }
  }
`;

export const CREATE_CLUB_SLOT = `
  ${MANAGED_SLOT_FIELDS}
  mutation CREATE_CLUB_SLOT($input: CreateClubSlotInput!) {
    createClubSlot(input: $input) {
      success message
      slot { ...ManagedSlotFields }
    }
  }
`;

export const UPDATE_CLUB_SLOT = `
  ${MANAGED_SLOT_FIELDS}
  mutation UPDATE_CLUB_SLOT($input: UpdateClubSlotInput!) {
    updateClubSlot(input: $input) {
      success message
      slot { ...ManagedSlotFields }
    }
  }
`;

export const DELETE_CLUB_SLOT = `
  mutation DELETE_CLUB_SLOT($slotId: ID!) {
    deleteClubSlot(slotId: $slotId) {
      success message
      slot { id isActive }
    }
  }
`;

export const TOGGLE_SLOT_BLOCK = `
  ${MANAGED_SLOT_FIELDS}
  ${IMPACT_PREVIEW_FIELDS}
  mutation TOGGLE_SLOT_BLOCK($input: BlockSlotInput!) {
    toggleSlotBlock(input: $input) {
      success message cancelledMatchesCount notifiedPlayersCount
      slot { ...ManagedSlotFields }
      impactPreview { ...ImpactPreviewFields }
    }
  }
`;

export const BULK_BLOCK_SLOTS = `
  ${IMPACT_PREVIEW_FIELDS}
  mutation BULK_BLOCK_SLOTS($input: BulkBlockSlotsInput!) {
    bulkBlockSlots(input: $input) {
      success affectedCount skippedCount message cancelledMatchesCount notifiedPlayersCount
      impactPreview { ...ImpactPreviewFields }
    }
  }
`;

export const UPDATE_COURT_PRICING = `
  mutation UPDATE_COURT_PRICING($input: UpdateCourtPricingInput!) {
    updateCourtPricing(input: $input) {
      success message
      courtPricing {
        id courtId basePrice peakStart peakEnd peakDays
        peakMultiplier offPeakDiscount createdAt
      }
    }
  }
`;
