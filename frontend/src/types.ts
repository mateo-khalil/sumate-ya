export type MatchFormat = 5 | 7 | 10 | 11
export type TeamOption = 'A' | 'B'
export type AuthRole = 'player' | 'club'

export interface Club {
  id: string
  name: string
  zone: string
  availableSlots: string[]
}

export interface Participant {
  playerId: string
  name: string
  team: TeamOption | null
}

export interface Match {
  id: string
  organizerId: string
  organizerName: string
  clubName: string
  zone: string
  slot: string
  format: MatchFormat
  capacity: number
  participants: Participant[]
  requiresTeamSelection: boolean
}

export interface Tournament {
  id: string
  organizerId: string
  name: string
  format: MatchFormat
  teamCount: number
  playersPerTeam: number
  clubId: string
  clubName: string
  scheduleSlots: string[]
  createdAt: string
}

export interface SessionUser {
  id: string
  name: string
  email: string
  role: AuthRole
}
