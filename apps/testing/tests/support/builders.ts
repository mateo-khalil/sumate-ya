/**
 * Mock data builders for GraphQL responses.
 *
 * Decision Context:
 * - Three different specs (matches-list, match-filters, matches-map) each had
 *   their own `MockMatch` type and `buildMatch()` factory with slightly drifted
 *   field shapes. Centralizing keeps the mock contract aligned with the real
 *   GraphQL schema and prevents one spec from masking a regression that would
 *   surface in another.
 * - `buildMatch` returns a sensible OPEN match in Centro by default; tests
 *   spread overrides for the fields that matter to them. We intentionally use
 *   a future date so date-range filter tests aren't affected by `Date.now()`.
 * - `buildMockSlot` mirrors clubSlots() responses for the create-match wizard.
 * - Previously fixed bugs: none relevant.
 */

export type MatchFormat = 'FIVE_VS_FIVE' | 'SEVEN_VS_SEVEN' | 'TEN_VS_TEN' | 'ELEVEN_VS_ELEVEN';
export type MatchStatus = 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MatchTeam = 'A' | 'B';

export type MockClub = {
  __typename?: 'Club';
  name: string;
  zone: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type MockMatch = {
  __typename?: 'Match';
  id: string;
  title: string;
  startTime: string;
  format: MatchFormat;
  totalSlots: number;
  availableSlots: number;
  status: MatchStatus;
  club: MockClub | null;
};

export function buildMatch(overrides: Partial<MockMatch> = {}): MockMatch {
  return {
    __typename: 'Match',
    id: 'match-default',
    title: 'Partido de prueba',
    startTime: '2026-05-01T20:00:00Z',
    format: 'FIVE_VS_FIVE',
    totalSlots: 10,
    availableSlots: 5,
    status: 'OPEN',
    club: { __typename: 'Club', name: 'Club Test', zone: 'Centro', address: 'Test 123' },
    ...overrides,
  };
}

export type CourtSurface = 'GRASS' | 'SYNTHETIC' | 'CONCRETE' | 'INDOOR';

export type MockSlot = {
  id: string;
  clubId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  priceArs: number | null;
  court: {
    id: string;
    name: string;
    maxFormat: MatchFormat;
    surface: CourtSurface;
    isIndoor: boolean;
  };
};

export const DEFAULT_MOCK_SLOT: MockSlot = {
  id: 'slot-e2e-1900',
  clubId: 'club-from-ui',
  dayOfWeek: 'monday',
  startTime: '19:00:00',
  endTime: '20:00:00',
  priceArs: 4200,
  court: {
    id: 'court-e2e-1',
    name: 'Cancha E2E',
    maxFormat: 'SEVEN_VS_SEVEN',
    surface: 'SYNTHETIC',
    isIndoor: false,
  },
};

type MockSlotOverrides = Partial<Omit<MockSlot, 'court'>> & { court?: Partial<MockSlot['court']> };

export function buildMockSlot(overrides: MockSlotOverrides = {}): MockSlot {
  const { court, ...rest } = overrides;
  return {
    ...DEFAULT_MOCK_SLOT,
    ...rest,
    court: { ...DEFAULT_MOCK_SLOT.court, ...(court ?? {}) },
  };
}

/* ── Club match wizard builders (Crear Partido desde Club) ───────────────── */

/**
 * ClubMatchSlotOccurrence mock builder for the AvailableSlotsForClubMatch query.
 *
 * Decision Context:
 * - The wizard's Step 1 (AvailableSlotsPicker) renders a weekly CalendarGrid for
 *   the CURRENT week (Mon–Sun of today) and only paints cells in the 07:00–23:00
 *   range. A cell is CLICKABLE only when the occurrence is: not `hasMatch`, the
 *   day is not in the past, and `now < slotStart + 15min` (grace period). So a
 *   mocked slot must land on a future date+time inside the visible week or the
 *   test can't select it.
 * - `buildClubSlotOccurrence` defaults are computed at call time relative to the
 *   real clock so the spec is not date-fragile: it picks a date in the current
 *   week that is strictly in the future (tomorrow if today is Mon–Sat, else a
 *   safe future hour today) at a fixed 19:00 slot well inside DISPLAY_HOURS.
 * - The picker fetches with `includeNonBookable: true` and ignores the date range
 *   echo — it maps occurrences into the grid purely by their `date`+`startTime`.
 *   We don't need to match the requested filters, only return occurrences whose
 *   `date` falls in the rendered week.
 * - The accessible cell label the grid emits is
 *   `${courtName} ${startTime.slice(0,5)}–${endTime.slice(0,5)} el ${date}` — the
 *   Page Object locates the clickable cell by that label, so courtName/startTime
 *   here must stay in sync with what the PO expects.
 * - Previously fixed bugs: none relevant (new feature).
 */

export type MockClubSlotOccurrence = {
  slotId: string;
  courtId: string;
  courtName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  duration: number;
  priceArs: number | null;
  date: string;
  scheduledAt: string;
  hasMatch: boolean;
  allowOnlineBooking: boolean;
};

const JS_DOW = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Pick a date inside the current Mon–Sun week that is strictly in the future
 * (so its 19:00 slot is always within the 15-min grace window and clickable).
 * Tomorrow normally; if tomorrow falls outside this week (today is Sunday),
 * fall back to today (the 19:00 slot will still be future for any run before 19:15).
 */
function defaultFutureOccurrenceDate(now: Date): Date {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  // Sunday (getDay()===0) is the last day of the Mon–Sun week, so tomorrow would
  // spill into next week and not be rendered. Use today instead in that case.
  if (now.getDay() === 0) return now;
  return tomorrow;
}

export function buildClubSlotOccurrence(
  overrides: Partial<MockClubSlotOccurrence> = {},
): MockClubSlotOccurrence {
  const now = new Date();
  const occDate = overrides.date
    ? new Date(`${overrides.date}T00:00:00`)
    : defaultFutureOccurrenceDate(now);
  const date = overrides.date ?? isoDate(occDate);
  return {
    slotId: 'slot-club-e2e-1',
    courtId: 'court-club-e2e-1',
    courtName: 'Cancha Club E2E',
    dayOfWeek: JS_DOW[occDate.getDay()],
    startTime: '19:00:00',
    endTime: '20:00:00',
    duration: 60,
    priceArs: 5000,
    date,
    scheduledAt: `${date}T19:00:00.000Z`,
    hasMatch: false,
    allowOnlineBooking: true,
    ...overrides,
  };
}

/** Wrap occurrences in the AvailableSlotsForClubMatch data envelope. */
export function buildAvailableSlotsResponse(
  occurrences: MockClubSlotOccurrence[],
): { data: { availableSlotsForClubMatch: MockClubSlotOccurrence[] } } {
  return { data: { availableSlotsForClubMatch: occurrences } };
}

/** Successful createClubMatch response body. */
export function buildCreateClubMatchResponse(
  overrides: Partial<{ success: boolean; matchId: string | null; message: string | null }> = {},
): { data: { createClubMatch: { success: boolean; matchId: string | null; message: string | null } } } {
  return {
    data: {
      createClubMatch: {
        success: true,
        matchId: 'd1000000-0000-0000-0000-0000000000aa',
        message: null,
        ...overrides,
      },
    },
  };
}

/** Failed createClubMatch response body (success=false, no GraphQL-level error). */
export function buildCreateClubMatchFailure(message: string): {
  data: { createClubMatch: { success: boolean; matchId: string | null; message: string | null } };
} {
  return {
    data: { createClubMatch: { success: false, matchId: null, message } },
  };
}

/* ── Tournament mock builders (US #39) ───────────────────────────────────── */

/**
 * Tournament mock builders for joinTournament / addMember / removeMember
 * mutation responses.
 *
 * Decision Context:
 * - The TournamentRegistrationForm calls /api/graphql-auth for all mutations.
 *   Mocking this route lets tests exercise UI error/success flows without
 *   writing real data to the DB.
 * - `buildMockTournamentTeam` mirrors the TournamentTeam type returned by the
 *   backend. Spread overrides for the fields that matter to the specific test.
 * - `buildJoinTournamentResponse` wraps the result in the `joinTournament`
 *   data envelope expected by the component.
 * - `buildMemberMutationResponse` covers both addTournamentTeamMember and
 *   removeTournamentTeamMember — same result shape.
 * - Previously fixed bugs: none relevant.
 */

export type MockTournamentPlayer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
};

