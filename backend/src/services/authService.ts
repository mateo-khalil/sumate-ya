import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { authRepository } from '../repositories/authRepository.js'
import type { AuthAddress, AuthTokenPayload, LoginInput, RegisterInput } from '../types.js'

const jwtSecret = process.env.JWT_SECRET ?? 'sumate-ya-secret-change-me'
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? '24h') as SignOptions['expiresIn']

const normalizeEmail = (value: string) => value.trim().toLowerCase()
const normalizeText = (value: string) => value.trim()

const validateAddress = (address: AuthAddress | undefined) => {
  if (!address) {
    throw new Error('Completa todos los campos de dirección para club')
  }

  const requiredFields: Array<keyof AuthAddress> = ['street', 'doorNumber', 'city', 'department', 'zipCode']
  for (const field of requiredFields) {
    if (!address[field] || !address[field].trim()) {
      throw new Error('Completa todos los campos de dirección para club')
    }
  }
}

const isValidRole = (role: string): role is LoginInput['role'] => role === 'player' || role === 'club'

export const authService = {
  async register(input: RegisterInput) {
    if (!input.name || !input.email || !input.password || !input.role) {
      throw new Error('Completa los campos obligatorios')
    }

    if (!isValidRole(input.role)) {
      throw new Error('Rol inválido. Debe ser player o club')
    }

    if (input.role === 'player') {
      if (!input.phone || !input.phone.trim()) {
        throw new Error('El teléfono es requerido para jugadores')
      }
    }

    if (input.role === 'club') {
      validateAddress(input.address)
      const services = (input.servicesOffered ?? []).filter((service) => service.trim().length > 0)
      if (services.length === 0) {
        throw new Error('Selecciona al menos un servicio para el club')
      }
    }

    const existingUser = await authRepository.findByEmail(input.email)
    if (existingUser) {
      throw new Error('El email ya está registrado')
    }

    const passwordHash = await bcrypt.hash(input.password, 10)
    const userId = randomUUID()
    const servicesOffered = (input.servicesOffered ?? []).map((item) => item.trim()).filter((item) => item.length > 0)

    const newUser = await authRepository.create({
      id: userId,
      name: normalizeText(input.name),
      email: normalizeEmail(input.email),
      role: input.role,
      password: passwordHash,
      active: true,
      phone: input.role === 'player' ? normalizeText(input.phone ?? '') : null,
      address: input.role === 'club' && input.address
        ? {
            street: normalizeText(input.address.street),
            doorNumber: normalizeText(input.address.doorNumber),
            apartment: normalizeText(input.address.apartment ?? ''),
            city: normalizeText(input.address.city),
            department: normalizeText(input.address.department),
            zipCode: normalizeText(input.address.zipCode),
          }
        : null,
      servicesOffered,
    })

    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      phone: newUser.phone,
      address: newUser.address,
      servicesOffered: newUser.servicesOffered,
    }
  },

  async login(input: LoginInput) {
    if (!input.email || !input.password) {
      throw new Error('Por favor ingresa email y contraseña')
    }

    if (!isValidRole(input.role)) {
      throw new Error('Debes especificar si inicias sesión como jugador o club')
    }

    const user = await authRepository.findByEmail(input.email)
    if (!user) {
      throw new Error('Credenciales inválidas')
    }

    if (user.role !== input.role) {
      throw new Error(
        input.role === 'club'
          ? 'Esta cuenta no es de un club. Inicia sesión como jugador.'
          : 'Esta cuenta es de un club. Inicia sesión como club.'
      )
    }

    if (!user.active) {
      throw new Error('Usuario inactivo')
    }

    const passwordOk = await bcrypt.compare(input.password, user.password)
    if (!passwordOk) {
      throw new Error('Credenciales inválidas')
    }

    const payload: AuthTokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    }

    const token = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn })

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }
  },

  async verifyToken(token: string) {
    const decoded = jwt.verify(token, jwtSecret) as AuthTokenPayload
    const user = await authRepository.findById(decoded.id)
    if (!user || !user.active) {
      throw new Error('Usuario no válido')
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  },
}
