import { Router } from 'express'
import { join } from 'node:path'
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import { readAllFunds, writeFund, updateFundConfig, entriesToCashInterest } from '@escapemint/storage'
import type { FundData, FundEntry } from '@escapemint/storage'
import type { SubFundConfig } from '@escapemint/engine'
import { badRequest, notFound } from '../middleware/error-handler.js'
import { computeFundFinalMetrics } from '../utils/fund-metrics.js'

export const platformsRouter: ReturnType<typeof Router> = Router()

// Round to 2 decimal places for monetary values
const round2 = (value: number): number => Math.round(value * 100) / 100

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const FUNDS_DIR = join(DATA_DIR, 'funds')
const PLATFORMS_FILE = join(DATA_DIR, 'platforms.json')
const BACKUPS_DIR = join(DATA_DIR, 'backups')

/**
 * Platform configuration stored in JSON.
 * Key is platform id, value is platform config.
 */
interface PlatformConfig {
  name: string
  color?: string
  url?: string
  notes?: string
  /** When true, platform manages a shared cash pool via a {platform}-cash fund */
  manage_cash?: boolean
  /** When true, trades (BUY/SELL/dividends) on trading funds auto-create corresponding entries in the cash fund.
   *  Use this for platforms like Robinhood where cash is shared across all trading within the platform.
   *  Defaults to true for robinhood platform. */
  auto_sync_cash?: boolean
  /** Column order for funds table */
  funds_column_order?: string[]
  /** Visible columns for funds table */
  funds_visible_columns?: string[]
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
 * Get today's date as YYYY-MM-DD
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]!
}

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

/**
 * GET /platforms/:id/metrics - Get aggregate metrics for a platform
 * Uses computeFundFinalMetrics to calculate each fund's metrics once,
 * then aggregates for platform totals.
 */
