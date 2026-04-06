import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { authRepository } from '../repositories/authRepository.js'
import type { AuthTokenPayload } from '../types.js'

const jwtSecret = process.env.JWT_SECRET ?? 'sumate-ya-secret-change-me'

const extractBearerToken = (authHeader: string | undefined) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.split(' ')[1]
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: 'player' | 'club'
      }
    }
  }
}

export const protectRoute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(req.headers.authorization)

    if (!token) {
      return res.status(401).json({ success: false, mensaje: 'No autorizado. Token no proporcionado.' })
    }

    const decoded = jwt.verify(token, jwtSecret) as AuthTokenPayload
    const user = await authRepository.findById(decoded.id)

    if (!user || !user.active) {
      return res.status(401).json({ success: false, mensaje: 'Usuario no válido' })
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    }

    return next()
  } catch {
    return res.status(401).json({ success: false, mensaje: 'Token inválido o expirado' })
  }
}

export const requireRoles = (...roles: Array<'player' | 'club'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, mensaje: 'No tienes permisos para esta operación' })
    }
    return next()
  }
}
