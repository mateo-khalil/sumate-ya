/**
 * PrivacySettingsForm — React island for granular privacy controls
 *
 * Decision Context:
 * - Why React island (client:load): all toggles are interactive and must respond
 *   immediately. State updates optimistically and the mutation confirms server-side.
 * - Toggle hierarchy: isPublic acts as a master switch. When isPublic=false, the
 *   sub-toggles (showStats, showHistory, showPosition, showDivision) are disabled
 *   visually but still stored on the server so their values are preserved for when
 *   the user makes their profile public again.
 * - fetch instead of urql: urql-client.ts reads the token from localStorage (client-side
 *   only). We use native fetch with the accessToken prop passed from the SSR page.
 * - Toast feedback: uses a local state flag (saved/error) with a 3-second auto-dismiss
 *   instead of an external toast library to keep dependencies minimal.
 * - Preview modal: opened via callback prop to keep the preview concern separate from the
 *   save concern. The modal receives the *local* (not-yet-saved) settings so users can
 *   preview before committing.
 * - Previously fixed bugs: none relevant.
 */

import { Eye, Globe, BarChart3, History, MapPin, Shield, Save, Loader2, Check, X } from 'lucide-react';
import { useState } from 'react';
import type { PrivacySettings, UpdatePrivacyInput } from '../../graphql/operations/profile';
import { UPDATE_PRIVACY } from '../../graphql/operations/profile';