platformsRouter.get('/:id/metrics', async (req, res, next) => {
  const platformId = req.params['id']?.toLowerCase() ?? ''

  // Load platform config
  const platformsData = await readPlatformsData().catch(() => ({} as PlatformsData))
  const platformConfig = platformsData[platformId]

  // Load all funds and filter by platform
  const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const platformFunds = allFunds.filter(f => f.platform.toLowerCase() === platformId)

  if (platformFunds.length === 0) {
    return next(notFound(`Platform '${platformId}' has no funds`))
  }

  // Build cash interest history
  const interestByDate: Record<string, { balance: number; interest: number }> = {}

  // Aggregate totals
  let totalFundSize = 0
  let totalValue = 0
  let totalCash = 0
  let totalInvested = 0
  let totalDividends = 0
  let totalExpenses = 0
  let totalCashInterest = 0
  let totalRealized = 0
  let totalUnrealized = 0
  let activeFunds = 0
  let closedFunds = 0

  // Fund metrics for the table
  const fundMetricsForTable: Array<{
    id: string
    ticker: string
    fundType: string
    status: string
    fundSize: number
    currentValue: number
    cash: number
    startInput: number
    daysActive: number
    dividends: number
    expenses: number
    cashInterest: number
    unrealized: number
    realized: number
    liquidPnl: number
    realizedAPY: number
    liquidAPY: number
    entries: number
    audited?: string
    // Derivatives-specific fields
    position?: number
    avgEntry?: number
    marginBalance?: number
    cumFunding?: number
    cumRebates?: number
    cumFees?: number
  }> = []

  for (const fund of platformFunds) {
    const isCashFund = fund.config.fund_type === 'cash'
    const isClosed = fund.config.status === 'closed'

    // Compute metrics using shared utility
    const metrics = computeFundFinalMetrics(fund)

    // Track cash interest history by date
    for (const entry of fund.entries) {
      if (entry.cash_interest && entry.cash_interest > 0) {
        if (!interestByDate[entry.date]) {
          interestByDate[entry.date] = { balance: 0, interest: 0 }
        }
        interestByDate[entry.date]!.interest += entry.cash_interest
        interestByDate[entry.date]!.balance += isCashFund ? (entry.value ?? 0) : (entry.cash ?? 0)
      }
    }

    // Aggregate totals (skip closed funds for size/value)
    if (isClosed) {
      closedFunds++
    } else {
      activeFunds++
      totalFundSize += metrics.fundSize
      totalValue += metrics.currentValue
      totalCash += metrics.cash
      totalInvested += metrics.totalInvested
    }
    totalDividends += metrics.cumDividends
    totalExpenses += metrics.cumExpenses
    totalCashInterest += metrics.cumCashInterest
    totalRealized += metrics.realized
    totalUnrealized += metrics.unrealized

    // Build fund metrics for table
    fundMetricsForTable.push({
      id: fund.id,
      ticker: fund.ticker,
      fundType: fund.config.fund_type ?? 'stock',
      status: fund.config.status ?? 'active',
      fundSize: metrics.fundSize,
      currentValue: metrics.currentValue,
      cash: metrics.cash,
      startInput: metrics.totalInvested,
      daysActive: metrics.daysActive,
      dividends: metrics.cumDividends,
      expenses: metrics.cumExpenses,
      cashInterest: metrics.cumCashInterest,
      unrealized: metrics.unrealized,
      realized: metrics.realized,
      liquidPnl: metrics.liquidPnl,
      realizedAPY: metrics.realizedApy,
      liquidAPY: metrics.liquidApy,
      entries: fund.entries.length,
      ...(fund.config.audited && { audited: fund.config.audited }),
      // Derivatives-specific fields
      ...(metrics.position !== undefined && { position: metrics.position }),
      ...(metrics.avgEntry !== undefined && { avgEntry: metrics.avgEntry }),
      ...(metrics.marginBalance !== undefined && { marginBalance: metrics.marginBalance }),
      ...(metrics.cumFunding !== undefined && { cumFunding: metrics.cumFunding }),
      ...(metrics.cumRebates !== undefined && { cumRebates: metrics.cumRebates }),
      ...(metrics.cumFees !== undefined && { cumFees: metrics.cumFees })
    })
  }

  // Calculate aggregate gains and APY
  const totalLiquidPnl = totalRealized + totalUnrealized
  const totalGainPct = totalInvested > 0 ? totalLiquidPnl / totalInvested : 0

  // Sort interest history by date
  const cashInterestHistory = Object.entries(interestByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }))

  res.json({
    platformId,
    platformName: platformConfig?.name ?? platformId,
    totalFundSize,
    totalValue,
    totalCash,
    totalStartInput: totalInvested,
    totalDividends,
    totalExpenses,
    totalCashInterest,
    totalRealized,
    totalUnrealized,
    totalGainUsd: totalLiquidPnl,
    totalGainPct,
    activeFunds,
    closedFunds,
    cashInterestHistory,
    funds: fundMetricsForTable,
    // Table configuration
    fundsColumnOrder: platformConfig?.funds_column_order,
    fundsVisibleColumns: platformConfig?.funds_visible_columns
  })
})

/**
 * PATCH /platforms/:id/config - Update platform configuration
 */
platformsRouter.patch('/:id/config', async (req, res, next) => {
  const platformId = req.params['id']?.toLowerCase() ?? ''
  const updates = req.body as Partial<PlatformConfig>

  const data = await readPlatformsData().catch(() => ({} as PlatformsData))
  let platformConfig = data[platformId]

  if (!platformConfig) {
    // Auto-create if platform has funds
    const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [])
    const platformFunds = allFunds.filter(f => f.platform.toLowerCase() === platformId)
    if (platformFunds.length === 0) {
      return next(notFound(`Platform '${platformId}' not found`))
    }
    platformConfig = { name: platformId.charAt(0).toUpperCase() + platformId.slice(1) }
  }

  // Only allow updating specific fields
  if (updates.funds_column_order !== undefined) {
    platformConfig.funds_column_order = updates.funds_column_order
  }
  if (updates.funds_visible_columns !== undefined) {
    platformConfig.funds_visible_columns = updates.funds_visible_columns
  }
  if (updates.color !== undefined) {
    platformConfig.color = updates.color
  }
  if (updates.url !== undefined) {
    platformConfig.url = updates.url
  }
  if (updates.notes !== undefined) {
    platformConfig.notes = updates.notes
  }
  if (updates.auto_sync_cash !== undefined) {
    platformConfig.auto_sync_cash = updates.auto_sync_cash
  }

  data[platformId] = platformConfig
  await writePlatformsData(data)

  res.json({ success: true, config: platformConfig })
})

