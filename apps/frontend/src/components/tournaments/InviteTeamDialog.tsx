/**
 * InviteTeamDialog — modal para invitar equipos permanentes a un torneo (T5).
 *
 * Decision Context:
 * - Issue #132 T5: visible solo para el organizador del torneo en /torneos/[id].
 * - Busca equipos permanentes via searchTeams query (mínimo 2 chars, debounce 400ms).
 * - Muestra invitaciones ya enviadas con su status via MY_TOURNAMENT_INVITATIONS.
 * - INVITE_TEAM_TO_TOURNAMENT crea la invitación; el capitán la ve en el navbar bell.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect, useRef } from 'react';
import { Search, Users, X, Send, Loader2, Check, Clock, XCircle } from 'lucide-react';
import type { TeamData } from '../../graphql/operations/teams';
import type { TournamentInvitationData } from '../../graphql/operations/tournaments';
import { MY_TOURNAMENT_INVITATIONS, INVITE_TEAM_TO_TOURNAMENT } from '../../graphql/operations/tournaments';

const SEARCH_TEAMS = /* GraphQL */ `
  query SearchTeams($search: String!) {
    searchTeams(search: $search) {
      id name captainId memberCount
      captain { id displayName avatarUrl }
    }
  }
`;

interface Props {
  tournamentId: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', EXPIRED: 'Expirada',
};
const STATUS_CLASS: Record<string, string> = {
  PENDING: 'status-pending', ACCEPTED: 'status-accepted', REJECTED: 'status-rejected', EXPIRED: 'status-expired',
};

async function gqlPost<T>(query: string, variables?: unknown): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json() as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) return { error: json.errors[0].message };
    return { data: json.data };
  } catch { return { error: 'Error de red' }; }
}

