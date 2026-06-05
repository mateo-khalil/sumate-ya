/**
 * Match filtering utilities for the /partidos listing.
 *
 * Decision Context:
 * - `timeframe` is a UI-only dimension that maps to a backend `status` filter:
 *   `upcoming` → OPEN, `past` → COMPLETED. The backend already collapses stale
 *   OPEN/FULL rows whose scheduledAt has passed into COMPLETED at presentation
 *   time (see matchService.effectiveStatus), so "past" returning COMPLETED is
 *   the correct way to surface every historic match without further hacks.
 * - `onlyMine` is forwarded to the server only when the timeframe is `past` —
 *   the upcoming list does not need participation filtering and forwarding it
 *   would only fragment the Redis cache. The server further enforces this
 *   constraint by ignoring the flag for anonymous callers.
 * - Other filters (format, zone, date range, time range, search) remain
 *   client-side because the architecture loads the dataset for the chosen
 *   timeframe in one request and filters locally for instant UX. When the
 *   dataset grows, push these to the server like onlyMine.
 * - URL persistence is intentionally narrow: only filter values useful for
 *   sharing/bookmarks are stored. `onlyMine` IS persisted because a player
 *   sharing their "mis partidos pasados" link wants the toggle preserved.
 * - `showCancelled` reveals the caller's OWN cancelled matches (auto-cancelled
 *   for not reaching the roster, or admin-cancelled). It is a private, opt-in,
 *   authenticated-only dimension: the backend scopes the CANCELLED status to the
 *   requesting user (see matchService.toFilterOptions), so a second server query
 *   with `{ status: CANCELLED, onlyMine: true }` is fired by MatchList and merged
 *   into the active dataset. It is persisted in the URL like `onlyMine`.
 * - Previously fixed bugs: none relevant — new dimension.
 */

import type { MatchFilters, MatchFormat, MatchStatus } from '@/graphql/operations/matches';
import type { Match } from '@/components/matches/MatchCard';

export type MatchTimeframe = 'upcoming' | 'past';

export type ClientMatchFilters = MatchFilters & {
  timeFrom?: string;
  timeTo?: string;
  /** UI tab — maps to status on the server (upcoming → OPEN, past → COMPLETED). */
  timeframe?: MatchTimeframe;
  /** Reveal the caller's OWN cancelled matches (authenticated-only, opt-in). */
  showCancelled?: boolean;
};

export const DEFAULT_MATCH_FILTERS: ClientMatchFilters = {
  timeframe: 'upcoming',
  status: 'OPEN',
};

const URL_FILTER_KEYS = [
  'format',
  'zone',
  'dateFrom',
  'dateTo',
  'timeFrom',
  'timeTo',
  'search',
] as const;

const VALID_FORMATS = new Set<MatchFormat>([
  'FIVE_VS_FIVE',
  'SEVEN_VS_SEVEN',
  'TEN_VS_TEN',
  'ELEVEN_VS_ELEVEN',
]);

function compactFilters(filters: ClientMatchFilters): ClientMatchFilters {
  const next: ClientMatchFilters = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === '') continue;
    next[key as keyof ClientMatchFilters] = value as never;
  }

  // Re-derive status from timeframe so the two stay in sync no matter which
  // surface (URL parser, MatchesView toggle, MatchFilters form) wrote the value.
  const timeframe: MatchTimeframe = next.timeframe ?? 'upcoming';
  const status: MatchStatus = timeframe === 'past' ? 'COMPLETED' : 'OPEN';

  return { ...DEFAULT_MATCH_FILTERS, ...next, timeframe, status };
}

function dateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  return value.includes('T') ? value.split('T')[0] : value;
}

function toLocalDateStart(value?: string): Date | null {
  const date = dateOnly(value);
  return date ? new Date(`${date}T00:00:00`) : null;
}

function toLocalDateEnd(value?: string): Date | null {
  const date = dateOnly(value);
  return date ? new Date(`${date}T23:59:59.999`) : null;
}

function timeToMinutes(value?: string): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Checks if a match's start time falls within the requested time range.
 *
 * Timezone: uses the browser's LOCAL time (Date.prototype.getHours).
 * Match startTime is stored as ISO-8601 UTC in the DB and parsed by
 * `new Date()`, which converts it to the browser's local timezone automatically.
 * Since the platform is exclusively for players and clubs in Montevideo, Uruguay
 * (UTC-3 / UTC-2 during DST), local browser time is the correct reference for
 * slot labels like "Mañana / Tarde / Noche". Accessing from outside Uruguay will
 * produce offset results — if multi-timezone support is added, replace
 * `getHours()` with Intl.DateTimeFormat using the club's IANA timezone.
 *
 * Cross-midnight ranges (e.g. 20:00–02:00): when `from > to`, the
 * match is valid if current >= from OR current <= to.
 */
function matchesTimeRange(matchDate: Date, filters: ClientMatchFilters): boolean {
  const from = timeToMinutes(filters.timeFrom);
  const to = timeToMinutes(filters.timeTo);
  if (from == null && to == null) return true;

  const current = matchDate.getHours() * 60 + matchDate.getMinutes();
  if (from != null && to != null && from > to) {
    // Cross-midnight range (e.g. Nocturno: 20:00–02:00)
    return current >= from || current <= to;
  }

  if (from != null && current < from) return false;
  if (to != null && current > to) return false;
  return true;
}