/**
 * GET /platforms/:id/cash - Get platform cash status (balance, margin)
 */
platformsRouter.get('/:id/cash', async (req, res, next) => {
  const platformId = req.params['id']?.toLowerCase() ?? ''

  const data = await readPlatformsData().catch(() => ({} as PlatformsData))
  const platformConfig = data[platformId]

  // If platform isn't in platforms.json, check if it exists via funds
  if (!platformConfig) {
    const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [])
    const platformFunds = allFunds.filter(f => f.platform.toLowerCase() === platformId)

    if (platformFunds.length === 0) {
      return next(notFound(`Platform '${platformId}' not found`))
    }

    // Platform exists via funds but has no config - return cash tracking disabled
    return res.json({
      enabled: false,
      cashFundId: null,
      balance: 0,
      marginAvailable: 0,
      marginBorrowed: 0,
      interestEarned: 0,
      autoSyncCash: platformId === 'robinhood'
    })
  }

  // Determine auto_sync_cash (defaults to true for robinhood)
  const autoSyncCash = platformConfig.auto_sync_cash ?? (platformId === 'robinhood')

  // Check if cash tracking is enabled
  if (!platformConfig.manage_cash) {
    return res.json({
      enabled: false,
      cashFundId: null,
      balance: 0,
      marginAvailable: 0,
      marginBorrowed: 0,
      interestEarned: 0,
      autoSyncCash
    })
  }

  // Find the cash fund
  const cashFundId = `${platformId}-cash`
  const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const cashFund = allFunds.find(f => f.id === cashFundId)

  if (!cashFund) {
    // Auto-disable manage_cash if cash fund is missing
    platformConfig.manage_cash = false
    data[platformId] = platformConfig
    await writePlatformsData(data)

    return res.json({
      enabled: false,
      cashFundId: null,
      balance: 0,
      marginAvailable: 0,
      marginBorrowed: 0,
      interestEarned: 0,
      autoSyncCash,
      autoDisabled: true
    })
  }

  // Get latest entry for current state
  const latestCashEntry = cashFund.entries[cashFund.entries.length - 1]
  const balance = latestCashEntry?.value ?? 0
  const marginAvailable = latestCashEntry?.margin_available ?? 0
  const marginBorrowed = latestCashEntry?.margin_borrowed ?? 0

  // Sum up all interest earned
  const interestEarned = entriesToCashInterest(cashFund.entries)

  res.json({
    enabled: true,
    cashFundId,
    balance,
    marginAvailable,
    marginBorrowed,
    interestEarned,
    entriesCount: cashFund.entries.length,
    autoSyncCash
  })
})

/**
 * POST /platforms/:id/enable-cash-tracking - Enable cash tracking and create cash fund
 * This migrates existing fund cash balances into a shared cash pool.
 */
