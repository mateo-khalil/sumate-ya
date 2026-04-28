import type { MatchFilters, MatchFormat } from '@/graphql/operations/matches';
import type { Match } from '@/components/matches/MatchCard';

export type ClientMatchFilters = MatchFilters & {
  timeFrom?: string;
  timeTo?: string;
};

export const DEFAULT_MATCH_FILTERS: ClientMatchFilters = { status: 'OPEN' };

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

  return { ...DEFAULT_MATCH_FILTERS, ...next };
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

function matchesTimeRange(matchDate: Date, filters: ClientMatchFilters): boolean {
  const from = timeToMinutes(filters.timeFrom);
  const to = timeToMinutes(filters.timeTo);
  if (from == null && to == null) return true;

  const current = matchDate.getHours() * 60 + matchDate.getMinutes();
  if (from != null && to != null && from > to) {
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
    if (normalized.status && match.status && match.status !== normalized.status) return false;
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

  return normalizeMatchFilters({
    format: format && VALID_FORMATS.has(format) ? format : undefined,
    zone: params.get('zone') || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
    timeFrom: params.get('timeFrom') || undefined,
    timeTo: params.get('timeTo') || undefined,
    search: params.get('search') || undefined,
  });
}

export function writeMatchFiltersToUrl(filters: ClientMatchFilters, href: string): string {
  const url = new URL(href);
  const normalized = normalizeMatchFilters(filters);

  for (const key of URL_FILTER_KEYS) {
    url.searchParams.delete(key);
  }

  for (const key of URL_FILTER_KEYS) {
    const value = normalized[key];
    if (!value) continue;
    url.searchParams.set(key, key.startsWith('date') ? dateOnly(value) ?? value : value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function toServerMatchFilters(filters: ClientMatchFilters): MatchFilters {
  return {
    status: filters.status ?? 'OPEN',
  };
}

export function toDateInputValue(value?: string): string {
  return dateOnly(value) ?? '';
}
