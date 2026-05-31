/**
 * NewTournamentWizard — wizard de creación de torneos con auto-scheduling (issue #132).
 *
 * Decision Context:
 * - Flujo nuevo (date-based) paralelo al flujo legacy de CreateTournamentFlow (slot-based).
 * - 3 pasos: (1) Tipo de torneo, (2) Scheduling/Configuración, (3) Detalles + Crear.
 * - Detecta auto-schedule path: envía firstMatchday sin schedule → backend usa
 *   createTournamentAutoSchedule en lugar de createTournamentWithFixtureRpc.
 * - Tras crear exitosamente redirige a /torneos/{id} para ver el fixture generado.
 * - Previously fixed bugs: none relevant (nueva funcionalidad).
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trophy, Loader2, Check } from 'lucide-react';
import { TournamentTypeSelector } from './TournamentTypeSelector';
import { TournamentSchedulingForm } from './TournamentSchedulingForm';
import type { TournamentType, DurationMode } from '../../../graphql/operations/tournaments';
import { CREATE_TOURNAMENT } from '../../../graphql/operations/tournaments';
import type { ClubDetail, MatchFormat } from '../../../graphql/operations/matches';

interface Props {
  initialClubs: ClubDetail[];
  accessToken: string;
  userName: string;
}

const FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
  { value: 'FIVE_VS_FIVE', label: '5 vs 5' },
  { value: 'SEVEN_VS_SEVEN', label: '7 vs 7' },
  { value: 'TEN_VS_TEN', label: '10 vs 10' },
  { value: 'ELEVEN_VS_ELEVEN', label: '11 vs 11' },
];

const STEPS = ['Tipo de torneo', 'Scheduling', 'Detalles'];

interface FormState {
  // Step 1
  tournamentType: TournamentType;
  teamCount: number;
  groupCount: number;
  teamsPerGroup: number;
  advancingPerGroup: number;
  // Step 2
  durationMode: DurationMode;
  firstMatchday: string;
  cadenceDays: number;
  // Step 3
  name: string;
  clubId: string;
  format: MatchFormat;
  playersPerTeam: number;
  description: string;
}

const today = new Date().toISOString().slice(0, 10);
const INITIAL: FormState = {
  tournamentType: 'ROUND_ROBIN', teamCount: 4, groupCount: 2, teamsPerGroup: 2, advancingPerGroup: 2,
  durationMode: 'MULTI_DAY', firstMatchday: today, cadenceDays: 7,
  name: '', clubId: '', format: 'SEVEN_VS_SEVEN', playersPerTeam: 7, description: '',
};

async function gqlPost<T>(query: string, variables: unknown): Promise<{ data?: T; error?: string }> {
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

export function NewTournamentWizard({ initialClubs, userName }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function canAdvance(): boolean {
    if (step === 0) return !!form.tournamentType && form.teamCount >= 2;
    if (step === 1) return !!form.firstMatchday;
    if (step === 2) return form.name.trim().length >= 3 && !!form.clubId;
    return false;
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);

    const input = {
      name: form.name.trim(),
      clubId: form.clubId,
      format: form.format,
      teamCount: form.teamCount,
      playersPerTeam: form.playersPerTeam,
      description: form.description.trim() || null,
      tournamentType: form.tournamentType,
      durationMode: form.durationMode,
      firstMatchday: form.firstMatchday,
      cadenceDays: form.durationMode === 'MULTI_DAY' ? form.cadenceDays : undefined,
      ...(form.tournamentType === 'GROUP_STAGE_ELIMINATION' ? {
        groupCount: form.groupCount,
        teamsPerGroup: form.teamsPerGroup,
        advancingPerGroup: form.advancingPerGroup,
      } : {}),
    };

    const { data, error: err } = await gqlPost<{ createTournament: { success: boolean; message: string | null; tournamentId: string | null } }>(
      CREATE_TOURNAMENT, { input }
    );

    if (err || !data?.createTournament.success) {
      setError(err ?? data?.createTournament.message ?? 'Error al crear el torneo');
      setCreating(false);
      return;
    }

    const id = data.createTournament.tournamentId;
    if (id) window.location.href = `/torneos/${id}`;
  }

  return (
    <div className="wizard">
      {/* Progress steps */}
      <div className="wizard-steps" role="list">
        {STEPS.map((s, i) => (
          <div key={s} role="listitem"
            className={`wizard-step ${i === step ? 'wizard-step--active' : ''} ${i < step ? 'wizard-step--done' : ''}`}
          >
            <span className="step-circle">{i < step ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : i + 1}</span>
            <span className="step-label">{s}</span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="wizard-body">
        {step === 0 && (
          <div>
            <TournamentTypeSelector value={form.tournamentType} onChange={t => update('tournamentType', t)} />

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="team-count">Equipos en el torneo</label>
                <input id="team-count" type="number" className="field-input" min={2} max={32}
                  value={form.teamCount} onChange={e => update('teamCount', parseInt(e.target.value) || 4)} />
              </div>
              {form.tournamentType === 'GROUP_STAGE_ELIMINATION' && (
                <>
                  <div className="field-group">
                    <label className="field-label" htmlFor="group-count">Grupos</label>
                    <input id="group-count" type="number" className="field-input" min={2} max={16}
                      value={form.groupCount} onChange={e => update('groupCount', parseInt(e.target.value) || 2)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="tpg">Por grupo</label>
                    <input id="tpg" type="number" className="field-input" min={2} max={8}
                      value={form.teamsPerGroup} onChange={e => update('teamsPerGroup', parseInt(e.target.value) || 2)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="adv">Clasifican</label>
                    <input id="adv" type="number" className="field-input" min={1} max={7}
                      value={form.advancingPerGroup} onChange={e => update('advancingPerGroup', parseInt(e.target.value) || 2)} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <TournamentSchedulingForm
            tournamentType={form.tournamentType} teamCount={form.teamCount}
            groupCount={form.groupCount} teamsPerGroup={form.teamsPerGroup}
            value={{ durationMode: form.durationMode, firstMatchday: form.firstMatchday, cadenceDays: form.cadenceDays }}
            onChange={v => setForm(prev => ({ ...prev, ...v }))}
          />
        )}

        {step === 2 && (
          <div className="details-step">
            <div className="field-group">
              <label className="field-label" htmlFor="t-name">Nombre del torneo *</label>
              <input id="t-name" type="text" className="field-input" maxLength={120}
                value={form.name} onChange={e => update('name', e.target.value)} placeholder="Copa Verano 2026" autoFocus />
            </div>

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="t-club">Club *</label>
                <select id="t-club" className="field-input" value={form.clubId}
                  onChange={e => update('clubId', e.target.value)}>
                  <option value="">Seleccioná un club...</option>
                  {initialClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="t-format">Formato</label>
                <select id="t-format" className="field-input" value={form.format}
                  onChange={e => update('format', e.target.value as MatchFormat)}>
                  {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="t-ppt">Jugadores/equipo</label>
                <input id="t-ppt" type="number" className="field-input" min={1} max={30}
                  value={form.playersPerTeam} onChange={e => update('playersPerTeam', parseInt(e.target.value) || 7)} />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="t-desc">Descripción (opcional)</label>
              <textarea id="t-desc" className="field-input field-textarea" maxLength={700} rows={3}
                value={form.description} onChange={e => update('description', e.target.value)} />
            </div>

            {error && <div className="error-msg" role="alert">{error}</div>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="wizard-nav">
        {step > 0 && (
          <button type="button" className="btn-back" onClick={() => { setStep(s => s - 1); setError(null); }}>
            <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" /> Anterior
          </button>
        )}
        <span />
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn-next" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>
            Siguiente <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn-create" onClick={handleCreate}
            disabled={creating || !canAdvance()}>
            {creating
              ? <><Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin" /> Creando...</>
              : <><Trophy size={15} strokeWidth={2} aria-hidden="true" /> Crear torneo</>
            }
          </button>
        )}
      </div>

      <style>{`
        .wizard { display: flex; flex-direction: column; gap: 1.5rem; max-width: 640px; }
        .wizard-steps { display: flex; gap: 0; }
        .wizard-step {
          display: flex; align-items: center; gap: 0.45rem; flex: 1;
          font-size: 0.78rem; color: var(--color-muted-foreground); font-weight: 500;
        }
        .wizard-step::after { content: ''; flex: 1; height: 1px; background: var(--color-border); margin: 0 0.4rem; }
        .wizard-step:last-child::after { display: none; }
        .wizard-step--active { color: hsl(42 100% 60%); font-weight: 700; }
        .wizard-step--done { color: hsl(140 70% 50%); }
        .step-circle {
          width: 22px; height: 22px; border-radius: 50%; border: 1px solid currentColor;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; font-weight: 700; flex-shrink: 0;
        }
        .wizard-step--active .step-circle { background: rgba(246,164,0,0.15); }
        .wizard-step--done .step-circle { background: rgba(34,197,94,0.15); border-color: hsl(140 70% 50%); }
        .step-label { white-space: nowrap; }
        .wizard-body { min-height: 200px; }
        .field-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }
        .field-row .field-group { flex: 1; min-width: 120px; }
        .details-step { display: flex; flex-direction: column; gap: 1rem; }
        .field-group { display: flex; flex-direction: column; gap: 0.35rem; }
        .field-label { font-size: 0.82rem; font-weight: 600; color: var(--color-muted-foreground); }
        .field-input {
          background: var(--color-input); border: 1px solid var(--color-border);
          color: var(--color-foreground); border-radius: 8px; padding: 0.55rem 0.75rem;
          font-size: 0.875rem; outline: none; transition: border-color 0.15s; width: 100%;
        }
        .field-input:focus { border-color: var(--color-primary); }
        .field-textarea { resize: vertical; font-family: inherit; }
        .error-msg { background: hsl(0 60% 15%); border: 1px solid hsl(0 72% 40%); color: hsl(0 80% 70%); padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.85rem; }
        .wizard-nav { display: flex; align-items: center; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
        .btn-back { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.9rem; border-radius: 8px; background: var(--color-muted); color: var(--color-foreground); border: none; cursor: pointer; font-size: 0.85rem; }
        .btn-next { display: flex; align-items: center; gap: 0.35rem; padding: 0.5rem 1rem; border-radius: 8px; background: var(--color-secondary); color: #fff; border: none; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: opacity 0.15s; }
        .btn-next:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-create { display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 1.2rem; border-radius: 8px; background: var(--color-primary); color: hsl(0 0% 5%); border: none; cursor: pointer; font-size: 0.875rem; font-weight: 700; transition: opacity 0.15s; }
        .btn-create:disabled { opacity: 0.6; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
