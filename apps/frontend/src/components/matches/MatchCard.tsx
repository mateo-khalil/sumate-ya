/**
 * MatchCard Component - Displays a single match card
 *
 * Decision Context:
 * - Why: Composable card using shadcn/ui primitives for consistent UI.
 * - Pattern: Props-driven, no internal state; parent manages data.
 * - Format mapping: GraphQL uses enum values (FIVE_VS_FIVE) which we map to display
 *   labels here for user-friendly presentation.
 * - Status-aware CTA: only OPEN matches are joinable. The backend now collapses past
 *   'open'/'full' rows into COMPLETED at presentation time, so the card must read the
 *   GraphQL status (not just availableSlots) to decide whether to enable "Sumarme" —
 *   otherwise a finished match with stale slot data would still offer a join button.
 *   Joinable → primary "Sumarme". Non-joinable (FULL / COMPLETED / CANCELLED /
 *   IN_PROGRESS) → secondary "Ver detalle" that routes to /partidos/:id; the actual
 *   status is conveyed via the badge in the header so the button can stay actionable.
 * - Card-level navigation: the entire card is clickable and routes to /partidos/:id so
 *   users can ALWAYS reach the detail page, even when the join CTA is disabled (full,
 *   completed, cancelled, in-progress). Required so a player can inspect the roster of
 *   a 10/10 match before deciding whether to wait for a free slot. The inner button keeps
 *   its own onClick (with stopPropagation) so its specific action runs without double
 *   navigation. Keyboard handling (Enter/Space) and role="button" make the card
 *   accessible for non-mouse users.
 * - Previously fixed bugs:
 *   - "Sumarme" appeared on past matches because the card only checked availableSlots,
 *     not match.status (the past-match status override now lives server-side).
 *   - Full (10/10) matches were unreachable from the listing because the only clickable
 *     affordance was the disabled "Completo" button — fixed by making the whole card a
 *     link to the detail page.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchFormat, MatchStatus } from '@/graphql/operations/matches';

export interface Match {
  id: string;
  title: string;
  startTime: string;
  format: MatchFormat;
  totalSlots: number;
  availableSlots: number;
  status?: MatchStatus;
  club: {
    name: string;
    zone: string | null;
    // Optional coordinates — present when the backend returns them (e.g. map view).
    // Callers must treat these as nullable; not all clubs have geocoded locations.
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
    // Profile photo of the club. Optional because legacy clubs may not have
    // uploaded one yet — when missing, the card falls back to a name initial.
    imageUrl?: string | null;
  } | null;
}

interface MatchCardProps {
  match: Match;
  onJoin?: (matchId: string) => void;
  /** When false, clicking "Sumarme" redirects to /login instead of joining */
  isAuthenticated?: boolean;
}

/**
 * Format date to Spanish locale
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Format time from ISO date
 */
function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Map GraphQL format enum to display label
 */
const FORMAT_LABELS: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

function formatDisplay(format: MatchFormat): string {
  return FORMAT_LABELS[format] || format;
}

/**
 * Circular club avatar shown in the card header.
 *
 * Decision Context:
 * - Why a small (40px) circle: matches the FIFA-style player roster aesthetic and keeps
 *   the card visually scannable without dominating the title row.
 * - Fallback to the first character of the club name when imageUrl is null. Legacy clubs
 *   may not have an uploaded image and we want a consistent visual placeholder, not a
 *   broken-image icon (broken images also cost Supabase Storage egress per backend rules).
 * - `loading="lazy"` so off-screen cards in long lists don't pull every club image upfront.
 * - Previously fixed bugs: none relevant — new component.
 */
