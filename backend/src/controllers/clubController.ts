import type { Request, Response } from 'express'
import { clubService } from '../services/clubService.js'
import { sendBadRequest } from './http.js'

const getParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

export const clubController = {
  async list(_req: Request, res: Response) {
    return res.json(await clubService.list())
  },

  async listSlots(req: Request, res: Response) {
    try {
      const slots = await clubService.listSlots(getParam(req.params.clubId))
      return res.json(slots)
    } catch (error) {
      return sendBadRequest(res, error, 'No se pudieron obtener horarios')
    }
  },
}
