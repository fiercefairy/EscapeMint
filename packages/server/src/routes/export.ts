import { Router } from 'express'
import { join } from 'node:path'
import { readdir, readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { readAllFunds, writeFund, type FundData } from '@escapemint/storage'

export const exportRouter = Router()

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const FUNDS_DIR = join(DATA_DIR, 'funds')

/**
 * GET /export - Export all fund data as JSON
 */
exportRouter.get('/', async (_req, res, next) => {
  const funds = await readAllFunds(FUNDS_DIR).catch(next)
  if (!funds) return

  // Also include totals snapshot if it exists
  let totalsSnapshot = null
  const totalsPath = join(DATA_DIR, 'totals-snapshot.json')
  if (existsSync(totalsPath)) {
    const content = await readFile(totalsPath, 'utf-8').catch(() => null)
    if (content) {
      totalsSnapshot = JSON.parse(content)
    }
  }

  res.json({
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    fund_count: funds.length,
    funds,
    totals_snapshot: totalsSnapshot
  })
})

/**
 * GET /export/download - Export as downloadable JSON file
 */
exportRouter.get('/download', async (_req, res, next) => {
  const funds = await readAllFunds(FUNDS_DIR).catch(next)
  if (!funds) return

  const exportData = {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    fund_count: funds.length,
    funds
  }

  const filename = `escapemint-export-${new Date().toISOString().split('T')[0]}.json`
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Type', 'application/json')
  res.json(exportData)
})

/**
 * POST /export/import - Import fund data from JSON
 */
exportRouter.post('/import', async (req, res) => {
  const { funds, mode = 'merge' } = req.body as {
    funds: FundData[]
    mode?: 'merge' | 'replace'
  }

  if (!funds || !Array.isArray(funds)) {
    return res.status(400).json({ error: { message: 'funds array is required' } })
  }

  // Ensure funds directory exists
  await mkdir(FUNDS_DIR, { recursive: true }).catch(() => {})

  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[]
  }

  for (const fund of funds) {
    const filePath = join(FUNDS_DIR, `${fund.id}.tsv`)
    const exists = existsSync(filePath)

    if (mode === 'merge' && exists) {
      results.skipped++
      continue
    }

    const result = await writeFund(filePath, fund).catch((e: Error) => {
      results.errors.push(`${fund.id}: ${e.message}`)
      return null
    })

    if (result !== null) {
      results.imported++
    }
  }

  res.json({
    success: true,
    results
  })
})

/**
 * GET /export/tsv-files - List all TSV files
 */
exportRouter.get('/tsv-files', async (_req, res) => {
  const files = await readdir(FUNDS_DIR).catch(() => [])
  const tsvFiles = files.filter(f => f.endsWith('.tsv'))

  res.json({
    count: tsvFiles.length,
    files: tsvFiles
  })
})
