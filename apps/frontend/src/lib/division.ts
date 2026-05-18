export interface DivisionMeta {
  level: number;
  name: string;
  shortName: string;
  className: string;
}

const DIVISIONS: Record<number, DivisionMeta> = {
  1: { level: 1, name: 'Bronce', shortName: 'BR', className: 'division-bronze' },
  2: { level: 2, name: 'Plata', shortName: 'PL', className: 'division-silver' },
  3: { level: 3, name: 'Oro', shortName: 'OR', className: 'division-gold' },
  4: { level: 4, name: 'Diamante', shortName: 'DI', className: 'division-diamond' },
};

export function getDivisionMeta(division: number | null | undefined): DivisionMeta {
  const level = Math.max(1, Math.floor(division ?? 1));
  return DIVISIONS[level] ?? {
    level,
    name: `Elite ${level}`,
    shortName: `E${level}`,
    className: 'division-elite',
  };
}
