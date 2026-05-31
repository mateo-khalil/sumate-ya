/**
 * Tournament filtering utilities for the /torneos listing.
 *
 * Decision Context:
 * - Mirrors the /partidos filter flow: controlled filter state lives in TournamentsView,
 *   URL persistence stays outside the UI-only filter bar, and list/map receive the same
 *   normalized filters.
 * - Unlike matches, tournament filters are forwarded to the GraphQL query because the
 *   tournament dataset can include registration and in-progress rows. The small local
 *   filter mirror remains as a defensive fallback for mocked tests and registration
 *   updates that change a card's status without a full refetch.
 */

import type { MatchFormat } from '@/graphql/operations/matches';
import type {
  TournamentFilters,
  TournamentListItem,
  TournamentStatus,
} from '@/graphql/operations/tournaments';

export type ClientTournamentFilters = TournamentFilters;

export const DEFAULT_TOURNAMENT_FILTERS: ClientTournamentFilters = {
  status: 'REGISTRATION',
};

const URL_FILTER_KEYS = ['status', 'format', 'zone', 'dateFrom', 'dateTo', 'search'] as const;

const VALID_FORMATS = new Set<MatchFormat>([
  'FIVE_VS_FIVE',
  'SEVEN_VS_SEVEN',
  'TEN_VS_TEN',
  'ELEVEN_VS_ELEVEN',
]);

const VALID_STATUSES = new Set<TournamentStatus>(['REGISTRATION', 'IN_PROGRESS']);

function compactFilters(filters: ClientTournamentFilters): ClientTournamentFilters {
  const next: ClientTournamentFilters = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === '') continue;
    next[key as keyof ClientTournamentFilters] = value as never;
  }

  return { ...DEFAULT_TOURNAMENT_FILTERS, ...next };
}

function dateOnly(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.includes('T') ? value.split('T')[0] : value;
}

function toLocalDate(value?: string | null, endOfDay = false): Date | null {
  const date = dateOnly(value);
  if (!date) return null;
  return new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
}

export function normalizeTournamentFilters(
  filters: ClientTournamentFilters,
): ClientTournamentFilters {
  return compactFilters(filters);
}

export function filterTournaments(
  tournaments: TournamentListItem[],
  filters: ClientTournamentFilters,
): TournamentListItem[] {
  const normalized = normalizeTournamentFilters(filters);
  const fromDate = toLocalDate(normalized.dateFrom);
  const toDate = toLocalDate(normalized.dateTo, true);

  return tournaments.filter((tournament) => {
    if (normalized.status && tournament.status !== normalized.status) return false;
    if (normalized.format && tournament.format !== normalized.format) return false;
    if (normalized.zone && tournament.club?.zone !== normalized.zone) return false;

    const search = normalized.search?.trim().toLowerCase();
    if (search) {
      const haystack = [
        tournament.name,
        tournament.description,
        tournament.club?.name,
        tournament.club?.zone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    if (fromDate || toDate) {
      if (!tournament.startDate) return false;
      const tournamentDate = toLocalDate(tournament.startDate);
      if (!tournamentDate) return false;
      if (fromDate && tournamentDate < fromDate) return false;
      if (toDate && tournamentDate > toDate) return false;
    }

    return true;
  });
}

export function parseTournamentFiltersFromSearch(search: string): ClientTournamentFilters {
  const params = new URLSearchParams(search);
  const status = params.get('status') as TournamentStatus | null;
  const format = params.get('format') as MatchFormat | null;

  return normalizeTournamentFilters({
    status: status && VALID_STATUSES.has(status) ? status : undefined,
    format: format && VALID_FORMATS.has(format) ? format : undefined,
    zone: params.get('zone') || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
    search: params.get('search') || undefined,
  });
}

export function writeTournamentFiltersToUrl(
  filters: ClientTournamentFilters,
  href: string,
): string {
  const url = new URL(href);
  const normalized = normalizeTournamentFilters(filters);

  for (const key of URL_FILTER_KEYS) {
    url.searchParams.delete(key);
  }

  for (const key of URL_FILTER_KEYS) {
    const value = normalized[key];
    if (!value) continue;
    if (key === 'status' && value === DEFAULT_TOURNAMENT_FILTERS.status) continue;
    url.searchParams.set(key, key.startsWith('date') ? dateOnly(value) ?? value : value);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function toServerTournamentFilters(
  filters: ClientTournamentFilters,
): TournamentFilters {
  const normalized = normalizeTournamentFilters(filters);

  return {
    status: normalized.status,
    format: normalized.format,
    zone: normalized.zone,
    dateFrom: dateOnly(normalized.dateFrom),
    dateTo: dateOnly(normalized.dateTo),
    search: normalized.search?.trim() || undefined,
  };
}

export function toDateInputValue(value?: string): string {
  return dateOnly(value) ?? '';
}

export function toDateFilter(value: string): string | undefined {
  return value || undefined;
}
