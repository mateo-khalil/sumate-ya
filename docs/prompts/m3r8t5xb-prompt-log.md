# Prompt Log

- Timestamp: 2026-04-28 02:23:45
- Task ID: m3r8t5xb

## User Prompt

> @copilot review this.
> (PR: "cumplir epica de filtros de partidos" — MatchFilters component with zone/format/date/time controls, client-side filtering, URL param persistence, and list/map shared state)

## Agent Main Actions

- Reviewed the full PR diff (MatchFilters, MatchList, MatchMap, MatchesView, match-filtering.ts, select.tsx, date-picker.tsx) and identified four actionable issues.
- Fixed the empty-state UX in MatchList to distinguish "no open matches at all" from "all matches hidden by active filters" so players get clearer feedback.
- Centralized date utilities by moving `toDateFilter` from a local MatchFilters.tsx function to the shared `match-filtering.ts` module, and added explicit doc comments explaining the `toServerMatchFilters` intentional filter-stripping strategy and the `matchesTimeRange` timezone assumption.
