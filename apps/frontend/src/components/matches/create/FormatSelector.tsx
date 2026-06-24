/**
 * FormatSelector — Step 3 of the create-match wizard
 * Shows format options (5v5, 7v7, 10v10, 11v11), disables those exceeding court.maxFormat.
 *
 * Decision Context:
 * - Capacity is NOT adjustable: in a one-off match the format fully determines the player
 *   count (5v5 = 10, 7v7 = 14, 10v10 = 20, 11v11 = 22). There are no substitutions in this
 *   context, unlike a tournament where extra players for changes make sense.
 *   The capacity selector was removed so the user only needs to pick a format.
 * - Disabled options: a format is disabled when FORMAT_ORDER[format] > FORMAT_ORDER[courtMax].
 *   This matches the backend validation so there is no way to submit an incompatible format.
 * - onChange fires on every format selection; capacity is auto-derived = getMaxCapacity(format).
 * - Previously fixed bugs: none relevant.
 */

import type { MatchFormat } from '../../../graphql/operations/matches';

interface Props {
  courtMaxFormat: MatchFormat;
  selectedFormat: MatchFormat | null;
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
  onFormatChange,
}: Props) {
  function handleFormatClick(format: MatchFormat) {
    onFormatChange(format, getMaxCapacity(format));
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

      <style>{`
        .format-step { display: flex; flex-direction: column; gap: 1.25rem; }
        .format-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        @media (max-width: 400px) { .format-grid { grid-template-columns: 1fr; } }
        .fmt-card {
          display: flex; flex-direction: column; align-items: center;
          gap: 0.3rem; padding: 1.25rem 0.75rem; min-height: 44px;
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
      `}</style>
    </div>
  );
}
