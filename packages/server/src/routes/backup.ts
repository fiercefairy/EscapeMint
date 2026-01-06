import { Router } from 'express'
import { createBackup, listBackups, getDefaultBackupDir, restoreBackup, readBackup } from '@escapemint/storage'

export const backupRouter: ReturnType<typeof Router> = Router()

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const BACKUP_DIR = process.env['BACKUP_DIR'] ?? getDefaultBackupDir()

/**
 * GET /backup - Get backup configuration and list of existing backups
 */
backupRouter.get('/', async (_req, res) => {
  const backups = await listBackups(BACKUP_DIR)

  res.json({
    backup_dir: BACKUP_DIR,
    backups
  })
})

/**
 * POST /backup - Create a new backup
 */
backupRouter.post('/', async (_req, res) => {
  const result = await createBackup(DATA_DIR, BACKUP_DIR)

  if (result.success) {
    res.json({
      success: true,
      message: `Backup created successfully`,
      path: result.path,
      backup_date: result.backup_date,
      fund_count: result.fund_count
    })
  } else {
    res.status(500).json({
      success: false,
      error: result.error ?? 'Unknown error creating backup'
    })
  }
})

/**
 * GET /backup/config - Get backup configuration
 */
backupRouter.get('/config', (_req, res) => {
  res.json({
    data_dir: DATA_DIR,
    backup_dir: BACKUP_DIR,
    is_icloud: BACKUP_DIR.includes('Mobile Documents/com~apple~CloudDocs')
  })
})

/**
 * GET /backup/:filename - Get backup details
 */
backupRouter.get('/:filename', async (req, res) => {
  const { filename } = req.params
  const backup = await readBackup(BACKUP_DIR, filename)

  if (!backup) {
    res.status(404).json({
      success: false,
      error: 'Backup not found'
    })
    return
  }

  res.json({
    success: true,
    backup_date: backup.backup_date,
    fund_count: backup.funds.length,
    has_platforms: !!backup.platforms,
    has_totals_snapshot: !!backup.totals_snapshot,
    scrape_archive_count: Object.keys(backup.scrape_archives).length
  })
})

/**
 * POST /backup/restore/:filename - Restore a backup
 */
backupRouter.post('/restore/:filename', async (req, res) => {
  const { filename } = req.params
  const result = await restoreBackup(BACKUP_DIR, filename, DATA_DIR)

  if (result.success) {
    res.json({
      success: true,
      message: `Backup restored successfully`,
      backup_date: result.backup_date,
      fund_count: result.fund_count
    })
  } else {
    res.status(500).json({
      success: false,
      error: result.error ?? 'Unknown error restoring backup'
    })
  }
})
