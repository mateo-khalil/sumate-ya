export type MatchFormat = 5 | 7 | 10 | 11
export type TeamOption = 'A' | 'B'

export interface Club {
  id: string
  name: string
  zone: string
  availableSlots: string[]
}

export interface MatchParticipant {
  playerId: string
  name: string
  team: TeamOption | null
}

export interface Match {
  id: string
  organizerId: string
  organizerName: string
  clubId: string
  clubName: string
  zone: string
  slot: string
  format: MatchFormat
  capacity: number
  invitedPlayerIds: string[]
  participants: MatchParticipant[]
  requiresTeamSelection: boolean
  createdAt: string
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

export interface CreateMatchInput {
  organizerId: string
  organizerName: string
  clubId: string
  slot: string
  format: MatchFormat
  capacity: number
  invitedPlayerIds?: string[]
}

export interface JoinMatchInput {
  playerId: string
  name: string
  team?: TeamOption
}

export interface SelectTeamInput {
  playerId: string
  team: TeamOption
}

export interface LeaveMatchInput {
  playerId: string
  now: string
}

export interface CreateTournamentInput {
  organizerId: string
  name: string
  format: MatchFormat
  teamCount: number
  playersPerTeam: number
  clubId: string
  scheduleSlots: string[]
}

export type AuthRole = 'player' | 'club'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: AuthRole
  password: string
  active: boolean
  phone: string | null
  address: AuthAddress | null
  servicesOffered: string[]
}

export interface AuthAddress {
  street: string
  doorNumber: string
  apartment: string
  city: string
  department: string
  zipCode: string
}

export interface LoginInput {
  email: string
  password: string
  role: AuthRole
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  role: AuthRole
  phone?: string
  address?: AuthAddress
  servicesOffered?: string[]
}

export interface AuthTokenPayload {
  id: string
  email: string
  role: AuthRole
}
