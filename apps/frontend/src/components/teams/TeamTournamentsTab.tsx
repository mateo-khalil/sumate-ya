/**
 * TeamTournamentsTab — gestión de inscripciones del equipo a torneos.
 *
 * Decision Context:
 * - F10 (issue #137): al inscribir, el backend calcula warnings de disponibilidad
 *   comparando playerAvailability del equipo vs scheduledAt de los fixtureMatches.
 * - El warning es informativo y NO bloquea la inscripción.
 * - Los warnings se muestran en un panel amarillo tras el enroll exitoso.
 * - Para dar de baja se reutiliza LEAVE_TOURNAMENT (ya existe en tournamentService).
 * - Los torneos disponibles se obtienen via GET_TOURNAMENTS (solo REGISTRATION).
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import { Trophy, Plus, X, Loader2, TriangleAlert, Check, LogOut } from 'lucide-react';
import type { TeamEnrollmentData, EnrollTeamResultData } from '../../graphql/operations/teams';
import { TEAM_ENROLLMENTS, ENROLL_TEAM_IN_TOURNAMENT } from '../../graphql/operations/teams';
import { LEAVE_TOURNAMENT } from '../../graphql/operations/tournaments';
import type { TournamentData } from '../../graphql/operations/tournaments';
import { GET_TOURNAMENTS } from '../../graphql/operations/tournaments';

interface Props {
  teamId: string;
  isCaptain: boolean;
}

async function gqlPost<T>(query: string, variables?: Record<string, unknown>, auth = true): Promise<{ data?: T; error?: string }> {
  try {
    const endpoint = auth ? '/api/graphql-auth' : '/api/graphql';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json() as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) return { error: json.errors[0].message };
    return { data: json.data };
  } catch {
    return { error: 'Error de red' };
  }
}

const STATUS_LABEL: Record<string, string> = {
  REGISTRATION: 'Inscripción', IN_PROGRESS: 'En curso', COMPLETED: 'Finalizado', CANCELLED: 'Cancelado',
};
const STATUS_CLASS: Record<string, string> = {
  REGISTRATION: 'status-reg', IN_PROGRESS: 'status-ip', COMPLETED: 'status-done', CANCELLED: 'status-canc',
};
const FORMAT_LABEL: Record<string, string> = {
  FIVE_VS_FIVE: '5v5', SEVEN_VS_SEVEN: '7v7', TEN_VS_TEN: '10v10', ELEVEN_VS_ELEVEN: '11v11',
};

export function TeamTournamentsTab({ teamId, isCaptain }: Props) {
  const [enrollments, setEnrollments] = useState<TeamEnrollmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<EnrollTeamResultData | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadEnrollments() {
    setLoading(true);
    const { data } = await gqlPost<{ teamEnrollments: TeamEnrollmentData[] }>(TEAM_ENROLLMENTS, { teamId });
    setEnrollments(data?.teamEnrollments ?? []);
    setLoading(false);
  }

  useEffect(() => { loadEnrollments(); }, [teamId]);

  async function openSelector() {
    setShowSelector(true);
    setLoadingTournaments(true);
    setLastResult(null);
    setActionError(null);
    const { data } = await gqlPost<{ tournaments: TournamentData[] }>(GET_TOURNAMENTS, undefined, false);
    const all = data?.tournaments ?? [];
    const enrolledIds = new Set(enrollments.map(e => e.tournamentId));
    setTournaments(all.filter(t => t.status === 'REGISTRATION' && !enrolledIds.has(t.id)));
    setLoadingTournaments(false);
  }

  async function handleEnroll(tournamentId: string) {
    setEnrolling(tournamentId);
    setActionError(null);
    const { data, error } = await gqlPost<{ enrollTeamInTournament: EnrollTeamResultData }>(
      ENROLL_TEAM_IN_TOURNAMENT, { teamId, tournamentId }
    );
    if (error || !data?.enrollTeamInTournament.success) {
      setActionError(error ?? data?.enrollTeamInTournament.message ?? 'Error al inscribir');
      setEnrolling(null);
      return;
    }
    setLastResult(data.enrollTeamInTournament);
    await loadEnrollments();
    setShowSelector(false);
    setEnrolling(null);
  }

  async function handleWithdraw(enrollment: TeamEnrollmentData) {
    if (!confirm(`¿Retirar el equipo de "${enrollment.tournamentName}"?`)) return;
    setWithdrawing(enrollment.id);
    setActionError(null);
    // Necesitamos el tournamentTeamId (= enrollment.id) y el tournamentId
    const { data, error } = await gqlPost<{ leaveTournament: { success: boolean; message: string } }>(
      LEAVE_TOURNAMENT,
      { input: { tournamentId: enrollment.tournamentId, teamId: enrollment.id, reason: null } }
    );
    if (error || !data?.leaveTournament.success) {
      setActionError(error ?? data?.leaveTournament.message ?? 'Error al retirar');
      setWithdrawing(null);
      return;
    }
    await loadEnrollments();
    setWithdrawing(null);
  }

  return (
    <div className="tournaments-tab">
      <div className="tab-header">
        <span className="header-count">
          <Trophy size={15} strokeWidth={2} aria-hidden="true" />
          {enrollments.length} {enrollments.length === 1 ? 'torneo' : 'torneos'}
        </span>
        {isCaptain && (
          <button className="enroll-btn" onClick={openSelector} disabled={showSelector}>
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" /> Inscribir a torneo
          </button>
        )}
      </div>

      {/* Resultado de última inscripción */}
      {lastResult && (
        <div className={`result-banner ${lastResult.warnings.length > 0 ? 'result-warn' : 'result-ok'}`}>
          {lastResult.warnings.length === 0
            ? <><Check size={15} strokeWidth={2} aria-hidden="true" /> {lastResult.message}</>
            : <>
                <div className="warn-header">
                  <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{lastResult.message}</span>
                </div>
                <ul className="warn-list">
                  {lastResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </>
          }
          <button className="dismiss-btn" onClick={() => setLastResult(null)} aria-label="Cerrar">
            <X size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}

      {actionError && <div className="error-msg" role="alert">{actionError}</div>}

      {/* Selector de torneos disponibles */}
      {showSelector && (
        <div className="selector-panel">
          <div className="selector-header">
            <span>Torneos disponibles</span>
            <button className="close-selector" onClick={() => setShowSelector(false)} aria-label="Cerrar">
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          {loadingTournaments && (
            <div className="loading-row">
              <Loader2 size={16} strokeWidth={2} aria-hidden="true" className="spin" /> Cargando...
            </div>
          )}
          {!loadingTournaments && tournaments.length === 0 && (
            <p className="no-tournaments">No hay torneos en período de inscripción disponibles.</p>
          )}
          {tournaments.map(t => (
            <div key={t.id} className="tournament-option">
              <div className="option-info">
                <span className="option-name">{t.name}</span>
                <span className="option-meta">
                  {FORMAT_LABEL[t.format] ?? t.format} · {t.registeredTeamsCount}/{t.teamCount} equipos
                  {t.club && ` · ${t.club.name}`}
                </span>
              </div>
              <button
                className="option-enroll-btn"
                onClick={() => handleEnroll(t.id)}
                disabled={enrolling === t.id}
              >
                {enrolling === t.id
                  ? <Loader2 size={13} strokeWidth={2} aria-hidden="true" className="spin" />
                  : 'Inscribir'
                }
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lista de inscripciones actuales */}
      {loading && (
        <div className="loading-row">
          <Loader2 size={16} strokeWidth={2} aria-hidden="true" className="spin" /> Cargando torneos...
        </div>
      )}
      {!loading && enrollments.length === 0 && !showSelector && (
        <div className="empty-state">
          <Trophy size={36} strokeWidth={1.5} aria-hidden="true" className="empty-icon" />
          <p>El equipo no está inscripto en ningún torneo.</p>
        </div>
      )}
      <div className="enrollment-list">
        {enrollments.map(e => (
          <div key={e.id} className="enrollment-row">
            <div className="enrollment-info">
              <span className="enrollment-name">{e.tournamentName}</span>
              <div className="enrollment-meta">
                <span className={`status-badge ${STATUS_CLASS[e.tournamentStatus] ?? ''}`}>
                  {STATUS_LABEL[e.tournamentStatus] ?? e.tournamentStatus}
                </span>
                <span className="enrollment-format">{FORMAT_LABEL[e.format] ?? e.format}</span>
              </div>
            </div>
            {isCaptain && e.tournamentStatus === 'REGISTRATION' && (
              <button
                className="withdraw-btn"
                onClick={() => handleWithdraw(e)}
                disabled={withdrawing === e.id}
                aria-label={`Retirar de ${e.tournamentName}`}
                title="Retirar equipo"
              >
                {withdrawing === e.id
                  ? <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="spin" />
                  : <LogOut size={14} strokeWidth={2} aria-hidden="true" />
                }
              </button>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .tournaments-tab { display: flex; flex-direction: column; gap: 1rem; }
        .tab-header { display: flex; align-items: center; justify-content: space-between; }
        .header-count { display: flex; align-items: center; gap: .4rem; font-size: .875rem; color: var(--color-muted-foreground); }
        .enroll-btn {
          display: flex; align-items: center; gap: .4rem; padding: .45rem .9rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px; font-size: .8rem; font-weight: 600; cursor: pointer;
        }
        .enroll-btn:disabled { opacity: .5; cursor: not-allowed; }
        .result-banner {
          display: flex; flex-direction: column; gap: .4rem; padding: .75rem .9rem;
          border-radius: 8px; font-size: .85rem; position: relative;
        }
        .result-ok { background: hsl(140 60% 12%); color: hsl(140 70% 55%); }
        .result-warn { background: hsl(35 70% 12%); color: hsl(35 80% 60%); }
        .warn-header { display: flex; align-items: center; gap: .4rem; font-weight: 600; }
        .warn-list { margin: .25rem 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: .2rem; font-size: .8rem; }
        .dismiss-btn {
          position: absolute; top: .5rem; right: .5rem; width: 22px; height: 22px;
          border-radius: 4px; border: none; background: transparent; cursor: pointer;
          color: inherit; display: flex; align-items: center; justify-content: center; opacity: .7;
        }
        .error-msg { background: hsl(0 60% 15%); border: 1px solid hsl(0 72% 40%); color: hsl(0 80% 70%); padding: .6rem .8rem; border-radius: 8px; font-size: .85rem; }
        .selector-panel { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; }
        .selector-header { display: flex; align-items: center; justify-content: space-between; padding: .75rem 1rem; border-bottom: 1px solid var(--color-border); font-size: .85rem; font-weight: 600; }
        .close-selector { width: 28px; height: 28px; border-radius: 6px; border: none; background: var(--color-muted); color: var(--color-muted-foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .loading-row { display: flex; align-items: center; gap: .5rem; padding: 1rem; color: var(--color-muted-foreground); font-size: .875rem; }
        .no-tournaments { padding: 1rem; color: var(--color-muted-foreground); font-size: .85rem; margin: 0; }
        .tournament-option { display: flex; align-items: center; gap: .75rem; padding: .7rem 1rem; border-top: 1px solid var(--color-border); }
        .option-info { flex: 1; min-width: 0; }
        .option-name { font-size: .875rem; font-weight: 500; display: block; }
        .option-meta { font-size: .75rem; color: var(--color-muted-foreground); }
        .option-enroll-btn {
          padding: .35rem .75rem; background: hsl(216 60% 18%); color: hsl(216 70% 65%);
          border: 1px solid hsl(216 50% 30%); border-radius: 6px; font-size: .78rem; font-weight: 600; cursor: pointer;
          display: flex; align-items: center; gap: .3rem;
        }
        .option-enroll-btn:disabled { opacity: .5; }
        .empty-state { display: flex; flex-direction: column; align-items: center; gap: .6rem; padding: 2.5rem 1rem; color: var(--color-muted-foreground); text-align: center; }
        .empty-icon { opacity: .3; }
        .empty-state p { margin: 0; font-size: .875rem; }
        .enrollment-list { display: flex; flex-direction: column; gap: .4rem; }
        .enrollment-row { display: flex; align-items: center; gap: .75rem; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 8px; padding: .7rem 1rem; }
        .enrollment-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .25rem; }
        .enrollment-name { font-size: .875rem; font-weight: 500; }
        .enrollment-meta { display: flex; align-items: center; gap: .5rem; }
        .status-badge { font-size: .7rem; font-weight: 600; padding: .15rem .5rem; border-radius: 999px; }
        .status-reg  { background: hsl(216 60% 18%); color: hsl(216 70% 65%); }
        .status-ip   { background: hsl(35 70% 18%); color: hsl(35 80% 60%); }
        .status-done { background: hsl(140 50% 12%); color: hsl(140 60% 50%); }
        .status-canc { background: hsl(0 50% 15%); color: hsl(0 60% 55%); }
        .enrollment-format { font-size: .75rem; color: var(--color-muted-foreground); }
        .withdraw-btn { width: 30px; height: 30px; border-radius: 6px; border: none; background: hsl(0 50% 18%); color: hsl(0 70% 55%); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .withdraw-btn:disabled { opacity: .5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
