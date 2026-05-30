/**
 * InvitePlayerDialog — modal para que el capitán invite jugadores al equipo.
 *
 * Decision Context:
 * - Búsqueda en tiempo real con debounce de 400ms vía SEARCH_PLAYERS query.
 * - La búsqueda requiere mínimo 2 caracteres para evitar queries vacíos.
 * - La mutación INVITE_PLAYER se ejecuta via /api/graphql-auth con el player seleccionado.
 * - onInvited callback para que el padre (TeamMembersTab) actualice su estado.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect, useRef } from 'react';
import { Search, X, UserPlus, Loader2, Check } from 'lucide-react';
import type { TeamProfile } from '../../graphql/operations/teams';
import { SEARCH_PLAYERS, INVITE_PLAYER } from '../../graphql/operations/teams';

interface Props {
  teamId: string;
  onClose: () => void;
  onInvited: () => void;
}

async function gqlAuthPost<T>(query: string, variables?: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch('/api/graphql-auth', {
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

export function InvitePlayerDialog({ teamId, onClose, onInvited }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TeamProfile | null>(null);
  const [message, setMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await gqlAuthPost<{ searchPlayers: TeamProfile[] }>(
        SEARCH_PLAYERS, { search: query }
      );
      setResults(data?.searchPlayers ?? []);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  async function handleInvite() {
    if (!selected) return;
    setInviting(true);
    setError(null);

    const { data, error: err } = await gqlAuthPost<{ invitePlayer: { success: boolean; message: string } }>(
      INVITE_PLAYER,
      { input: { teamId, playerId: selected.id, message: message.trim() || null } },
    );

    if (err || !data?.invitePlayer.success) {
      setError(err ?? data?.invitePlayer.message ?? 'Error al enviar la invitación');
      setInviting(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onInvited();
      onClose();
    }, 1200);
  }

  const POSITION_LABEL: Record<string, string> = {
    GOALKEEPER: 'Portero', DEFENDER: 'Defensor',
    MIDFIELDER: 'Mediocampista', FORWARD: 'Delantero',
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="dialog">
        <div className="dialog-header">
          <h2 id="invite-title" className="dialog-title">
            <UserPlus size={18} strokeWidth={2} aria-hidden="true" /> Invitar jugador
          </h2>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {!success ? (
          <>
            {/* Búsqueda */}
            {!selected && (
              <div className="search-wrap">
                <div className="search-input-wrap">
                  <Search size={16} strokeWidth={2} aria-hidden="true" className="search-icon" />
                  <input
                    ref={inputRef}
                    type="text"
                    className="search-input"
                    placeholder="Buscar por nombre..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {searching && <Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin search-spinner" />}
                </div>

                {results.length > 0 && (
                  <ul className="results-list">
                    {results.map(player => (
                      <li key={player.id}>
                        <button className="result-item" onClick={() => { setSelected(player); setQuery(''); setResults([]); }}>
                          <div className="result-avatar">
                            {player.avatarUrl
                              ? <img src={player.avatarUrl} alt={player.displayName} />
                              : <span className="avatar-initial">{player.displayName[0]}</span>
                            }
                          </div>
                          <div className="result-info">
                            <span className="result-name">{player.displayName}</span>
                            {player.preferredPosition && (
                              <span className="result-pos">{POSITION_LABEL[player.preferredPosition] ?? player.preferredPosition}</span>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {query.trim().length >= 2 && !searching && results.length === 0 && (
                  <p className="no-results">No se encontraron jugadores con ese nombre.</p>
                )}
              </div>
            )}

            {/* Jugador seleccionado */}
            {selected && (
              <div className="selected-player">
                <div className="selected-avatar">
                  {selected.avatarUrl
                    ? <img src={selected.avatarUrl} alt={selected.displayName} />
                    : <span className="avatar-initial">{selected.displayName[0]}</span>
                  }
                </div>
                <div className="selected-info">
                  <span className="selected-name">{selected.displayName}</span>
                  {selected.preferredPosition && (
                    <span className="selected-pos">{POSITION_LABEL[selected.preferredPosition] ?? selected.preferredPosition}</span>
                  )}
                </div>
                <button className="deselect-btn" onClick={() => { setSelected(null); setError(null); }} aria-label="Cambiar jugador">
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Mensaje opcional */}
            {selected && (
              <div className="message-wrap">
                <label htmlFor="invite-msg" className="msg-label">Mensaje (opcional)</label>
                <textarea
                  id="invite-msg"
                  className="msg-input"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  maxLength={300}
                  rows={3}
                  placeholder="¿Por qué querés invitar a este jugador?"
                />
                <span className="char-count">{message.length}/300</span>
              </div>
            )}

            {error && <div className="error-msg" role="alert">{error}</div>}

            <div className="dialog-actions">
              <button className="cancel-btn" onClick={onClose} disabled={inviting}>Cancelar</button>
              <button
                className="invite-btn"
                onClick={handleInvite}
                disabled={!selected || inviting}
              >
                {inviting
                  ? <><Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin" /> Enviando...</>
                  : <><UserPlus size={15} strokeWidth={2} aria-hidden="true" /> Enviar invitación</>
                }
              </button>
            </div>
          </>
        ) : (
          <div className="success-state">
            <Check size={40} strokeWidth={2} aria-hidden="true" className="success-icon" />
            <p>Invitación enviada a <strong>{selected?.displayName}</strong></p>
          </div>
        )}
      </div>

      <style>{`
        .overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.65);
          display: flex; align-items: center; justify-content: center;
          z-index: 60; padding: 1rem;
        }
        .dialog {
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 420px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 1.1rem;
        }
        .dialog-header { display: flex; align-items: center; justify-content: space-between; }
        .dialog-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; font-weight: 700; margin: 0; }
        .close-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          background: var(--color-muted); color: var(--color-muted-foreground);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .search-wrap { display: flex; flex-direction: column; gap: 0.5rem; }
        .search-input-wrap {
          display: flex; align-items: center; gap: 0.5rem;
          background: var(--color-input); border: 1px solid var(--color-border);
          border-radius: 8px; padding: 0 0.75rem;
        }
        .search-icon { color: var(--color-muted-foreground); flex-shrink: 0; }
        .search-input {
          flex: 1; background: none; border: none; color: var(--color-foreground);
          font-size: 0.9rem; padding: 0.55rem 0; outline: none;
        }
        .search-spinner { color: var(--color-muted-foreground); }
        .results-list {
          list-style: none; margin: 0; padding: 0;
          border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden;
        }
        .result-item {
          display: flex; align-items: center; gap: 0.75rem; width: 100%;
          padding: 0.65rem 0.85rem; background: none; border: none;
          border-bottom: 1px solid var(--color-border); color: var(--color-foreground);
          cursor: pointer; text-align: left; transition: background 0.1s;
        }
        .result-item:last-child { border-bottom: none; }
        .result-item:hover { background: var(--color-muted); }
        .result-avatar {
          width: 34px; height: 34px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
          background: var(--color-muted); display: flex; align-items: center; justify-content: center;
        }
        .result-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-initial { font-size: 0.85rem; font-weight: 700; color: var(--color-muted-foreground); }
        .result-info { display: flex; flex-direction: column; }
        .result-name { font-size: 0.875rem; font-weight: 500; }
        .result-pos { font-size: 0.75rem; color: var(--color-muted-foreground); }
        .no-results { font-size: 0.85rem; color: var(--color-muted-foreground); text-align: center; padding: 0.5rem 0; }
        .selected-player {
          display: flex; align-items: center; gap: 0.75rem;
          background: hsl(216 60% 12%); border: 1px solid hsl(216 60% 25%);
          border-radius: 8px; padding: 0.75rem;
        }
        .selected-avatar {
          width: 38px; height: 38px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
          background: var(--color-muted); display: flex; align-items: center; justify-content: center;
        }
        .selected-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .selected-info { flex: 1; display: flex; flex-direction: column; }
        .selected-name { font-size: 0.9rem; font-weight: 600; color: hsl(216 80% 75%); }
        .selected-pos { font-size: 0.775rem; color: var(--color-muted-foreground); }
        .deselect-btn {
          width: 28px; height: 28px; border-radius: 6px; border: none;
          background: hsl(216 40% 20%); color: hsl(216 60% 60%);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .message-wrap { display: flex; flex-direction: column; gap: 0.3rem; }
        .msg-label { font-size: 0.8rem; font-weight: 600; color: var(--color-muted-foreground); }
        .msg-input {
          background: var(--color-input); border: 1px solid var(--color-border);
          color: var(--color-foreground); border-radius: 8px; padding: 0.55rem 0.75rem;
          font-size: 0.875rem; outline: none; resize: vertical; font-family: inherit;
          transition: border-color 0.15s;
        }
        .msg-input:focus { border-color: var(--color-primary); }
        .char-count { font-size: 0.72rem; color: var(--color-muted-foreground); text-align: right; }
        .error-msg {
          background: hsl(0 60% 15%); border: 1px solid hsl(0 72% 40%);
          color: hsl(0 80% 70%); padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.85rem;
        }
        .dialog-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
        .cancel-btn {
          padding: 0.55rem 1rem; border-radius: 8px;
          background: var(--color-muted); color: var(--color-foreground);
          border: none; cursor: pointer; font-size: 0.875rem;
        }
        .cancel-btn:disabled { opacity: 0.5; }
        .invite-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s;
        }
        .invite-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .success-state {
          display: flex; flex-direction: column; align-items: center;
          padding: 1rem 0; gap: 0.75rem; text-align: center;
        }
        .success-icon { color: hsl(140 70% 50%); }
        .success-state p { font-size: 0.95rem; color: var(--color-foreground); margin: 0; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
