/**
 * TournamentFilters - filter controls for tournament listing.
 *
 * Decision Context:
 * - Adapted from MatchFilters with the tournament surface: search by name, status,
 *   format, zone, and date range. Tournaments do not have a time-of-day filter.
 * - Controlled by TournamentsView so list and map share the same state and URL params.
 */

import { useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { MatchFormat } from '@/graphql/operations/matches';
import type { TournamentStatus } from '@/graphql/operations/tournaments';
import {
  DEFAULT_TOURNAMENT_FILTERS,
  normalizeTournamentFilters,
  toDateFilter,
  toDateInputValue,
  type ClientTournamentFilters,
} from '@/lib/tournament-filtering';

interface TournamentFiltersProps {
  filters: ClientTournamentFilters;
  onFiltersChange: (filters: ClientTournamentFilters) => void;
}

const STATUS_OPTIONS: { value: TournamentStatus; label: string }[] = [
  { value: 'REGISTRATION', label: 'Inscripcion abierta' },
  { value: 'IN_PROGRESS', label: 'En curso' },
];

const FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
  { value: 'FIVE_VS_FIVE', label: 'Futbol 5' },
  { value: 'SEVEN_VS_SEVEN', label: 'Futbol 7' },
  { value: 'TEN_VS_TEN', label: 'Futbol 10' },
  { value: 'ELEVEN_VS_ELEVEN', label: 'Futbol 11' },
];

const ZONE_OPTIONS = ['Norte', 'Sur', 'Este', 'Oeste', 'Centro'].map((zone) => ({
  value: zone,
  label: zone,
}));

export function TournamentFilters({ filters, onFiltersChange }: TournamentFiltersProps) {
  const updateFilters = useCallback(
    (updates: Partial<ClientTournamentFilters>) => {
      onFiltersChange(normalizeTournamentFilters({ ...filters, ...updates }));
    },
    [filters, onFiltersChange],
  );

  const clearFilters = useCallback(() => {
    onFiltersChange(DEFAULT_TOURNAMENT_FILTERS);
  }, [onFiltersChange]);

  const hasActiveFilters =
    filters.status !== DEFAULT_TOURNAMENT_FILTERS.status ||
    filters.format ||
    filters.zone ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.search;

  return (
    <div className="mb-6 rounded-lg border border-border bg-card/70 p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(140px,1fr))]">
        <div className="relative min-w-0">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            aria-label="Buscar torneos"
            placeholder="Buscar torneo o club"
            value={filters.search || ''}
            onChange={(event) => updateFilters({ search: event.target.value || undefined })}
            className="pl-10"
          />
        </div>

        <Select
          aria-label="Estado"
          value={filters.status || DEFAULT_TOURNAMENT_FILTERS.status}
          placeholder="Estado"
          options={STATUS_OPTIONS}
          onValueChange={(value) =>
            updateFilters({ status: (value as TournamentStatus) || undefined })
          }
        />

        <Select
          aria-label="Formato"
          value={filters.format || ''}
          placeholder="Formato"
          options={FORMAT_OPTIONS}
          onValueChange={(value) =>
            updateFilters({ format: (value as MatchFormat) || undefined })
          }
        />

        <Select
          aria-label="Zona"
          value={filters.zone || ''}
          placeholder="Zona"
          options={ZONE_OPTIONS}
          onValueChange={(value) => updateFilters({ zone: value || undefined })}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto]">
        <DatePicker
          aria-label="Fecha desde"
          value={toDateInputValue(filters.dateFrom)}
          onValueChange={(value) => updateFilters({ dateFrom: toDateFilter(value) })}
        />

        <DatePicker
          aria-label="Fecha hasta"
          value={toDateInputValue(filters.dateTo)}
          onValueChange={(value) => updateFilters({ dateTo: toDateFilter(value) })}
        />

        <Button
          type="button"
          variant="outline"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Limpiar
        </Button>
      </div>
    </div>
  );
}
