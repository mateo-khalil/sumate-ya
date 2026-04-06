import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

export const db = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.POSTGRES_HOST ?? 'localhost',
        port: Number(process.env.POSTGRES_PORT ?? 5432),
        user: process.env.POSTGRES_USER ?? 'postgres',
        password: process.env.POSTGRES_PASSWORD ?? 'postgres',
        database: process.env.POSTGRES_DB ?? 'sumateya',
      }
)

export const ensureDatabaseConnection = async () => {
  const client = await db.connect()
  try {
    await client.query('SELECT 1')
  } finally {
    client.release()
  }
}
