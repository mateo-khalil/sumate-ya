import { Router } from 'express'
import { authController } from '../controllers/authController.js'
import { protectRoute } from '../middleware/authMiddleware.js'

export const authRoutes = Router()

authRoutes.post('/register', authController.register)
authRoutes.post('/login', authController.login)
authRoutes.get('/verificar', protectRoute, authController.verify)
