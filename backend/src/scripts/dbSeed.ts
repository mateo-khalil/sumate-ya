import 'dotenv/config'
import { db } from '../config/database.js'
import { runSqlFile } from './runSqlFile.js'

const run = async () => {
  try {
    await runSqlFile('db/seed.sql')
    console.log('Seed db/seed.sql applied successfully')
  } finally {
    await db.end()
  }
}

run().catch((error) => {
  console.error('Seed failed', error)
  process.exit(1)
})