export type MockTournamentTeam = {
  id: string;
  name: string;
  captainId: string;
  captain: MockTournamentPlayer | null;
  players: MockTournamentPlayer[];
  createdAt: string;
};

export type MockTournamentTeamRegistrationResult = {
  success: boolean;
  teamId: string | null;
  message: string | null;
  tournament: null;
};

export function buildMockTournamentPlayer(
  overrides: Partial<MockTournamentPlayer> = {},
): MockTournamentPlayer {
  return {
    id: 'player-e2e-default',
    displayName: 'Jugador Test',
    avatarUrl: null,
    preferredPosition: null,
    ...overrides,
  };
}

export function buildMockTournamentTeam(
  overrides: Partial<MockTournamentTeam> = {},
): MockTournamentTeam {
  const captain = buildMockTournamentPlayer({
    id: 'captain-e2e-1',
    displayName: 'Capitan Test',
  });
  return {
    id: 'team-e2e-1',
    name: 'Equipo E2E',
    captainId: captain.id,
    captain,
    players: [captain],
    createdAt: '2027-07-01T12:00:00Z',
    ...overrides,
  };
}

/** Successful joinTournament response body. */
export function buildJoinTournamentResponse(
  overrides: Partial<MockTournamentTeamRegistrationResult> = {},
): { data: { joinTournament: MockTournamentTeamRegistrationResult } } {
  return {
    data: {
      joinTournament: {
        success: true,
        teamId: 'team-e2e-new',
        message: null,
        tournament: null,
        ...overrides,
      },
    },
  };
}

