export { MatchCard, type Match } from './MatchCard';
export { MatchFilters } from './MatchFilters';
export { MatchList } from './MatchList';
// MatchMap is intentionally NOT re-exported here — it uses Leaflet which requires
// browser APIs (window/document) and must be lazy-imported inside MatchesView to
// prevent Node.js SSR from loading it. Static re-export here would cause the barrel
// import in index.astro to pull in Leaflet during SSR and crash with "window is not defined".
export { MatchesView } from './MatchesView';
