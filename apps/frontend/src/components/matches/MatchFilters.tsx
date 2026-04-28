/**
 * MatchFilters Component - Filter controls for match listing.
 *
 * Decision Context:
 * - Filters are controlled by the parent so list and map views can share the same state.
 * - The list applies filters locally over the loaded open matches for instant feedback.
 * - URL persistence is handled by MatchesView, keeping this component UI-only.
 */

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import {
  DEFAULT_MATCH_FILTERS,
  normalizeMatchFilters,
  toDateFilter,
  toDateInputValue,
  type ClientMatchFilters,
} from '@/lib/match-filtering';
import type { MatchFormat } from '@/graphql/operations/matches';

interface MatchFiltersProps {
  filters: ClientMatchFilters;
  onFiltersChange: (filters: ClientMatchFilters) => void;
}

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

const TIME_RANGE_OPTIONS = [
  { value: '06:00|12:00', label: 'Manana' },
  { value: '12:00|18:00', label: 'Tarde' },
  { value: '18:00|23:59', label: 'Noche' },
  { value: '20:00|02:00', label: 'Nocturno' },
];

function toTimeRangeValue(filters: ClientMatchFilters): string {
  return filters.timeFrom && filters.timeTo ? `${filters.timeFrom}|${filters.timeTo}` : '';
}

export function MatchFilters({ filters, onFiltersChange }: MatchFiltersProps) {
  const updateFilters = useCallback(
    (updates: Partial<ClientMatchFilters>) => {
      onFiltersChange(normalizeMatchFilters({ ...filters, ...updates }));
    },
    [filters, onFiltersChange],
  );

  const clearFilters = useCallback(() => {
    onFiltersChange(DEFAULT_MATCH_FILTERS);
  }, [onFiltersChange]);

  const handleTimeRangeChange = useCallback(
    (value: string) => {
      if (!value) {
        updateFilters({ timeFrom: undefined, timeTo: undefined });
        return;
      }

      const [timeFrom, timeTo] = value.split('|');
      updateFilters({ timeFrom, timeTo });
    },
    [updateFilters],
  );

  const hasActiveFilters =
    filters.format ||
    filters.zone ||
    filters.search ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.timeFrom ||
    filters.timeTo;

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
            aria-label="Buscar partidos"
            placeholder="Buscar partido o club"
            value={filters.search || ''}
            onChange={(event) => updateFilters({ search: event.target.value || undefined })}
            className="pl-10"
          />
        </div>

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

        <Select
          aria-label="Horario"
          value={toTimeRangeValue(filters)}
          placeholder="Horario"
          options={TIME_RANGE_OPTIONS}
          onValueChange={handleTimeRangeChange}
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
          onValueChange={(value) => updateFilters({ dateTo: toDateFilter(value, true) })}
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
