import { Router } from 'express'
import { join } from 'node:path'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import { readAllFunds } from '@escapemint/storage'
import { badRequest } from '../middleware/error-handler.js'

export const platformsRouter = Router()

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const FUNDS_DIR = join(DATA_DIR, 'funds')
const PLATFORMS_FILE = join(DATA_DIR, 'platforms.json')

/**
 * Platform configuration stored in JSON.
 * Key is platform id, value is platform config.
 */
interface PlatformConfig {
  name: string
  color?: string
  url?: string
  notes?: string
}

interface Platform extends PlatformConfig {
  id: string
}

type PlatformsData = Record<string, PlatformConfig>

/**
 * Read platforms from JSON file
 */
async function readPlatformsData(): Promise<PlatformsData> {
  if (!existsSync(PLATFORMS_FILE)) {
    return {}
  }
  const content = await readFile(PLATFORMS_FILE, 'utf-8')
  return JSON.parse(content) as PlatformsData
}

/**
 * Write platforms to JSON file atomically
 */
async function writePlatformsData(data: PlatformsData): Promise<void> {
  const tempPath = join(DATA_DIR, `.${uuidv4()}.tmp`)
  await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tempPath, PLATFORMS_FILE)
}

/**
 * GET /platforms - List all platforms (from file + derived from funds)
 */
platformsRouter.get('/', async (_req, res) => {
  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const savedData = await readPlatformsData().catch(() => ({} as PlatformsData))

  // Extract unique platforms from funds
  const fundPlatforms = new Set(funds.map(f => f.platform.toLowerCase()))

  // Merge: saved platforms take precedence for display name
  const platformMap = new Map<string, Platform>()

  // Add fund-derived platforms first
  for (const platformId of fundPlatforms) {
    platformMap.set(platformId, {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1)
    })
  }

  // Override with saved platform details
  for (const [id, config] of Object.entries(savedData)) {
    platformMap.set(id, { id, ...config })
  }

  const allPlatforms = Array.from(platformMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  res.json(allPlatforms)
})

/**
 * POST /platforms - Create or update a platform
 */
platformsRouter.post('/', async (req, res, next) => {
  const { id, name, color, url, notes } = req.body as {
    id?: string
    name?: string
    color?: string
    url?: string
    notes?: string
  }

  if (!id) return next(badRequest('id is required'))
  if (!name) return next(badRequest('name is required'))

  const platformId = id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const data = await readPlatformsData().catch(() => ({} as PlatformsData))

  const isUpdate = platformId in data
  const config: PlatformConfig = { name }
  if (color) config.color = color
  if (url) config.url = url
  if (notes) config.notes = notes

  data[platformId] = config
  await writePlatformsData(data)

  res.status(isUpdate ? 200 : 201).json({ id: platformId, ...config })
})

/**
 * DELETE /platforms/:id - Delete a platform (only if no funds use it)
 */
platformsRouter.delete('/:id', async (req, res, next) => {
  const platformId = req.params['id']?.toLowerCase() ?? ''

  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const fundsUsingPlatform = funds.filter(f => f.platform.toLowerCase() === platformId)

  if (fundsUsingPlatform.length > 0) {
    return next(badRequest(`Cannot delete platform: ${fundsUsingPlatform.length} fund(s) still use it`))
  }

  const data = await readPlatformsData().catch(() => ({} as PlatformsData))

  if (!(platformId in data)) {
    return res.status(204).send()
  }

  delete data[platformId]
  await writePlatformsData(data)
  res.status(204).send()
})

/**
 * PUT /platforms/:id/rename - Rename a platform across all funds
 */
platformsRouter.put('/:id/rename', async (req, res, next) => {
  const oldPlatformId = req.params['id']?.toLowerCase() ?? ''
  const { newId, newName } = req.body as { newId?: string; newName?: string }

  if (!newId) return next(badRequest('newId is required'))

  const newPlatformId = newId.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const data = await readPlatformsData().catch(() => ({} as PlatformsData))

  if (oldPlatformId === newPlatformId) {
    // Just updating the display name
    const existing = data[oldPlatformId]
    if (existing) {
      data[oldPlatformId] = { ...existing, name: newName ?? existing.name }
    } else if (newName) {
      // Platform was derived from funds but not saved yet - add it
      data[oldPlatformId] = { name: newName }
    }

    await writePlatformsData(data)
    return res.json({ id: oldPlatformId, name: newName ?? oldPlatformId, renamed: 0 })
  }

  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const fundsToRename = funds.filter(f => f.platform.toLowerCase() === oldPlatformId)

  // Rename each fund file (both TSV and JSON)
  const renamedFunds: string[] = []
  for (const fund of fundsToRename) {
    const oldTsvPath = join(FUNDS_DIR, `${fund.id}.tsv`)
    const oldJsonPath = join(FUNDS_DIR, `${fund.id}.json`)
    const newFundId = `${newPlatformId}-${fund.ticker.toLowerCase()}`
    const newTsvPath = join(FUNDS_DIR, `${newFundId}.tsv`)
    const newJsonPath = join(FUNDS_DIR, `${newFundId}.json`)

    if (existsSync(newTsvPath)) {
      return next(badRequest(`Cannot rename: fund ${newFundId} already exists`))
    }

    await rename(oldTsvPath, newTsvPath)
    if (existsSync(oldJsonPath)) {
      await rename(oldJsonPath, newJsonPath)
    }
    renamedFunds.push(fund.id)
  }

  // Update platforms data
  const oldConfig = data[oldPlatformId]
  const newConfig: PlatformConfig = {
    name: newName ?? newPlatformId.charAt(0).toUpperCase() + newPlatformId.slice(1),
    ...oldConfig
  }
  if (newName) newConfig.name = newName

  delete data[oldPlatformId]
  data[newPlatformId] = newConfig
  await writePlatformsData(data)

  res.json({
    id: newPlatformId,
    name: newConfig.name,
    renamed: renamedFunds.length,
    funds: renamedFunds.map(old => ({
      old,
      new: `${newPlatformId}-${old.split('-').slice(1).join('-')}`
    }))
  })
})
