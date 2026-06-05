import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { APIRequestContext, Browser } from '@playwright/test';
import dotenv from 'dotenv';
import {
  ACCESS_TOKEN_COOKIE,
  BACKEND_GRAPHQL_URL,
  buildMockSubmission,
  buildMockVoter,
  expect,
  FRONTEND_URL,
  gqlPost,
  gqlPostOrThrow,
  loginAndReadToken,
  SEED_MATCHES,
  test,
  TEST_USERS,
} from './support';
import type { MockMatchResultSubmission } from './support';

const BACKEND_ENV_PATH = path.resolve(__dirname, '..', '..', 'backend', '.env');
dotenv.config({ path: BACKEND_ENV_PATH });

/**
 * Tests E2E — US #54 "Confirmar resultado y actualizar stats" (PR #125).
 *
 * Decision Context:
 * - Backend implementation: a SECURITY DEFINER Postgres RPC
 *   `confirm_match_result_submission(uuid)` runs the whole cascade
 *   (confirm submission → reject siblings → update match → +1
 *   matchesPlayed for every participant → +1 matchesWon for winners →
 *   notify all) atomically inside one transaction with FOR UPDATE locks.
 *   The service layer (matchResultVoteService.voteMatchResult) calls
 *   that RPC the moment a vote pushes approveCount above
 *   `totalParticipants / 2` (strict majority) and only invalidates the
 *   match/profile caches when the RPC reports `alreadyConfirmed: false`.
 *   See PR #125 commit + apps/backend/src/services/matchResultVoteService.ts
 *   for the full rationale.
 * - 37 Vitest unit tests already cover service-level behaviour
 *   (matchResultVoteService.test.ts). This e2e suite intentionally
 *   exercises only the contract visible from the browser:
 *     1. The vote button in MatchResultsSection.tsx fires the
 *        VoteMatchResult mutation with the correct variables.
 *     2. statusChanged=true transitions the card to CONFIRMED and
 *        auto-rejects sibling PENDING submissions (handleVote logic).
 *     3. statusChanged=false (race / sub-majority) keeps the card
 *        PENDING — no false "officialized" state.
 *     4. UI surfaces backend voting errors (parseGqlError pipeline).
 *     5. Anonymous + non-participant variants don't expose the section.
 *     6. Backend contract: voteMatchResult without auth returns the
 *        canonical "Se requiere autenticación" error.
 *
 * - Mocking strategy:
 *   * GetMatchResultSubmissions + VoteMatchResult are mocked at the
 *     browser layer via MatchResultsSectionPage so we don't pollute
 *     real submissions/votes against the seeded match (which other
 *     specs rely on for join/leave/historial tests).
 *   * Page navigation uses real SSR — we discover a seed match where
 *     `showResultSection` is satisfied (playerMateo joined + not
 *     cancelled + matchStarted) via gqlPostOrThrow. If none exists we
 *     skip rather than mutate the DB.
 *
 * - Auth posture: storageState=playerMateo for the rendering blocks,
 *   anonymous newContext for the gating test, and no token at all for
 *   the API contract test.
 *
 * - Why no test mutates the real DB: writing a real submission /
 *   vote / confirmation would cascade into profiles.matchesPlayed +
 *   matchesWon for every participant of the seed match, breaking
 *   division-ranking.spec.ts and historial-partidos.spec.ts on the
 *   next run. Mocks keep the suite hermetic.
 *
 * - Previously fixed bugs:
 *   * P2 audit (MatchResultsSection): the "Cargar resultado" CTA
 *     disappeared when ALL submissions were REJECTED — covered here
 *     so the regression never re-lands.
 *   * Race condition: concurrent final votes used to double-increment
 *     stats. The unit suite asserts the RPC short-circuits via
 *     `alreadyConfirmed`; this spec asserts the UI honours that flag
 *     by NOT transitioning to CONFIRMED when statusChanged=false.
 */

