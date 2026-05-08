/**
 * Club Dashboard Resolver — GraphQL resolvers for club admin dashboard
 *
 * Decision Context:
 * - Why: Thin resolver layer. Auth + role enforcement here; all business logic
 *   in clubDashboardService. Pattern mirrors club-slot.ts resolver.
 * - requireClubAdminRole (via profileRepository): defense-in-depth beyond service
 *   ownership check. Same approach as club-slot.ts (P7 fix reapplied here).
 * - User-scoped client created for all queries (not just mutations) because the
 *   dashboard reads match/slot data — RLS must enforce clubs.ownerId = auth.uid().
 * - Zod validation: dateRange max 90 days, valid UUID arrays, enum values.
 * - Export query: format param must be 'csv' or 'json' (case insensitive).
 * - Error messages in Spanish per project UX conventions.
 * - Query resolver object is not typed as QueryResolvers because the generated enum
 *   types (MatchFormat, MatchStatus, etc.) are TypeScript enums — not directly
 *   assignable from plain string literals without explicit use of enum values.
 *   We import and use the generated enum values in mapFormat/mapStatus instead.
 * - Previously fixed bugs:
 *   - Enum "MatchFormat" cannot represent value: "11v11" — schedule[].match objects
 *     were returned with raw DB strings; mapMatchEnums now applied to both top-level
 *     matches and nested slot.match before the response is serialized.
 */

import { z } from 'zod';
import { createUserClient } from '../../../config/supabase.js';
import { clubDashboardService } from '../../../services/clubDashboardService.js';
import { profileRepository } from '../../../repositories/profileRepository.js';
import {
  MatchFormat as GQLMatchFormat,
  MatchStatus as GQLMatchStatus,
  TimeStatus as GQLTimeStatus,
} from '../../generated/graphql.js';
import { requireAuth } from '../../../types/context.js';
import type { GraphQLContext } from '../../../types/context.js';

// =====================================================
// Validation schemas
// =====================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MATCH_STATUSES = ['open', 'full', 'in_progress', 'completed', 'cancelled'] as const;

const FiltersSchema = z
  .object({
    startDate: z.string().regex(DATE_REGEX, 'Fecha de inicio inválida (YYYY-MM-DD)').optional(),
    endDate: z.string().regex(DATE_REGEX, 'Fecha de fin inválida (YYYY-MM-DD)').optional(),
    courtIds: z.array(z.string().regex(UUID_REGEX, 'courtId inválido')).optional(),
    matchStatuses: z.array(z.enum(MATCH_STATUSES)).optional(),
    includeBlocked: z.boolean().optional(),
    includeInactive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.startDate && val.endDate) {
      const start = new Date(val.startDate);
      const end = new Date(val.endDate);
      if (end < start) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'endDate debe ser posterior a startDate' });
      }
      const days = (end.getTime() - start.getTime()) / 86_400_000;
      if (days > 90) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El rango no puede superar 90 días' });
      }
    }
  });

// =====================================================
// Auth helpers
// =====================================================

async function requireClubAdminRole(userId: string): Promise<void> {
  const profile = await profileRepository.getProfileById(userId);
  if (!profile || profile.role !== 'club_admin') {
    throw new Error('Solo administradores de club pueden acceder al dashboard');
  }
}

function userClientFrom(ctx: GraphQLContext) {
  return ctx.accessToken ? createUserClient(ctx.accessToken) : undefined;
}

// =====================================================
// Enum mappers (DB lowercase strings → generated TS enums)
// =====================================================

function mapFormat(f: string): GQLMatchFormat {
  const map: Record<string, GQLMatchFormat> = {
    '5v5': GQLMatchFormat.FiveVsFive,
    '7v7': GQLMatchFormat.SevenVsSeven,
    '10v10': GQLMatchFormat.TenVsTen,
    '11v11': GQLMatchFormat.ElevenVsEleven,
  };
  return map[f] ?? GQLMatchFormat.FiveVsFive;
}

function mapStatus(s: string): GQLMatchStatus {
  const map: Record<string, GQLMatchStatus> = {
    open: GQLMatchStatus.Open,
    full: GQLMatchStatus.Full,
    in_progress: GQLMatchStatus.InProgress,
    completed: GQLMatchStatus.Completed,
    cancelled: GQLMatchStatus.Cancelled,
  };
  return map[s] ?? GQLMatchStatus.Open;
}

