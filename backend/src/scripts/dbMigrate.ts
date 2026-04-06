import 'dotenv/config'
import { db } from '../config/database.js'
import { runSqlFile } from './runSqlFile.js'

const run = async () => {
  try {
    await runSqlFile('db/migrations/001_init.sql')
    await runSqlFile('db/migrations/002_auth_profile.sql')
    console.log('Migrations applied successfully')
  } finally {
    await db.end()
  }
}

run().catch((error) => {
  console.error('Migration failed', error)
  process.exit(1)
})