/** Failed joinTournament response body (success=false, no GraphQL-level error). */
export function buildJoinTournamentFailure(message: string): {
  data: { joinTournament: MockTournamentTeamRegistrationResult };
} {
  return {
    data: {
      joinTournament: {
        success: false,
        teamId: null,
        message,
        tournament: null,
      },
    },
  };
}

/** Successful addTournamentTeamMember response body. */
export function buildAddMemberResponse(
  overrides: Partial<MockTournamentTeamRegistrationResult> = {},
): { data: { addTournamentTeamMember: MockTournamentTeamRegistrationResult } } {
  return {
    data: {
      addTournamentTeamMember: {
        success: true,
        teamId: 'team-e2e-1',
        message: null,
        tournament: null,
        ...overrides,
      },
    },
  };
}

/** Failed addTournamentTeamMember response body. */
export function buildAddMemberFailure(message: string): {
  data: { addTournamentTeamMember: MockTournamentTeamRegistrationResult };
} {
  return {
    data: {
      addTournamentTeamMember: {
        success: false,
        teamId: null,
        message,
        tournament: null,
      },
    },
  };
}

/** Successful removeTournamentTeamMember response body. */
export function buildRemoveMemberResponse(
  overrides: Partial<MockTournamentTeamRegistrationResult> = {},
): { data: { removeTournamentTeamMember: MockTournamentTeamRegistrationResult } } {
  return {
    data: {
      removeTournamentTeamMember: {
        success: true,
        teamId: 'team-e2e-1',
        message: null,
        tournament: null,
        ...overrides,
      },
    },
  };
}

/** Failed removeTournamentTeamMember response body. */
export function buildRemoveMemberFailure(message: string): {
  data: { removeTournamentTeamMember: MockTournamentTeamRegistrationResult };
} {
  return {
    data: {
      removeTournamentTeamMember: {
        success: false,
        teamId: null,
        message,
        tournament: null,
      },
    },
  };
}

/* ── Tournament list mock builders (US #33) ─────────────────────────────── */

