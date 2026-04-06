import { clubRepository } from '../repositories/clubRepository.js'
import { tournamentRepository } from '../repositories/tournamentRepository.js'
import type { CreateTournamentInput, Tournament } from '../types.js'

const formatSuggestedPlayers: Record<number, number> = {
  5: 5,
  7: 7,
  10: 10,
  11: 11,
}

const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`

export const tournamentService = {
  async list(): Promise<Tournament[]> {
    return tournamentRepository.findAll()
  },

  async create(input: CreateTournamentInput): Promise<Tournament> {
    if (input.teamCount < 2) {
      throw new Error('La cantidad mínima de equipos es 2.')
    }

    const suggestedPlayers = formatSuggestedPlayers[input.format]
    if (!suggestedPlayers) {
      throw new Error('Formato inválido. Usá 5, 7, 10 u 11.')
    }

    if (input.playersPerTeam <= 0) {
      throw new Error('La cantidad de jugadores por equipo debe ser mayor a 0.')
    }

    const club = await clubRepository.findById(input.clubId)
    if (!club) {
      throw new Error('Club no encontrado para el torneo.')
    }

    const hasInvalidSlot = input.scheduleSlots.some((slot) => !club.availableSlots.includes(slot))
    if (hasInvalidSlot) {
      throw new Error('No hay disponibilidad del club para todas las jornadas elegidas.')
    }

    const tournament: Tournament = {
      id: generateId('tournament'),
      organizerId: input.organizerId,
      name: input.name,
      format: input.format,
      teamCount: input.teamCount,
      playersPerTeam: input.playersPerTeam,
      clubId: club.id,
      clubName: club.name,
      scheduleSlots: input.scheduleSlots,
      createdAt: new Date().toISOString(),
    }

    return tournamentRepository.create(tournament)
  },

  suggestionForFormat(format: number) {
    return formatSuggestedPlayers[format]
  },
}
