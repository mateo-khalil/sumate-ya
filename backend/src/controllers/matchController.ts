import type { Request, Response } from 'express'
import { matchService } from '../services/matchService.js'
import { sendBadRequest, sendNotFound } from './http.js'

const getParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

export const matchController = {
  async list(req: Request, res: Response) {
    const data = await matchService.list({
      zone: typeof req.query.zone === 'string' ? req.query.zone : undefined,
      format: typeof req.query.format === 'string' ? req.query.format : undefined,
      hour: typeof req.query.hour === 'string' ? req.query.hour : undefined,
    })

    return res.json(data)
  },

  async getById(req: Request, res: Response) {
    const match = await matchService.getById(getParam(req.params.matchId))
    if (!match) {
      return sendNotFound(res, 'Partido no encontrado.')
    }
    return res.json(match)
  },

  async create(req: Request, res: Response) {
    try {
      const match = await matchService.create(req.body)
      return res.status(201).json({
        message: 'Partido creado y publicado.',
        match,
        canInvitePlayers: true,
      })
    } catch (error) {
      return sendBadRequest(res, error, 'No se pudo crear el partido')
    }
  },

  async join(req: Request, res: Response) {
    try {
      const result = await matchService.join(getParam(req.params.matchId), req.body)
      return res.json(result)
    } catch (error) {
      return sendBadRequest(res, error, 'No se pudo unir al partido')
    }
  },

  async selectTeam(req: Request, res: Response) {
    try {
      const result = await matchService.selectTeam(getParam(req.params.matchId), req.body)
      return res.json(result)
    } catch (error) {
      return sendBadRequest(res, error, 'No se pudo seleccionar equipo')
    }
  },

  async leave(req: Request, res: Response) {
    try {
      const result = await matchService.leave(getParam(req.params.matchId), req.body)
      return res.json(result)
    } catch (error) {
      return sendBadRequest(res, error, 'No se pudo salir del partido')
    }
  },
}