function mapTimeStatus(s: string): GQLTimeStatus {
  const map: Record<string, GQLTimeStatus> = {
    PAST: GQLTimeStatus.Past,
    FINISHED_RECENTLY: GQLTimeStatus.FinishedRecently,
    NOW: GQLTimeStatus.Now,
    UPCOMING_SOON: GQLTimeStatus.UpcomingSoon,
    UPCOMING: GQLTimeStatus.Upcoming,
    FAR_FUTURE: GQLTimeStatus.FarFuture,
  };
  return map[s] ?? GQLTimeStatus.Upcoming;
}

// =====================================================
// Queries (typed as plain Record to avoid enum mismatch with QueryResolvers)
// =====================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Query: Record<string, (...args: any[]) => Promise<unknown>> = {
  clubDashboard: async (_parent: unknown, args: { filters?: Record<string, unknown> | null }, ctx: GraphQLContext) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    let filters = {};
    if (args.filters) {
      const parsed = FiltersSchema.safeParse(args.filters);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((issue) => issue.message).join('; ');
        throw new Error(`Filtros inválidos: ${msg}`);
      }
      filters = {
        ...parsed.data,
        matchStatuses: parsed.data.matchStatuses?.map((s) => s.toLowerCase()),
      };
    }

    try {
      const data = await clubDashboardService.getDashboard(
        { userId: ctx.user!.id, supabase: userClient },
        filters,
      );

      // mapMatchEnums: converts raw DB strings to GQL enum values for a DashboardMatch.
      // Applied to both top-level matches AND nested schedule[].match — the serializer
      // rejects the raw '11v11' / 'open' / 'PAST' strings if they reach it unmapped.
      // Previously fixed bugs: 'Enum "MatchFormat" cannot represent value: "11v11"' when
      // schedule slots had matches; schedule was not being mapped through enum converters.
      const mapMatchEnums = (m: (typeof data.matches)[number]) => ({
        ...m,
        format: mapFormat(m.format),
        status: mapStatus(m.status),
        timeStatus: mapTimeStatus(m.timeStatus),
      });

      return {
        club: {
          id: data.club.id,
          name: data.club.name,
          zone: data.club.zone,
          address: data.club.address,
          imageUrl: data.club.imageUrl,
          phone: data.club.phone,
          lat: null,
          lng: null,
        },
        metrics: data.metrics,
        schedule: data.schedule.map((slot) => ({
          ...slot,
          match: slot.match ? mapMatchEnums(slot.match) : null,
        })),
        matches: data.matches.map(mapMatchEnums),
        conflicts: data.conflicts,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al cargar el dashboard';
      console.error('[club-dashboard.resolver.clubDashboard] Error:', msg);
      throw new Error(msg);
    }
  },

  clubMetrics: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    try {
      return clubDashboardService.getMetrics({ userId: ctx.user!.id, supabase: userClient });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al cargar las métricas';
      console.error('[club-dashboard.resolver.clubMetrics] Error:', msg);
      throw new Error(msg);
    }
  },

  exportClubSchedule: async (_parent: unknown, args: { filters?: Record<string, unknown> | null; format?: string | null }, ctx: GraphQLContext) => {
    requireAuth(ctx);
    await requireClubAdminRole(ctx.user!.id);
    const userClient = userClientFrom(ctx);

    const fmt = (args.format ?? 'csv').toLowerCase();
    if (fmt !== 'csv' && fmt !== 'json') {
      throw new Error('Formato de exportación inválido. Use "csv" o "json"');
    }

    let filters = {};
    if (args.filters) {
      const parsed = FiltersSchema.safeParse(args.filters);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((issue) => issue.message).join('; ');
        throw new Error(`Filtros inválidos: ${msg}`);
      }
      filters = parsed.data;
    }

    try {
      return clubDashboardService.exportSchedule(
        { userId: ctx.user!.id, supabase: userClient },
        filters,
        fmt,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al exportar el reporte';
      console.error('[club-dashboard.resolver.exportClubSchedule] Error:', msg);
      throw new Error(msg);
    }
  },
};

export const clubDashboardResolvers = { Query };
