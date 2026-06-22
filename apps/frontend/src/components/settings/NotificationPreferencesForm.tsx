/**
 * NotificationPreferencesForm — React island for in-app notification delivery toggles.
 *
 * Decision Context:
 * - Replaces the old "Próximamente" placeholder for the Notificaciones settings tab.
 * - Each toggle gates a family of system notification types (see backend notificationService
 *   TYPE_TO_PREF): matchActivity (un jugador se sumó / faltan jugadores), matchUpdates
 *   (partido cancelado), matchResults (resultado confirmado), invitations (invitaciones a
 *   equipos/torneos). Turning a toggle off stops NEW notifications of that family from being
 *   created — it does not delete existing ones.
 * - fetch instead of urql: mirrors PrivacySettingsForm — urql-client reads the token from
 *   localStorage (client-only); here we use the accessToken prop passed from the SSR page.
 * - Optimistic local state + a 3.5s auto-dismiss toast for feedback, no external toast lib.
 * - Iconography: lucide-react only (no emojis) per the design system hard rule.
 * - Previously fixed bugs: none relevant.
 */

import { Activity, CalendarX, Trophy, Mail, Save, Loader2, Check, X } from 'lucide-react';
import { useState } from 'react';
import type { NotificationPreferences, UpdateNotificationPreferencesInput } from '../../graphql/operations/notifications';
import { UPDATE_NOTIFICATION_PREFERENCES } from '../../graphql/operations/notifications';

interface Props {
  initialPreferences: NotificationPreferences;
  accessToken: string;
  backendUrl: string;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const TOGGLE_CONFIG = [
  {
    key: 'matchActivity' as const,
    icon: Activity,
    label: 'Actividad de tus partidos',
    tooltip: 'Cuando alguien se suma a tu partido o todavía faltan jugadores',
  },
  {
    key: 'matchUpdates' as const,
    icon: CalendarX,
    label: 'Cambios y cancelaciones',
    tooltip: 'Cuando un partido en el que participás se cancela',
  },
  {
    key: 'matchResults' as const,
    icon: Trophy,
    label: 'Resultados de partidos',
    tooltip: 'Cuando se confirma el resultado de un partido que jugaste',
  },
  {
    key: 'invitations' as const,
    icon: Mail,
    label: 'Invitaciones',
    tooltip: 'Invitaciones para sumarte a equipos y torneos',
  },
] as const;

export default function NotificationPreferencesForm({ initialPreferences, accessToken, backendUrl }: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const graphqlUrl = `${backendUrl}/graphql`;

  function showToast(type: ToastState['type'], message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  function handleToggle(key: keyof NotificationPreferences, value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const input: UpdateNotificationPreferencesInput = { ...prefs };

    try {
      const res = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: UPDATE_NOTIFICATION_PREFERENCES, variables: { input } }),
      });

      const json = (await res.json()) as {
        data?: { updateNotificationPreferences: NotificationPreferences };
        errors?: Array<{ message: string }>;
      };

