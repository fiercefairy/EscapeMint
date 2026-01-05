import express from 'express'
import cors from 'cors'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fundsRouter } from './routes/funds.js'
import { computeRouter } from './routes/compute.js'
import { exportRouter } from './routes/export.js'
import { platformsRouter } from './routes/platforms.js'
import { importRouter } from './routes/import.js'
import { errorHandler } from './middleware/error-handler.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app: ReturnType<typeof express> = express()
const PORT = process.env['PORT'] ?? 5551

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// API routes - simplified model
app.use('/api/v1/funds', fundsRouter)
app.use('/api/v1/compute', computeRouter)
app.use('/api/v1/export', exportRouter)
app.use('/api/v1/platforms', platformsRouter)
app.use('/api/v1/import', importRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Version endpoint
app.get('/api/version', async (_req, res) => {
  const pkgPath = join(__dirname, '..', '..', '..', 'package.json')
  const pkgContent = await readFile(pkgPath, 'utf-8')
  const pkg = JSON.parse(pkgContent)
  res.json({ version: pkg.version, name: pkg.name })
})

// Error handling
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`EscapeMint API running on http://localhost:${PORT}`)
})

export { app }
