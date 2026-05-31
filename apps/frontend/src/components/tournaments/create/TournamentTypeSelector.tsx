/**
 * TournamentTypeSelector — selector visual para el tipo de torneo.
 *
 * Decision Context:
 * - Issue #132 T1: 3 opciones: Liga (round-robin), Eliminación directa, Grupos+Eliminación.
 * - Cada card muestra nombre + descripción + icono visual representativo.
 * - El tipo seleccionado se resalta con borde naranja.
 * - Previously fixed bugs: none relevant.
 */

import { Trophy, Users, Layers } from 'lucide-react';
import type { TournamentType } from '../../../graphql/operations/tournaments';

interface Props {
  value: TournamentType;
  onChange: (type: TournamentType) => void;
}

const TYPE_OPTIONS: {
  value: TournamentType;
  label: string;
  description: string;
  example: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number; 'aria-hidden'?: 'true' }>;
}[] = [
  {
    value: 'ROUND_ROBIN',
    label: 'Liga',
    description: 'Todos contra todos. Cada equipo juega contra todos los demás.',
    example: '4 equipos → 6 partidos, 3 jornadas',
    Icon: Users,
  },
  {
    value: 'SINGLE_ELIMINATION',
    label: 'Eliminación Directa',
    description: 'El perdedor queda eliminado. Hasta el campeón.',
    example: '8 equipos → 7 partidos, cuartos → semi → final',
    Icon: Trophy,
  },
  {
    value: 'GROUP_STAGE_ELIMINATION',
    label: 'Grupos + Eliminación',
    description: 'Fase de grupos estilo Mundial. Los mejores de cada grupo avanzan.',
    example: '2 grupos de 4 → 12 partidos de grupos + eliminación',
    Icon: Layers,
  },
];

export function TournamentTypeSelector({ value, onChange }: Props) {
  return (
    <div className="type-selector">
      <p className="selector-hint">Elegí el formato de competencia</p>

      <div className="type-grid">
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`type-card ${value === opt.value ? 'type-card--selected' : ''}`}
          >
            <div className="type-icon-wrap">
              <opt.Icon size={22} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="type-info">
              <span className="type-label">{opt.label}</span>
              <span className="type-desc">{opt.description}</span>
              <span className="type-example">{opt.example}</span>
            </div>
            {value === opt.value && (
              <span className="type-check" aria-hidden="true">✓</span>
            )}
          </button>
        ))}
      </div>

      <style>{`
        .type-selector { display: flex; flex-direction: column; gap: 0.75rem; }
        .selector-hint { font-size: 0.85rem; color: var(--color-muted-foreground); margin: 0; }
        .type-grid { display: flex; flex-direction: column; gap: 0.5rem; }
        .type-card {
          display: flex; align-items: flex-start; gap: 0.875rem;
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 10px; padding: 0.875rem 1rem; cursor: pointer;
          text-align: left; transition: border-color 0.15s, background 0.15s;
          width: 100%; position: relative;
        }
        .type-card:hover { border-color: hsl(35 100% 50%); background: rgba(246,164,0,0.04); }
        .type-card--selected { border-color: hsl(35 100% 50%); background: rgba(246,164,0,0.08); }
        .type-icon-wrap {
          width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0;
          background: rgba(246,164,0,0.1); color: hsl(35 100% 55%);
          display: flex; align-items: center; justify-content: center;
        }
        .type-card--selected .type-icon-wrap { background: rgba(246,164,0,0.18); }
        .type-info { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; }
        .type-label { font-size: 0.9rem; font-weight: 700; color: var(--color-foreground); }
        .type-desc { font-size: 0.8rem; color: var(--color-muted-foreground); line-height: 1.4; }
        .type-example { font-size: 0.73rem; color: hsl(42 100% 55%); font-style: italic; margin-top: 0.1rem; }
        .type-check {
          position: absolute; top: 0.6rem; right: 0.75rem;
          color: hsl(35 100% 55%); font-size: 0.9rem; font-weight: 700;
        }
        :global(html.light) .type-card { background: hsl(0 0% 100%); border-color: hsl(220 13% 88%); }
        :global(html.light) .type-card:hover { border-color: hsl(35 80% 55%); background: hsl(35 100% 97%); }
        :global(html.light) .type-card--selected { border-color: hsl(35 80% 48%); background: hsl(35 100% 95%); }
        :global(html.light) .type-label { color: hsl(220 72% 10%); }
      `}</style>
    </div>
  );
}