platformsRouter.post('/:id/enable-cash-tracking', async (req, res, next) => {
  const platformId = req.params['id']?.toLowerCase() ?? ''

  const data = await readPlatformsData().catch(() => ({} as PlatformsData))
  let platformConfig = data[platformId]

  // Get all funds for this platform first
  const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const platformFunds = allFunds.filter(f => f.platform.toLowerCase() === platformId)

  // Auto-create platform config if it doesn't exist but has funds
  if (!platformConfig) {
    if (platformFunds.length === 0) {
      return next(notFound(`Platform '${platformId}' not found and has no funds`))
    }
    // Create platform config from existing funds
    platformConfig = {
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1)
    }
    data[platformId] = platformConfig
    await writePlatformsData(data)
  }

  if (platformConfig.manage_cash) {
    return next(badRequest('Cash tracking is already enabled for this platform'))
  }

  // Check if cash fund already exists
  const cashFundId = `${platformId}-cash`
  if (platformFunds.some(f => f.id === cashFundId)) {
    return next(badRequest(`Cash fund '${cashFundId}' already exists`))
  }

  // Create automatic backup before migration
  await mkdir(BACKUPS_DIR, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFilename = `pre-cash-migration-${platformId}-${timestamp}.json`
  const backupPath = join(BACKUPS_DIR, backupFilename)

  const backupData = {
    version: '1.0.0',
    backup_type: 'pre-cash-migration',
    platform: platformId,
    created_at: new Date().toISOString(),
    fund_count: allFunds.length,
    funds: allFunds,
    platforms: data
  }
  await writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf-8')

  // Collect ALL historical cash data from all trading funds
  // Consolidate by date: { date -> { cash, interest, expense, deposit, withdrawal, margin_available, margin_borrowed } }
  const cashByDate = new Map<string, {
    cash: number
    interest: number
    expense: number
    deposit: number
    withdrawal: number
    margin_available: number
    margin_borrowed: number
    sources: string[]
  }>()

  let totalCashInterest = 0
  let totalExpense = 0
  let earliestDate = getTodayDate()

  for (const fund of platformFunds) {
    // Skip if fund doesn't manage cash
    if (fund.config.manage_cash === false) continue

    for (const entry of fund.entries) {
      const existing = cashByDate.get(entry.date) ?? {
        cash: 0, interest: 0, expense: 0, deposit: 0, withdrawal: 0,
        margin_available: 0, margin_borrowed: 0, sources: []
      }

      // Track cash balance (we'll use the latest per date)
      if (entry.cash !== undefined) {
        existing.cash += entry.cash
        existing.sources.push(`${fund.ticker}:cash=${entry.cash}`)
      }

      // Track interest (cash interest earned)
      if (entry.cash_interest) {
        existing.interest += entry.cash_interest
        totalCashInterest += entry.cash_interest
      }

      // Track expense (margin interest cost)
      if (entry.expense) {
        existing.expense += entry.expense
        totalExpense += entry.expense
      }

      // Track deposits/withdrawals from notes or action
      const notes = (entry.notes ?? '').toLowerCase()
      if (entry.action === 'DEPOSIT' || notes.includes('deposit')) {
        existing.deposit += entry.amount ?? 0
      }
      if (entry.action === 'WITHDRAW' || notes.includes('withdraw')) {
        existing.withdrawal += entry.amount ?? 0
      }

      // Track margin (use max across funds for the date)
      existing.margin_available = Math.max(existing.margin_available, entry.margin_available ?? 0)
      existing.margin_borrowed = Math.max(existing.margin_borrowed, entry.margin_borrowed ?? 0)

      cashByDate.set(entry.date, existing)

      // Track earliest date
      if (entry.date < earliestDate) {
        earliestDate = entry.date
      }
    }
  }

  // Get latest totals from most recent entries
  let latestCash = 0
  let latestMarginAvailable = 0
  let latestMarginBorrowed = 0
  for (const fund of platformFunds) {
    if (fund.config.manage_cash === false) continue
    const latestFundEntry = fund.entries[fund.entries.length - 1]
    if (latestFundEntry) {
      latestCash += latestFundEntry.cash ?? 0
      latestMarginAvailable += latestFundEntry.margin_available ?? 0
      latestMarginBorrowed += latestFundEntry.margin_borrowed ?? 0
    }
  }

  // Build cash fund entries from consolidated data
  // IMPORTANT: 'value' represents PRE-ACTION state, so:
  // - First DEPOSIT: value=0 (starting from nothing), action deposits the amount
  // - Subsequent entries: value=running balance BEFORE the action
  const cashEntries: FundEntry[] = []
  const sortedDates = [...cashByDate.keys()].sort()

  // Track running balance - starts at 0, will be final balance after all entries
  let finalCashBalance = 0

  if (sortedDates.length > 0) {
    let runningCash = 0

    for (let i = 0; i < sortedDates.length; i++) {
      const date = sortedDates[i]!
      const dateData = cashByDate.get(date)!

      // Calculate net change for this entry
      const targetCash = dateData.cash
      const cashChange = targetCash - runningCash
      let action: 'DEPOSIT' | 'WITHDRAW' | 'HOLD' | undefined
      let amount: number | undefined

      // Explicit deposits/withdrawals take priority
      if (dateData.deposit > 0) {
        action = 'DEPOSIT'
        amount = dateData.deposit
      } else if (dateData.withdrawal > 0) {
        action = 'WITHDRAW'
        amount = dateData.withdrawal
      } else if (cashChange > 0.01) {
        // Implicit deposit based on balance increase
        action = 'DEPOSIT'
        amount = cashChange
      } else if (cashChange < -0.01) {
        // Implicit withdrawal based on balance decrease
        action = 'WITHDRAW'
        amount = Math.abs(cashChange)
      } else if (dateData.margin_available || dateData.margin_borrowed || dateData.interest || dateData.expense) {
        // No cash change but has margin/interest activity - use HOLD
        action = 'HOLD'
      }

      // Create entry with PRE-ACTION value (runningCash before this entry's changes)
      // Round all monetary values to 2 decimal places
      const entry: FundEntry = {
        date,
        value: round2(runningCash)  // PRE-ACTION: balance before this entry
      }

      if (action) entry.action = action
      if (amount) entry.amount = round2(amount)
      if (dateData.interest) entry.cash_interest = round2(dateData.interest)
      if (dateData.expense) entry.expense = round2(dateData.expense)
      if (dateData.margin_available) entry.margin_available = round2(dateData.margin_available)
      if (dateData.margin_borrowed) entry.margin_borrowed = round2(dateData.margin_borrowed)

      // Notes for first entry or if there are sources
      if (i === 0) {
        entry.notes = `Initial migration from: ${dateData.sources.join(', ')}`
      } else if (dateData.sources.length > 0) {
        entry.notes = `From: ${dateData.sources.join(', ')}`
      }

      cashEntries.push(entry)

      // Update running balance to POST-ACTION state for next iteration
      // Account for action amount plus interest minus expense
      // Round after each operation to prevent floating point accumulation
      if (action === 'DEPOSIT' && amount) {
        runningCash = round2(runningCash + amount)
      } else if (action === 'WITHDRAW' && amount) {
        runningCash = round2(runningCash - amount)
      }
      // Interest adds to balance, expense reduces it
      if (dateData.interest) runningCash = round2(runningCash + dateData.interest)
      if (dateData.expense) runningCash = round2(runningCash - dateData.expense)
    }

    // Store final balance for fund_size_usd
    finalCashBalance = round2(runningCash)
  } else {
    // No historical data, create entry with current state
    // value=0 (pre-action), then DEPOSIT the total
    const entry: FundEntry = {
      date: getTodayDate(),
      value: 0,  // PRE-ACTION: starting from 0
      action: 'DEPOSIT',
      amount: latestCash,
      notes: 'Initial cash pool from migration'
    }
    if (latestMarginAvailable) entry.margin_available = latestMarginAvailable
    if (latestMarginBorrowed) entry.margin_borrowed = latestMarginBorrowed
    cashEntries.push(entry)
    earliestDate = getTodayDate()
    finalCashBalance = latestCash  // Final balance is the deposited amount
  }

  // Create the cash fund config
  // fund_size_usd = 0 for cash funds since balance is computed from DEPOSIT/WITHDRAW entries
  // The UI calculates: fund_size_usd + cumDeposits - cumWithdrawals + cumInterest - cumExpenses
  const cashFundConfig: SubFundConfig = {
    fund_type: 'cash',
    status: 'active',
    fund_size_usd: 0,
    target_apy: 0.04,
    interval_days: 1,
    input_min_usd: 0,
    input_mid_usd: 0,
    input_max_usd: 0,
    max_at_pct: 0,
    min_profit_usd: 0,
    cash_apy: 0.04,
    margin_apr: 0,
    margin_access_usd: latestMarginAvailable,
    accumulate: true,
    manage_cash: true,
    start_date: earliestDate
  }

  const cashFundData: FundData = {
    id: cashFundId,
    platform: platformId,
    ticker: 'cash',
    config: cashFundConfig,
    entries: cashEntries
  }

  // Write the cash fund
  const cashFundPath = join(FUNDS_DIR, `${cashFundId}.tsv`)
  await writeFund(cashFundPath, cashFundData)

  // Update each trading fund to disable individual cash/margin management and clear from entries
  // (Skip the cash fund we just created)
  for (const fund of platformFunds) {
    if (fund.id === cashFundId) continue
    const fundPath = join(FUNDS_DIR, `${fund.id}.tsv`)
    // Clear cash, margin, interest and expense from all entries (now tracked in cash fund)
    const clearedEntries = fund.entries.map(entry => {
      const { cash: _cash, margin_available: _margin_available, margin_borrowed: _margin_borrowed, cash_interest: _cash_interest, expense: _expense, ...rest } = entry
      return rest
    })
    // Write fund with cleared entries and updated config
    await writeFund(fundPath, {
      ...fund,
      config: { ...fund.config, manage_cash: false, margin_access_usd: 0 },
      entries: clearedEntries
    })
  }

  // Update platform config
  platformConfig.manage_cash = true
  data[platformId] = platformConfig
  await writePlatformsData(data)

  res.status(201).json({
    success: true,
    cashFundId,
    migratedCash: finalCashBalance,
    migratedCashInterest: totalCashInterest,
    migratedExpense: totalExpense,
    migratedMarginAvailable: latestMarginAvailable,
    migratedMarginBorrowed: latestMarginBorrowed,
    fundsUpdated: platformFunds.length,
    entriesCreated: cashEntries.length,
    backupFile: backupFilename
  })
})

