import type { Club, Match, Tournament } from '../types.js'

export const clubs: Club[] = [
  {
    id: 'club-1',
    name: 'Club Parque Rivera',
    zone: 'Este',
    availableSlots: ['2026-04-10T19:00:00.000Z', '2026-04-10T20:00:00.000Z', '2026-04-11T18:00:00.000Z'],
  },
  {
    id: 'club-2',
    name: 'Club Pocitos Arena',
    zone: 'Sur',
    availableSlots: ['2026-04-10T21:00:00.000Z', '2026-04-11T20:00:00.000Z', '2026-04-12T19:00:00.000Z'],
  },
  {
    id: 'club-3',
    name: 'Complejo Belvedere',
    zone: 'Oeste',
    availableSlots: ['2026-04-11T17:00:00.000Z', '2026-04-12T18:00:00.000Z'],
  },
]

export const players = [
  { id: 'player-1', name: 'Mateo' },
  { id: 'player-2', name: 'Sofía' },
  { id: 'player-3', name: 'Lautaro' },
  { id: 'player-4', name: 'Lucía' },
  { id: 'player-5', name: 'Diego' },
]

export const matches: Match[] = []
export const tournaments: Tournament[] = []