      if (json.errors?.length) {
        showToast('error', json.errors[0]?.message ?? 'Error al guardar los cambios');
      } else if (json.data?.updateNotificationPreferences) {
        setPrefs(json.data.updateNotificationPreferences);
        showToast('success', 'Preferencias de notificaciones guardadas');
      }
    } catch {
      showToast('error', 'Error de red. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notif-form">
      {toast && (
        <div className={`toast toast--${toast.type}`} role="alert" aria-live="polite">
          {toast.type === 'success'
            ? <Check size={16} strokeWidth={2.5} aria-hidden="true" />
            : <X size={16} strokeWidth={2.5} aria-hidden="true" />}
          <span>{toast.message}</span>
        </div>
      )}

      <section className="toggle-section">
        <div className="section-label-row">
          <span className="section-heading">Qué notificaciones querés recibir</span>
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
              aria-checked={prefs[key]}
              aria-label={label}
              className={`toggle-switch ${prefs[key] ? 'toggle-switch--on' : ''}`}
              onClick={() => handleToggle(key, !prefs[key])}
            >
              <span className="toggle-thumb" />
            </button>
          </label>
        ))}
      </section>

      <div className="form-actions">
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
          {saving ? 'Guardando...' : 'Guardar preferencias'}
        </button>
      </div>

      <style>{`
        .notif-form { position: relative; display: flex; flex-direction: column; gap: 1.5rem; }

        .toast {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.75rem 1rem; border-radius: 8px;
          font-family: 'Barlow', sans-serif; font-size: 0.875rem; font-weight: 500;
          animation: slideIn 0.2s ease;
        }
        .toast--success { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: hsl(142 71% 65%); }
        .toast--error { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: hsl(0 72% 70%); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

        .toggle-section {
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.75rem; overflow: hidden;
        }
        .section-label-row {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.875rem 1.25rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .section-heading {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.78rem; font-weight: 700;
          letter-spacing: 0.15em; text-transform: uppercase; color: hsl(215 20% 65%); flex: 1;
        }

        .toggle-row {
          display: flex; align-items: center; gap: 0.875rem;
          padding: 1rem 1.25rem; cursor: pointer; transition: background 0.15s;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .toggle-row:last-child { border-bottom: none; }
        .toggle-row:hover { background: rgba(255,255,255,0.03); }
        .toggle-icon-wrap { color: hsl(216 85% 60%); flex-shrink: 0; display: flex; align-items: center; }
        .toggle-info { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
        .toggle-label { font-family: 'Barlow', sans-serif; font-size: 0.9375rem; font-weight: 600; color: hsl(210 20% 90%); }
        .toggle-tooltip { font-family: 'Barlow', sans-serif; font-size: 0.8rem; color: hsl(215 20% 50%); line-height: 1.35; }

        .toggle-switch {
          flex-shrink: 0; width: 48px; height: 28px; border-radius: 14px;
          background: hsl(220 30% 20%); border: 1px solid rgba(255,255,255,0.1);
          position: relative; cursor: pointer; transition: background 0.2s, border-color 0.2s;
          padding: 0; min-width: 48px; min-height: 44px; display: flex; align-items: center;
        }
        .toggle-switch--on { background: hsl(35 100% 48%); border-color: hsl(35 100% 48%); }
        .toggle-thumb {
          position: absolute; left: 3px; width: 20px; height: 20px; border-radius: 50%;
          background: hsl(215 20% 65%); transition: transform 0.2s, background 0.2s; pointer-events: none;
        }
        .toggle-switch--on .toggle-thumb { transform: translateX(20px); background: hsl(220 72% 7%); }

        .form-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .btn-save {
          display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
          font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; font-size: 0.875rem; padding: 0.65rem 1.25rem;
          border-radius: 8px; cursor: pointer; transition: background 0.15s; border: none;
          min-height: 44px; background: hsl(35 100% 48%); color: hsl(220 72% 7%); flex: 1;
        }
        .btn-save:hover:not(:disabled) { background: hsl(35 100% 55%); }
        .btn-save:disabled { opacity: 0.7; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Light mode */
        :global(html.light) .toggle-section { background: hsl(0 0% 100%); border-color: rgba(0,0,0,0.08); }
        :global(html.light) .section-label-row { border-bottom-color: rgba(0,0,0,0.06); }
        :global(html.light) .toggle-label { color: hsl(220 20% 20%); }
        :global(html.light) .toggle-row { border-bottom-color: rgba(0,0,0,0.04); }
        :global(html.light) .toggle-switch { background: hsl(220 15% 80%); }

        @media (max-width: 480px) {
          .toggle-row { padding: 0.875rem 1rem; }
          .section-label-row { padding: 0.75rem 1rem; }
          .btn-save { width: 100%; flex: unset; }
        }
      `}</style>
    </div>
  );
}
