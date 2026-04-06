import { Router } from 'express'
import { matchController } from '../controllers/matchController.js'

export const matchRoutes = Router()

matchRoutes.get('/', matchController.list)

matchRoutes.get('/:matchId', matchController.getById)

matchRoutes.post('/', matchController.create)

matchRoutes.post('/:matchId/join', matchController.join)

matchRoutes.post('/:matchId/team', matchController.selectTeam)

matchRoutes.post('/:matchId/leave', matchController.leave)