type MatchSummary = {
  id: string;
  status: 'OPEN' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  durationMin: number | null;
  isCurrentUserJoined: boolean | null;
};

/**
 * Finds a seed match where playerMateo is inscripto AND the result
 * section would render (matchStarted && !cancelled). We prefer
 * IN_PROGRESS / COMPLETED matches; otherwise fall back to any match
 * with startTime in the past.
 *
 * Decision Context:
 * - The `match(id)` query exposes `isCurrentUserJoined` only when the
 *   caller is authenticated, so the token from loginAndReadToken is
 *   required. Without it the field comes back null and every match
 *   gets skipped silently.
 */
async function findEligibleMatch(
  request: APIRequestContext,
  accessToken: string,
): Promise<MatchSummary | null> {
  const seededResultMatch = await gqlPostOrThrow<{ match: MatchSummary | null }>(
    request,
    /* GraphQL */ `
      query GetSeedResultVotingMatch($id: ID!) {
        match(id: $id) {
          id status startTime durationMin isCurrentUserJoined
        }
      }
    `,
    { id: SEED_MATCHES.resultVoting },
    accessToken,
  ).then((d) => d.match);

  if (seededResultMatch && isEligibleForResultSection(seededResultMatch)) {
    return seededResultMatch;
  }

  const ids = await gqlPostOrThrow<{ matches: Array<{ id: string }> }>(
    request,
    /* GraphQL */ `
      query GetMatchesForResultSection {
        matches { id }
      }
    `,
  ).then((d) => d.matches.map((m) => m.id));

  for (const id of ids) {
    const detail = await gqlPostOrThrow<{ match: MatchSummary | null }>(
      request,
      /* GraphQL */ `
        query GetMatchForResultSection($id: ID!) {
          match(id: $id) {
            id status startTime durationMin isCurrentUserJoined
          }
        }
      `,
      { id },
      accessToken,
    ).then((d) => d.match);

    if (detail && isEligibleForResultSection(detail)) return detail;
  }
  return null;
}

function isEligibleForResultSection(detail: MatchSummary): boolean {
  if (detail.status === 'CANCELLED') return false;
  if (detail.isCurrentUserJoined !== true) return false;

  // Aligned with the SSR gate in [id].astro: the result section renders once the match has
  // ENDED (startTime + durationMin), not merely started. Picking a started-but-not-ended
  // match would make goto() fail because the section never mounts.
  const endMs =
    new Date(detail.startTime).getTime() + (detail.durationMin ?? 60) * 60_000;
  return detail.status === 'COMPLETED' || Date.now() >= endMs;
}

