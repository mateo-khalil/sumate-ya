/**
 * ChangePasswordForm — account security form for /ajustes.
 *
 * Decision Context:
 * - Why React island: password fields need immediate client-side validation, loading
 *   state, and success/error feedback without a full-page reload.
 * - The backend verifies currentPassword and calls Supabase Auth updateUser. The frontend
 *   never stores or logs password values.
 */

import { Check, KeyRound, Loader2, LockKeyhole, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  accessToken: string;
  backendUrl: string;
}

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const INITIAL_VALUES = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export default function ChangePasswordForm({ accessToken, backendUrl }: Props) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const passwordStrength = useMemo(() => {
    const password = values.newPassword;
    if (password.length === 0) return { label: 'Sin ingresar', score: 0 };
    let score = password.length >= 8 ? 1 : 0;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (score >= 4) return { label: 'Fuerte', score: 4 };
    if (score >= 2) return { label: 'Media', score };
    return { label: 'Básica', score };
  }, [values.newPassword]);

  function showToast(type: ToastState['type'], message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  function updateValue(field: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (!values.currentPassword) {
      nextErrors.currentPassword = 'Ingresá tu contraseña actual';
    }
    if (values.newPassword.length < 8) {
      nextErrors.newPassword = 'La nueva contraseña debe tener al menos 8 caracteres';
    }
    if (values.currentPassword && values.currentPassword === values.newPassword) {
      nextErrors.newPassword = 'La nueva contraseña debe ser distinta a la actual';
    }
    if (!values.confirmPassword) {
      nextErrors.confirmPassword = 'Confirmá tu nueva contraseña';
    } else if (values.newPassword !== values.confirmPassword) {
      nextErrors.confirmPassword = 'Las contraseñas no coinciden';
    }
    return nextErrors;
  }

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const response = await fetch(`${backendUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(values),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; errors?: FieldErrors }
        | null;

      if (!response.ok) {
        if (payload?.errors) setErrors(payload.errors);
        showToast('error', payload?.message ?? 'No pudimos actualizar la contraseña');
        return;
      }

      setValues(INITIAL_VALUES);
      setErrors({});
      showToast('success', payload?.message ?? 'Contraseña actualizada correctamente');
    } catch {
      showToast('error', 'Error de red. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="password-form" onSubmit={handleSubmit} noValidate>
      {toast && (
        <div className={`toast toast--${toast.type}`} role="alert" aria-live="polite">
          {toast.type === 'success'
            ? <Check size={16} strokeWidth={2.5} aria-hidden="true" />
            : <X size={16} strokeWidth={2.5} aria-hidden="true" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="password-grid">
        <label className="field">
          <span className="field-label">Contraseña actual</span>
          <span className="field-control">
            <LockKeyhole size={16} strokeWidth={2} aria-hidden="true" />
            <input
              type="password"
              value={values.currentPassword}
              autoComplete="current-password"
              onChange={(event) => updateValue('currentPassword', event.target.value)}
              aria-invalid={!!errors.currentPassword}
              aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
            />
          </span>
          {errors.currentPassword && (
            <span id="current-password-error" className="field-error">{errors.currentPassword}</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">Nueva contraseña</span>
          <span className="field-control">
            <KeyRound size={16} strokeWidth={2} aria-hidden="true" />
            <input
              type="password"
              value={values.newPassword}
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => updateValue('newPassword', event.target.value)}
              aria-invalid={!!errors.newPassword}
              aria-describedby={errors.newPassword ? 'new-password-error' : 'password-strength'}
            />
          </span>
          <span id="password-strength" className={`strength strength--${passwordStrength.score}`}>
            Fortaleza: {passwordStrength.label}
          </span>
          {errors.newPassword && (
            <span id="new-password-error" className="field-error">{errors.newPassword}</span>
          )}
        </label>

        <label className="field">
          <span className="field-label">Confirmar nueva contraseña</span>
          <span className="field-control">
            <KeyRound size={16} strokeWidth={2} aria-hidden="true" />
            <input
              type="password"
              value={values.confirmPassword}
              autoComplete="new-password"
              onChange={(event) => updateValue('confirmPassword', event.target.value)}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
            />
          </span>
          {errors.confirmPassword && (
            <span id="confirm-password-error" className="field-error">{errors.confirmPassword}</span>
          )}
        </label>
      </div>

      <div className="security-actions">
        <button type="submit" className="btn-save" disabled={saving} aria-busy={saving}>
          {saving
            ? <Loader2 size={16} strokeWidth={2} aria-hidden="true" className="spin" />
            : <Save size={16} strokeWidth={2} aria-hidden="true" />}
          {saving ? 'Actualizando...' : 'Actualizar contraseña'}
        </button>
      </div>

      <style>{`
        .password-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.75rem;
          padding: 1.25rem;
        }

        .toast {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-family: 'Barlow', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
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

        .password-grid {
          display: grid;
          gap: 1rem;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .field-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: hsl(215 20% 68%);
        }

        .field-control {
          min-height: 46px;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: hsl(220 42% 8%);
          color: hsl(216 85% 68%);
          padding: 0 0.85rem;
          transition: border-color 0.15s, background 0.15s;
        }

        .field-control:focus-within {
          border-color: hsl(35 100% 48% / 0.65);
          background: hsl(220 44% 10%);
        }

        .field-control input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: hsl(210 20% 92%);
          font-family: 'Barlow', sans-serif;
          font-size: 0.95rem;
        }

        .field-error {
          font-family: 'Barlow', sans-serif;
          font-size: 0.8rem;
          color: hsl(0 72% 70%);
        }

        .strength {
          font-family: 'Barlow', sans-serif;
          font-size: 0.8rem;
          color: hsl(215 20% 48%);
        }
        .strength--2, .strength--3 { color: hsl(44 100% 62%); }
        .strength--4 { color: hsl(142 71% 65%); }

        .security-actions {
          display: flex;
          justify-content: flex-end;
        }

        .btn-save {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          min-height: 44px;
          border: none;
          border-radius: 8px;
          background: hsl(35 100% 48%);
          color: hsl(220 72% 7%);
          cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.65rem 1.25rem;
          transition: background 0.15s, opacity 0.15s;
        }

        .btn-save:hover:not(:disabled) {
          background: hsl(35 100% 55%);
        }

        .btn-save:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .password-form { padding: 1rem; }
          .security-actions { display: block; }
          .btn-save { width: 100%; }
        }
      `}</style>
    </form>
  );
}
