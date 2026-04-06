import { clubRepository } from '../repositories/clubRepository.js'
import { matchRepository } from '../repositories/matchRepository.js'
import type { CreateMatchInput, JoinMatchInput, LeaveMatchInput, Match, SelectTeamInput, TeamOption } from '../types.js'

const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`

const parseHour = (slot: string) => new Date(slot).getUTCHours()

const isValidFormat = (format: number) => [5, 7, 10, 11].includes(format)

const teamMaxSize = (match: Match) => Math.ceil(match.capacity / 2)

const teamCount = (participants: Match['participants'], team: TeamOption) => participants.filter((item) => item.team === team).length

export const matchService = {
  async create(input: CreateMatchInput): Promise<Match> {
    if (!isValidFormat(input.format)) {
      throw new Error('Formato inválido. Usá 5, 7, 10 u 11.')
    }
    if (input.capacity < input.format) {
      throw new Error('La cantidad de cupos debe ser mayor o igual al formato.')
    }

    const club = await clubRepository.findById(input.clubId)
    if (!club) {
      throw new Error('No hay clubes disponibles en la zona seleccionada.')
    }

    if (!club.availableSlots.includes(input.slot)) {
      throw new Error('No hay horarios disponibles en el club seleccionado.')
    }

    const newMatch: Match = {
      id: generateId('match'),
      organizerId: input.organizerId,
      organizerName: input.organizerName,
      clubId: club.id,
      clubName: club.name,
      zone: club.zone,
      slot: input.slot,
      format: input.format,
      capacity: input.capacity,
      invitedPlayerIds: input.invitedPlayerIds ?? [],
      participants: [
        {
          playerId: input.organizerId,
          name: input.organizerName,
          team: null,
        },
      ],
      requiresTeamSelection: input.format >= 7,
      createdAt: new Date().toISOString(),
    }

    return matchRepository.create(newMatch)
  },

  async list(filters: { zone?: string; format?: string; hour?: string }) {
    const matches = await matchRepository.findAll()
    return matches.filter((match) => {
      const zoneOk = filters.zone ? match.zone.toLowerCase() === filters.zone.toLowerCase() : true
      const formatOk = filters.format ? String(match.format) === filters.format : true
      const hourOk = filters.hour ? String(parseHour(match.slot)) === filters.hour : true
      return zoneOk && formatOk && hourOk
    })
  },

  async getById(id: string) {
    return matchRepository.findById(id)
  },

  async join(matchId: string, input: JoinMatchInput) {
    const match = await matchRepository.findById(matchId)
    if (!match) {
      throw new Error('Partido no encontrado.')
    }
    if (match.participants.some((item) => item.playerId === input.playerId)) {
      throw new Error('Ya estás inscripto en este partido.')
    }
    if (match.participants.length >= match.capacity) {
      throw new Error('El partido está completo.')
    }

    if (match.requiresTeamSelection && input.team) {
      if (teamCount(match.participants, input.team) >= teamMaxSize(match)) {
        throw new Error('El equipo seleccionado está completo.')
      }
    }

    const newParticipant = {
      playerId: input.playerId,
      name: input.name,
      team: match.requiresTeamSelection ? (input.team ?? null) : null,
    }

    await matchRepository.addParticipant(matchId, newParticipant)

    match.participants.push(newParticipant)

    return {
      message: 'Te sumaste al partido correctamente.',
      match,
      notifyOrganizer: true,
    }
  },

  async selectTeam(matchId: string, input: SelectTeamInput) {
    const match = await matchRepository.findById(matchId)
    if (!match) {
      throw new Error('Partido no encontrado.')
    }
    if (!match.requiresTeamSelection) {
      throw new Error('Este formato no requiere selección de equipo.')
    }

    const participant = match.participants.find((item) => item.playerId === input.playerId)
    if (!participant) {
      throw new Error('No estás inscripto en este partido.')
    }

    const currentTeamCount = teamCount(match.participants, input.team)
    const maxSize = teamMaxSize(match)

    if (participant.team !== input.team && currentTeamCount >= maxSize) {
      throw new Error('El equipo seleccionado está completo.')
    }

    await matchRepository.updateParticipantTeam(matchId, input.playerId, input.team)
    participant.team = input.team

    return {
      message: 'Equipo actualizado correctamente.',
      match,
    }
  },

  async leave(matchId: string, input: LeaveMatchInput) {
    const match = await matchRepository.findById(matchId)
    if (!match) {
      throw new Error('Partido no encontrado.')
    }

    const participantIndex = match.participants.findIndex((item) => item.playerId === input.playerId)
    if (participantIndex === -1) {
      throw new Error('No estás inscripto en este partido.')
    }

    const now = new Date(input.now)
    const start = new Date(match.slot)
    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60)
    const lateWarning = diffMinutes <= 60

    await matchRepository.removeParticipant(matchId, input.playerId)
    match.participants.splice(participantIndex, 1)

    return {
      message: lateWarning ? 'Saliste del partido. Advertencia: salida tardía.' : 'Saliste del partido correctamente.',
      match,
      lateWarning,
      notifyOrganizer: true,
    }
  },
}
