import type { Request, Response } from 'express'
import { tournamentService } from '../services/tournamentService.js'
import { sendBadRequest } from './http.js'

export const tournamentController = {
  async list(_req: Request, res: Response) {
    try {
      const tournaments = await tournamentService.list()
      return res.json(tournaments)
    } catch (error) {
      return sendBadRequest(res, error, 'No se pudieron cargar los torneos')
    }
  },

  async create(req: Request, res: Response) {
    try {
      const tournament = await tournamentService.create(req.body)
      return res.status(201).json({
        message: 'Torneo creado correctamente.',
        tournament,
        fixtureGenerated: true,
      })
    } catch (error) {
      return sendBadRequest(res, error, 'No se pudo crear el torneo')
    }
  },

  suggestionForFormat(req: Request, res: Response) {
    const suggestion = tournamentService.suggestionForFormat(Number(req.params.format))
    if (!suggestion) {
      return res.status(400).json({ message: 'Formato inválido.' })
    }
    return res.json({ playersPerTeam: suggestion })
  },
}
