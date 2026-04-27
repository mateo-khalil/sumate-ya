/**
 * MatchResultsSection — displays result submissions and voting UI for a match.
 *
 * Decision Context:
 * - Why a React island: requires auth-aware interactivity (vote buttons, propose form).
 *   client:visible in the parent page loads it lazily when scrolled into view.
 * - State: submissions fetched on mount. After each mutation the affected submission is
 *   replaced in-place from the response — no extra round-trip needed.
 * - CTA visibility rules (P2 fix):
 *   - No submissions OR all REJECTED → "Cargar resultado" CTA
 *     (previously only showed when submissions.length === 0, missing the all-rejected case)
 *   - Has PENDING, no CONFIRMED → show submissions + "Proponer otro resultado"
 *   - Has CONFIRMED → show result card + hide all propose CTAs
 * - Cancelled match guard: showResultSection in [id].astro already excludes cancelled
 *   matches (P1 fix), so this component never renders for them.
 * - Styling: Tailwind utility classes using @theme tokens from globals.css.
 *   font-display → Bebas Neue, font-condensed → Barlow Condensed (tokens added for P3).
 *   bg-success / text-success-foreground → hsl(142 72% 50%) / hsl(142 72% 65%).
 * - Error display: vote errors from GraphQL are passed through parseGqlError so Zod v4 JSON
 *   arrays render as readable Spanish messages rather than raw JSON. Keep in sync with the
 *   same helper in ProposeResultForm.
 * - Previously fixed bugs:
 *   - P2 audit: "Cargar resultado" disappeared when all submissions were REJECTED.
 *   - P3 audit: inline style objects replaced with Tailwind classes per design-system.md.
 *   - Zod v4 JSON error array shown raw in UI — fixed by parseGqlError helper.
 */

import { useEffect, useState } from 'react';
import type { MatchResultSubmission } from '../../graphql/operations/match-results.js';
import {
  GET_MATCH_RESULT_SUBMISSIONS,
  VOTE_MATCH_RESULT,
  type VoteValue,
} from '../../graphql/operations/match-results.js';
import ProposeResultForm from './ProposeResultForm.js';

interface Props {
  matchId: string;
  isParticipant: boolean;
  backendUrl: string;
  accessToken: string;
}

function parseGqlError(message: string): string {
  try {
    const parsed: unknown = JSON.parse(message);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof (parsed[0] as Record<string, unknown>).message === 'string'
    ) {
      return parsed
        .map((issue: Record<string, unknown>) => String(issue.message))
        .join('. ');
    }
  } catch {
    // not JSON — fall through
  }
  return message;
}

