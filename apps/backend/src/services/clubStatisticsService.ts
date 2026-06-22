/**
 * Club Statistics Service — aggregations for the Estadísticas analytics page
 *
 * Decision Context:
 * - Services return data only; all bucketing/aggregation lives here. Pure reads, cached.
 * - Range: defaults to the last 30 days; capped at 365 days to bound the trend array and the
 *   query cost. startISO/endISO span the full inclusive days in UTC.
 * - UTC bucketing: day-of-week / hour / trend-date all use UTC getters so results are stable
 *   regardless of server timezone and consistent with the dashboard's UTC week math. (A future
 *   refinement could bucket in club-local time; documented here so it is a conscious tradeoff.)
 * - Revenue mirrors the dashboard definition (slot priceArs for non-cancelled matches) plus
 *   non-cancelled reservation prices, so the figure reflects both match and manual bookings.
 * - occupancyRate is an explicit approximation: non-cancelled matches ÷ (active recurring slots
 *   × weeks in range), clamped to [0,100]. Labelled as approximate in the UI.
 * - Caching: clubStats:{clubId}:{start}:{end} at DYNAMIC_DATA TTL — fresh enough as matches
 *   close, cheap to recompute. No explicit invalidation (TTL handles it).
 * - Previously fixed bugs: none relevant (new service).
 */

import { cacheGetOrSet, CACHE_TTL } from '../config/redis.js';
import { supabase, type SupabaseClient } from '../config/supabase.js';
import type {
  ClubStatistics,
  ClubStatisticsFilters,
  CourtRevenue,
  DateCount,
  DayCount,
  HourCount,
  StatusCount,
} from '../graphql/generated/graphql.js';
import { clubStatisticsRepository } from '../repositories/clubStatisticsRepository.js';
import { courtRepository } from '../repositories/courtRepository.js';
import { getClubByOwnerId } from '../repositories/clubSlotManagementRepository.js';
import type { ServiceContext } from '../types/context.js';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 365;

// =====================================================
// Range helpers
// =====================================================

function defaultRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 29 * MS_PER_DAY).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

function resolveRange(filters?: ClubStatisticsFilters | null): { startDate: string; endDate: string } {
  const def = defaultRange();
  const startDate = filters?.startDate ?? def.startDate;
  const endDate = filters?.endDate ?? def.endDate;
  const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error('Rango de fechas inválido');
  if (endMs < startMs) throw new Error('La fecha final no puede ser anterior a la inicial');
  if ((endMs - startMs) / MS_PER_DAY > MAX_RANGE_DAYS) {
    throw new Error('El rango no puede superar los 365 días');
  }
  return { startDate, endDate };
}

// =====================================================
// Service
// =====================================================

export async function getClubStatistics(
  ctx: ServiceContext,
  filters?: ClubStatisticsFilters | null,
): Promise<ClubStatistics> {
  if (!ctx.userId) throw new Error('Autenticación requerida');
  const db = ctx.supabase ?? supabase;
  const club = await getClubByOwnerId(ctx.userId, db);
  if (!club) throw new Error('No se encontró un club asociado a tu cuenta');

  const { startDate, endDate } = resolveRange(filters);
  const startISO = `${startDate}T00:00:00.000Z`;
  const endISO = `${endDate}T23:59:59.999Z`;

  return cacheGetOrSet<ClubStatistics>(
    `clubStats:${club.id}:${startDate}:${endDate}`,
    () => computeStatistics(db, club.id, startDate, endDate, startISO, endISO),
    CACHE_TTL.DYNAMIC_DATA,
  );
}

