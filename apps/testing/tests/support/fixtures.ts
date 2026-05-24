import { test as base } from '@playwright/test';
import { CreateMatchPage } from './page-objects/CreateMatchPage';
import { CreateTournamentPage } from './page-objects/CreateTournamentPage';
import { ClubDashboardPage } from './page-objects/ClubDashboardPage';
import { HomePage } from './page-objects/HomePage';
import { LoginPage } from './page-objects/LoginPage';
import { MatchDetailPage } from './page-objects/MatchDetailPage';
import { MatchesListPage } from './page-objects/MatchesListPage';
import { MatchesMapPage } from './page-objects/MatchesMapPage';
import { ProfilePage } from './page-objects/ProfilePage';
import { RegisterClubPage } from './page-objects/RegisterClubPage';
import { RegisterPlayerPage } from './page-objects/RegisterPlayerPage';
import { SettingsPage } from './page-objects/SettingsPage';
import { TournamentDetailPage } from './page-objects/TournamentDetailPage';
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
  createMatchPage: CreateMatchPage;
  createTournamentPage: CreateTournamentPage;
  clubDashboardPage: ClubDashboardPage;
  profilePage: ProfilePage;
  settingsPage: SettingsPage;
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
  createMatchPage: async ({ page }, use) => {
    await use(new CreateMatchPage(page));
  },
  createTournamentPage: async ({ page }, use) => {
    await use(new CreateTournamentPage(page));
  },
  clubDashboardPage: async ({ page }, use) => {
    await use(new ClubDashboardPage(page));
  },
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
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
