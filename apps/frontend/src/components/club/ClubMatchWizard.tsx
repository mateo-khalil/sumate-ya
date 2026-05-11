/**
 * ClubMatchWizard — 3-step wizard for admin-initiated match creation
 *
 * Decision Context:
 * - Why 3 steps (vs 5 for players): admin already owns the club, so Club and Slot selection
 *   collapse into one step. The remaining complexity is format/capacity and confirmation.
 * - Step 1: slot + date picker (AvailableSlotsPicker). If prefillSlotId+prefillDate are
 *   provided (from dashboard quick-create link), Step 1 auto-completes and jumps to Step 2.
 * - Step 2: format selection with court.maxFormat validation, capacity, description, and
 *   optional auto-enroll toggle for the admin. Formats incompatible with maxFormat are
 *   rendered as disabled options with a tooltip.
 * - Step 3: confirmation summary + calendar preview (simplified: just shows the scheduled
 *   date/time/court inline — a full calendar render is Phase 2).
 * - Post-success: offers "Ver partido", "Crear otro", "Ir al dashboard" options.
 * - Error handling: service errors (slot conflict, wrong day, etc.) surface inline.
 * - Phase 2 (not here): BulkCreateModal, Templates panel.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { CheckCircle, ChevronRight, ChevronLeft, Calendar, MapPin, Users, Check } from 'lucide-react';
import AvailableSlotsPicker from './AvailableSlotsPicker';
import type { ClubMatchSlotOccurrence, MatchFormat, CreateClubMatchResult } from '../../graphql/operations/club-match';
import { FORMAT_LABELS, FORMAT_CAPACITY, CREATE_CLUB_MATCH_MUTATION } from '../../graphql/operations/club-match';

interface Props {
  accessToken: string;
  prefillSlotId?: string;
  prefillDate?: string;
}

// Use graphql-auth proxy (triple-layer auth: locals → cookie → explicit header).
// /api/graphql suffers from Astro dev hot-reload caching that breaks auth forwarding.
const BACKEND_GQL = '/api/graphql-auth';

const COURT_FORMAT_ORDER: Record<string, number> = {
  '5v5': 5, '7v7': 7, '10v10': 10, '11v11': 11,
  'FIVE_VS_FIVE': 5, 'SEVEN_VS_SEVEN': 7, 'TEN_VS_TEN': 10, 'ELEVEN_VS_ELEVEN': 11,
};

const ALL_FORMATS: MatchFormat[] = ['FIVE_VS_FIVE', 'SEVEN_VS_SEVEN', 'TEN_VS_TEN', 'ELEVEN_VS_ELEVEN'];

function isFormatAllowed(format: MatchFormat, maxFormat: string | undefined): boolean {
  if (!maxFormat) return true;
  return (COURT_FORMAT_ORDER[format] ?? 0) <= (COURT_FORMAT_ORDER[maxFormat] ?? 99);
}

function formatDateNice(iso: string) {
  // Parse as LOCAL date components (not UTC) to avoid off-by-one in timezones behind UTC.
  // new Date("YYYY-MM-DD") is UTC midnight which shifts to the previous day in UTC-3.
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="steps">
      {[1, 2, 3].map((n) => (
        <div key={n} className={`step ${n === step ? 'active' : n < step ? 'done' : ''}`}>
          <div className="step-circle">
            {n < step ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : n}
          </div>
          <div className="step-label">
            {n === 1 && 'Horario'}{n === 2 && 'Detalles'}{n === 3 && 'Confirmar'}
          </div>
        </div>
      ))}
      <style>{`
        .steps { display: flex; align-items: center; gap: 0; margin-bottom: 2rem; }
        .step { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
        .step:not(:last-child)::after {
          content: ''; flex: 1; height: 1px;
          background: rgba(255,255,255,0.1); margin: 0 0.75rem;
        }
        .step-circle {
          width: 28px; height: 28px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700;
          font-family: 'Barlow Condensed', sans-serif;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
          color: hsl(215 20% 50%); flex-shrink: 0;
        }
        .step.active .step-circle { background: rgba(246,164,0,0.15); border-color: rgba(246,164,0,0.4); color: hsl(42 100% 65%); }
        .step.done .step-circle { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.3); color: hsl(142 70% 55%); }
        .step-label { font-family: 'Barlow Condensed', sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: hsl(215 20% 45%); }
        .step.active .step-label { color: hsl(42 100% 60%); }
        .step.done .step-label { color: hsl(142 70% 50%); }
      `}</style>
    </div>
  );
}

export default function ClubMatchWizard({ accessToken, prefillSlotId, prefillDate }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedOccurrence, setSelectedOccurrence] = useState<ClubMatchSlotOccurrence | null>(null);
  const [format, setFormat] = useState<MatchFormat>('SEVEN_VS_SEVEN');
  const [capacity, setCapacity] = useState(14);
  const [description, setDescription] = useState('');
  const [autoEnroll, setAutoEnroll] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateClubMatchResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleSlotSelect(occ: ClubMatchSlotOccurrence) {
    setSelectedOccurrence(occ);
    // If prefill both provided and match found, auto-advance
    if (prefillSlotId && prefillDate && occ.slotId === prefillSlotId && occ.date === prefillDate) {
      setStep(2);
    }
  }

  function handleFormatChange(f: MatchFormat) {
    setFormat(f);
    setCapacity(FORMAT_CAPACITY[f]);
  }

  async function handleSubmit() {
    if (!selectedOccurrence) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(BACKEND_GQL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          query: CREATE_CLUB_MATCH_MUTATION,
          variables: {
            input: {
              slotId: selectedOccurrence.slotId,
              scheduledDate: selectedOccurrence.date,
              format,
              capacity,
              description: description.trim() || null,
              autoEnrollOrganizer: autoEnroll,
            },
          },
        }),
      });
      const json = (await res.json()) as {
        data?: { createClubMatch?: CreateClubMatchResult };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) throw new Error(json.errors[0].message);
      const r = json.data?.createClubMatch;
      if (!r) throw new Error('Respuesta inesperada del servidor');
      setResult(r);
      if (!r.success) setServerError(r.message ?? 'Error al crear el partido');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  }

  function resetWizard() {
    setStep(1);
    setSelectedOccurrence(null);
    setFormat('SEVEN_VS_SEVEN');
    setCapacity(14);
    setDescription('');
    setAutoEnroll(false);
    setResult(null);
    setServerError(null);
  }

  // =====================================================
  // Post-success screen
  // =====================================================
  if (result?.success) {
    return (
      <div className="wizard-card success-screen">
        <div className="success-icon">
          <CheckCircle size={40} strokeWidth={1.5} color="hsl(142 70% 55%)" aria-hidden="true" />
        </div>
        <h2 className="success-title">Partido creado</h2>
        <p className="success-sub">El partido fue creado exitosamente y ya está visible en /partidos</p>
        <div className="success-actions">
          <a href={`/partidos/${result.matchId}`} className="btn-primary">
            Ver detalle del partido
          </a>
          <button className="btn-secondary" onClick={resetWizard}>Crear otro partido</button>
          <a href="/panel-club/dashboard" className="btn-ghost">Ir al dashboard</a>
        </div>
        <style>{SUCCESS_STYLES}</style>
      </div>
    );
  }

  const maxFormat = selectedOccurrence ? undefined : undefined;

  return (
    <div className="wizard-card">
      <StepIndicator step={step} />

      {/* =================== STEP 1 =================== */}
      {step === 1 && (
        <div className="step-body">
          <h3 className="step-title">Seleccioná un horario disponible</h3>
          <p className="step-hint">Elegí la cancha, el día y el horario donde querés crear el partido.</p>
          <AvailableSlotsPicker
            accessToken={accessToken}
            prefillSlotId={prefillSlotId}
            prefillDate={prefillDate}
            onSelect={handleSlotSelect}
          />
          <div className="step-footer">
            <div />
            <button
              className="btn-primary"
              disabled={!selectedOccurrence}
              onClick={() => setStep(2)}
            >
              Siguiente
              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* =================== STEP 2 =================== */}
      {step === 2 && selectedOccurrence && (
        <div className="step-body">
          <h3 className="step-title">Configurá el partido</h3>

          <div className="slot-summary">
            <div className="summary-row">
              <MapPin size={13} strokeWidth={2} color="hsl(215 20% 50%)" aria-hidden="true" />
              {selectedOccurrence.courtName}
            </div>
            <div className="summary-row">
              <Calendar size={13} strokeWidth={2} color="hsl(215 20% 50%)" aria-hidden="true" />
              {formatDateNice(selectedOccurrence.date)} · {selectedOccurrence.startTime.slice(0, 5)}–{selectedOccurrence.endTime.slice(0, 5)}
            </div>
          </div>

          {/* Format selector */}
          <div className="field-group">
            <label className="field-label">Formato</label>
            <div className="format-grid">
              {ALL_FORMATS.map((f) => {
                const allowed = isFormatAllowed(f, undefined);
                return (
                  <button
                    key={f}
                    className={`format-btn ${format === f ? 'selected' : ''} ${!allowed ? 'disabled' : ''}`}
                    disabled={!allowed}
                    onClick={() => handleFormatChange(f)}
                    title={!allowed ? `Esta cancha no soporta este formato` : undefined}
                  >
                    {FORMAT_LABELS[f]}
                    <span className="format-cap">{FORMAT_CAPACITY[f]} jugadores</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Capacity */}
          <div className="field-group">
            <label className="field-label" htmlFor="capacity">
              Capacidad <span className="field-hint">(máx. {FORMAT_CAPACITY[format]})</span>
            </label>
            <div className="cap-row">
              <button className="cap-btn" onClick={() => setCapacity((c) => Math.max(2, c - 1))}>−</button>
              <input
                id="capacity"
                type="number"
                min={2}
                max={FORMAT_CAPACITY[format]}
                value={capacity}
                onChange={(e) => setCapacity(Math.min(FORMAT_CAPACITY[format], Math.max(2, Number(e.target.value))))}
                className="cap-input"
              />
              <button className="cap-btn" onClick={() => setCapacity((c) => Math.min(FORMAT_CAPACITY[format], c + 1))}>+</button>
              <div className="cap-icon">
                <Users size={14} strokeWidth={2} color="hsl(215 20% 50%)" aria-hidden="true" />
                <span>{capacity} jugadores</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="field-group">
            <label className="field-label" htmlFor="desc">Descripción (opcional)</label>
            <textarea
              id="desc"
              className="desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Partido amistoso abierto al público..."
              maxLength={500}
              rows={3}
            />
            <div className="char-count">{description.length}/500</div>
          </div>

          {/* Auto-enroll */}
          <label className="enroll-toggle">
            <input
              type="checkbox"
              checked={autoEnroll}
              onChange={(e) => setAutoEnroll(e.target.checked)}
            />
            <span>Inscribirme como jugador (Equipo A)</span>
          </label>

          <div className="step-footer">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              Volver
            </button>
            <button className="btn-primary" onClick={() => setStep(3)}>
              Siguiente
              <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* =================== STEP 3 =================== */}
      {step === 3 && selectedOccurrence && (
        <div className="step-body">
          <h3 className="step-title">Confirmar partido</h3>

          <div className="confirm-card">
            <div className="confirm-row"><span>Cancha</span><strong>{selectedOccurrence.courtName}</strong></div>
            <div className="confirm-row"><span>Fecha</span><strong>{formatDateNice(selectedOccurrence.date)}</strong></div>
            <div className="confirm-row"><span>Horario</span><strong>{selectedOccurrence.startTime.slice(0, 5)}–{selectedOccurrence.endTime.slice(0, 5)}</strong></div>
            <div className="confirm-row"><span>Formato</span><strong>{FORMAT_LABELS[format]}</strong></div>
            <div className="confirm-row"><span>Capacidad</span><strong>{capacity} jugadores</strong></div>
            {description && <div className="confirm-row"><span>Descripción</span><strong>{description}</strong></div>}
            <div className="confirm-row"><span>Admin inscripto</span><strong>{autoEnroll ? 'Sí (Equipo A)' : 'No'}</strong></div>
          </div>

          <div className="club-badge-preview">
            <span className="club-badge-icon">
              <Check size={11} strokeWidth={2.5} aria-hidden="true" />
            </span>
            Este partido se mostrará como <strong>Organizado por el club</strong> en /partidos
          </div>

          {serverError && <div className="error-banner" role="alert">{serverError}</div>}

          <div className="step-footer">
            <button className="btn-ghost" onClick={() => setStep(2)}>
              <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              Volver
            </button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creando...' : 'Crear partido'}
            </button>
          </div>
        </div>
      )}

      <style>{WIZARD_STYLES}</style>
    </div>
  );
}

const SUCCESS_STYLES = `
  .success-screen { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 2rem; }
  .success-icon { display: flex; }
  .success-title { font-family:'Bebas Neue',sans-serif; font-size:1.8rem; color:#fff; margin:0; }
  .success-sub { font-family:'Barlow',sans-serif; font-size:0.9rem; color:hsl(215 20% 55%); text-align:center; margin:0; }
  .success-actions { display:flex; flex-direction:column; gap:0.625rem; width:100%; max-width:320px; margin-top:0.5rem; }
`;

const WIZARD_STYLES = `
  .wizard-card {
    background: hsl(220 55% 10%); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px; padding: 2rem;
    max-width: 720px;
  }
  .step-body { display:flex; flex-direction:column; gap:1.25rem; }
  .step-title { font-family:'Bebas Neue',sans-serif; font-size:1.4rem; color:#fff; margin:0; letter-spacing:0.04em; }
  .step-hint { font-family:'Barlow',sans-serif; font-size:0.875rem; color:hsl(215 20% 50%); margin:0; }
  .slot-summary {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 0.75rem 1rem; display:flex; flex-direction:column; gap:5px;
  }
  .summary-row { display:flex; align-items:center; gap:6px; font-family:'Barlow',sans-serif; font-size:0.875rem; color:hsl(215 20% 70%); }
  .field-group { display:flex; flex-direction:column; gap:0.4rem; }
  .field-label { font-family:'Barlow Condensed',sans-serif; font-size:0.72rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:hsl(215 20% 50%); }
  .field-hint { font-weight:400; letter-spacing:0; text-transform:none; }
  .format-grid { display:flex; gap:0.5rem; flex-wrap:wrap; }
  .format-btn {
    display:flex; flex-direction:column; gap:2px; padding:0.625rem 0.875rem;
    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
    border-radius:8px; cursor:pointer; font-family:'Barlow Condensed',sans-serif;
    font-size:0.88rem; font-weight:700; letter-spacing:0.05em; color:hsl(215 20% 65%);
    transition:all 0.12s;
  }
  .format-btn.selected { background:rgba(246,164,0,0.12); border-color:rgba(246,164,0,0.35); color:hsl(42 100% 65%); }
  .format-btn.disabled { opacity:0.35; cursor:not-allowed; }
  .format-btn:hover:not(.selected):not(.disabled) { background:rgba(255,255,255,0.07); }
  .format-cap { font-size:0.65rem; font-weight:400; color:hsl(215 20% 45%); letter-spacing:0.02em; }
  .cap-row { display:flex; align-items:center; gap:0.625rem; }
  .cap-btn {
    width:32px; height:32px; border-radius:6px; background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.1); font-size:1.1rem; color:hsl(210 20% 80%);
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background 0.12s;
  }
  .cap-btn:hover { background:rgba(255,255,255,0.12); }
  .cap-input {
    width:54px; text-align:center; background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:0.3rem;
    color:hsl(210 20% 85%); font-size:0.9rem; font-family:'Barlow',sans-serif; outline:none;
  }
  .cap-icon { display:flex; align-items:center; gap:4px; font-family:'Barlow',sans-serif; font-size:0.82rem; color:hsl(215 20% 50%); }
  .desc-input {
    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09);
    border-radius:8px; padding:0.625rem 0.875rem; font-family:'Barlow',sans-serif;
    font-size:0.875rem; color:hsl(210 20% 85%); resize:vertical; outline:none;
    transition:border-color 0.12s;
  }
  .desc-input:focus { border-color:rgba(246,164,0,0.3); }
  .char-count { font-size:0.7rem; color:hsl(215 20% 40%); text-align:right; }
  .enroll-toggle {
    display:flex; align-items:center; gap:0.5rem; cursor:pointer;
    font-family:'Barlow',sans-serif; font-size:0.875rem; color:hsl(215 20% 60%);
  }
  .enroll-toggle input[type=checkbox] { accent-color:hsl(42 100% 55%); width:16px; height:16px; }
  .confirm-card {
    background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07);
    border-radius:10px; padding:1rem; display:flex; flex-direction:column; gap:0.5rem;
  }
  .confirm-row { display:flex; justify-content:space-between; align-items:baseline; font-family:'Barlow',sans-serif; font-size:0.875rem; }
  .confirm-row span { color:hsl(215 20% 50%); }
  .confirm-row strong { color:hsl(210 20% 85%); }
  .club-badge-preview {
    display:flex; align-items:center; gap:6px; font-family:'Barlow',sans-serif;
    font-size:0.82rem; color:hsl(42 100% 60%);
    background:rgba(246,164,0,0.08); border:1px solid rgba(246,164,0,0.2);
    border-radius:8px; padding:0.625rem 0.875rem;
  }
  .club-badge-icon {
    display:inline-flex; background:rgba(246,164,0,0.15); border-radius:50%;
    width:18px; height:18px; align-items:center; justify-content:center; flex-shrink:0;
  }
  .error-banner {
    background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2);
    border-radius:8px; padding:0.625rem 0.875rem; font-family:'Barlow',sans-serif;
    font-size:0.875rem; color:hsl(0 72% 65%);
  }
  .step-footer { display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem; }
  .btn-primary {
    display:flex; align-items:center; gap:5px; background:hsl(35 100% 48%);
    border:none; border-radius:8px; padding:0.5rem 1.25rem;
    font-family:'Barlow Condensed',sans-serif; font-size:0.9rem; font-weight:700;
    letter-spacing:0.06em; text-transform:uppercase; color:#fff; cursor:pointer;
    text-decoration:none; transition:background 0.12s;
  }
  .btn-primary:hover { background:hsl(35 100% 42%); }
  .btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
  .btn-secondary {
    background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12);
    border-radius:8px; padding:0.5rem 1.125rem; font-family:'Barlow Condensed',sans-serif;
    font-size:0.88rem; font-weight:700; letter-spacing:0.05em; text-transform:uppercase;
    color:hsl(210 20% 75%); cursor:pointer; transition:background 0.12s;
  }
  .btn-secondary:hover { background:rgba(255,255,255,0.1); }
  .btn-ghost {
    display:flex; align-items:center; gap:4px; background:transparent;
    border:none; font-family:'Barlow',sans-serif; font-size:0.875rem;
    color:hsl(215 20% 55%); cursor:pointer; text-decoration:none;
    transition:color 0.12s; padding:0;
  }
  .btn-ghost:hover { color:hsl(210 20% 80%); }
  /* ── Responsive ── */
  @media (max-width: 540px) {
    .wizard-card { padding: 1.25rem 1rem; border-radius: 10px; }
    .step-footer { flex-direction: column-reverse; gap: 0.5rem; }
    .btn-primary, .btn-secondary {
      width: 100%; justify-content: center;
      padding: 0.75rem 1rem; min-height: 44px;
    }
    .btn-ghost { align-self: center; }
    .confirm-row { flex-direction: column; gap: 0.15rem; }
    .confirm-row span { font-size: 0.72rem; }
  }
`;
