import { Router } from 'express'
import { tournamentController } from '../controllers/tournamentController.js'

export const tournamentRoutes = Router()

tournamentRoutes.get('/', tournamentController.list)

tournamentRoutes.post('/', tournamentController.create)

tournamentRoutes.get('/suggestions/:format', tournamentController.suggestionForFormat)
