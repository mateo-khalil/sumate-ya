import { Router } from 'express'
import { clubController } from '../controllers/clubController.js'

export const clubRoutes = Router()

clubRoutes.get('/', clubController.list)

clubRoutes.get('/:clubId/slots', clubController.listSlots)
