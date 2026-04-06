import type { AuthAddress, AuthUser } from '../types.js'
import { db } from '../config/database.js'

const normalizeEmail = (value: string) => value.trim().toLowerCase()

interface AuthUserRow {
  id: string
  name: string
  email: string
  role: 'player' | 'club'
  password: string
  active: boolean
  phone: string | null
  address: AuthAddress | null
  servicesOffered: unknown
}

const USERS_COLUMNS =
  '"id", "name", "email", "role", "password", "active", "phone", "address", "servicesOffered"'

const mapUserRow = (row: AuthUserRow): AuthUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  password: row.password,
  active: row.active,
  phone: row.phone,
  address: row.address,
  servicesOffered: Array.isArray(row.servicesOffered) ? row.servicesOffered.filter((item): item is string => typeof item === 'string') : [],
})

export const authRepository = {
  async findByEmail(email: string) {
    const normalized = normalizeEmail(email)
    const { rows } = await db.query<AuthUserRow>(
      `SELECT ${USERS_COLUMNS} FROM "users" WHERE "email" = $1 LIMIT 1`,
      [normalized]
    )
    const row = rows[0]
    return row ? mapUserRow(row) : null
  },

  async findById(id: string) {
    const { rows } = await db.query<AuthUserRow>(
      `SELECT ${USERS_COLUMNS} FROM "users" WHERE "id" = $1 LIMIT 1`,
      [id]
    )
    const row = rows[0]
    return row ? mapUserRow(row) : null
  },

  async create(input: {
    id: string
    name: string
    email: string
    role: 'player' | 'club'
    password: string
    active: boolean
    phone: string | null
    address: AuthAddress | null
    servicesOffered: string[]
  }) {
    const { rows } = await db.query<AuthUserRow>(
      `
        INSERT INTO "users" (
          "id", "name", "email", "role", "password", "active", "phone", "address", "servicesOffered"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
        RETURNING ${USERS_COLUMNS}
      `,
      [
        input.id,
        input.name,
        normalizeEmail(input.email),
        input.role,
        input.password,
        input.active,
        input.phone,
        JSON.stringify(input.address),
        JSON.stringify(input.servicesOffered),
      ]
    )

    return mapUserRow(rows[0])
  },
}
