/**
 * ClubSelector — Step 1 of the create-match wizard
 * Shows all available clubs as cards; the player picks one to continue.
 *
 * Decision Context:
 * - Data is passed as props (pre-fetched SSR on the Astro page) to avoid a client-side
 *   fetch waterfall on an already-SSR page. If the list is empty we show a friendly message
 *   rather than a loading spinner.
 * - Card layout matches the /partidos visual system (dark card, orange accent on selection).
 * - Previously fixed bugs: none relevant.
 */

import type { ClubDetail } from '../../../graphql/operations/matches';

interface Props {
  clubs: ClubDetail[];
  selectedId: string | null;
  onSelect: (club: ClubDetail) => void;
}

const PLACEHOLDER_IMG = '/img/club-placeholder.svg';

export default function ClubSelector({ clubs, selectedId, onSelect }: Props) {
  if (clubs.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'hsl(215 20% 50%)', padding: '2rem 0' }}>
        <p style={{ fontFamily: "'Barlow', sans-serif" }}>No hay clubes disponibles todavía.</p>
      </div>
    );
  }

  return (
    <div className="club-grid">
      {clubs.map((club) => {
        const isSelected = club.id === selectedId;
        return (
          <button
            key={club.id}
            type="button"
            className={`club-card${isSelected ? ' club-card--selected' : ''}`}
            onClick={() => onSelect(club)}
            aria-pressed={isSelected}
          >
            <img
              src={club.imageUrl ?? PLACEHOLDER_IMG}
              alt={`Logo de ${club.name}`}
              className="club-img"
              width={56}
              height={56}
            />
            <div className="club-info">
              <span className="club-name">{club.name}</span>
              <span className="club-meta">{club.zone} · {club.address}</span>
              {club.phone && (
                <span className="club-phone">{club.phone}</span>
              )}
            </div>
            {isSelected && (
              <span className="club-check" aria-hidden="true">✓</span>
            )}
          </button>
        );
      })}

      <style>{`
        .club-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .club-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 0.75rem;
          cursor: pointer;
          text-align: left;
          transition: border-color 0.15s, background 0.15s;
          width: 100%;
          position: relative;
        }
        .club-card:hover { border-color: rgba(255,255,255,0.18); background: hsl(220 55% 14%); }
        .club-card--selected { border-color: hsl(35 100% 48%); background: hsl(220 55% 13%); }
        .club-img {
          width: 56px; height: 56px;
          border-radius: 8px;
          object-fit: cover;
          background: hsl(220 40% 16%);
          flex-shrink: 0;
        }
        .club-info { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
        .club-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.15rem;
          letter-spacing: 0.05em;
          color: #fff;
        }
        .club-meta {
          font-family: 'Barlow', sans-serif;
          font-size: 0.8rem;
          color: hsl(215 20% 55%);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .club-phone {
          font-family: 'Barlow', sans-serif;
          font-size: 0.75rem;
          color: hsl(215 20% 45%);
        }
        .club-check {
          position: absolute;
          right: 1.25rem;
          top: 50%;
          transform: translateY(-50%);
          color: hsl(35 100% 55%);
          font-size: 1.2rem;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
