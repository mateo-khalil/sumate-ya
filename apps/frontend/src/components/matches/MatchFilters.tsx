/**
 * MatchFilters Component - Filter controls for match listing
 *
 * Decision Context:
 * - Why: Provides UI controls for filtering matches by format, zone, date, and text search.
 * - Pattern: Controlled component that emits filter changes to parent via callback.
 *   Parent (MatchList) manages state and triggers GraphQL refetch.
 * - Uses shadcn/ui primitives (Button, Input) for consistent styling.
 * - Format/zone options are derived from schema enums and common zones.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, Filter } from 'lucide-react';
import type { MatchFilters, MatchFormat, MatchStatus } from '@/graphql/operations/matches';

interface MatchFiltersProps {
  onFiltersChange: (filters: MatchFilters) => void;
  initialFilters?: MatchFilters;
}

// Format options matching GraphQL enum
const FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
  { value: 'FIVE_VS_FIVE', label: 'Fútbol 5' },
  { value: 'SEVEN_VS_SEVEN', label: 'Fútbol 7' },
  { value: 'TEN_VS_TEN', label: 'Fútbol 10' },
  { value: 'ELEVEN_VS_ELEVEN', label: 'Fútbol 11' },
];

// Status options matching GraphQL enum
const STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: 'OPEN', label: 'Abiertos' },
  { value: 'FULL', label: 'Completos' },
  { value: 'IN_PROGRESS', label: 'En curso' },
  { value: 'COMPLETED', label: 'Finalizados' },
];

// Common zones (could be fetched from API in future)
const ZONE_OPTIONS = ['Norte', 'Sur', 'Este', 'Oeste', 'Centro'];

export function MatchFilters({ onFiltersChange, initialFilters }: MatchFiltersProps) {
  const [filters, setFilters] = useState<MatchFilters>(initialFilters || { status: 'OPEN' });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilters = useCallback(
    (updates: Partial<MatchFilters>) => {
      const newFilters = { ...filters, ...updates };
      // Remove undefined/empty values
      Object.keys(newFilters).forEach((key) => {
        const k = key as keyof MatchFilters;
        if (newFilters[k] === undefined || newFilters[k] === '') {
          delete newFilters[k];
        }
      });
      setFilters(newFilters);
      onFiltersChange(newFilters);
    },
    [filters, onFiltersChange]
  );

  const clearFilters = useCallback(() => {
    const defaultFilters: MatchFilters = { status: 'OPEN' };
    setFilters(defaultFilters);
    onFiltersChange(defaultFilters);
  }, [onFiltersChange]);

  const hasActiveFilters =
    filters.format || filters.zone || filters.search || filters.dateFrom || filters.dateTo;

  return (
    <div className="space-y-4 mb-6">
      {/* Main filter row */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por partido o club..."
            value={filters.search || ''}
            onChange={(e) => updateFilters({ search: e.target.value || undefined })}
            className="pl-10"
          />
        </div>

        {/* Format filter */}
        <select
          value={filters.format || ''}
          onChange={(e) => updateFilters({ format: (e.target.value as MatchFormat) || undefined })}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">Todos los formatos</option>
          {FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Zone filter */}
        <select
          value={filters.zone || ''}
          onChange={(e) => updateFilters({ zone: e.target.value || undefined })}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">Todas las zonas</option>
          {ZONE_OPTIONS.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filters.status || 'OPEN'}
          onChange={(e) => updateFilters({ status: (e.target.value as MatchStatus) || undefined })}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Advanced toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          {showAdvanced ? 'Menos filtros' : 'Más filtros'}
        </Button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Advanced filters (date range) */}
      {showAdvanced && (
        <div className="flex flex-wrap gap-3 items-center p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Desde:</label>
            <Input
              type="date"
              value={filters.dateFrom?.split('T')[0] || ''}
              onChange={(e) =>
                updateFilters({
                  dateFrom: e.target.value ? `${e.target.value}T00:00:00Z` : undefined,
                })
              }
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Hasta:</label>
            <Input
              type="date"
              value={filters.dateTo?.split('T')[0] || ''}
              onChange={(e) =>
                updateFilters({
                  dateTo: e.target.value ? `${e.target.value}T23:59:59Z` : undefined,
                })
              }
              className="w-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