/**
 * Mock builder for TournamentListItem — used by listado-torneos.spec.ts.
 *
 * Decision Context:
 * - Mirrors the TournamentListItem type from the frontend GraphQL operations.
 *   The client-side keepRegistrationOnly() filter checks status === 'REGISTRATION',
 *   so the default status is 'REGISTRATION' to avoid unexpected empty-state renders.
 * - startDate uses a future date so date-display tests stay valid over time.
 * - teamCount/registeredTeamsCount defaults produce a 50% full tournament (4/8),
 *   showing a non-trivial progress bar without triggering the "Completo" state.
 * - Previously fixed bugs: none relevant.
 */
export type TournamentStatus = 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type MockTournamentClub = {
  id: string;
  name: string;
  zone: string | null;
  address: string | null;
  imageUrl: string | null;
};

export type MockTournamentListItem = {
  id: string;
  name: string;
  format: MatchFormat;
  teamCount: number;
  playersPerTeam: number;
  registeredTeamsCount: number;
  status: TournamentStatus;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  club: MockTournamentClub | null;
};

export function buildTournament(
  overrides: Partial<MockTournamentListItem> = {},
): MockTournamentListItem {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Copa de Prueba',
    format: 'FIVE_VS_FIVE',
    teamCount: 8,
    playersPerTeam: 5,
    registeredTeamsCount: 4,
    status: 'REGISTRATION',
    description: null,
    startDate: '2027-09-15',
    endDate: null,
    club: {
      id: 'club-test-1',
      name: 'Club Test',
      zone: 'Centro',
      address: 'Calle Test 123',
      imageUrl: null,
    },
    ...overrides,
  };
}

/* ── Leave-tournament builders (US #47) ─────────────────────────────────── */

/**
 * Mock builders for leaveTournament mutation responses.
 *
 * Decision Context:
 * - LeaveTournamentDialog posts to /api/graphql-auth with the LeaveTournament
 *   mutation and reads `data.leaveTournament.{success,message,tournamentStatus,
 *   remainingTeams}`. The component branches on:
 *     · errors[0].message contains "authentication required" → redirect to /login.
 *     · success=false → render `message` as inline error.
 *     · success=true + tournamentStatus='CANCELLED' → extra yellow message + redirect
 *       to /torneos after 2500ms.
 *     · success=true otherwise → reload after 1500ms.
 * - Builders centralise the shape so specs only override the fields under test.
 * - Previously fixed bugs: none relevant.
 */

export type MockLeaveTournamentResult = {
  success: boolean;
  message: string;
  tournamentStatus: string | null;
  remainingTeams: number | null;
};

export function buildLeaveTournamentResponse(
  overrides: Partial<MockLeaveTournamentResult> = {},
): { data: { leaveTournament: MockLeaveTournamentResult } } {
  return {
    data: {
      leaveTournament: {
        success: true,
        message: 'Equipo retirado del torneo',
        tournamentStatus: 'REGISTRATION',
        remainingTeams: 5,
        ...overrides,
      },
    },
  };
}

export function buildLeaveTournamentFailure(message: string): {
  data: { leaveTournament: MockLeaveTournamentResult };
} {
  return {
    data: {
      leaveTournament: {
        success: false,
        message,
        tournamentStatus: null,
        remainingTeams: null,
      },
    },
  };
}

export function buildLeaveTournamentErrors(messages: string[]): {
  errors: Array<{ message: string }>;
} {
  return { errors: messages.map((message) => ({ message })) };
}

/** Mock eligible players response (tournamentEligiblePlayers query). */
export function buildEligiblePlayersResponse(
  players: MockTournamentPlayer[] = [],
): { data: { tournamentEligiblePlayers: MockTournamentPlayer[] } } {
  return { data: { tournamentEligiblePlayers: players } };
}

/* ── Match-result-submission mock builders (US #54) ─────────────────────── */

