/**
 * MatchHistoryCard — Single match card for the player's history list.
 *
 * Decision Context:
 * - Why React (.tsx, not .astro): this component is imported and rendered inside
 *   MatchHistoryList.tsx (a React island). Astro components cannot be imported inside
 *   React components, so .tsx is the only viable choice.
 * - Result badge colors follow FIFA design tokens: green → WON, red → LOST,
 *   amber → DRAW, muted gray → PENDING. These are inline styles (not Tailwind classes)
 *   to avoid Tailwind purge issues inside a React island that isn't part of the Astro
 *   build graph.
 * - scoreA/scoreB are null until "registrar resultado" is implemented — the score
 *   section is hidden when both are null.
 * - Date formatting uses Intl.DateTimeFormat('es-AR') to match MatchInfoCard.astro.
 * - Previously fixed bugs: none relevant.
 */

import type { MatchHistoryItem, MatchUserResult } from '../../graphql/operations/profile';

interface MatchHistoryCardProps {
  item: MatchHistoryItem;
}

const FORMAT_LABEL: Record<string, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

const RESULT_CONFIG: Record<
  MatchUserResult,
  { label: string; bg: string; color: string; border: string }
> = {
  WON:     { label: 'Ganado',       bg: 'hsl(142 72% 50% / 0.12)', color: 'hsl(142 72% 60%)', border: 'hsl(142 72% 50% / 0.35)' },
  LOST:    { label: 'Perdido',      bg: 'hsl(0 72% 51% / 0.12)',   color: 'hsl(0 72% 65%)',   border: 'hsl(0 72% 51% / 0.35)' },
  DRAW:    { label: 'Empate',       bg: 'hsl(35 100% 48% / 0.12)', color: 'hsl(35 100% 60%)', border: 'hsl(35 100% 48% / 0.35)' },
  PENDING: { label: 'Sin resultado',bg: 'hsl(215 20% 20% / 0.4)',  color: 'hsl(215 20% 55%)', border: 'rgba(255,255,255,0.1)' },
};

function formatDate(iso: string): string {
  const dt = new Date(iso);
  const date = dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function MatchHistoryCard({ item }: MatchHistoryCardProps) {
  const result = RESULT_CONFIG[item.userResult];
  const formatLabel = FORMAT_LABEL[item.format] ?? item.format;
  const hasScore = item.scoreA != null && item.scoreB != null;

  return (
    <article style={cardStyle}>
      {/* Top row: date + format badge */}
      <div style={topRowStyle}>
        <span style={dateStyle}>{formatDate(item.startTime)}</span>
        <span style={formatBadgeStyle}>{formatLabel}</span>
      </div>

      {/* Club info */}
      {item.club && (
        <div style={clubRowStyle}>
          <span style={clubIconStyle}>📍</span>
          <span style={clubNameStyle}>{item.club.name}</span>
          {item.club.zone && <span style={clubZoneStyle}>· {item.club.zone}</span>}
        </div>
      )}

      {/* Team + organizer */}
      <div style={metaRowStyle}>
        <span style={teamBadgeStyle(item.userTeam)}>
          Equipo {item.userTeam}
        </span>
        {item.isOrganizer && <span style={orgBadgeStyle}>Organizador</span>}
      </div>

      {/* Result + score */}
      <div style={resultRowStyle}>
        <span
          style={{
            ...resultBadgeBase,
            background: result.bg,
            color: result.color,
            border: `1px solid ${result.border}`,
          }}
        >
          {result.label}
        </span>
        {hasScore && (
          <span style={scoreStyle}>
            {item.scoreA} — {item.scoreB}
          </span>
        )}
      </div>
    </article>
  );
}

// =====================================================
// Inline styles — FIFA design tokens
// =====================================================

const cardStyle: React.CSSProperties = {
  background: 'hsl(220 55% 11%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '0.75rem',
  padding: '1rem 1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
};

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const dateStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: '0.8rem',
  color: 'hsl(215 20% 55%)',
  textTransform: 'capitalize',
};

const formatBadgeStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: '0.85rem',
  letterSpacing: '0.08em',
  background: 'hsl(216 85% 45% / 0.15)',
  color: 'hsl(216 85% 65%)',
  border: '1px solid hsl(216 85% 45% / 0.3)',
  padding: '0.1rem 0.6rem',
  borderRadius: '4px',
  flexShrink: 0,
};

const clubRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
};

const clubIconStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  lineHeight: 1,
};

const clubNameStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: '0.875rem',
  fontWeight: 700,
  color: 'hsl(210 20% 85%)',
  letterSpacing: '0.02em',
};

const clubZoneStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: '0.8rem',
  color: 'hsl(215 20% 50%)',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

function teamBadgeStyle(team: string): React.CSSProperties {
  const isA = team === 'A';
  return {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: isA ? 'hsl(35 100% 55%)' : 'hsl(216 85% 65%)',
    background: isA ? 'hsl(35 100% 48% / 0.12)' : 'hsl(216 85% 45% / 0.12)',
    border: `1px solid ${isA ? 'hsl(35 100% 48% / 0.3)' : 'hsl(216 85% 45% / 0.3)'}`,
    padding: '0.1rem 0.5rem',
    borderRadius: '4px',
  };
}

const orgBadgeStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'hsl(35 100% 55%)',
  background: 'hsl(35 100% 48% / 0.15)',
  border: '1px solid hsl(35 100% 48% / 0.35)',
  padding: '0.1rem 0.45rem',
  borderRadius: '4px',
};

const resultRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  flexWrap: 'wrap',
  paddingTop: '0.5rem',
  borderTop: '1px solid rgba(255,255,255,0.06)',
};

const resultBadgeBase: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  padding: '0.15rem 0.65rem',
  borderRadius: '4px',
};

const scoreStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: '1rem',
  letterSpacing: '0.06em',
  color: 'hsl(210 20% 90%)',
};
