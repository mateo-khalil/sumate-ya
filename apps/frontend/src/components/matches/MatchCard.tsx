/**
 * MatchCard Component - Displays a single match card
 *
 * Decision Context:
 * - Why: Composable card using shadcn/ui primitives for consistent UI.
 * - Pattern: Props-driven, no internal state; parent manages data.
 * - Format mapping: GraphQL uses enum values (FIVE_VS_FIVE) which we map to display
 *   labels here for user-friendly presentation.
 * - Previously fixed bugs: none relevant.
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

export function MatchCard({ match, onJoin, isAuthenticated = false }: MatchCardProps) {
  const filledSlots = match.totalSlots - match.availableSlots;
  const isFull = match.availableSlots === 0;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{match.title}</CardTitle>
          <Badge variant={isFull ? 'secondary' : 'default'}>
            {formatDisplay(match.format)}
          </Badge>
        </div>
        {match.club && (
          <CardDescription className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {match.club.name}
            {match.club.zone && (
              <span className="text-muted-foreground">· {match.club.zone}</span>
            )}
          </CardDescription>
        )}
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
                  isFull ? 'text-destructive' : 'text-foreground font-medium'
                }
              >
                {filledSlots}/{match.totalSlots} jugadores
              </span>
            </div>
          </div>
          <Button
            size="sm"
            disabled={isFull}
            onClick={() => {
              if (!isAuthenticated) {
                window.location.href = '/login';
                return;
              }
              onJoin?.(match.id);
            }}
          >
            {isFull ? 'Completo' : 'Sumarme'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
