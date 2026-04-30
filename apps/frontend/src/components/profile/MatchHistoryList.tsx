/**
 * MatchHistoryList — React island for the player's completed match history.
 *
 * Decision Context:
 * - Why React island (not Astro): needs client-side state for "Cargar más" pagination.
 *   The initial page is rendered server-side via Astro (initialData prop), subsequent
 *   pages are fetched on-demand when the user clicks "Cargar más".
 * - client:visible: hydrated only when the section scrolls into the viewport, keeping
 *   the initial page load fast (the above-the-fold ProfileCard loads first).
 * - Data fetching: uses raw fetch (not urql) like JoinTeamButton — backendUrl and
 *   accessToken are passed as props from the SSR Astro page where they're available.
 * - Page accumulation: clicking "Cargar más" appends items to the existing list (no
 *   replace). This matches the "infinite scroll" mental model for a history feed.
 * - Empty state: shown when initialData.items.length === 0, not when items is empty
 *   after loading (which would flicker on hydration).
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { MatchHistoryCard } from './MatchHistoryCard';
import {
  GET_MY_MATCHES,
  type MatchHistoryConnection,
  type MatchHistoryItem,
} from '../../graphql/operations/profile';

interface MatchHistoryListProps {
  initialData: MatchHistoryConnection;
  backendUrl: string;
  accessToken: string;
}

export function MatchHistoryList({ initialData, backendUrl, accessToken }: MatchHistoryListProps) {
  const [items, setItems] = useState<MatchHistoryItem[]>(initialData.items);
  const [currentPage, setCurrentPage] = useState(initialData.page);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const nextPage = currentPage + 1;
      const res = await fetch(`${backendUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: GET_MY_MATCHES,
          variables: { page: nextPage, pageSize: initialData.pageSize },
        }),
      });

      const json = (await res.json()) as {
        data?: { myMatches?: MatchHistoryConnection };
        errors?: { message: string }[];
      };

      if (json.errors?.length) {
        setError(json.errors[0].message);
        return;
      }

      const result = json.data?.myMatches;
      if (result) {
        setItems((prev) => [...prev, ...result.items]);
        setCurrentPage(nextPage);
        setHasMore(result.hasMore);
      }
    } catch {
      setError('Error de red al cargar más partidos.');
    } finally {
      setLoading(false);
    }
  }

  if (initialData.items.length === 0) {
    return (
      <div style={emptyStyle}>
        <span style={emptyIconStyle}>🏟️</span>
        <p style={emptyTitleStyle}>Aún no tenés partidos jugados</p>
        <p style={emptySubStyle}>
          Tus partidos completados aparecerán aquí con el resultado y el puntaje.
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={listStyle}>
        {items.map((item) => (
          <MatchHistoryCard key={item.id} item={item} />
        ))}
      </div>

      {hasMore && (
        <div style={footerStyle}>
          <button
            onClick={loadMore}
            disabled={loading}
            style={loading ? loadMoreBtnLoadingStyle : loadMoreBtnStyle}
            aria-busy={loading}
          >
            {loading ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <p style={endLabelStyle}>Mostrando todos tus partidos ({items.length})</p>
      )}

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// =====================================================
// Inline styles — FIFA design tokens
// =====================================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const listStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '0.75rem',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  paddingTop: '0.5rem',
};

const loadMoreBtnBase: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: '0.875rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '0.6rem 1.5rem',
  borderRadius: '8px',
  border: '1px solid hsl(35 100% 48% / 0.4)',
  background: 'transparent',
  color: 'hsl(35 100% 55%)',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s',
};

const loadMoreBtnStyle: React.CSSProperties = loadMoreBtnBase;

const loadMoreBtnLoadingStyle: React.CSSProperties = {
  ...loadMoreBtnBase,
  opacity: 0.5,
  cursor: 'wait',
};

const endLabelStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: '0.8rem',
  color: 'hsl(215 20% 45%)',
  textAlign: 'center',
  margin: 0,
};

const errorStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: '0.85rem',
  color: 'hsl(0 72% 65%)',
  textAlign: 'center',
  margin: 0,
};

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '2.5rem 1rem',
  background: 'hsl(220 55% 11%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1rem',
  textAlign: 'center',
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: '2rem',
  lineHeight: 1,
  marginBottom: '0.25rem',
};

const emptyTitleStyle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: '1.4rem',
  letterSpacing: '0.04em',
  color: '#fff',
  margin: 0,
};

const emptySubStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: '0.875rem',
  color: 'hsl(215 20% 50%)',
  margin: 0,
  maxWidth: '320px',
};
