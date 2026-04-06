import type { Match } from '../types.js'
import { db } from '../config/database.js'

interface MatchRow {
  id: string
  organizerId: string
  organizerName: string
  clubId: string
  clubName: string
  zone: string
  slot: Date
  format: number
  capacity: number
  invitedPlayerIds: string[]
  requiresTeamSelection: boolean
  createdAt: Date
}

const MATCH_COLUMNS = `
  m."id",
  m."organizerId",
  m."organizerName",
  m."clubId",
  m."clubName",
  m."zone",
  m."slot",
  m."format",
  m."capacity",
  m."invitedPlayerIds",
  m."requiresTeamSelection",
  m."createdAt"
`

const mapRowToMatch = async (row: MatchRow): Promise<Match> => {
  const { rows: participants } = await db.query<{
    playerId: string
    name: string
    team: 'A' | 'B' | null
  }>(
    `
      SELECT "playerId", "name", "team"
      FROM "matchParticipants"
      WHERE "matchId" = $1
      ORDER BY "id"
    `,
    [row.id]
  )

  return {
    id: row.id,
    organizerId: row.organizerId,
    organizerName: row.organizerName,
    clubId: row.clubId,
    clubName: row.clubName,
    zone: row.zone,
    slot: new Date(row.slot).toISOString(),
    format: row.format as Match['format'],
    capacity: row.capacity,
    invitedPlayerIds: row.invitedPlayerIds ?? [],
    participants,
    requiresTeamSelection: row.requiresTeamSelection,
    createdAt: new Date(row.createdAt).toISOString(),
  }
}

export const matchRepository = {
  async create(match: Match) {
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `
          INSERT INTO "matches" (
            "id", "organizerId", "organizerName", "clubId", "clubName", "zone",
            "slot", "format", "capacity", "invitedPlayerIds", "requiresTeamSelection", "createdAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
        `,
        [
          match.id,
          match.organizerId,
          match.organizerName,
          match.clubId,
          match.clubName,
          match.zone,
          match.slot,
          match.format,
          match.capacity,
          JSON.stringify(match.invitedPlayerIds),
          match.requiresTeamSelection,
          match.createdAt,
        ]
      )

      for (const participant of match.participants) {
        await client.query(
          `
            INSERT INTO "matchParticipants" ("matchId", "playerId", "name", "team")
            VALUES ($1, $2, $3, $4)
          `,
          [match.id, participant.playerId, participant.name, participant.team]
        )
      }

      await client.query('COMMIT')
      return match
    } catch (error) {
      await client.query('ROLLBACK')
      const message = error instanceof Error ? error.message : 'Error al crear match'
      throw new Error(message)
    } finally {
      client.release()
    }
  },

  async findAll() {
    const { rows } = await db.query<MatchRow>(
      `
        SELECT ${MATCH_COLUMNS}
        FROM "matches" m
        ORDER BY m."createdAt" DESC
      `
    )

    return Promise.all(rows.map((row) => mapRowToMatch(row)))
  },

  async findById(matchId: string) {
    const { rows } = await db.query<MatchRow>(
      `
        SELECT ${MATCH_COLUMNS}
        FROM "matches" m
        WHERE m."id" = $1
        LIMIT 1
      `,
      [matchId]
    )

    const row = rows[0]
    if (!row) {
      return null
    }

    return mapRowToMatch(row)
  },

  async addParticipant(matchId: string, input: { playerId: string; name: string; team: 'A' | 'B' | null }) {
    await db.query(
      `
        INSERT INTO "matchParticipants" ("matchId", "playerId", "name", "team")
        VALUES ($1, $2, $3, $4)
      `,
      [matchId, input.playerId, input.name, input.team]
    )
  },

  async updateParticipantTeam(matchId: string, playerId: string, team: 'A' | 'B') {
    await db.query(
      `
        UPDATE "matchParticipants"
        SET "team" = $3
        WHERE "matchId" = $1 AND "playerId" = $2
      `,
      [matchId, playerId, team]
    )
  },

  async removeParticipant(matchId: string, playerId: string) {
    await db.query(
      `
        DELETE FROM "matchParticipants"
        WHERE "matchId" = $1 AND "playerId" = $2
      `,
      [matchId, playerId]
    )
  },
}
