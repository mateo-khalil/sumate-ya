/**
 * Court Service — business logic for club admin court CRUD (Canchas)
 *
 * Decision Context:
 * - Services return data only; enum mapping, validation, caching and ownership resolution
 *   live here, never in the resolver. Mirrors clubService / clubSlotManagementService.
 * - Ownership: every operation resolves the caller's club via clubs.ownerId = auth.uid()
 *   (getClubByOwnerId, reused from clubSlotManagementRepository). Writes use the user-scoped
 *   client so the new courts RLS policies are the real gate; the explicit ownership lookup is
 *   defense-in-depth and yields friendly Spanish errors instead of raw RLS failures.
 * - Enum mapping: DB stores 'grass'/'5v5'; GraphQL exposes GRASS/FIVE_VS_FIVE. Both directions
 *   are mapped here (same pattern as clubService.ts).
 * - Counts: getManagedCourts composes slot/match counts fetched club-wide (no N+1). These power
 *   the UI badges and explain WHY a court can't be deleted.
 * - Delete guard: a court with any slots, matches or reservations cannot be hard-deleted — the
 *   FK would fail and, more importantly, deleting would orphan operational history. We block it
 *   with a clear message instead.
 * - Caching: admin court list cached per club (CLUB_COURTS) at DYNAMIC_DATA TTL because the
 *   referencing counts shift as slots/matches change. Invalidated on every court mutation.
 * - Previously fixed bugs: none relevant (new service).
 */

import { cacheGetOrSet, cacheDelete, CACHE_TTL } from '../config/redis.js';
import { supabase } from '../config/supabase.js';
import {
  CourtSurface,
  MatchFormat,
  type ManagedCourt,
  type CreateCourtInput,
  type UpdateCourtInput,
} from '../graphql/generated/graphql.js';
import { courtRepository, type CourtRow } from '../repositories/courtRepository.js';
import { getClubByOwnerId } from '../repositories/clubSlotManagementRepository.js';
import type { ServiceContext } from '../types/context.js';

// =====================================================
// Cache keys
// =====================================================

const clubCourtsKey = (clubId: string) => `clubCourts:${clubId}`;

// =====================================================
// Enum mapping (DB ↔ GraphQL)
// =====================================================

const DB_TO_SURFACE: Record<string, CourtSurface> = {
  grass: CourtSurface.Grass,
  synthetic: CourtSurface.Synthetic,
  concrete: CourtSurface.Concrete,
  indoor: CourtSurface.Indoor,
};

const SURFACE_TO_DB: Record<CourtSurface, string> = {
  [CourtSurface.Grass]: 'grass',
  [CourtSurface.Synthetic]: 'synthetic',
  [CourtSurface.Concrete]: 'concrete',
  [CourtSurface.Indoor]: 'indoor',
};

const DB_TO_FORMAT: Record<string, MatchFormat> = {
  '5v5': MatchFormat.FiveVsFive,
  '7v7': MatchFormat.SevenVsSeven,
  '10v10': MatchFormat.TenVsTen,
  '11v11': MatchFormat.ElevenVsEleven,
};

const FORMAT_TO_DB: Record<MatchFormat, string> = {
  [MatchFormat.FiveVsFive]: '5v5',
  [MatchFormat.SevenVsSeven]: '7v7',
  [MatchFormat.TenVsTen]: '10v10',
  [MatchFormat.ElevenVsEleven]: '11v11',
};

// =====================================================
// Helpers
// =====================================================

interface ResolvedClub {
  clubId: string;
}

/** Resolve the club owned by the authenticated user, or throw a friendly error. */
async function resolveClub(ctx: ServiceContext): Promise<ResolvedClub> {
  if (!ctx.userId) throw new Error('Autenticación requerida');
  const db = ctx.supabase ?? supabase;
  const club = await getClubByOwnerId(ctx.userId, db);
  if (!club) throw new Error('No se encontró un club asociado a tu cuenta');
  return { clubId: club.id };
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) throw new Error('El nombre de la cancha es obligatorio');
  if (trimmed.length > 80) throw new Error('El nombre de la cancha es demasiado largo (máx. 80)');
  return trimmed;
}

function toManagedCourt(
  row: CourtRow,
  slotCounts: { total: number; active: number } | undefined,
  upcomingMatches: number,
): ManagedCourt {
  return {
    id: row.id,
    clubId: row.clubId,
    name: row.name,
    surface: DB_TO_SURFACE[row.surface] ?? CourtSurface.Synthetic,
    isIndoor: row.isIndoor,
    maxFormat: DB_TO_FORMAT[row.maxFormat] ?? MatchFormat.ElevenVsEleven,
    slotCount: slotCounts?.total ?? 0,
    activeSlotCount: slotCounts?.active ?? 0,
    upcomingMatchCount: upcomingMatches,
    createdAt: row.createdAt,
  };
}