async function gql<T>(
  backendUrl: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: T; errors?: { message: string }[] }> {
  const res = await fetch(`${backendUrl}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json() as Promise<{ data?: T; errors?: { message: string }[] }>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ScoreBadge({
  scoreA,
  scoreB,
  winnerTeam,
}: {
  scoreA: number;
  scoreB: number;
  winnerTeam: string;
}) {
  const label = winnerTeam === 'DRAW' ? 'Empate' : `Gana Equipo ${winnerTeam}`;
  return (
    <div className="flex items-center gap-[0.4rem]">
      <span className="font-display text-[2rem] text-foreground leading-none">{scoreA}</span>
      <span className="font-display text-[1.2rem] text-muted-foreground leading-none">—</span>
      <span className="font-display text-[2rem] text-foreground leading-none">{scoreB}</span>
      <span className="font-condensed text-[0.8rem] font-bold tracking-[0.08em] text-muted-foreground uppercase ml-[0.3rem]">
        {label}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONFIRMED') {
    return (
      <span className="font-condensed text-[0.75rem] font-bold tracking-[0.07em] uppercase px-[0.65rem] py-[0.25rem] rounded-full bg-success/15 border border-success/40 text-success-foreground">
        ✓ Resultado oficial
      </span>
    );
  }
  if (status === 'REJECTED') {
    return (
      <span className="font-condensed text-[0.75rem] font-bold tracking-[0.07em] uppercase px-[0.65rem] py-[0.25rem] rounded-full bg-white/5 border border-white/10 text-muted-foreground">
        Rechazado
      </span>
    );
  }
  return (
    <span className="font-condensed text-[0.75rem] font-bold tracking-[0.07em] uppercase px-[0.65rem] py-[0.25rem] rounded-full bg-primary/10 border border-primary/30 text-primary">
      Pendiente
    </span>
  );
}

interface SubmissionCardProps {
  submission: MatchResultSubmission;
  isParticipant: boolean;
  onVote: (submissionId: string, vote: VoteValue) => Promise<void>;
  voting: string | null;
}

function SubmissionCard({ submission, isParticipant, onVote, voting }: SubmissionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isPending = submission.status === 'PENDING';
  const isVoting = voting === submission.id;
  const isConfirmed = submission.status === 'CONFIRMED';

  return (
    <div
      className={`flex flex-col gap-[0.7rem] rounded-[10px] px-[1.4rem] py-[1.1rem] border ${
        isConfirmed
          ? 'bg-success-surface border-success/35'
          : 'bg-card border-white/8'
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <ScoreBadge
          scoreA={submission.scoreA}
          scoreB={submission.scoreB}
          winnerTeam={submission.winnerTeam}
        />
        <StatusBadge status={submission.status} />
      </div>

      <p className="m-0 font-body text-[0.825rem] text-muted-foreground">
        Propuesto por <strong>{submission.submitter.displayName}</strong> ·{' '}
        {formatDate(submission.createdAt)}
      </p>

      <div className="flex gap-4">
        <span className="font-body text-[0.825rem] text-success-foreground">
          ✓ {submission.approveCount} aprobaciones
        </span>
        <span className="font-body text-[0.825rem] text-destructive">
          ✗ {submission.rejectCount} rechazos
        </span>
      </div>

      {isPending && isParticipant && (
        <div className="flex gap-[0.6rem] items-center flex-wrap">
          {!submission.hasUserVoted ? (
            <>
              <button
                onClick={() => onVote(submission.id, 'APPROVE')}
                disabled={isVoting}
                className="rounded-md font-condensed text-[0.85rem] font-bold tracking-[0.07em] px-4 py-[0.4rem] cursor-pointer bg-success/15 border border-success/40 text-success-foreground disabled:opacity-60"
              >
                {isVoting ? '…' : '✓ Aprobar'}
              </button>
              <button
                onClick={() => onVote(submission.id, 'REJECT')}
                disabled={isVoting}
                className="rounded-md font-condensed text-[0.85rem] font-bold tracking-[0.07em] px-4 py-[0.4rem] cursor-pointer bg-destructive/12 border border-destructive/35 text-destructive disabled:opacity-60"
              >
                {isVoting ? '…' : '✗ Rechazar'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 flex-wrap font-body text-[0.85rem] text-muted-foreground">
              <span>
                Tu voto:{' '}
                <strong>
                  {submission.userVote === 'APPROVE' ? 'Aprobado ✓' : 'Rechazado ✗'}
                </strong>
              </span>
              <button
                onClick={() =>
                  onVote(
                    submission.id,
                    submission.userVote === 'APPROVE' ? 'REJECT' : 'APPROVE',
                  )
                }
                disabled={isVoting}
                className="bg-transparent border border-white/12 rounded-[5px] text-muted-foreground font-body text-[0.8rem] py-[0.2rem] px-[0.7rem] cursor-pointer disabled:opacity-60"
              >
                {isVoting ? '…' : 'Cambiar voto'}
              </button>
            </div>
          )}
        </div>
      )}

      {submission.votes.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="bg-transparent border-none text-secondary font-body text-[0.8rem] p-0 cursor-pointer underline"
          >
            {expanded
              ? 'Ocultar votos'
              : `Ver ${submission.votes.length} voto${submission.votes.length !== 1 ? 's' : ''}`}
          </button>
          {expanded && (
            <ul className="list-none m-0 mt-2 p-0 flex flex-col gap-[0.3rem]">
              {submission.votes.map((v) => (
                <li key={v.id} className="flex items-center gap-2">
                  <span
                    className={
                      v.vote === 'APPROVE'
                        ? 'font-body text-[0.825rem] text-success-foreground'
                        : 'font-body text-[0.825rem] text-destructive'
                    }
                  >
                    {v.vote === 'APPROVE' ? '✓' : '✗'}
                  </span>
                  <span className="font-body text-[0.825rem] text-muted-foreground">
                    {v.voter.displayName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function MatchResultsSection({
  matchId,
  isParticipant,
  backendUrl,
  accessToken,
}: Props) {
  const [submissions, setSubmissions] = useState<MatchResultSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isParticipant) {
      setLoading(false);
      return;
    }

    gql<{ matchResultSubmissions: MatchResultSubmission[] }>(
      backendUrl,
      accessToken,
      GET_MATCH_RESULT_SUBMISSIONS,
      { matchId },
    )
      .then((json) => {
        if (json.errors?.length) {
          setFetchError(json.errors[0].message);
        } else {
          setSubmissions(json.data?.matchResultSubmissions ?? []);
        }
      })
      .catch(() => setFetchError('Error de red'))
      .finally(() => setLoading(false));
  }, [matchId, isParticipant, backendUrl, accessToken]);

  async function handleVote(submissionId: string, vote: VoteValue) {
    setVoting(submissionId);
    setVoteError(null);

    const json = await gql<{
      voteMatchResult: { statusChanged: boolean; submission: MatchResultSubmission };
    }>(backendUrl, accessToken, VOTE_MATCH_RESULT, { input: { submissionId, vote } });

    setVoting(null);

    if (json.errors?.length) {
      setVoteError(parseGqlError(json.errors[0].message));
      return;
    }

    if (json.data?.voteMatchResult) {
      const updated = json.data.voteMatchResult.submission;
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

      if (json.data.voteMatchResult.statusChanged) {
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id !== updated.id && s.status === 'PENDING'
              ? { ...s, status: 'REJECTED' as const }
              : s,
          ),
        );
      }
    }
  }

  function handleProposed(submission: MatchResultSubmission) {
    setSubmissions((prev) => [submission, ...prev]);
    setShowForm(false);
  }

  // P2 fix: track active (non-rejected) submissions separately
  const hasPending = submissions.some((s) => s.status === 'PENDING');
  const hasConfirmed = submissions.some((s) => s.status === 'CONFIRMED');
  // Show initial CTA when there are no pending or confirmed submissions
  // (covers: no submissions yet AND all-rejected case)
  const hasActiveSubmission = hasPending || hasConfirmed;

  if (!isParticipant) return null;

  return (
    <section className="flex flex-col gap-[0.9rem]">
      <h2 className="m-0 font-display text-[1.35rem] tracking-[0.08em] text-foreground">
        Resultado del partido
      </h2>

      {loading && (
        <p className="m-0 font-body text-sm text-muted-foreground">Cargando…</p>
      )}
      {fetchError && (
        <p className="m-0 font-body text-sm text-destructive">{fetchError}</p>
      )}
      {voteError && (
        <p className="m-0 font-body text-sm text-destructive">{voteError}</p>
      )}

      {/* P2 fix: show CTA when no active (pending/confirmed) submissions exist */}
      {!loading && !hasActiveSubmission && !showForm && (
        <div className="bg-card border border-white/7 rounded-[10px] p-6 flex flex-col items-center gap-4">
          <p className="m-0 font-body text-sm text-muted-foreground">
            Ningún participante cargó el resultado todavía.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary border-none rounded-lg text-background font-condensed text-[0.9rem] font-bold tracking-[0.08em] py-[0.55rem] px-6 cursor-pointer"
          >
            + Cargar resultado
          </button>
        </div>
      )}

      {submissions.map((s) => (
        <SubmissionCard
          key={s.id}
          submission={s}
          isParticipant={isParticipant}
          onVote={handleVote}
          voting={voting}
        />
      ))}

      {/* Show "Proponer otro resultado" only when there are pending submissions but no confirmed one */}
      {!showForm && hasPending && !hasConfirmed && (
        <button
          onClick={() => setShowForm(true)}
          className="bg-transparent border border-white/12 rounded-lg text-muted-foreground font-condensed text-[0.85rem] font-bold tracking-[0.07em] py-[0.45rem] px-[1.1rem] cursor-pointer self-start"
        >
          + Proponer otro resultado
        </button>
      )}

      {showForm && (
        <ProposeResultForm
          matchId={matchId}
          backendUrl={backendUrl}
          accessToken={accessToken}
          onSuccess={handleProposed}
          onCancel={() => setShowForm(false)}
        />
      )}
    </section>
  );
}