test.describe('US #54 — Confirmar resultado y actualizar stats', () => {
  test.use({ storageState: TEST_USERS.playerMateo.storageStatePath });

  /* ════════════════════════════════════════════════════════════════════
     Bloque 1 — Render inicial de la sección
     ════════════════════════════════════════════════════════════════════ */
  test.describe('Render inicial', () => {
    test('sin submissions previas muestra CTA "Cargar resultado"', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(
        !match,
        'No hay un partido en estado matchStarted donde playerMateo esté inscripto.',
      );
      if (!match) return;

      const { payloads } = await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [] },
      });

      await matchResultsSectionPage.goto(match.id);

      await expect(matchResultsSectionPage.loadResultButton).toBeVisible();
      await expect(
        matchResultsSectionPage.section.getByText(/ning.n participante carg.+todav.a/i),
      ).toBeVisible();
      expect(payloads.length, 'Solo una query GetMatchResultSubmissions').toBe(1);
      expect(payloads[0]).toMatchObject({ variables: { matchId: match.id } });
    });

    test('con una submission PENDING que el usuario aún no votó, muestra Aprobar/Rechazar', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      const submission = buildMockSubmission({
        id: 'sub-pending-1',
        matchId: match.id,
        scoreA: 3,
        scoreB: 1,
        winnerTeam: 'A',
        status: 'PENDING',
        approveCount: 1,
        hasUserVoted: false,
      });

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [submission] },
      });

      await matchResultsSectionPage.goto(match.id);

      await matchResultsSectionPage.expectPendingBadge(3, 1);
      await expect(matchResultsSectionPage.approveButton).toBeVisible();
      await expect(matchResultsSectionPage.rejectButton).toBeVisible();
      await expect(
        matchResultsSectionPage.section.getByText(/1 aprobaciones/i),
      ).toBeVisible();
    });

    test('cuando todas las submissions están REJECTED, vuelve a aparecer la CTA "Cargar resultado" (P2 audit regression guard)', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      await matchResultsSectionPage.mockGetSubmissions({
        data: {
          matchResultSubmissions: [
            buildMockSubmission({
              id: 'sub-rej-1',
              matchId: match.id,
              status: 'REJECTED',
              scoreA: 5,
              scoreB: 0,
            }),
          ],
        },
      });

      await matchResultsSectionPage.goto(match.id);

      // Tarjeta rechazada visible PLUS la CTA debe seguir disponible para reintentar.
      await matchResultsSectionPage.expectRejectedBadge(5, 0);
      await expect(matchResultsSectionPage.loadResultButton).toBeVisible();
    });

    test('cuando hay una submission CONFIRMED, no se muestra ninguna CTA para proponer otro resultado', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      await matchResultsSectionPage.mockGetSubmissions({
        data: {
          matchResultSubmissions: [
            buildMockSubmission({
              id: 'sub-conf-1',
              matchId: match.id,
              status: 'CONFIRMED',
              approveCount: 4,
              scoreA: 2,
              scoreB: 2,
              winnerTeam: 'DRAW',
            }),
          ],
        },
      });

      await matchResultsSectionPage.goto(match.id);

      await matchResultsSectionPage.expectConfirmedBadge(2, 2);
      await expect(matchResultsSectionPage.loadResultButton).toHaveCount(0);
      await expect(matchResultsSectionPage.proposeAnotherButton).toHaveCount(0);
    });

    test('participante carga el primer resultado: marcador + ganador Equipo A via ProposeMatchResult', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [] },
      });

      const proposed = buildMockSubmission({
        id: 'sub-first-result-a',
        matchId: match.id,
        submitter: buildMockVoter({ id: 'mateo', displayName: 'Mateo Duran E2E' }),
        scoreA: 3,
        scoreB: 2,
        winnerTeam: 'A',
        status: 'PENDING',
        approveCount: 0,
        rejectCount: 0,
        hasUserVoted: false,
        userVote: null,
        votes: [],
      });
      const { payloads } = await matchResultsSectionPage.mockProposeMatchResult({
        data: { proposeMatchResult: proposed },
      });

      await matchResultsSectionPage.goto(match.id);
      await matchResultsSectionPage.loadResultButton.click();
      await matchResultsSectionPage.fillResult(3, 2);

      await expect(matchResultsSectionPage.resultSummary).toContainText(/Gana Equipo A/i);
      await expect(matchResultsSectionPage.submitResultButton).toBeEnabled();

      await matchResultsSectionPage.submitResultButton.click();

      await expect.poll(() => payloads.length, { timeout: 10_000 }).toBe(1);
      expect(payloads[0]).toMatchObject({
        variables: {
          input: {
            matchId: match.id,
            scoreA: 3,
            scoreB: 2,
            winnerTeam: 'A',
          },
        },
      });

      await matchResultsSectionPage.expectPendingBadge(3, 2);
      await expect(
        matchResultsSectionPage.section.getByText(/0 aprobaciones/i),
      ).toBeVisible();
      await expect(
        matchResultsSectionPage.section.getByText(/0 rechazos/i),
      ).toBeVisible();
      await expect(matchResultsSectionPage.proposeAnotherButton).toBeVisible();
    });

    test('deriva empate desde el marcador y envia winnerTeam=DRAW', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [] },
      });

      const proposed = buildMockSubmission({
        id: 'sub-first-result-draw',
        matchId: match.id,
        scoreA: 1,
        scoreB: 1,
        winnerTeam: 'DRAW',
        approveCount: 0,
        rejectCount: 0,
        votes: [],
      });
      const { payloads } = await matchResultsSectionPage.mockProposeMatchResult({
        data: { proposeMatchResult: proposed },
      });

      await matchResultsSectionPage.goto(match.id);
      await matchResultsSectionPage.loadResultButton.click();
      await matchResultsSectionPage.fillResult(1, 1);

      await expect(matchResultsSectionPage.resultSummary).toContainText(/Empate/i);
      await matchResultsSectionPage.submitResultButton.click();

      await expect.poll(() => payloads.length, { timeout: 10_000 }).toBe(1);
      expect(payloads[0]).toMatchObject({
        variables: {
          input: {
            matchId: match.id,
            scoreA: 1,
            scoreB: 1,
            winnerTeam: 'DRAW',
          },
        },
      });
      await matchResultsSectionPage.expectPendingBadge(1, 1);
    });
  });

  /* ════════════════════════════════════════════════════════════════════
     Bloque 2 — Voto APPROVE / REJECT (mutation contract)
     ════════════════════════════════════════════════════════════════════ */
  test.describe('Contrato real de carga de resultado', () => {
    test('proposeMatchResult inserta submission, abre voting y queda visible para otro participante', async ({
      request,
      page,
      browser,
    }) => {
      const mateoToken = await readTokenFromCookies(page);

      const created = await gqlPostOrThrow<{
        proposeMatchResult: MockMatchResultSubmission;
      }>(
        request,
        /* GraphQL */ `
          mutation ProposeResultE2E($input: ProposeMatchResultInput!) {
            proposeMatchResult(input: $input) {
              id
              matchId
              submitter { id displayName avatarUrl }
              scoreA
              scoreB
              winnerTeam
              status
              approveCount
              rejectCount
              hasUserVoted
              userVote
              createdAt
              votes {
                id
                voter { id displayName avatarUrl }
                vote
                createdAt
              }
            }
          }
        `,
        {
          input: {
            matchId: SEED_MATCHES.resultVoting,
            scoreA: 4,
            scoreB: 1,
            winnerTeam: 'A',
          },
        },
        mateoToken,
      ).then((d) => d.proposeMatchResult);

      expect(created).toMatchObject({
        matchId: SEED_MATCHES.resultVoting,
        scoreA: 4,
        scoreB: 1,
        winnerTeam: 'A',
        status: 'PENDING',
        approveCount: 0,
        rejectCount: 0,
      });

      const votingState = await readMatchVotingState(SEED_MATCHES.resultVoting);
      expect(votingState.resultStatus).toBe('voting');
      expect(votingState.resultVotingClosesAt).toBeTruthy();

      const ricardoToken = await readTokenFromStorageState(
        browser,
        TEST_USERS.playerRicardo.storageStatePath,
      );
      const visibleToRicardo = await gqlPostOrThrow<{
        matchResultSubmissions: MockMatchResultSubmission[];
      }>(
        request,
        /* GraphQL */ `
          query GetResultSubmissionsForOtherParticipant($matchId: ID!) {
            matchResultSubmissions(matchId: $matchId) {
              id
              matchId
              submitter { id displayName avatarUrl }
              scoreA
              scoreB
              winnerTeam
              status
              approveCount
              rejectCount
              hasUserVoted
              userVote
              createdAt
              votes {
                id
                voter { id displayName avatarUrl }
                vote
                createdAt
              }
            }
          }
        `,
        { matchId: SEED_MATCHES.resultVoting },
        ricardoToken,
      ).then((d) => d.matchResultSubmissions.find((s) => s.id === created.id));

      expect(visibleToRicardo, 'El primer resultado cargado debe mostrarse al otro participante').toBeTruthy();
      expect(visibleToRicardo).toMatchObject({
        id: created.id,
        scoreA: 4,
        scoreB: 1,
        winnerTeam: 'A',
        status: 'PENDING',
        hasUserVoted: false,
      });
    });

    test('un usuario autenticado no participante no puede cargar resultado por API', async ({
      request,
      browser,
    }) => {
      const clubAdminToken = await readTokenFromStorageState(
        browser,
        TEST_USERS.clubAdmin.storageStatePath,
      );

      const payload = await gqlPost<{ proposeMatchResult: { id: string } }>(
        request,
        /* GraphQL */ `
          mutation ProposeResultAsNonParticipant($input: ProposeMatchResultInput!) {
            proposeMatchResult(input: $input) { id }
          }
        `,
        {
          input: {
            matchId: SEED_MATCHES.resultVoting,
            scoreA: 2,
            scoreB: 0,
            winnerTeam: 'A',
          },
        },
        clubAdminToken,
      );

      expect(payload.data?.proposeMatchResult).toBeFalsy();
      expect(payload.errors?.[0]?.message ?? '').toMatch(
        /solo los participantes del partido pueden proponer resultados/i,
      );
    });
  });

  test.describe('Voto APPROVE / REJECT', () => {
    test('click en "Aprobar" envía VoteMatchResult con vote=APPROVE y el submissionId correcto', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      const pending = buildMockSubmission({
        id: 'sub-approve-1',
        matchId: match.id,
        scoreA: 2,
        scoreB: 1,
        winnerTeam: 'A',
        approveCount: 1,
      });

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [pending] },
      });
      const { payloads } = await matchResultsSectionPage.mockVoteMatchResult({
        data: {
          voteMatchResult: {
            statusChanged: false, // 2/X cuando X>3 no cruza mayoría → sigue PENDING
            submission: {
              ...pending,
              approveCount: 2,
              hasUserVoted: true,
              userVote: 'APPROVE',
              votes: [
                {
                  __typename: 'MatchResultVote',
                  id: 'v-1',
                  voter: buildMockVoter({
                    id: 'mateo',
                    displayName: 'Mateo',
                  }),
                  vote: 'APPROVE',
                  createdAt: '2026-05-04T20:00:00Z',
                },
              ],
            },
          },
        },
      });

      await matchResultsSectionPage.goto(match.id);
      await matchResultsSectionPage.approveButton.click();

      await expect.poll(() => payloads.length, { timeout: 10_000 }).toBe(1);
      expect(payloads[0]).toMatchObject({
        variables: { input: { submissionId: 'sub-approve-1', vote: 'APPROVE' } },
      });

      // statusChanged=false → la card sigue PENDIENTE y aparece el botón "Cambiar voto".
      await matchResultsSectionPage.expectPendingBadge(2, 1);
      await expect(matchResultsSectionPage.changeVoteButton).toBeVisible();
    });

    test('click en "Rechazar" envía VoteMatchResult con vote=REJECT', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      const pending = buildMockSubmission({
        id: 'sub-reject-1',
        matchId: match.id,
        scoreA: 0,
        scoreB: 4,
        winnerTeam: 'B',
      });

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [pending] },
      });
      const { payloads } = await matchResultsSectionPage.mockVoteMatchResult({
        data: {
          voteMatchResult: {
            statusChanged: false,
            submission: {
              ...pending,
              rejectCount: 1,
              hasUserVoted: true,
              userVote: 'REJECT',
              votes: [
                {
                  __typename: 'MatchResultVote',
                  id: 'v-rej',
                  voter: buildMockVoter({ id: 'mateo', displayName: 'Mateo' }),
                  vote: 'REJECT',
                  createdAt: '2026-05-04T20:00:00Z',
                },
              ],
            },
          },
        },
      });

      await matchResultsSectionPage.goto(match.id);
      await matchResultsSectionPage.rejectButton.click();

      await expect.poll(() => payloads.length, { timeout: 10_000 }).toBe(1);
      expect(payloads[0]).toMatchObject({
        variables: { input: { submissionId: 'sub-reject-1', vote: 'REJECT' } },
      });
    });
  });

  /* ════════════════════════════════════════════════════════════════════
     Bloque 3 — Mayoría cruzada (statusChanged=true) — corazón de US #54
     ════════════════════════════════════════════════════════════════════ */
  test.describe('Mayoría estricta cruzada', () => {
    test('cuando voteMatchResult retorna statusChanged=true, la UI muestra la submission como CONFIRMADA y auto-rechaza siblings PENDING', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      // Dos PENDING en simultáneo (Caso B del spec: múltiples propuestas).
      const winningSubmission = buildMockSubmission({
        id: 'sub-win-1',
        matchId: match.id,
        scoreA: 3,
        scoreB: 1,
        winnerTeam: 'A',
        approveCount: 2, // ya tiene 2 — el voto del usuario sería el 3ro (>2.5 = mayoría)
      });
      const losingSibling = buildMockSubmission({
        id: 'sub-lose-1',
        matchId: match.id,
        scoreA: 4,
        scoreB: 2,
        winnerTeam: 'A',
        approveCount: 1,
      });

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [winningSubmission, losingSibling] },
      });

      // La mutation devuelve la submission ya CONFIRMED + statusChanged=true,
      // lo que dispara el handleVote → marca otras PENDING como REJECTED.
      const { payloads } = await matchResultsSectionPage.mockVoteMatchResult({
        data: {
          voteMatchResult: {
            statusChanged: true,
            submission: {
              ...winningSubmission,
              status: 'CONFIRMED',
              approveCount: 3,
              hasUserVoted: true,
              userVote: 'APPROVE',
              votes: [
                {
                  __typename: 'MatchResultVote',
                  id: 'v-final',
                  voter: buildMockVoter({ id: 'mateo', displayName: 'Mateo' }),
                  vote: 'APPROVE',
                  createdAt: '2026-05-04T20:01:00Z',
                },
              ],
            },
          },
        },
      });

      await matchResultsSectionPage.goto(match.id);

      // Aprobamos la winning submission (la primera APPROVE visible).
      await matchResultsSectionPage
        .submissionCardByScore(3, 1)
        .getByRole('button', { name: /^aprobar$/i })
        .click();

      await expect.poll(() => payloads.length, { timeout: 10_000 }).toBe(1);

      // Heart of US #54: the winning card switches to CONFIRMED…
      await matchResultsSectionPage.expectConfirmedBadge(3, 1);

      // …and the sibling PENDING flips to REJECTED locally (handleVote).
      await matchResultsSectionPage.expectRejectedBadge(4, 2);

      // Y las CTAs de proponer otro desaparecen porque hay confirmado.
      await expect(matchResultsSectionPage.loadResultButton).toHaveCount(0);
      await expect(matchResultsSectionPage.proposeAnotherButton).toHaveCount(0);
    });

    test('statusChanged=false (carrera con voto hermano) NO transiciona la UI a CONFIRMED', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      const pending = buildMockSubmission({
        id: 'sub-race-1',
        matchId: match.id,
        scoreA: 1,
        scoreB: 1,
        winnerTeam: 'DRAW',
        approveCount: 2,
      });

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [pending] },
      });

      // El backend devuelve statusChanged=false aún siendo un APPROVE
      // que conceptualmente cruzaba mayoría: simulamos el alreadyConfirmed=true
      // del RPC (otro voto final llegó primero). El UI NO debe ascender la
      // tarjeta a CONFIRMED — sólo el primer caller hace esa transición.
      await matchResultsSectionPage.mockVoteMatchResult({
        data: {
          voteMatchResult: {
            statusChanged: false,
            submission: {
              ...pending,
              approveCount: 3,
              hasUserVoted: true,
              userVote: 'APPROVE',
            },
          },
        },
      });

      await matchResultsSectionPage.goto(match.id);
      await matchResultsSectionPage.approveButton.click();

      // La card sigue PENDING — guardia contra falsos "Resultado oficial".
      await matchResultsSectionPage.expectPendingBadge(1, 1);
      await expect(
        matchResultsSectionPage.section.getByText(/resultado oficial/i),
      ).toHaveCount(0);
    });
  });

  /* ════════════════════════════════════════════════════════════════════
     Bloque 4 — Errores del backend
     ════════════════════════════════════════════════════════════════════ */
  test.describe('Errores del backend', () => {
    test('si VoteMatchResult devuelve errors, la sección muestra el mensaje normalizado', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      const pending = buildMockSubmission({
        id: 'sub-err-1',
        matchId: match.id,
      });
      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [pending] },
      });
      await matchResultsSectionPage.mockVoteMatchResult({
        errors: [{ message: 'Solo se puede votar en propuestas pendientes' }],
      });

      await matchResultsSectionPage.goto(match.id);
      await matchResultsSectionPage.approveButton.click();

      await expect(matchResultsSectionPage.errorMessage).toContainText(
        /propuestas pendientes/i,
      );
    });
  });

  /* ════════════════════════════════════════════════════════════════════
     Bloque 5 — Visibilidad de la sección (gating SSR)
     ════════════════════════════════════════════════════════════════════ */
  test.describe('Gating SSR de la sección', () => {
    test('un visitante anónimo NUNCA ve la sección de resultado, aunque el partido haya empezado', async ({
      browser,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const anon = await ctx.newPage();
      try {
        await anon.goto(`${FRONTEND_URL}/partidos/${match.id}`);
        await expect(
          anon.getByRole('heading', { name: /resultado del partido/i, level: 2 }),
        ).toHaveCount(0);
      } finally {
        await ctx.close();
      }
    });
  });

  /* ════════════════════════════════════════════════════════════════════
     Bloque 5b — Editar equipos (reasignar A/B antes de confirmar)
     ════════════════════════════════════════════════════════════════════
     Decision Context:
     - The "Editar equipos" toggle is visible while no submission is CONFIRMED. Opening it
       mounts EditTeamsForm (one A/B segmented toggle per participant). Saving fires the
       ReassignMatchTeams mutation; on success the component reloads the page so the SSR team
       grid reflects the change — so we assert the captured payload right after the click
       (the reload may detach the page afterwards). The mutation is mocked to keep the suite
       hermetic (a real reassignment mutates matchParticipants for the shared seed match). */
  test.describe('Editar equipos (reasignar A/B)', () => {
    test('abre el editor y envía ReassignMatchTeams con el matchId correcto al guardar', async ({
      matchResultsSectionPage,
      request,
      page,
    }) => {
      const token = await readTokenFromCookies(page);
      const match = await findEligibleMatch(request, token);
      test.skip(!match);
      if (!match) return;

      await matchResultsSectionPage.mockGetSubmissions({
        data: { matchResultSubmissions: [] },
      });
      const { payloads } = await matchResultsSectionPage.mockReassignMatchTeams({
        data: {
          reassignMatchTeams: {
            teamA: [],
            teamB: [],
            teamACount: 0,
            teamBCount: 0,
            totalCount: 0,
            spotsLeftA: 0,
            spotsLeftB: 0,
          },
        },
      });

      await matchResultsSectionPage.goto(match.id);

      await expect(matchResultsSectionPage.editTeamsButton).toBeVisible();
      await matchResultsSectionPage.editTeamsButton.click();
      await expect(matchResultsSectionPage.saveTeamsButton).toBeVisible();

      await matchResultsSectionPage.saveTeamsButton.click();

      await expect.poll(() => payloads.length, { timeout: 10_000 }).toBe(1);
      expect(payloads[0]).toMatchObject({ variables: { input: { matchId: match.id } } });
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Bloque 6 — Contrato GraphQL voteMatchResult (sin browser)
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Contrato GraphQL voteMatchResult', () => {
  /**
   * Decision Context:
   * - Pegamos directo al backend con APIRequestContext para validar el
   *   contrato. NO autenticamos: la mutation debe rechazar la request
   *   con el mensaje canónico definido en matchResultVoteService.voteMatchResult
   *   ("Se requiere autenticación"). Es la guardia que protege contra
   *   votos forjados por callers sin sesión.
   * - No mutamos datos: como la request es rechazada antes del DB write,
   *   el seed permanece intacto.
   */
  test('sin Authorization header → la mutation falla con error de autenticación', async ({ request }) => {
    const resp = await request.post(BACKEND_GRAPHQL_URL, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        query: /* GraphQL */ `
          mutation Vote54Anon($input: VoteMatchResultInput!) {
            voteMatchResult(input: $input) { statusChanged }
          }
        `,
        variables: {
          input: {
            submissionId: '00000000-0000-0000-0000-000000000000',
            vote: 'APPROVE',
          },
        },
      },
    });

    expect(resp.ok(), 'GraphQL siempre responde 200, los errores van en body.errors').toBe(true);
    const body = (await resp.json()) as { errors?: Array<{ message: string }> };
    /*
     * Decision Context:
     * - The Apollo Server requireAuth middleware emits the canonical English
     *   "Authentication required" message; only the deeper service layer
     *   uses the Spanish "Se requiere autenticación". For an anonymous
     *   request the resolver guard short-circuits FIRST, so we expect the
     *   English variant. Matching either form keeps the assertion stable
     *   against future i18n of the auth layer.
     */
    expect(body.errors?.[0]?.message ?? '').toMatch(/authentication required|autenticaci/i);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
   Helpers locales del spec
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Lee la cookie HttpOnly sumateya-access-token del contexto del browser ya
 * autenticado vía storageState. No usa loginAndReadToken (que dispara un
 * login UI extra) porque la sesión ya está pre-warmeada por auth.setup.ts.
 *
 * Decision Context:
 * - Necesitamos el token para `gqlPostOrThrow` con APIRequestContext, que
 *   no comparte storage con el browser. Reutilizar la sesión existente
 *   evita un login redundante de 1-2s por test.
 */
function requiredBackendEnv(name: string): string {
  const value = process.env[name];
  expect(value, `${name} debe existir en ${BACKEND_ENV_PATH}`).toBeTruthy();
  return value as string;
}

async function readMatchVotingState(matchId: string): Promise<{
  resultStatus: string | null;
  resultVotingClosesAt: string | null;
}> {
  const admin = createClient(
    requiredBackendEnv('SUPABASE_URL'),
    requiredBackendEnv('PRIVATE_SUPABASE_SECRET_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await admin
    .from('matches')
    .select('"resultStatus", "resultVotingClosesAt"')
    .eq('id', matchId)
    .single();

  expect(error, 'No debe fallar la lectura DB de estado de votacion').toBeNull();
  expect(data, 'El fixture de partido E3 debe existir').toBeTruthy();
  return data as { resultStatus: string | null; resultVotingClosesAt: string | null };
}

async function readTokenFromStorageState(
  browser: Browser,
  storageStatePath: string,
): Promise<string> {
  const context = await browser.newContext({ storageState: storageStatePath });
  try {
    const cookies = await context.cookies(FRONTEND_URL);
    const token = cookies.find((c) => c.name === ACCESS_TOKEN_COOKIE)?.value;
    expect(token, `storageState ${storageStatePath} debe tener access token`).toBeTruthy();
    return token as string;
  } finally {
    await context.close();
  }
}

async function readTokenFromCookies(
  page: import('@playwright/test').Page,
): Promise<string> {
  const cookies = await page.context().cookies(FRONTEND_URL);
  const token = cookies.find((c) => c.name === ACCESS_TOKEN_COOKIE)?.value;
  if (token) return token;
  // Fallback defensivo: si por algún motivo la cookie no está, hacemos
  // login real (cubre runs donde auth.setup.ts falló silenciosamente).
  return loginAndReadToken(page, 'playerMateo');
}
