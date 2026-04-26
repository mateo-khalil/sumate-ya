/**
 * FormatSelector — Step 3 of the create-match wizard
 * Shows format options (5v5, 7v7, 10v10, 11v11), disables those exceeding court.maxFormat,
 * auto-computes default capacity, and lets the user adjust it within valid bounds.
 *
 * Decision Context:
 * - Disabled options: a format is disabled when FORMAT_ORDER[format] > FORMAT_ORDER[courtMax].
 *   This matches the backend validation so there is no way to submit an incompatible format.
 * - Capacity range: the wizard shows the default capacity and lets the user reduce it (minimum
 *   is 4 — smallest meaningful match with 2 per side). The backend re-validates on submit.
 * - onChange fires on every valid change so the parent wizard can track state reactively.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import type { MatchFormat } from '../../../graphql/operations/matches';

interface Props {
  courtMaxFormat: MatchFormat;
  selectedFormat: MatchFormat | null;
  capacity: number;
  onFormatChange: (format: MatchFormat, capacity: number) => void;
}

export const FORMAT_OPTIONS: { value: MatchFormat; label: string; players: number }[] = [
  { value: 'FIVE_VS_FIVE',    label: '5v5',   players: 10 },
  { value: 'SEVEN_VS_SEVEN',  label: '7v7',   players: 14 },
  { value: 'TEN_VS_TEN',      label: '10v10', players: 20 },
  { value: 'ELEVEN_VS_ELEVEN',label: '11v11', players: 22 },
];

const FORMAT_ORDER: Record<MatchFormat, number> = {
  FIVE_VS_FIVE: 1, SEVEN_VS_SEVEN: 2, TEN_VS_TEN: 3, ELEVEN_VS_ELEVEN: 4,
};

export function getMaxCapacity(format: MatchFormat): number {
  return FORMAT_OPTIONS.find((o) => o.value === format)?.players ?? 10;
}

export default function FormatSelector({
  courtMaxFormat,
  selectedFormat,
  capacity,
  onFormatChange,
}: Props) {
  const [localCapacity, setLocalCapacity] = useState(capacity);

  useEffect(() => {
    setLocalCapacity(capacity);
  }, [capacity]);

  function handleFormatClick(format: MatchFormat) {
    const maxCap = getMaxCapacity(format);
    const newCap = Math.min(localCapacity, maxCap);
    setLocalCapacity(newCap);
    onFormatChange(format, newCap);
  }

  function handleCapacityChange(val: number) {
    if (!selectedFormat) return;
    const max = getMaxCapacity(selectedFormat);
    const clamped = Math.max(4, Math.min(val, max));
    setLocalCapacity(clamped);
    onFormatChange(selectedFormat, clamped);
  }

  return (
    <div className="format-step">
      <div className="format-grid">
        {FORMAT_OPTIONS.map(({ value, label, players }) => {
          const disabled = FORMAT_ORDER[value] > FORMAT_ORDER[courtMaxFormat];
          const isSelected = value === selectedFormat;
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              className={`fmt-card${isSelected ? ' fmt-card--selected' : ''}${disabled ? ' fmt-card--disabled' : ''}`}
              onClick={() => !disabled && handleFormatClick(value)}
              aria-pressed={isSelected}
              aria-disabled={disabled}
              title={disabled ? `La cancha soporta hasta ${FORMAT_OPTIONS.find(o=>o.value===courtMaxFormat)?.label}` : undefined}
            >
              <span className="fmt-label">{label}</span>
              <span className="fmt-players">{players} jugadores</span>
              {disabled && <span className="fmt-badge">No compatible</span>}
            </button>
          );
        })}
      </div>

      {selectedFormat && (
        <div className="capacity-row">
          <label className="step-label" htmlFor="capacity-input">
            Capacidad de jugadores
          </label>
          <div className="capacity-controls">
            <button
              type="button"
              className="cap-btn"
              onClick={() => handleCapacityChange(localCapacity - 1)}
              aria-label="Reducir capacidad"
            >–</button>
            <input
              id="capacity-input"
              type="number"
              value={localCapacity}
              min={4}
              max={getMaxCapacity(selectedFormat)}
              onChange={(e) => handleCapacityChange(Number(e.target.value))}
              className="cap-input"
              aria-label="Cantidad de jugadores"
            />
            <button
              type="button"
              className="cap-btn"
              onClick={() => handleCapacityChange(localCapacity + 1)}
              aria-label="Aumentar capacidad"
            >+</button>
          </div>
          <span className="capacity-hint">
            Máximo para {FORMAT_OPTIONS.find(o => o.value === selectedFormat)?.label}: {getMaxCapacity(selectedFormat)} jugadores
          </span>
        </div>
      )}

      <style>{`
        .format-step { display: flex; flex-direction: column; gap: 1.25rem; }
        .format-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .fmt-card {
          display: flex; flex-direction: column; align-items: center;
          gap: 0.3rem; padding: 1.25rem 0.75rem;
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 0.75rem; cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          position: relative;
        }
        .fmt-card:not(.fmt-card--disabled):hover { border-color: rgba(255,255,255,0.2); }
        .fmt-card--selected { border-color: hsl(35 100% 48%); background: hsl(220 55% 14%); }
        .fmt-card--disabled { opacity: 0.4; cursor: not-allowed; }
        .fmt-label {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 2rem; letter-spacing: 0.05em; color: #fff;
        }
        .fmt-players {
          font-family: 'Barlow', sans-serif; font-size: 0.78rem;
          color: hsl(215 20% 55%);
        }
        .fmt-badge {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase;
          background: hsl(0 72% 51% / 0.15);
          color: hsl(0 72% 70%);
          padding: 0.1rem 0.4rem; border-radius: 3px;
          margin-top: 0.2rem;
        }
        .capacity-row { display: flex; flex-direction: column; gap: 0.5rem; }
        .step-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.75rem; font-weight: 700;
          letter-spacing: 0.15em; text-transform: uppercase;
          color: hsl(35 100% 55%);
        }
        .capacity-controls { display: flex; align-items: center; gap: 0.5rem; }
        .cap-btn {
          width: 36px; height: 36px;
          background: hsl(220 30% 18%); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; cursor: pointer; color: #fff; font-size: 1.1rem;
          display: flex; align-items: center; justify-content: center;
        }
        .cap-btn:hover { background: hsl(220 30% 22%); }
        .cap-input {
          width: 72px; text-align: center;
          background: hsl(220 30% 16%); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; color: #fff; font-size: 1rem;
          padding: 0.4rem 0; font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em;
        }
        .capacity-hint {
          font-family: 'Barlow', sans-serif; font-size: 0.78rem;
          color: hsl(215 20% 45%);
        }
      `}</style>
    </div>
  );
}