export function normalizeMatchFilters(filters: ClientMatchFilters): ClientMatchFilters {
  return compactFilters(filters);
}

export function filterMatches(matches: Match[], filters: ClientMatchFilters): Match[] {
  const normalized = normalizeMatchFilters(filters);
  const fromDate = toLocalDateStart(normalized.dateFrom);
  const toDate = toLocalDateEnd(normalized.dateTo);
  const search = normalized.search?.trim().toLowerCase();

  return matches.filter((match) => {
    // Status gate: a match must match the active timeframe status (OPEN/COMPLETED). The one
    // exception is the opt-in "Mostrar cancelados" view, where the caller's own CANCELLED
    // rows (loaded via a separate server query in MatchList) must survive even though their
    // status differs from the active timeframe.
    const isShownCancelled = !!normalized.showCancelled && match.status === 'CANCELLED';
    if (
      normalized.status &&
      match.status &&
      match.status !== normalized.status &&
      !isShownCancelled
    ) {
      return false;
    }
    if (normalized.format && match.format !== normalized.format) return false;
    if (normalized.zone && match.club?.zone !== normalized.zone) return false;

    const matchDate = new Date(match.startTime);
    if (fromDate && matchDate < fromDate) return false;
    if (toDate && matchDate > toDate) return false;
    if (!matchesTimeRange(matchDate, normalized)) return false;

    if (search) {
      const haystack = [
        match.title,
        match.club?.name,
        match.club?.zone,
        match.club?.address,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function parseMatchFiltersFromSearch(search: string): ClientMatchFilters {
  const params = new URLSearchParams(search);
  const format = params.get('format') as MatchFormat | null;
  const timeframeParam = params.get('timeframe');
  const timeframe: MatchTimeframe = timeframeParam === 'past' ? 'past' : 'upcoming';
  const onlyMine = params.get('onlyMine') === '1';
  const showCancelled = params.get('showCancelled') === '1';

  return normalizeMatchFilters({
    format: format && VALID_FORMATS.has(format) ? format : undefined,
    zone: params.get('zone') || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
    timeFrom: params.get('timeFrom') || undefined,
    timeTo: params.get('timeTo') || undefined,
    search: params.get('search') || undefined,
    timeframe,
    onlyMine: timeframe === 'past' && onlyMine ? true : undefined,
    showCancelled: showCancelled ? true : undefined,
  });
}

export function writeMatchFiltersToUrl(filters: ClientMatchFilters, href: string): string {
  const url = new URL(href);
  const normalized = normalizeMatchFilters(filters);

  for (const key of URL_FILTER_KEYS) {
    url.searchParams.delete(key);
  }
  url.searchParams.delete('timeframe');
  url.searchParams.delete('onlyMine');
  url.searchParams.delete('showCancelled');

  for (const key of URL_FILTER_KEYS) {
    const value = normalized[key];
    if (!value) continue;
    url.searchParams.set(key, key.startsWith('date') ? dateOnly(value) ?? value : value);
  }

  // Only persist non-default timeframe to keep upcoming URLs clean.
  if (normalized.timeframe === 'past') {
    url.searchParams.set('timeframe', 'past');
    if (normalized.onlyMine) {
      url.searchParams.set('onlyMine', '1');
    }
  }

  // `showCancelled` is timeframe-independent (a cancelled match may be upcoming or past),
  // so it is persisted regardless of the active tab.
  if (normalized.showCancelled) {
    url.searchParams.set('showCancelled', '1');
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Converts client filters to the MatchFilters shape expected by the GraphQL API.
 *
 * Decision Context:
 * - `status` is derived from `timeframe`: upcoming → OPEN, past → COMPLETED.
 *   This is the only timeframe→server contract; everything else is the same
 *   set of optional filters as before.
 * - `onlyMine` is forwarded only on the past timeframe — the backend ignores
 *   it for anonymous callers regardless, but skipping it on the upcoming path
 *   avoids fragmenting the shared Redis cache key for the public list.
 * - All non-server-side filters (format, zone, dateFrom, dateTo, search,
 *   timeFrom, timeTo) are still applied locally in `filterMatches` because
 *   the frontend already loads the timeframe slice in one request and filters
 *   for instant UX. When the dataset grows past comfortable single-roundtrip
 *   sizes, extend this function to forward those fields too.
 */
export function toServerMatchFilters(filters: ClientMatchFilters): MatchFilters {
  const timeframe: MatchTimeframe = filters.timeframe ?? 'upcoming';
  const status: MatchStatus = timeframe === 'past' ? 'COMPLETED' : 'OPEN';

  return {
    status,
    onlyMine: timeframe === 'past' && filters.onlyMine ? true : undefined,
  };
}

export function toDateInputValue(value?: string): string {
  return dateOnly(value) ?? '';
}

/**
 * Converts a plain date string (YYYY-MM-DD) from a `<input type="date">`
 * into an ISO-like datetime string suitable for `filters.dateFrom / dateTo`.
 * The T suffix is consumed by the private `toLocalDateStart` / `toLocalDateEnd`
 * helpers in this module (which build a `Date` object in local time) and is
 * stripped before URL serialisation in `writeMatchFiltersToUrl`.
 */
export function toDateFilter(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`;
}
