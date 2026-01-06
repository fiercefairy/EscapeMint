import { Router } from 'express'
import { createBackup, listBackups, getDefaultBackupDir } from '@escapemint/storage'

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
