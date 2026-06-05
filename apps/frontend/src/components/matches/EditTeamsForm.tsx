/**
 * EditTeamsForm — reassign participants between Team A and Team B when loading a result.
 *
 * Decision Context:
 * - Why: matchesWon is computed from the team rosters at confirmation time, so a participant
 *   loading the result must be able to fix who was on which side (someone swapped mid-match,
 *   or was placed on the wrong team at join time) BEFORE the result is confirmed.
 * - Each participant gets an A/B segmented toggle seeded from the current roster. Saving sends
 *   the full assignment list; the backend RPC ignores unchanged rows and validates the caller
 *   is a participant, the match has ended, and the result is not yet confirmed.
 * - Direct fetch (no urql) with the bearer token, matching ProposeResultForm / JoinTeamButton.
 * - On success the parent reloads the page so the SSR-rendered team grid reflects the change.
 * - Errors are normalised via the shared parseGqlError helper (Zod v4 arrays -> readable ES).
 * - No emojis: lucide-react icons only; colours come from globals.css theme tokens.
 * - Previously fixed bugs: none relevant (new capability).
 */

import { useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import {
  REASSIGN_MATCH_TEAMS,
  type MatchTeam,
  type RosterMember,
  type MatchParticipantsData,
} from '../../graphql/operations/match-results.js';
import { parseGqlError } from '../../lib/parseGqlError.js';

interface Props {
  matchId: string;
  teamA: RosterMember[];
  teamB: RosterMember[];
  backendUrl: string;
  accessToken: string;
  onSuccess: (participants: MatchParticipantsData) => void;
  onCancel: () => void;
}

interface Row {
  player: RosterMember;
  team: MatchTeam;
}

export default function EditTeamsForm({
  matchId,
  teamA,
  teamB,
  backendUrl,
  accessToken,
  onSuccess,
  onCancel,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() => [
    ...teamA.map((player) => ({ player, team: 'A' as MatchTeam })),
    ...teamB.map((player) => ({ player, team: 'B' as MatchTeam })),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setTeam(playerId: string, team: MatchTeam) {
    setRows((prev) => prev.map((r) => (r.player.id === playerId ? { ...r, team } : r)));
  }

  async function handleSave() {
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
          query: REASSIGN_MATCH_TEAMS,
          variables: {
            input: {
              matchId,
              assignments: rows.map((r) => ({ playerId: r.player.id, team: r.team })),
            },
          },
        }),
      });

      const json = (await res.json()) as {
        data?: { reassignMatchTeams: MatchParticipantsData };
        errors?: { message: string }[];
      };

      if (json.errors?.length) {
        setError(parseGqlError(json.errors[0].message));
        return;
      }

      if (json.data?.reassignMatchTeams) {
        onSuccess(json.data.reassignMatchTeams);
      }
    } catch {
      setError('Error de red al guardar los equipos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-white/10 rounded-[10px] px-6 py-5 flex flex-col gap-[0.9rem]">
      <p className="m-0 inline-flex items-center gap-2 font-condensed font-bold text-[0.85rem] tracking-[0.1em] uppercase text-muted-foreground">
        <Users size={16} strokeWidth={2.25} aria-hidden="true" /> Editar equipos
      </p>
      <p className="m-0 font-body text-[0.8rem] text-muted-foreground">
        Corregí en qué equipo jugó cada participante antes de cargar el resultado.
      </p>

      <ul className="list-none m-0 p-0 flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.player.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-input/60 border border-border px-3 py-2"
          >
            <span className="font-body text-[0.9rem] text-foreground truncate">
              {r.player.displayName}
            </span>
            <div className="flex items-center gap-1 shrink-0" role="group" aria-label={`Equipo de ${r.player.displayName}`}>
              <button
                type="button"
                onClick={() => setTeam(r.player.id, 'A')}
                aria-pressed={r.team === 'A'}
                disabled={loading}
                className={`font-condensed text-[0.8rem] font-bold tracking-[0.06em] rounded-md px-3 py-[0.3rem] cursor-pointer disabled:opacity-60 ${
                  r.team === 'A'
                    ? 'bg-primary text-background'
                    : 'bg-transparent border border-white/12 text-muted-foreground'
                }`}
              >
                Equipo A
              </button>
              <button
                type="button"
                onClick={() => setTeam(r.player.id, 'B')}
                aria-pressed={r.team === 'B'}
                disabled={loading}
                className={`font-condensed text-[0.8rem] font-bold tracking-[0.06em] rounded-md px-3 py-[0.3rem] cursor-pointer disabled:opacity-60 ${
                  r.team === 'B'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-transparent border border-white/12 text-muted-foreground'
                }`}
              >
                Equipo B
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="m-0 font-body text-[0.875rem] text-destructive">{error}</p>}

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
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-primary border-none rounded-md text-background font-condensed text-[0.875rem] font-bold tracking-[0.08em] px-5 py-[0.45rem] cursor-pointer disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 size={14} strokeWidth={2.5} className="animate-spin" aria-hidden="true" /> Guardando…
            </>
          ) : (
            'Guardar equipos'
          )}
        </button>
      </div>
    </div>
  );
}
