/**
 * TeamConfigTab — formulario de configuración del equipo (solo capitán).
 *
 * Decision Context:
 * - Permite editar nombre, descripción, formato y logo URL del equipo.
 * - Usa UPDATE_TEAM mutation via /api/graphql-auth.
 * - onTeamUpdated propaga el equipo actualizado al padre (TeamDashboard) para
 *   refrescar el header sin recargar la página.
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { Save, Loader2, Trash2 } from 'lucide-react';
import type { TeamData, MatchFormat } from '../../graphql/operations/teams';
import { UPDATE_TEAM, DELETE_TEAM, GET_TEAM } from '../../graphql/operations/teams';

interface Props {
  team: TeamData;
  onTeamUpdated: (team: TeamData) => void;
}

const FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
  { value: 'FIVE_VS_FIVE', label: '5 vs 5' },
  { value: 'SEVEN_VS_SEVEN', label: '7 vs 7' },
  { value: 'TEN_VS_TEN', label: '10 vs 10' },
  { value: 'ELEVEN_VS_ELEVEN', label: '11 vs 11' },
];

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

export function TeamConfigTab({ team, onTeamUpdated }: Props) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? '');
  const [format, setFormat] = useState<MatchFormat>(team.format);
  const [logoUrl, setLogoUrl] = useState(team.logoUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);

    const { data, error } = await gqlAuthPost<{ updateTeam: { success: boolean; message: string; team: TeamData | null } }>(
      UPDATE_TEAM,
      {
        input: {
          teamId: team.id,
          name: name.trim() || null,
          description: description.trim() || null,
          format,
          logoUrl: logoUrl.trim() || null,
        },
      },
    );

    if (error || !data?.updateTeam.success) {
      setSaveMsg({ ok: false, text: error ?? data?.updateTeam.message ?? 'Error al guardar' });
      setSaving(false);
      return;
    }

    // Refrescar datos completos
    const { data: fresh } = await gqlAuthPost<{ team: TeamData }>(GET_TEAM, { id: team.id });
    if (fresh?.team) onTeamUpdated(fresh.team);
    setSaveMsg({ ok: true, text: 'Cambios guardados' });
    setSaving(false);
  }

  async function handleDelete() {
    const confirmed = confirm(
      `¿Seguro que querés eliminar el equipo "${team.name}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setDeleting(true);
    const { data, error } = await gqlAuthPost<{ deleteTeam: { success: boolean; message: string } }>(
      DELETE_TEAM,
      { teamId: team.id },
    );

    if (error || !data?.deleteTeam.success) {
      alert(error ?? data?.deleteTeam.message ?? 'Error al eliminar');
      setDeleting(false);
      return;
    }

    window.location.href = '/equipos';
  }

  return (
    <div className="config-tab">
      <form onSubmit={handleSave} className="config-form">
        <div className="field-group">
          <label htmlFor="team-name" className="field-label">Nombre del equipo</label>
          <input
            id="team-name"
            type="text"
            className="field-input"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="field-group">
          <label htmlFor="team-format" className="field-label">Formato</label>
          <select
            id="team-format"
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
          <label htmlFor="team-logo" className="field-label">URL del logo (opcional)</label>
          <input
            id="team-logo"
            type="url"
            className="field-input"
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />
          {logoUrl && (
            <div className="logo-preview">
              <img src={logoUrl} alt="Preview del logo" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </div>

        <div className="field-group">
          <label htmlFor="team-desc" className="field-label">Descripción (opcional)</label>
          <textarea
            id="team-desc"
            className="field-input field-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Contanos sobre el equipo..."
          />
          <span className="char-count">{description.length}/500</span>
        </div>

        {saveMsg && (
          <div className={`save-msg ${saveMsg.ok ? 'save-msg--ok' : 'save-msg--err'}`} role="alert">
            {saveMsg.text}
          </div>
        )}

        <button type="submit" className="save-btn" disabled={saving}>
          {saving
            ? <><Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin" /> Guardando...</>
            : <><Save size={15} strokeWidth={2} aria-hidden="true" /> Guardar cambios</>
          }
        </button>
      </form>

      {/* Zona de peligro */}
      <div className="danger-zone">
        <h3 className="danger-title">
          <Trash2 size={16} strokeWidth={2} aria-hidden="true" /> Zona de peligro
        </h3>
        <p className="danger-desc">
          Eliminar el equipo es permanente. Todos los miembros serán removidos
          y el historial del equipo se perderá.
        </p>
        <button className="delete-btn" onClick={handleDelete} disabled={deleting}>
          {deleting
            ? <><Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin" /> Eliminando...</>
            : 'Eliminar equipo'
          }
        </button>
      </div>

      <style>{`
        .config-tab { max-width: 520px; }
        .config-form { display: flex; flex-direction: column; gap: 1.25rem; }
        .field-group { display: flex; flex-direction: column; gap: 0.4rem; }
        .field-label { font-size: 0.85rem; font-weight: 600; color: var(--color-muted-foreground); }
        .field-input {
          background: var(--color-input); border: 1px solid var(--color-border);
          color: var(--color-foreground); border-radius: 8px; padding: 0.6rem 0.8rem;
          font-size: 0.9rem; outline: none; width: 100%;
          transition: border-color 0.15s;
        }
        .field-input:focus { border-color: var(--color-primary); }
        .field-select { cursor: pointer; }
        .field-textarea { resize: vertical; min-height: 80px; font-family: inherit; }
        .char-count { font-size: 0.75rem; color: var(--color-muted-foreground); text-align: right; }
        .logo-preview {
          width: 60px; height: 60px; border-radius: 8px; overflow: hidden;
          border: 1px solid var(--color-border); margin-top: 0.25rem;
        }
        .logo-preview img { width: 100%; height: 100%; object-fit: cover; }
        .save-msg {
          padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.85rem;
        }
        .save-msg--ok { background: hsl(140 60% 12%); color: hsl(140 70% 55%); }
        .save-msg--err { background: hsl(0 60% 15%); color: hsl(0 80% 65%); }
        .save-btn {
          display: flex; align-items: center; gap: 0.5rem; justify-content: center;
          padding: 0.65rem 1.25rem; background: var(--color-primary);
          color: hsl(0 0% 5%); border: none; border-radius: 8px;
          font-size: 0.9rem; font-weight: 600; cursor: pointer;
          transition: opacity 0.15s; width: fit-content;
        }
        .save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .danger-zone {
          margin-top: 2.5rem; padding: 1.25rem; border: 1px solid hsl(0 50% 30%);
          border-radius: 10px; background: hsl(0 40% 8%);
        }
        .danger-title {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.9rem; font-weight: 600; color: hsl(0 70% 55%); margin: 0 0 0.5rem;
        }
        .danger-desc { font-size: 0.825rem; color: var(--color-muted-foreground); margin: 0 0 1rem; }
        .delete-btn {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.5rem 1rem; background: hsl(0 60% 22%);
          color: hsl(0 80% 65%); border: 1px solid hsl(0 50% 35%);
          border-radius: 8px; font-size: 0.85rem; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .delete-btn:hover:not(:disabled) { background: hsl(0 60% 28%); }
        .delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
