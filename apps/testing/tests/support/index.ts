/**
 * Public surface of the e2e support package. Specs should import from
 * `./support` (relative to tests/) instead of reaching into individual files.
 *
 * Decision Context:
 * - One barrel keeps the spec import block short ("import { test, expect,
 *   TEST_USERS, mockGraphQLAll } from './support'") and lets us refactor the
 *   internal layout without touching every spec.
 */

export { test, expect } from './fixtures';
export * from './constants';
export * from './users';
export * from './auth';
export * from './graphql';
export * from './network';
export * from './builders';
export * from './divisions';
export { ChangePasswordPage } from './page-objects/ChangePasswordPage';
export { CreateMatchPage } from './page-objects/CreateMatchPage';
export { CreateTournamentPage } from './page-objects/CreateTournamentPage';
export { ClubDashboardPage } from './page-objects/ClubDashboardPage';
export { ClubMatchWizardPage } from './page-objects/ClubMatchWizardPage';
export { HomePage } from './page-objects/HomePage';
export { HorariosPage } from './page-objects/HorariosPage';
export { LeaderboardPage } from './page-objects/LeaderboardPage';
export { LoginPage } from './page-objects/LoginPage';
export { MatchDetailPage } from './page-objects/MatchDetailPage';
export { MatchResultsSectionPage } from './page-objects/MatchResultsSectionPage';
export { MatchesListPage } from './page-objects/MatchesListPage';
export { MatchesMapPage } from './page-objects/MatchesMapPage';
export { ProfilePage, ONE_PIXEL_PNG } from './page-objects/ProfilePage';
export { SettingsPage } from './page-objects/SettingsPage';
export {
  RegisterPlayerPage,
  VALID_PLAYER_REGISTER,
  type PlayerRegisterValues,
} from './page-objects/RegisterPlayerPage';
export { RegisterClubPage } from './page-objects/RegisterClubPage';
export { TournamentDetailPage } from './page-objects/TournamentDetailPage';
export { TournamentsListPage } from './page-objects/TournamentsListPage';
