import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDatabaseConnection } from './config/database.js'
import { authRoutes } from './routes/authRoutes.js'
import { clubRoutes } from './routes/clubRoutes.js'
import { matchRoutes } from './routes/matchRoutes.js'
import { tournamentRoutes } from './routes/tournamentRoutes.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sumate-ya-backend' })
})

app.use('/api/auth', authRoutes)
app.use('/api/clubs', clubRoutes)
app.use('/api/matches', matchRoutes)
app.use('/api/tournaments', tournamentRoutes)

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const frontendPath = path.resolve(currentDir, '../../frontend')

app.use(express.static(frontendPath))

app.use((_req, res) => {
  res.sendFile(path.resolve(frontendPath, 'index.html'))
})

const start = async () => {
  await ensureDatabaseConnection()

  app.listen(port, () => {
    console.log(`Sumate Ya backend listening on http://localhost:${port}`)
  })
}

start().catch((error) => {
  console.error('Failed to start backend', error)
  process.exit(1)
})
