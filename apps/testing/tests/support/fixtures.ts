import { test as base } from '@playwright/test';
import { ChangePasswordPage } from './page-objects/ChangePasswordPage';
import { CreateMatchPage } from './page-objects/CreateMatchPage';
import { CreateTournamentPage } from './page-objects/CreateTournamentPage';
import { ClubDashboardPage } from './page-objects/ClubDashboardPage';
import { ClubMatchWizardPage } from './page-objects/ClubMatchWizardPage';
import { HomePage } from './page-objects/HomePage';
import { HorariosPage } from './page-objects/HorariosPage';
import { LeaderboardPage } from './page-objects/LeaderboardPage';
import { LoginPage } from './page-objects/LoginPage';
import { MatchDetailPage } from './page-objects/MatchDetailPage';
import { MatchResultsSectionPage } from './page-objects/MatchResultsSectionPage';
import { MatchesListPage } from './page-objects/MatchesListPage';
import { MatchesMapPage } from './page-objects/MatchesMapPage';
import { ProfilePage } from './page-objects/ProfilePage';
import { RegisterClubPage } from './page-objects/RegisterClubPage';
import { RegisterPlayerPage } from './page-objects/RegisterPlayerPage';
import { SettingsPage } from './page-objects/SettingsPage';
import { TournamentDetailPage } from './page-objects/TournamentDetailPage';
import { TournamentsListPage } from './page-objects/TournamentsListPage';
import { SEED_TOURNAMENTS } from './constants';

/**
 * Custom Playwright test fixture.
 *
 * Decision Context:
 * - We attach every Page Object as an auto-injected fixture so tests can
 *   destructure exactly the surfaces they need (`{ matchesPage }`,
 *   `{ profilePage }`). Each PO is constructed once per test against the
 *   shared `page`, so they don't add overhead.
 * - Authentication is NOT a fixture: storage state is provisioned by
 *   `auth.setup.ts` (Playwright setup project) and consumed by specs via
 *   `test.use({ storageState: TEST_USERS.<role>.storageStatePath })`. That
 *   keeps the auth lifecycle visible at the top of each spec instead of
 *   hidden in a fixture, and it lets unauthenticated specs (login,
 *   registration, anonymous-visitor cases) opt out trivially.
 * - All specs should import `test` and `expect` from this module rather than
 *   from `@playwright/test`. The lint rule in `.claude/rules/e2e-testing.md`
 *   makes that explicit.
 */

type Fixtures = {
  loginPage: LoginPage;
  registerPlayerPage: RegisterPlayerPage;
  registerClubPage: RegisterClubPage;
  homePage: HomePage;
  matchesPage: MatchesListPage;
  matchesMapPage: MatchesMapPage;
  matchDetailPage: MatchDetailPage;
  /** Result-voting section of /partidos/[id]. US #54 — confirmar resultado y stats. */
  matchResultsSectionPage: MatchResultsSectionPage;
  createMatchPage: CreateMatchPage;
  createTournamentPage: CreateTournamentPage;
  clubDashboardPage: ClubDashboardPage;
  /** Club slot management (/panel-club/horarios). US — bloquear/liberar horarios. */
  horariosPage: HorariosPage;
  clubMatchWizardPage: ClubMatchWizardPage;
  profilePage: ProfilePage;
  settingsPage: SettingsPage;
  changePasswordPage: ChangePasswordPage;
  /** Public player ranking (/leaderboard). For ranking list tests. */
  leaderboardPage: LeaderboardPage;
  /** Tournament listing page (/torneos). For list + card interaction tests (US #33). */
  tournamentsPage: TournamentsListPage;
  /** Open-registration tournament (no teams). For inscription tests (US #39). */
  tournamentOpenPage: TournamentDetailPage;
  /** Tournament with Mateo's team pre-registered. For captain-panel tests (US #39). */
  tournamentCaptainPage: TournamentDetailPage;
  /** In-progress tournament with 2 teams + 2 fixture matches. For detail-view tests (US #35). */
  tournamentWithFixturePage: TournamentDetailPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registerPlayerPage: async ({ page }, use) => {
    await use(new RegisterPlayerPage(page));
  },
  registerClubPage: async ({ page }, use) => {
    await use(new RegisterClubPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  matchesPage: async ({ page }, use) => {
    await use(new MatchesListPage(page));
  },
  matchesMapPage: async ({ page }, use) => {
    await use(new MatchesMapPage(page));
  },
  matchDetailPage: async ({ page }, use) => {
    await use(new MatchDetailPage(page));
  },
  matchResultsSectionPage: async ({ page }, use) => {
    await use(new MatchResultsSectionPage(page));
  },
  createMatchPage: async ({ page }, use) => {
    await use(new CreateMatchPage(page));
  },
  createTournamentPage: async ({ page }, use) => {
    await use(new CreateTournamentPage(page));
  },
  clubDashboardPage: async ({ page }, use) => {
    await use(new ClubDashboardPage(page));
  },
  horariosPage: async ({ page }, use) => {
    await use(new HorariosPage(page));
  },
  clubMatchWizardPage: async ({ page }, use) => {
    await use(new ClubMatchWizardPage(page));
  },
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
  changePasswordPage: async ({ page }, use) => {
    await use(new ChangePasswordPage(page));
  },
  leaderboardPage: async ({ page }, use) => {
    await use(new LeaderboardPage(page));
  },
  tournamentsPage: async ({ page }, use) => {
    await use(new TournamentsListPage(page));
  },
  tournamentOpenPage: async ({ page }, use) => {
    await use(new TournamentDetailPage(page, SEED_TOURNAMENTS.open));
  },
  tournamentCaptainPage: async ({ page }, use) => {
    await use(new TournamentDetailPage(page, SEED_TOURNAMENTS.withCaptainMateo));
  },
  tournamentWithFixturePage: async ({ page }, use) => {
    await use(new TournamentDetailPage(page, SEED_TOURNAMENTS.withFixture));
  },
});

export { expect } from '@playwright/test';
