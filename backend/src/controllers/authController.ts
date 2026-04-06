import type { Request, Response } from 'express'
import { authService } from '../services/authService.js'

const extractBearerToken = (authHeader: string | undefined) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.split(' ')[1]
}

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const user = await authService.register(req.body)
      return res.status(201).json({
        success: true,
        mensaje: user.role === 'club' ? 'Club registrado exitosamente' : 'Jugador registrado exitosamente',
        data: { user },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al registrar usuario'
      return res.status(400).json({
        success: false,
        mensaje: message,
      })
    }
  },

  async login(req: Request, res: Response) {
    try {
      const result = await authService.login(req.body)
      return res.json({
        success: true,
        mensaje: 'Login exitoso',
        data: result,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al iniciar sesión'
      return res.status(401).json({
        success: false,
        mensaje: message,
      })
    }
  },

  async verify(req: Request, res: Response) {
    try {
      const token = extractBearerToken(req.headers.authorization)
      if (!token) {
        return res.status(401).json({
          success: false,
          mensaje: 'Token no proporcionado',
        })
      }

      const user = await authService.verifyToken(token)
      return res.json({
        success: true,
        data: { user },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token inválido o expirado'
      return res.status(401).json({
        success: false,
        mensaje: message,
      })
    }
  },
}
