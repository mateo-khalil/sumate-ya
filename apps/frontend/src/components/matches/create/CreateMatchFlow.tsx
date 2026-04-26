/**
 * CreateMatchFlow — multi-step wizard for creating a match
 *
 * Decision Context:
 * - Steps: 1-Club → 2-Slot → 3-Format → 4-Summary+Confirm
 * - State lives entirely in this component (no nanostore needed — it's a single-page
 *   wizard flow, not shared state). On success, onSuccess(matchId) is called so the Astro
 *   page can redirect with window.location.
 * - Props: `initialClubs` is pre-fetched server-side on the Astro page (SSR) so Step 1
 *   renders instantly without a client-side loading spinner.
 * - The step header uses an accessible ordered list with aria-current for screen readers.
 * - "Back" buttons clear downstream selections so the user doesn't get stuck in an
 *   inconsistent state (e.g., a slot for a different club than the newly selected one).
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import type { ClubDetail, ClubSlot, MatchFormat } from '../../../graphql/operations/matches';
import ClubSelector from './ClubSelector';
import SlotSelector from './SlotSelector';
import FormatSelector, { getMaxCapacity } from './FormatSelector';
import SummaryStep from './SummaryStep';

interface Props {
  initialClubs: ClubDetail[];
  /** URL prefix for post-create redirect: redirectBase + matchId (e.g. "/partidos/") */
  redirectBase?: string;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: 'Club',
  2: 'Horario',
  3: 'Formato',
  4: 'Confirmar',
};

export default function CreateMatchFlow({ initialClubs, redirectBase = '/partidos/' }: Props) {
  function onSuccess(matchId: string) {
    window.location.href = `${redirectBase}${matchId}`;
  }
  const [step, setStep] = useState<Step>(1);

  // Wizard selections
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [slot, setSlot] = useState<ClubSlot | null>(null);
  const [slotDate, setSlotDate] = useState<string>('');
  const [format, setFormat] = useState<MatchFormat | null>(null);
  const [capacity, setCapacity] = useState<number>(10);

  // ---- Navigation ----
  function goBack() {
    if (step === 2) {
      setSlot(null);
      setSlotDate('');
      setStep(1);
    } else if (step === 3) {
      setFormat(null);
      setStep(2);
    } else if (step === 4) {
      setStep(3);
    }
  }

  function canAdvance(): boolean {
    if (step === 1) return club !== null;
    if (step === 2) return slot !== null;
    if (step === 3) return format !== null;
    return true;
  }

  function handleNext() {
    if (!canAdvance()) return;
    setStep((s) => Math.min(s + 1, 4) as Step);
  }

  // ---- Step handlers ----
  function handleClubSelect(c: ClubDetail) {
    setClub(c);
    setSlot(null); // reset downstream
    setSlotDate('');
    setFormat(null);
  }

  function handleSlotSelect(s: ClubSlot, date: string) {
    setSlot(s);
    setSlotDate(date);
    // Reset format if it's no longer compatible with new court
    if (format) {
      const FORMAT_ORDER: Record<MatchFormat, number> = {
        FIVE_VS_FIVE: 1, SEVEN_VS_SEVEN: 2, TEN_VS_TEN: 3, ELEVEN_VS_ELEVEN: 4,
      };
      const courtMax = s.court.maxFormat;
      if (FORMAT_ORDER[format] > FORMAT_ORDER[courtMax]) {
        setFormat(null);
        setCapacity(getMaxCapacity(courtMax));
      }
    }
  }

  function handleFormatChange(f: MatchFormat, cap: number) {
    setFormat(f);
    setCapacity(cap);
  }

  return (
    <div className="wizard">
      {/* Step indicator */}
      <ol className="step-nav" aria-label="Pasos del formulario">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <li
            key={s}
            className={`step-item${s === step ? ' step-item--active' : ''}${s < step ? ' step-item--done' : ''}`}
            aria-current={s === step ? 'step' : undefined}
          >
            <span className="step-num">{s < step ? '✓' : s}</span>
            <span className="step-lbl">{STEP_LABELS[s]}</span>
          </li>
        ))}
      </ol>

      {/* Step content */}
      <div className="wizard-body">
        {step === 1 && (
          <ClubSelector
            clubs={initialClubs}
            selectedId={club?.id ?? null}
            onSelect={handleClubSelect}
          />
        )}

        {step === 2 && club && (
          <SlotSelector
            clubId={club.id}
            clubName={club.name}
            selectedSlot={slot}
            onSelect={handleSlotSelect}
          />
        )}

        {step === 3 && slot && (
          <FormatSelector
            courtMaxFormat={slot.court.maxFormat}
            selectedFormat={format}
            capacity={capacity}
            onFormatChange={handleFormatChange}
          />
        )}

        {step === 4 && club && slot && format && (
          <SummaryStep
            club={club}
            slot={slot}
            date={slotDate}
            format={format}
            capacity={capacity}
            onSuccess={onSuccess}
          />
        )}
      </div>

      {/* Navigation buttons (not shown on step 4 — SummaryStep has its own submit) */}
      {step < 4 && (
        <div className="wizard-nav">
          {step > 1 && (
            <button type="button" className="btn-back" onClick={goBack}>
              ← Atrás
            </button>
          )}
          <button
            type="button"
            className="btn-next"
            onClick={handleNext}
            disabled={!canAdvance()}
          >
            {step === 3 ? 'Ver resumen →' : 'Continuar →'}
          </button>
        </div>
      )}
      {step === 4 && (
        <div className="wizard-nav">
          <button type="button" className="btn-back" onClick={goBack}>
            ← Atrás
          </button>
        </div>
      )}

      <style>{`
        .wizard { display: flex; flex-direction: column; gap: 1.5rem; }

        /* Step indicator */
        .step-nav {
          display: flex; list-style: none; margin: 0; padding: 0;
          gap: 0; border-bottom: 1px solid rgba(255,255,255,0.06);
          padding-bottom: 1rem;
        }
        .step-item {
          display: flex; align-items: center; gap: 0.45rem;
          flex: 1; position: relative;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.75rem; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: hsl(215 20% 40%);
        }
        .step-item--active { color: hsl(35 100% 55%); }
        .step-item--done { color: hsl(142 72% 50%); }
        .step-num {
          width: 24px; height: 24px; border-radius: 50%;
          border: 1px solid currentColor;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; flex-shrink: 0;
        }
        .step-item--active .step-num {
          background: hsl(35 100% 48%); color: hsl(220 72% 7%); border-color: transparent;
        }
        .step-item--done .step-num {
          background: hsl(142 72% 50% / 0.15); border-color: hsl(142 72% 50%);
        }
        .step-lbl { display: none; }
        @media (min-width: 480px) { .step-lbl { display: inline; } }

        .wizard-body { min-height: 200px; }

        /* Navigation */
        .wizard-nav {
          display: flex; gap: 0.75rem; justify-content: flex-end;
          padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.06);
        }
        .btn-back {
          padding: 0.625rem 1.1rem;
          background: transparent; color: hsl(215 20% 65%);
          border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
          cursor: pointer; font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.875rem; font-weight: 600; letter-spacing: 0.08em;
          transition: background 0.15s, color 0.15s;
        }
        .btn-back:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .btn-next {
          padding: 0.625rem 1.5rem;
          background: hsl(35 100% 48%); color: hsl(220 72% 7%);
          border: none; border-radius: 6px; cursor: pointer;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.9rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: background 0.15s, opacity 0.15s;
        }
        .btn-next:hover:not(:disabled) { background: hsl(35 100% 55%); }
        .btn-next:disabled { opacity: 0.35; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
