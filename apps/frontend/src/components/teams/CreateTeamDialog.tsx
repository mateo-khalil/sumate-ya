/**
 * CreateTeamDialog — diálogo para crear un nuevo equipo permanente.
 *
 * Decision Context:
 * - Isla React montada en /equipos.astro con client:load.
 * - Usa CREATE_TEAM mutation via /api/graphql-auth.
 * - Al crear exitosamente redirige a /equipos/{id} para ver el dashboard.
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import type { MatchFormat } from '../../graphql/operations/teams';
import { CREATE_TEAM } from '../../graphql/operations/teams';

const FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
  { value: 'FIVE_VS_FIVE',     label: '5 vs 5'   },
  { value: 'SEVEN_VS_SEVEN',   label: '7 vs 7'   },
  { value: 'TEN_VS_TEN',       label: '10 vs 10' },
  { value: 'ELEVEN_VS_ELEVEN', label: '11 vs 11' },
];

interface CreateTeamResult {
  createTeam: { success: boolean; message: string; team: { id: string } | null };
}

export function CreateTeamDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<MatchFormat>('SEVEN_VS_SEVEN');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(''); setFormat('SEVEN_VS_SEVEN');
    setDescription(''); setError(null);
  }

  function handleClose() { setOpen(false); reset(); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/graphql-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: CREATE_TEAM,
          variables: {
            input: {
              name: name.trim(),
              format,
              description: description.trim() || null,
            },
          },
        }),
      });

      const json = await res.json() as { data?: CreateTeamResult; errors?: { message: string }[] };
      if (json.errors?.length) throw new Error(json.errors[0].message);

      const result = json.data?.createTeam;
      if (!result?.success) throw new Error(result?.message ?? 'Error al crear el equipo');

      if (result.team?.id) {
        window.location.href = `/equipos/${result.team.id}`;
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setLoading(false);
    }
  }

  return (
    <>
      <button className="open-btn" onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
        Crear equipo
      </button>

      {open && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="create-team-title">
          <div className="dialog">
            {/* Header */}
            <div className="dialog-header">
              <h2 id="create-team-title" className="dialog-title">Crear equipo</h2>
              <button className="close-btn" onClick={handleClose} aria-label="Cerrar">
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="dialog-form">
              <div className="field-group">
                <label htmlFor="new-team-name" className="field-label">Nombre *</label>
                <input
                  id="new-team-name"
                  type="text"
                  className="field-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={100}
                  minLength={3}
                  required
                  placeholder="Nombre de tu equipo"
                  autoFocus
                />
              </div>

              <div className="field-group">
                <label htmlFor="new-team-format" className="field-label">Formato *</label>
                <select
                  id="new-team-format"
                  className="field-input field-select"
                  value={format}
                  onChange={e => setFormat(e.target.value as MatchFormat)}
                >
                  {FORMAT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="new-team-desc" className="field-label">Descripción (opcional)</label>
                <textarea
                  id="new-team-desc"
                  className="field-input field-textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Contanos sobre el equipo..."
                />
              </div>

              {error && (
                <div className="error-msg" role="alert">{error}</div>
              )}

              <div className="dialog-actions">
                <button type="button" className="cancel-btn" onClick={handleClose} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="submit-btn" disabled={loading || name.trim().length < 3}>
                  {loading
                    ? <><Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin" /> Creando...</>
                    : 'Crear equipo'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .open-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s;
        }
        .open-btn:hover { opacity: 0.9; }
        .overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
          z-index: 50; padding: 1rem;
        }
        .dialog {
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 440px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .dialog-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
        .dialog-title { font-size: 1.1rem; font-weight: 700; margin: 0; }
        .close-btn {
          width: 32px; height: 32px; border-radius: 8px; border: none;
          background: var(--color-muted); color: var(--color-muted-foreground);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .dialog-form { display: flex; flex-direction: column; gap: 1rem; }
        .field-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .field-label { font-size: 0.82rem; font-weight: 600; color: var(--color-muted-foreground); }
        .field-input {
          background: var(--color-input); border: 1px solid var(--color-border);
          color: var(--color-foreground); border-radius: 8px; padding: 0.55rem 0.75rem;
          font-size: 0.875rem; outline: none; width: 100%; transition: border-color 0.15s;
        }
        .field-input:focus { border-color: var(--color-primary); }
        .field-select { cursor: pointer; }
        .field-textarea { resize: vertical; font-family: inherit; min-height: 72px; }
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
        .submit-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.1rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s;
        }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
