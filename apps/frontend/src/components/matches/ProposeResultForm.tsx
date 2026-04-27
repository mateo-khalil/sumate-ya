/**
 * ProposeResultForm — form to submit a new match result proposal.
 *
 * Decision Context:
 * - winnerTeam is derived automatically from scores so the user cannot submit an
 *   inconsistent result (e.g., scoreA=3, scoreB=2, winnerTeam=B).
 * - Client-side validation mirrors the backend Zod schema (0–99 range).
 * - On success, calls onSuccess(newSubmission) so the parent MatchResultsSection can
 *   prepend the submission without a full re-fetch.
 * - Error display: GraphQL errors whose message is a Zod v4 JSON array (e.g.,
 *   '[{"message":"ID inválido",...}]') are parsed and the human-readable .message of each
 *   issue is joined — prevents raw JSON appearing in the UI. Plain string messages fall
 *   through unchanged. Do NOT remove parseGqlError — Zod v4 serialises ZodError.message
 *   as a JSON array, and Apollo propagates that verbatim.
 * - Styling: Tailwind utility classes using @theme tokens from globals.css per P3 audit fix.
 *   font-display → Bebas Neue, font-condensed → Barlow Condensed.
 * - Previously fixed bugs:
 *   - P3 audit: inline style objects replaced with Tailwind classes per design-system.md.
 *   - Zod v4 JSON error array shown raw in UI — fixed by parseGqlError helper.
 */

import { useState } from 'react';
import type { MatchResultSubmission, WinnerTeam } from '../../graphql/operations/match-results.js';
import { PROPOSE_MATCH_RESULT } from '../../graphql/operations/match-results.js';

interface Props {
  matchId: string;
  backendUrl: string;
  accessToken: string;
  onSuccess: (submission: MatchResultSubmission) => void;
  onCancel: () => void;
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

function deriveWinner(a: number, b: number): WinnerTeam {
  if (a > b) return 'A';
  if (b > a) return 'B';
  return 'DRAW';
}

export default function ProposeResultForm({
  matchId,
  backendUrl,
  accessToken,
  onSuccess,
  onCancel,
}: Props) {
  const [scoreA, setScoreA] = useState<string>('');
  const [scoreB, setScoreB] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numA = parseInt(scoreA, 10);
  const numB = parseInt(scoreB, 10);
  const bothValid =
    !isNaN(numA) && !isNaN(numB) && numA >= 0 && numA <= 99 && numB >= 0 && numB <= 99;
  const winnerLabel = bothValid
    ? deriveWinner(numA, numB) === 'DRAW'
      ? 'Empate'
      : `Gana Equipo ${deriveWinner(numA, numB)}`
    : '—';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bothValid) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: PROPOSE_MATCH_RESULT,
          variables: {
            input: {
              matchId,
              scoreA: numA,
              scoreB: numB,
              winnerTeam: deriveWinner(numA, numB),
            },
          },
        }),
      });

      const json = (await res.json()) as {
        data?: { proposeMatchResult: MatchResultSubmission };
        errors?: { message: string }[];
      };

      if (json.errors?.length) {
        setError(parseGqlError(json.errors[0].message));
        return;
      }

      if (json.data?.proposeMatchResult) {
        onSuccess(json.data.proposeMatchResult);
      }
    } catch {
      setError('Error de red al enviar el resultado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-white/10 rounded-[10px] px-6 py-5 flex flex-col gap-[0.9rem]"
    >
      <p className="m-0 font-condensed font-bold text-[0.85rem] tracking-[0.1em] uppercase text-muted-foreground">
        Marcador final
      </p>

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-[0.3rem] flex-1">
          <label className="font-body text-[0.8rem] text-muted-foreground">Equipo A</label>
          <input
            type="number"
            min={0}
            max={99}
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            placeholder="0"
            required
            className="bg-input border border-border rounded-lg text-foreground font-display text-[2rem] text-center px-2 py-[0.4rem] w-full outline-none focus:border-primary"
          />
        </div>

        <span className="font-display text-[1.5rem] text-muted-foreground pb-2">—</span>

        <div className="flex flex-col gap-[0.3rem] flex-1">
          <label className="font-body text-[0.8rem] text-muted-foreground">Equipo B</label>
          <input
            type="number"
            min={0}
            max={99}
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            placeholder="0"
            required
            className="bg-input border border-border rounded-lg text-foreground font-display text-[2rem] text-center px-2 py-[0.4rem] w-full outline-none focus:border-primary"
          />
        </div>
      </div>

      {bothValid && (
        <p className="m-0 font-body text-[0.875rem] text-muted-foreground">
          Resultado: <strong className="text-foreground">{winnerLabel}</strong>
        </p>
      )}

      {error && (
        <p className="m-0 font-body text-[0.875rem] text-destructive">{error}</p>
      )}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="bg-transparent border border-white/12 rounded-md text-muted-foreground font-condensed text-[0.85rem] font-semibold tracking-[0.08em] px-4 py-[0.45rem] cursor-pointer disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!bothValid || loading}
          className="bg-primary border-none rounded-md text-background font-condensed text-[0.875rem] font-bold tracking-[0.08em] px-5 py-[0.45rem] cursor-pointer disabled:opacity-60"
        >
          {loading ? 'Enviando…' : 'Enviar resultado'}
        </button>
      </div>
    </form>
  );
}
