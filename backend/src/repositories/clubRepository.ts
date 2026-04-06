import { db } from '../config/database.js'

export const clubRepository = {
  async findAll() {
    const CLUB_COLUMNS = 'c."id", c."name", c."zone"'
    const { rows } = await db.query<{
      id: string
      name: string
      zone: string
      availableSlots: Date[]
    }>(
      `
        SELECT
          ${CLUB_COLUMNS},
          COALESCE(array_agg(cs."slot" ORDER BY cs."slot") FILTER (WHERE cs."slot" IS NOT NULL), '{}') AS "availableSlots"
        FROM "clubs" c
        LEFT JOIN "clubSlots" cs ON cs."clubId" = c."id"
        GROUP BY c."id", c."name", c."zone"
        ORDER BY c."name"
      `
    )

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      zone: row.zone,
      availableSlots: row.availableSlots.map((slot) => new Date(slot).toISOString()),
    }))
  },

  async findById(clubId: string) {
    const { rows } = await db.query<{
      id: string
      name: string
      zone: string
      availableSlots: Date[]
    }>(
      `
        SELECT
          c."id",
          c."name",
          c."zone",
          COALESCE(array_agg(cs."slot" ORDER BY cs."slot") FILTER (WHERE cs."slot" IS NOT NULL), '{}') AS "availableSlots"
        FROM "clubs" c
        LEFT JOIN "clubSlots" cs ON cs."clubId" = c."id"
        WHERE c."id" = $1
        GROUP BY c."id", c."name", c."zone"
      `,
      [clubId]
    )

    const row = rows[0]
    if (!row) {
      return null
    }

    return {
      id: row.id,
      name: row.name,
      zone: row.zone,
      availableSlots: row.availableSlots.map((slot) => new Date(slot).toISOString()),
    }
  },
}