interface Props {
  initialSettings: PrivacySettings;
  accessToken: string;
  backendUrl: string;
  onPreview: (settings: PrivacySettings) => void;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const TOGGLE_CONFIG = [
  {
    key: 'showStats' as const,
    icon: BarChart3,
    label: 'Estadísticas',
    tooltip: 'Partidos jugados, victorias y efectividad',
  },
  {
    key: 'showHistory' as const,
    icon: History,
    label: 'Historial de partidos',
    tooltip: 'La lista de partidos completados donde participaste',
  },
  {
    key: 'showPosition' as const,
    icon: MapPin,
    label: 'Posición preferida',
    tooltip: 'Tu posición en la cancha (arquero, defensor, etc.)',
  },
  {
    key: 'showDivision' as const,
    icon: Shield,
    label: 'División',
    tooltip: 'Tu nivel de división actual',
  },
] as const;

export default function PrivacySettingsForm({ initialSettings, accessToken, backendUrl, onPreview }: Props) {
  const [settings, setSettings] = useState<PrivacySettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const graphqlUrl = `${backendUrl}/graphql`;

  function showToast(type: ToastState['type'], message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  function handleToggle(key: keyof PrivacySettings, value: boolean) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const input: UpdatePrivacyInput = {
      isPublic: settings.isPublic,
      showStats: settings.showStats,
      showHistory: settings.showHistory,
      showPosition: settings.showPosition,
      showDivision: settings.showDivision,
    };

    try {
      const res = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: UPDATE_PRIVACY, variables: { input } }),
      });

      const json = (await res.json()) as {
        data?: { updatePrivacy: PrivacySettings };
        errors?: Array<{ message: string }>;
      };

      if (json.errors?.length) {
        showToast('error', json.errors[0]?.message ?? 'Error al guardar los cambios');
      } else if (json.data?.updatePrivacy) {
        setSettings(json.data.updatePrivacy);
        showToast('success', 'Configuración de privacidad guardada');
      }
    } catch {
      showToast('error', 'Error de red. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const isPublicDisabled = !settings.isPublic;

  return (
    <div className="privacy-form">
      {toast && (
        <div className={`toast toast--${toast.type}`} role="alert" aria-live="polite">
          {toast.type === 'success'
            ? <Check size={16} strokeWidth={2.5} aria-hidden="true" />
            : <X size={16} strokeWidth={2.5} aria-hidden="true" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Master toggle */}
      <section className="toggle-section">
        <div className="section-label-row">
          <Globe size={16} strokeWidth={2} aria-hidden="true" className="section-icon" />
          <span className="section-heading">Visibilidad del perfil</span>
        </div>

        <label className="toggle-row toggle-row--master">
          <div className="toggle-info">
            <span className="toggle-label">Perfil público</span>
            <span className="toggle-tooltip">
              Cuando está desactivado, solo se muestra tu nombre y foto en los partidos
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.isPublic}
            aria-label="Perfil público"
            className={`toggle-switch ${settings.isPublic ? 'toggle-switch--on' : ''}`}
            onClick={() => handleToggle('isPublic', !settings.isPublic)}
          >
            <span className="toggle-thumb" />
          </button>
        </label>
      </section>

      {/* Sub-toggles */}
      <section className={`toggle-section toggle-section--sub ${isPublicDisabled ? 'toggle-section--disabled' : ''}`}>
        <div className="section-label-row">
          <span className="section-heading">Qué ven otros jugadores</span>
          {isPublicDisabled && (
            <span className="disabled-badge">Perfil privado</span>
          )}
        </div>

        {TOGGLE_CONFIG.map(({ key, icon: Icon, label, tooltip }) => (
          <label key={key} className="toggle-row">
            <div className="toggle-icon-wrap" aria-hidden="true">
              <Icon size={16} strokeWidth={2} />
            </div>
            <div className="toggle-info">
              <span className="toggle-label">{label}</span>
              <span className="toggle-tooltip">{tooltip}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings[key]}
              aria-label={label}
              disabled={isPublicDisabled}
              className={`toggle-switch ${settings[key] && !isPublicDisabled ? 'toggle-switch--on' : ''}`}
              onClick={() => !isPublicDisabled && handleToggle(key, !settings[key])}
            >
              <span className="toggle-thumb" />
            </button>
          </label>
        ))}
      </section>

      {/* Actions */}
      <div className="form-actions">
        <button
          type="button"
          className="btn-preview"
          onClick={() => onPreview(settings)}
        >
          <Eye size={16} strokeWidth={2} aria-hidden="true" />
          Ver como otros me ven
        </button>

        <button
          type="button"
          className="btn-save"
          onClick={handleSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving
            ? <Loader2 size={16} strokeWidth={2} aria-hidden="true" className="spin" />
            : <Save size={16} strokeWidth={2} aria-hidden="true" />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <style>{`
        .privacy-form {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* ---- Toast ---- */
        .toast {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-family: 'Barlow', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          animation: slideIn 0.2s ease;
        }
        .toast--success {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: hsl(142 71% 65%);
        }
        .toast--error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: hsl(0 72% 70%);
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ---- Section ---- */
        .toggle-section {
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.75rem;
          overflow: hidden;
        }
        .toggle-section--disabled {
          opacity: 0.6;
        }

        .section-label-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.875rem 1.25rem 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .section-icon {
          color: hsl(35 100% 55%);
          flex-shrink: 0;
        }
        .section-heading {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: hsl(215 20% 65%);
          flex: 1;
        }
        .disabled-badge {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: hsl(215 20% 50%);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
        }

        /* ---- Toggle row ---- */
        .toggle-row {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          padding: 1rem 1.25rem;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .toggle-row:last-child { border-bottom: none; }
        .toggle-row--master { padding: 1.1rem 1.25rem; }
        .toggle-row:hover { background: rgba(255, 255, 255, 0.03); }

        .toggle-icon-wrap {
          color: hsl(216 85% 60%);
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }
        .toggle-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
        }
        .toggle-label {
          font-family: 'Barlow', sans-serif;
          font-size: 0.9375rem;
          font-weight: 600;
          color: hsl(210 20% 90%);
        }
        .toggle-tooltip {
          font-family: 'Barlow', sans-serif;
          font-size: 0.8rem;
          color: hsl(215 20% 50%);
          line-height: 1.35;
        }

        /* ---- Toggle switch ---- */
        .toggle-switch {
          flex-shrink: 0;
          width: 48px;
          height: 28px;
          border-radius: 14px;
          background: hsl(220 30% 20%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          position: relative;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          padding: 0;
          min-width: 48px;
          min-height: 44px;
          display: flex;
          align-items: center;
        }
        .toggle-switch--on {
          background: hsl(35 100% 48%);
          border-color: hsl(35 100% 48%);
        }
        .toggle-switch:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .toggle-thumb {
          position: absolute;
          left: 3px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: hsl(215 20% 65%);
          transition: transform 0.2s, background 0.2s;
          pointer-events: none;
        }
        .toggle-switch--on .toggle-thumb {
          transform: translateX(20px);
          background: hsl(220 72% 7%);
        }

        /* ---- Actions ---- */
        .form-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .btn-preview,
        .btn-save {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-size: 0.875rem;
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
          border: none;
          min-height: 44px;
        }

        .btn-preview {
          background: transparent;
          color: hsl(216 85% 65%);
          border: 1px solid rgba(99, 155, 255, 0.25);
          flex: 1;
          justify-content: center;
        }
        .btn-preview:hover {
          background: rgba(99, 155, 255, 0.08);
          border-color: rgba(99, 155, 255, 0.4);
        }

        .btn-save {
          background: hsl(35 100% 48%);
          color: hsl(220 72% 7%);
          flex: 1;
          justify-content: center;
        }
        .btn-save:hover:not(:disabled) {
          background: hsl(35 100% 55%);
        }
        .btn-save:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .toggle-row { padding: 0.875rem 1rem; }
          .section-label-row { padding: 0.75rem 1rem; }
          .form-actions { flex-direction: column; }
          .btn-preview, .btn-save { flex: unset; width: 100%; }
        }
      `}</style>
    </div>
  );
}