export function InviteTeamDialog({ tournamentId, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamData[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TeamData | null>(null);
  const [message, setMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invSuccess, setInvSuccess] = useState(false);
  const [sentInvitations, setSentInvitations] = useState<TournamentInvitationData[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cargar invitaciones ya enviadas
  useEffect(() => {
    gqlPost<{ myTournamentInvitations: TournamentInvitationData[] }>(MY_TOURNAMENT_INVITATIONS)
      .then(({ data }) => {
        const all = data?.myTournamentInvitations ?? [];
        setSentInvitations(all.filter(i => i.tournamentId === tournamentId));
      });
  }, [tournamentId, invSuccess]);

  // Búsqueda debounced
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await gqlPost<{ searchTeams: TeamData[] }>(SEARCH_TEAMS, { search: query });
      setResults(data?.searchTeams ?? []);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  async function handleInvite() {
    if (!selected) return;
    setInviting(true); setInvError(null);
    const { data, error } = await gqlPost<{ inviteTeamToTournament: { success: boolean; message: string } }>(
      INVITE_TEAM_TO_TOURNAMENT,
      { input: { tournamentId, teamId: selected.id, message: message.trim() || null } }
    );
    if (error || !data?.inviteTeamToTournament.success) {
      setInvError(error ?? data?.inviteTeamToTournament.message ?? 'Error al enviar');
      setInviting(false); return;
    }
    setInvSuccess(true); setSelected(null); setMessage(''); setQuery('');
    setTimeout(() => setInvSuccess(false), 2500);
    setInviting(false);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="invite-t-title">
      <div className="dialog">
        <div className="dialog-header">
          <h2 id="invite-t-title" className="dialog-title">
            <Users size={17} strokeWidth={2} aria-hidden="true" /> Invitar equipo al torneo
          </h2>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {invSuccess && (
          <div className="success-banner">
            <Check size={15} strokeWidth={2} aria-hidden="true" /> Invitación enviada correctamente
          </div>
        )}

        {/* Búsqueda de equipo */}
        {!selected && (
          <div className="search-section">
            <div className="search-input-wrap">
              <Search size={15} strokeWidth={2} aria-hidden="true" className="search-icon" />
              <input ref={inputRef} type="text" className="search-input" placeholder="Buscar equipo por nombre..."
                value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" />
              {searching && <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="spin" />}
            </div>
            {results.length > 0 && (
              <ul className="results-list">
                {results.map(t => (
                  <li key={t.id}>
                    <button className="result-item" onClick={() => { setSelected(t); setQuery(''); setResults([]); }}>
                      <div className="result-info">
                        <span className="result-name">{t.name}</span>
                        <span className="result-meta">
                          {t.captain?.displayName && `Capitán: ${t.captain.displayName}`}
                          {' · '}{t.memberCount} {t.memberCount === 1 ? 'miembro' : 'miembros'}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="no-results">No se encontraron equipos con ese nombre.</p>
            )}
          </div>
        )}

        {selected && (
          <>
            <div className="selected-team">
              <div className="selected-info">
                <span className="selected-name">{selected.name}</span>
                <span className="selected-captain">Capitán: {selected.captain?.displayName ?? '—'}</span>
              </div>
              <button className="deselect-btn" onClick={() => { setSelected(null); setInvError(null); }}>
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="field-group">
              <label htmlFor="inv-msg" className="field-label">Mensaje opcional</label>
              <textarea id="inv-msg" className="field-input" rows={2} maxLength={500}
                value={message} onChange={e => setMessage(e.target.value)}
                placeholder="¿Por qué querés invitar a este equipo?" />
            </div>
            {invError && <div className="error-msg" role="alert">{invError}</div>}
            <button className="invite-btn" onClick={handleInvite} disabled={inviting}>
              {inviting ? <><Loader2 size={14} strokeWidth={2} aria-hidden="true" className="spin" /> Enviando...</>
                : <><Send size={14} strokeWidth={2} aria-hidden="true" /> Enviar invitación</>}
            </button>
          </>
        )}

        {/* Invitaciones enviadas */}
        {sentInvitations.length > 0 && (
          <div className="sent-section">
            <h3 className="sent-title">Invitaciones enviadas</h3>
            {sentInvitations.map(inv => (
              <div key={inv.id} className="sent-row">
                <span className="sent-team">{inv.teamName}</span>
                <span className={`inv-status ${STATUS_CLASS[inv.status] ?? ''}`}>
                  {inv.status === 'ACCEPTED' ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> :
                   inv.status === 'REJECTED' ? <XCircle size={12} strokeWidth={2} aria-hidden="true" /> :
                   <Clock size={12} strokeWidth={2} aria-hidden="true" />}
                  {STATUS_LABEL[inv.status] ?? inv.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .overlay { position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:60;padding:1rem; }
        .dialog { background:var(--color-card);border:1px solid var(--color-border);border-radius:12px;padding:1.5rem;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:1rem; }
        .dialog-header { display:flex;align-items:center;justify-content:space-between; }
        .dialog-title { display:flex;align-items:center;gap:.45rem;font-size:.95rem;font-weight:700;margin:0; }
        .close-btn { width:30px;height:30px;border-radius:7px;border:none;background:var(--color-muted);color:var(--color-muted-foreground);cursor:pointer;display:flex;align-items:center;justify-content:center; }
        .success-banner { background:hsl(140 60% 12%);border:1px solid hsl(140 50% 28%);color:hsl(140 70% 55%);padding:.55rem .8rem;border-radius:8px;font-size:.85rem;display:flex;align-items:center;gap:.4rem; }
        .search-section { display:flex;flex-direction:column;gap:.4rem; }
        .search-input-wrap { display:flex;align-items:center;gap:.5rem;background:var(--color-input);border:1px solid var(--color-border);border-radius:8px;padding:0 .75rem; }
        .search-icon { color:var(--color-muted-foreground);flex-shrink:0; }
        .search-input { flex:1;background:none;border:none;color:var(--color-foreground);font-size:.875rem;padding:.55rem 0;outline:none; }
        .results-list { list-style:none;margin:0;padding:0;border:1px solid var(--color-border);border-radius:8px;overflow:hidden; }
        .result-item { display:flex;align-items:center;gap:.65rem;width:100%;padding:.6rem .8rem;background:none;border:none;border-bottom:1px solid var(--color-border);color:var(--color-foreground);cursor:pointer;text-align:left;transition:background .1s; }
        .result-item:last-child { border-bottom:none; }
        .result-item:hover { background:var(--color-muted); }
        .result-info { display:flex;flex-direction:column; }
        .result-name { font-size:.875rem;font-weight:600; }
        .result-meta { font-size:.75rem;color:var(--color-muted-foreground); }
        .no-results { font-size:.82rem;color:var(--color-muted-foreground);text-align:center;padding:.4rem 0; }
        .selected-team { display:flex;align-items:center;justify-content:space-between;background:hsl(216 60% 12%);border:1px solid hsl(216 60% 25%);border-radius:8px;padding:.65rem .85rem; }
        .selected-info { display:flex;flex-direction:column; }
        .selected-name { font-size:.9rem;font-weight:700;color:hsl(216 80% 75%); }
        .selected-captain { font-size:.75rem;color:var(--color-muted-foreground); }
        .deselect-btn { width:26px;height:26px;border-radius:6px;border:none;background:hsl(216 40% 20%);color:hsl(216 60% 60%);cursor:pointer;display:flex;align-items:center;justify-content:center; }
        .field-group { display:flex;flex-direction:column;gap:.3rem; }
        .field-label { font-size:.8rem;font-weight:600;color:var(--color-muted-foreground); }
        .field-input { background:var(--color-input);border:1px solid var(--color-border);color:var(--color-foreground);border-radius:8px;padding:.5rem .7rem;font-size:.875rem;outline:none;resize:vertical;font-family:inherit;transition:border-color .15s; }
        .field-input:focus { border-color:var(--color-primary); }
        .error-msg { background:hsl(0 60% 15%);border:1px solid hsl(0 72% 40%);color:hsl(0 80% 70%);padding:.55rem .75rem;border-radius:8px;font-size:.82rem; }
        .invite-btn { display:flex;align-items:center;gap:.4rem;padding:.55rem 1rem;background:var(--color-primary);color:hsl(0 0% 5%);border:none;border-radius:8px;font-size:.875rem;font-weight:700;cursor:pointer;transition:opacity .15s; }
        .invite-btn:disabled { opacity:.5;cursor:not-allowed; }
        .sent-section { display:flex;flex-direction:column;gap:.4rem;padding-top:.5rem;border-top:1px solid var(--color-border); }
        .sent-title { font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--color-muted-foreground);margin:0; }
        .sent-row { display:flex;align-items:center;justify-content:space-between;font-size:.82rem; }
        .sent-team { color:var(--color-foreground);font-weight:500; }
        .inv-status { display:inline-flex;align-items:center;gap:.25rem;font-size:.72rem;font-weight:700;padding:.15rem .5rem;border-radius:999px; }
        .status-pending  { background:hsl(35 80% 18%);color:hsl(35 100% 60%); }
        .status-accepted { background:hsl(140 60% 12%);color:hsl(140 70% 50%); }
        .status-rejected { background:hsl(0 60% 15%);color:hsl(0 70% 55%); }
        .status-expired  { background:hsl(220 30% 15%);color:hsl(220 20% 50%); }
        .spin { animation:spin 1s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