/**
 * POST /platforms/:id/disable-cash-tracking - Disable cash tracking
 * Optionally accepts target_fund_id to restore cash/margin tracking into.
 * If no target specified, just disables tracking without restoring data.
 * Deletes the cash fund after migration.
 */
platformsRouter.post('/:id/disable-cash-tracking', async (req, res, next) => {
  const platformId = req.params['id']?.toLowerCase() ?? ''
  const { target_fund_id } = req.body as { target_fund_id?: string }

  const data = await readPlatformsData().catch(() => ({} as PlatformsData))
  const platformConfig = data[platformId]

  if (!platformConfig) {
    return next(notFound(`Platform '${platformId}' not found`))
  }

  if (!platformConfig.manage_cash) {
    return next(badRequest('Cash tracking is not enabled for this platform'))
  }

  // Get all funds for this platform
  const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const platformFunds = allFunds.filter(f => f.platform.toLowerCase() === platformId)

  // Find the cash fund (may not exist if manually deleted)
  const cashFundId = `${platformId}-cash`
  const cashFund = platformFunds.find(f => f.id === cashFundId)

  // Get trading funds (excluding cash fund)
  const tradingFunds = platformFunds.filter(f => f.id !== cashFundId && f.config.fund_type !== 'cash')

  // Get current cash/margin from cash fund if it exists
  const latestCashEntry = cashFund?.entries[cashFund.entries.length - 1]
  const currentCash = latestCashEntry?.value ?? 0
  const marginAvailable = latestCashEntry?.margin_available ?? 0
  const marginBorrowed = latestCashEntry?.margin_borrowed ?? 0

  // Re-enable individual cash management for each trading fund
  for (const fund of tradingFunds) {
    const fundPath = join(FUNDS_DIR, `${fund.id}.tsv`)
    await updateFundConfig(fundPath, { manage_cash: true })
  }

  // If target fund specified, restore cash/margin history to it
  let restoredTo: string | null = null
  if (target_fund_id) {
    const targetFund = platformFunds.find(f => f.id === target_fund_id)
    if (!targetFund) {
      return next(notFound(`Target fund '${target_fund_id}' not found`))
    }
    if (targetFund.config.fund_type === 'cash') {
      return next(badRequest('Cannot restore into a cash fund'))
    }

    const targetFundPath = join(FUNDS_DIR, `${targetFund.id}.tsv`)

    // Build a map of cash fund entries by date for merging historical data
    const cashDataByDate = new Map<string, { cash?: number; margin_available?: number; margin_borrowed?: number; cash_interest?: number; expense?: number }>()
    if (cashFund) {
      // Track running balance to convert pre-action values to post-action
      let runningBalance = 0
      for (const entry of cashFund.entries) {
        // Calculate post-action balance
        let postBalance = entry.value
        if (entry.action === 'DEPOSIT' && entry.amount) postBalance += entry.amount
        if (entry.action === 'WITHDRAW' && entry.amount) postBalance -= entry.amount
        runningBalance = postBalance

        const dateData: { cash: number; margin_available?: number; margin_borrowed?: number; cash_interest?: number; expense?: number } = {
          cash: runningBalance
        }
        if (entry.margin_available !== undefined) dateData.margin_available = entry.margin_available
        if (entry.margin_borrowed !== undefined) dateData.margin_borrowed = entry.margin_borrowed
        if (entry.cash_interest !== undefined) dateData.cash_interest = entry.cash_interest
        if (entry.expense !== undefined) dateData.expense = entry.expense
        cashDataByDate.set(entry.date, dateData)
      }
    }

    // Merge cash fund data into target fund entries by date
    const updatedEntries = targetFund.entries.map(entry => {
      const cashData = cashDataByDate.get(entry.date)
      if (cashData) {
        const updated: FundEntry = { ...entry }
        if (cashData.cash !== undefined) updated.cash = cashData.cash
        if (cashData.margin_available !== undefined) updated.margin_available = cashData.margin_available
        if (cashData.margin_borrowed !== undefined) updated.margin_borrowed = cashData.margin_borrowed
        if (cashData.cash_interest !== undefined) updated.cash_interest = cashData.cash_interest
        if (cashData.expense !== undefined) updated.expense = cashData.expense
        return updated
      }
      return entry
    })

    // Also ensure latest entry has current values even if dates don't match
    if (updatedEntries.length > 0) {
      const lastIdx = updatedEntries.length - 1
      const lastEntry = updatedEntries[lastIdx]!
      updatedEntries[lastIdx] = {
        ...lastEntry,
        cash: lastEntry.cash ?? currentCash,
        margin_available: lastEntry.margin_available ?? marginAvailable,
        margin_borrowed: lastEntry.margin_borrowed ?? marginBorrowed
      }
    }

    await writeFund(targetFundPath, {
      ...targetFund,
      config: { ...targetFund.config, manage_cash: true, margin_access_usd: marginAvailable },
      entries: updatedEntries
    })
    restoredTo = target_fund_id
  }

  // Delete the cash fund if it exists
  if (cashFund) {
    const cashFundPath = join(FUNDS_DIR, `${cashFundId}.tsv`)
    const cashConfigPath = cashFundPath.replace(/\.tsv$/, '.json')
    await unlink(cashFundPath).catch(() => {})
    await unlink(cashConfigPath).catch(() => {})
  }

  // Update platform config
  platformConfig.manage_cash = false
  data[platformId] = platformConfig
  await writePlatformsData(data)

  res.json({
    success: true,
    cashFundDeleted: cashFund ? cashFundId : null,
    restoredTo,
    restoredCash: restoredTo ? currentCash : 0,
    restoredMarginAvailable: restoredTo ? marginAvailable : 0,
    restoredMarginBorrowed: restoredTo ? marginBorrowed : 0,
    fundsUpdated: tradingFunds.length
  })
})