async function computeStatistics(
  db: SupabaseClient,
  clubId: string,
  startDate: string,
  endDate: string,
  startISO: string,
  endISO: string,
): Promise<ClubStatistics> {
  const [matches, reservations, courts, slotCounts] = await Promise.all([
    clubStatisticsRepository.getMatchesInRange(clubId, startISO, endISO, db),
    clubStatisticsRepository.getReservationsInRange(clubId, startISO, endISO, db),
    courtRepository.getCourtsByClubId(clubId, db),
    courtRepository.getSlotCountsByClub(clubId, db),
  ]);

  const nonCancelled = matches.filter((m) => m.status !== 'cancelled');
  const slotIds = [...new Set(nonCancelled.map((m) => m.clubSlotId).filter(Boolean) as string[])];
  const [slotPrices, playerIds] = await Promise.all([
    clubStatisticsRepository.getSlotPrices(slotIds, db),
    clubStatisticsRepository.getParticipantPlayerIds(matches.map((m) => m.id), db),
  ]);

  // ── Summary ──
  const totalMatches = matches.length;
  const completedMatches = matches.filter((m) => m.status === 'completed').length;
  const cancelledMatches = matches.filter((m) => m.status === 'cancelled').length;
  const cancellationRate = totalMatches > 0 ? cancelledMatches / totalMatches : 0;

  const activeReservations = reservations.filter((r) => r.status !== 'cancelled');
  const matchRevenue = nonCancelled.reduce(
    (sum, m) => sum + (m.clubSlotId ? slotPrices[m.clubSlotId] ?? 0 : 0),
    0,
  );
  const reservationRevenue = activeReservations.reduce((sum, r) => sum + (r.priceArs ?? 0), 0);
  const estimatedRevenue = matchRevenue + reservationRevenue;

  const courtNames = new Map(courts.map((c) => [c.id, c.name]));
  const totalActiveSlots = Object.values(slotCounts).reduce((s, c) => s + c.active, 0);
  const activeCourts = courts.filter((c) => (slotCounts[c.id]?.active ?? 0) > 0).length;

  const rangeDays = Math.max(1, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / MS_PER_DAY) + 1);
  const slotInstances = totalActiveSlots * (rangeDays / 7);
  const occupancyRate = slotInstances > 0 ? Math.min(100, (nonCancelled.length / slotInstances) * 100) : 0;

  // ── Breakdowns ──
  const statusBuckets = new Map<string, number>();
  for (const m of matches) statusBuckets.set(m.status, (statusBuckets.get(m.status) ?? 0) + 1);
  const matchesByStatus: StatusCount[] = [...statusBuckets.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const courtMatchCount = new Map<string, number>();
  const courtRevenueMap = new Map<string, number>();
  for (const m of nonCancelled) {
    if (!m.courtId) continue;
    courtMatchCount.set(m.courtId, (courtMatchCount.get(m.courtId) ?? 0) + 1);
    const price = m.clubSlotId ? slotPrices[m.clubSlotId] ?? 0 : 0;
    courtRevenueMap.set(m.courtId, (courtRevenueMap.get(m.courtId) ?? 0) + price);
  }
  const revenueByCourt: CourtRevenue[] = courts
    .map((c) => ({
      courtId: c.id,
      courtName: c.name,
      matches: courtMatchCount.get(c.id) ?? 0,
      revenue: courtRevenueMap.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.matches - a.matches || a.courtName.localeCompare(b.courtName));

  const dayBuckets = new Array(7).fill(0) as number[];
  const hourBuckets = new Map<number, number>();
  const trendBuckets = new Map<string, number>();
  for (const m of nonCancelled) {
    const d = new Date(m.scheduledAt);
    dayBuckets[d.getUTCDay()] += 1;
    const h = d.getUTCHours();
    hourBuckets.set(h, (hourBuckets.get(h) ?? 0) + 1);
    const dateKey = d.toISOString().slice(0, 10);
    trendBuckets.set(dateKey, (trendBuckets.get(dateKey) ?? 0) + 1);
  }

  const matchesByDayOfWeek: DayCount[] = dayBuckets.map((count, dayOfWeek) => ({
    dayOfWeek,
    label: DAY_LABELS[dayOfWeek],
    count,
  }));

  const matchesByHour: HourCount[] = [...hourBuckets.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  // Fill every date in the range so the trend line is continuous.
  const matchesTrend: DateCount[] = [];
  const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  for (let i = 0; i < rangeDays; i++) {
    const dateKey = new Date(startMs + i * MS_PER_DAY).toISOString().slice(0, 10);
    matchesTrend.push({ date: dateKey, count: trendBuckets.get(dateKey) ?? 0 });
  }

  return {
    range: { startDate, endDate },
    summary: {
      totalMatches,
      completedMatches,
      cancelledMatches,
      cancellationRate,
      totalReservations: activeReservations.length,
      uniquePlayers: playerIds.length,
      estimatedRevenue,
      occupancyRate,
      activeCourts,
    },
    matchesByStatus,
    revenueByCourt,
    matchesByDayOfWeek,
    matchesByHour,
    matchesTrend,
  };
}

export const clubStatisticsService = { getClubStatistics };
