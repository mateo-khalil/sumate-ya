/**
 * MatchCard Component - Displays a single match card
 *
 * Decision Context:
 * - Why: Composable card using shadcn/ui primitives for consistent UI.
 * - Pattern: Props-driven, no internal state; parent manages data.
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

export interface Match {
  id: string;
  title: string;
  startTime: string;
  format: string;
  totalSlots: number;
  availableSlots: number;
  club: {
    name: string;
    zone: string | null;
  } | null;
}

interface MatchCardProps {
  match: Match;
  onJoin?: (matchId: string) => void;
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
 * Get format display name
 */
function formatDisplay(format: string): string {
  const formats: Record<string, string> = {
    'futbol-5': 'Fútbol 5',
    'futbol-7': 'Fútbol 7',
    'futbol-11': 'Fútbol 11',
  };
  return formats[format] || format;
}

export function MatchCard({ match, onJoin }: MatchCardProps) {
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
            onClick={() => onJoin?.(match.id)}
          >
            {isFull ? 'Completo' : 'Sumarme'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