function ClubAvatar({ club }: { club: { name: string; imageUrl?: string | null } }) {
  const initial = club.name.charAt(0).toUpperCase();
  return (
    <div
      className="h-10 w-10 rounded-full overflow-hidden flex items-center justify-center bg-muted border border-border shrink-0"
      aria-hidden="true"
    >
      {club.imageUrl ? (
        <img
          src={club.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-sm font-bold text-muted-foreground font-[Barlow_Condensed,sans-serif]">
          {initial}
        </span>
      )}
    </div>
  );
}

const STATUS_LABEL: Partial<Record<MatchStatus, string>> = {
  FULL: 'Completo',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
  IN_PROGRESS: 'En curso',
};

// CTA label when the match is not joinable. We use "Ver detalle" instead of repeating
// the status (which is already shown via the badge above) so the bottom button always
// provides an actionable affordance — clicking it routes to the match detail page where
// the user can inspect the roster of a full/finished/cancelled match.
const NON_JOINABLE_CTA = 'Ver detalle';

// Borde izquierdo coloreado por estado: acento sutil que comunica el estado
// del partido sin necesitar solo el badge. Compatible con ambos temas via
// opacidades relativas que adaptan bien sobre fondos claros y oscuros.
const STATUS_LEFT_BORDER: Partial<Record<MatchStatus | 'OPEN', string>> = {
  OPEN: 'border-l-2 border-l-green-500/50',
  FULL: 'border-l-2 border-l-yellow-500/50',
  IN_PROGRESS: 'border-l-2 border-l-blue-500/50',
  COMPLETED: 'border-l-2 border-l-slate-400/30',
  CANCELLED: 'border-l-2 border-l-red-500/30',
};

export function MatchCard({ match, onJoin, isAuthenticated = false }: MatchCardProps) {
  const filledSlots = match.totalSlots - match.availableSlots;
  const isOpen = match.status === 'OPEN';
  // Cancelled matches surface only via the opt-in "Mostrar cancelados" toggle. They are
  // rendered dimmed with a struck-through title so they read clearly as "no longer happening"
  // while staying clickable (the detail page shows the cancellation banner).
  const isCancelled = match.status === 'CANCELLED';
  const isJoinable = isOpen && match.availableSlots > 0;
  // Decision Context: tratamos un partido OPEN con availableSlots=0 como FULL para
  // efectos de UI. El backend a veces deja status='open' aunque ya no queden cupos
  // (p.ej. seed E2E que inserta participantes sin pasar por joinMatch que actualiza
  // a 'full'). Esto garantiza que el badge muestre "Completo" y que el CTA inferior
  // sea "Ver detalle" en vez de habilitar "Sumarme" sobre un partido sin cupos.
  // Previously fixed bugs: ninguna nueva — esto extiende la logica que ya existia para
  // status === 'FULL' al caso equivalente "OPEN sin cupos".
  const effectiveStatus: MatchStatus | undefined =
    !isJoinable && isOpen ? 'FULL' : match.status;
  const statusLabel = effectiveStatus ? STATUS_LABEL[effectiveStatus] : undefined;
  const ctaLabel = isJoinable ? 'Sumarme' : NON_JOINABLE_CTA;

  const goToDetail = () => {
    window.location.href = `/partidos/${match.id}`;
  };

  const leftBorderClass = effectiveStatus
    ? (STATUS_LEFT_BORDER[effectiveStatus] ?? STATUS_LEFT_BORDER['OPEN'])
    : STATUS_LEFT_BORDER['OPEN'];

  return (
    <Card
      className={cn(
        'hover:shadow-2xl hover:border-border/60 hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        leftBorderClass,
        isCancelled && 'opacity-60',
      )}
      role="button"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToDetail();
        }
      }}
      aria-label={`Ver detalle del partido ${match.title}`}
    >
      <CardHeader className="pb-3">
        {/* Decision Context: badges live in their own row above the title so a long
            "COMPLETO" + "5v5" combo never squeezes the title into a narrow column.
            Previously fixed bugs: the title became unreadable on full matches because
            the status + format badges shared the title row and shrunk it heavily. */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {statusLabel && (
            <Badge variant="secondary" className="text-[0.65rem] uppercase tracking-wider">
              {statusLabel}
            </Badge>
          )}
          <Badge variant={!isJoinable ? 'secondary' : 'default'}>
            {formatDisplay(match.format)}
          </Badge>
        </div>
        <div className="flex items-start gap-3 min-w-0">
          {match.club && <ClubAvatar club={match.club} />}
          <div className="min-w-0 flex-1">
            <CardTitle className={cn('text-lg', isCancelled && 'line-through')}>
              {match.title}
            </CardTitle>
            {match.club && (
              <CardDescription className="flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {match.club.name}
                  {match.club.zone && (
                    <span className="text-muted-foreground"> · {match.club.zone}</span>
                  )}
                </span>
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>
                {formatDate(match.startTime)} · {formatTime(match.startTime)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span
                className={
                  !isJoinable ? 'text-muted-foreground' : 'text-foreground font-medium'
                }
              >
                {filledSlots}/{match.totalSlots} jugadores
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant={isJoinable ? 'default' : 'secondary'}
            onClick={(e) => {
              // Prevent the card-level navigation from also firing — the button has its
              // own action so we don't want the parent click to also run. For joinable
              // matches we route through onJoin (which currently navigates to the detail
              // for the actual join flow) or push unauthenticated users to /login. For
              // non-joinable matches the CTA is "Ver detalle" and routes to the same
              // detail page so the user can inspect the roster of a full/finished match.
              e.stopPropagation();
              if (!isJoinable) {
                window.location.href = `/partidos/${match.id}`;
                return;
              }
              if (!isAuthenticated) {
                window.location.href = '/login';
                return;
              }
              onJoin?.(match.id);
            }}
          >
            {ctaLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
