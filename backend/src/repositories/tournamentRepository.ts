import type { Tournament } from '../types.js'
import { db } from '../config/database.js'

export const tournamentRepository = {
  async create(tournament: Tournament) {
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
          INSERT INTO "tournaments" (
            "id", "organizerId", "name", "format", "teamCount", "playersPerTeam", "clubId", "clubName", "createdAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          tournament.id,
          tournament.organizerId,
          tournament.name,
          tournament.format,
          tournament.teamCount,
          tournament.playersPerTeam,
          tournament.clubId,
          tournament.clubName,
          tournament.createdAt,
        ]
      )

      for (const slot of tournament.scheduleSlots) {
        await client.query(
          `
            INSERT INTO "tournamentSlots" ("tournamentId", "slot")
            VALUES ($1, $2)
          `,
          [tournament.id, slot]
        )
      }

      await client.query('COMMIT')
      return tournament
    } catch (error) {
      await client.query('ROLLBACK')
      const message = error instanceof Error ? error.message : 'Error al crear torneo'
      throw new Error(message)
    } finally {
      client.release()
    }
  },

  async findAll() {
    const { rows } = await db.query<{
      id: string
      organizerId: string
      name: string
      format: number
      teamCount: number
      playersPerTeam: number
      clubId: string
      clubName: string
      createdAt: Date
    }>(
      `
        SELECT
          "id", "organizerId", "name", "format", "teamCount",
          "playersPerTeam", "clubId", "clubName", "createdAt"
        FROM "tournaments"
        ORDER BY "createdAt" DESC
      `
    )

    const result: Tournament[] = []
    for (const row of rows) {
      const { rows: slotRows } = await db.query<{ slot: Date }>(
        `
          SELECT "slot"
          FROM "tournamentSlots"
          WHERE "tournamentId" = $1
          ORDER BY "slot"
        `,
        [row.id]
      )

      result.push({
        id: row.id,
        organizerId: row.organizerId,
        name: row.name,
        format: row.format as Tournament['format'],
        teamCount: row.teamCount,
        playersPerTeam: row.playersPerTeam,
        clubId: row.clubId,
        clubName: row.clubName,
        scheduleSlots: slotRows.map((slotRow) => new Date(slotRow.slot).toISOString()),
        createdAt: new Date(row.createdAt).toISOString(),
      })
    }

    return result
  },
}