/**
 * Mock builders for the result-voting GraphQL operations exercised by
 * MatchResultsSection.tsx (GetMatchResultSubmissions / VoteMatchResult).
 *
 * Decision Context:
 * - Mirrors the SubmissionFields fragment in match-results.graphql so the
 *   mocked responses match the shape the React island consumes. Drift here
 *   would let a real schema change pass tests silently.
 * - `buildMockSubmission` defaults to a PENDING 3-1 (team A wins) submission
 *   with one approve vote so specs that exercise the "majority crosses"
 *   threshold only need to override `approveCount` + add the threshold vote.
 * - `buildMockVoter` keeps voter shape (id/displayName/avatarUrl) consistent
 *   between the SubmissionFields fragment and the nested VoteFields one.
 * - Previously fixed bugs: none relevant (new builders).
 */

export type MockWinnerTeam = 'A' | 'B' | 'DRAW';
export type MockSubmissionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
export type MockVoteValue = 'APPROVE' | 'REJECT';

export interface MockVoter {
  __typename?: 'PlayerProfile';
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MockMatchResultVote {
  __typename?: 'MatchResultVote';
  id: string;
  voter: MockVoter;
  vote: MockVoteValue;
  createdAt: string;
}

export interface MockMatchResultSubmission {
  __typename?: 'MatchResultSubmission';
  id: string;
  matchId: string;
  submitter: MockVoter;
  scoreA: number;
  scoreB: number;
  winnerTeam: MockWinnerTeam;
  status: MockSubmissionStatus;
  approveCount: number;
  rejectCount: number;
  hasUserVoted: boolean;
  userVote: MockVoteValue | null;
  createdAt: string;
  votes: MockMatchResultVote[];
}

export function buildMockVoter(overrides: Partial<MockVoter> = {}): MockVoter {
  return {
    __typename: 'PlayerProfile',
    id: 'voter-default',
    displayName: 'Jugador Default',
    avatarUrl: null,
    ...overrides,
  };
}

export function buildMockSubmission(
  overrides: Partial<MockMatchResultSubmission> = {},
): MockMatchResultSubmission {
  return {
    __typename: 'MatchResultSubmission',
    id: 'submission-default-1',
    matchId: 'match-default',
    submitter: buildMockVoter({ id: 'submitter-default', displayName: 'Proponente' }),
    scoreA: 3,
    scoreB: 1,
    winnerTeam: 'A',
    status: 'PENDING',
    approveCount: 1,
    rejectCount: 0,
    hasUserVoted: false,
    userVote: null,
    createdAt: '2026-05-04T20:00:00Z',
    votes: [],
    ...overrides,
  };
}

/* ── Leaderboard mock builders (Ranking de jugadores) ───────────────────── */

/**
 * Mock builder for LeaderboardEntry — used by leaderboard.spec.ts.
 *
 * Decision Context:
 * - Mirrors the LeaderboardEntry type from leaderboard.graphql / leaderboard.ts.
 *   Every stat is non-null because the backend RPC only returns eligible public
 *   profiles (isPublic + showStats + matchesPlayed >= 5).
 * - Default is a top-of-table entry (rank 1, 66.7% winrate) so a single mock with
 *   no overrides already renders a complete row; specs spread `rank`, `id`,
 *   `displayName`, `winrate`, etc. for the case under test.
 * - The page sorts nothing client-side — it renders entries in the order returned.
 *   Specs must therefore pass entries already in rank order.
 * - Previously fixed bugs: none relevant.
 */
export type PlayerPosition = 'GOALKEEPER' | 'DEFENDER' | 'MIDFIELDER' | 'FORWARD';

export type MockLeaderboardEntry = {
  __typename?: 'LeaderboardEntry';
  rank: number;
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: PlayerPosition | null;
  division: number;
  matchesPlayed: number;
  matchesWon: number;
  winrate: number;
};

export function buildLeaderboardEntry(
  overrides: Partial<MockLeaderboardEntry> = {},
): MockLeaderboardEntry {
  return {
    __typename: 'LeaderboardEntry',
    rank: 1,
    id: 'leader-default-1',
    displayName: 'Jugador Top',
    avatarUrl: null,
    preferredPosition: 'FORWARD',
    division: 3,
    matchesPlayed: 12,
    matchesWon: 8,
    winrate: 66.67,
    ...overrides,
  };
}