// =====================================================
// Service functions
// =====================================================

/** List the admin's courts with referencing counts. Cached per club. */
export async function getManagedCourts(ctx: ServiceContext): Promise<ManagedCourt[]> {
  const { clubId } = await resolveClub(ctx);
  const db = ctx.supabase ?? supabase;

  return cacheGetOrSet<ManagedCourt[]>(
    clubCourtsKey(clubId),
    async () => {
      const [courts, slotCounts, matchCounts] = await Promise.all([
        courtRepository.getCourtsByClubId(clubId, db),
        courtRepository.getSlotCountsByClub(clubId, db),
        courtRepository.getUpcomingMatchCountsByClub(clubId, db),
      ]);
      return courts.map((c) => toManagedCourt(c, slotCounts[c.id], matchCounts[c.id] ?? 0));
    },
    CACHE_TTL.DYNAMIC_DATA,
  );
}

/** Create a court on the admin's club. */
export async function createCourt(
  ctx: ServiceContext,
  input: CreateCourtInput,
): Promise<ManagedCourt> {
  const { clubId } = await resolveClub(ctx);
  const db = ctx.supabase ?? supabase;
  const name = validateName(input.name);

  const row = await courtRepository.createCourt(
    {
      clubId,
      name,
      surface: SURFACE_TO_DB[input.surface],
      isIndoor: input.isIndoor ?? false,
      maxFormat: FORMAT_TO_DB[input.maxFormat],
    },
    db,
  );

  await cacheDelete(clubCourtsKey(clubId));
  console.info(`[courtService.createCourt] Created court ${row.id} for clubId=${clubId}`);
  return toManagedCourt(row, { total: 0, active: 0 }, 0);
}

/** Update a court owned by the admin. */
export async function updateCourt(
  ctx: ServiceContext,
  input: UpdateCourtInput,
): Promise<ManagedCourt> {
  const { clubId } = await resolveClub(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await courtRepository.getCourtById(input.courtId, db);
  if (!existing || existing.clubId !== clubId) {
    throw new Error('Cancha no encontrada');
  }

  const updates: { name?: string; surface?: string; isIndoor?: boolean; maxFormat?: string } = {};
  if (input.name != null) updates.name = validateName(input.name);
  if (input.surface != null) updates.surface = SURFACE_TO_DB[input.surface];
  if (input.maxFormat != null) updates.maxFormat = FORMAT_TO_DB[input.maxFormat];
  if (input.isIndoor != null) updates.isIndoor = input.isIndoor;

  if (Object.keys(updates).length === 0) {
    throw new Error('No hay cambios para guardar');
  }

  const row = await courtRepository.updateCourt(input.courtId, updates, db);

  const [slotCounts, matchCounts] = await Promise.all([
    courtRepository.getSlotCountsByClub(clubId, db),
    courtRepository.getUpcomingMatchCountsByClub(clubId, db),
  ]);

  await cacheDelete(clubCourtsKey(clubId));
  console.info(`[courtService.updateCourt] Updated court ${row.id} for clubId=${clubId}`);
  return toManagedCourt(row, slotCounts[row.id], matchCounts[row.id] ?? 0);
}

/**
 * Hard-delete a court. Blocked with a friendly message if it still has slots, matches or
 * reservations referencing it (FK + data-integrity).
 */
export async function deleteCourt(ctx: ServiceContext, courtId: string): Promise<void> {
  const { clubId } = await resolveClub(ctx);
  const db = ctx.supabase ?? supabase;

  const existing = await courtRepository.getCourtById(courtId, db);
  if (!existing || existing.clubId !== clubId) {
    throw new Error('Cancha no encontrada');
  }

  const counts = await courtRepository.getCourtReferenceCounts(courtId, db);
  if (counts.slots > 0 || counts.upcomingMatches > 0 || counts.reservations > 0) {
    const parts: string[] = [];
    if (counts.slots > 0) parts.push(`${counts.slots} horario(s)`);
    if (counts.upcomingMatches > 0) parts.push(`${counts.upcomingMatches} partido(s)`);
    if (counts.reservations > 0) parts.push(`${counts.reservations} reserva(s)`);
    throw new Error(
      `No se puede eliminar la cancha porque tiene ${parts.join(', ')} asociado(s). Eliminá o reasigná esos elementos primero.`,
    );
  }

  await courtRepository.deleteCourt(courtId, db);
  await cacheDelete(clubCourtsKey(clubId));
  console.info(`[courtService.deleteCourt] Deleted court ${courtId} for clubId=${clubId}`);
}

export const courtService = {
  getManagedCourts,
  createCourt,
  updateCourt,
  deleteCourt,
};
