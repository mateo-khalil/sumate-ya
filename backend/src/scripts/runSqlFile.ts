import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { db } from '../config/database.js'

export const runSqlFile = async (relativePath: string) => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const filePath = path.resolve(currentDir, '../../', relativePath)
  const sql = await readFile(filePath, 'utf-8')
  await db.query(sql)
}
