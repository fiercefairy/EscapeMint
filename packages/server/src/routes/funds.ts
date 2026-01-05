import { Router } from 'express'
import { join } from 'node:path'
import { rename, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  readFund,
  writeFund,
  readAllFunds,
  appendEntry,
  deleteEntry,
  deleteFund,
  entriesToTrades,
  entriesToDividends,
  entriesToExpenses,
  entriesToCashInterest,
  getLatestEquity,
  type FundData,
  type FundEntry
} from '@escapemint/storage'
import {
  computeFundState,
  computeRecommendation,
  computeFundMetrics,
  computeAggregateMetrics,
  computeClosedFundMetrics
} from '@escapemint/engine'
import { notFound, badRequest } from '../middleware/error-handler.js'

export const fundsRouter: ReturnType<typeof Router> = Router()

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const FUNDS_DIR = join(DATA_DIR, 'funds')
const PLATFORMS_FILE = join(DATA_DIR, 'platforms.json')

interface PlatformConfig {
  name: string
  manage_cash?: boolean
}

async function readPlatformsData(): Promise<Record<string, PlatformConfig>> {
  if (!existsSync(PLATFORMS_FILE)) return {}
  const content = await readFile(PLATFORMS_FILE, 'utf-8')
  return JSON.parse(content) as Record<string, PlatformConfig>
}

async function writePlatformsData(data: Record<string, PlatformConfig>): Promise<void> {
  const { writeFile: fsWriteFile, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await mkdir(dirname(PLATFORMS_FILE), { recursive: true })
  await fsWriteFile(PLATFORMS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * GET /funds - List all funds
 * Query params:
 *   - include_test: 'true' to include test platform funds (default: false)
 */
fundsRouter.get('/', async (req, res, next) => {
  const allFunds = await readAllFunds(FUNDS_DIR).catch(next)
  if (!allFunds) return

  const includeTest = req.query.include_test === 'true'
  const funds = includeTest
    ? allFunds.filter(f => f.platform === 'test')
    : allFunds.filter(f => f.platform !== 'test')

  res.json(funds.map(f => {
    const latest = getLatestEquity(f.entries)
    // For cash funds, use the cash field as the balance
    const isCashFund = f.config.fund_type === 'cash'
    const latestEntry = f.entries[f.entries.length - 1]
    const latestEquity = latest && isCashFund && latestEntry?.cash !== undefined
      ? { date: latest.date, value: latestEntry.cash }
      : latest
    // Get latest fund size from entries (falls back to config if not in entries)
    const latestFundSize = latestEntry?.fund_size ?? f.config.fund_size_usd
    return {
      id: f.id,
      platform: f.platform,
      ticker: f.ticker,
      config: f.config,
      entryCount: f.entries.length,
      latestEquity,
      latestFundSize
    }
  }))
})

/**
 * GET /funds/aggregate - Get aggregate metrics across all funds
 * Query params:
 *   - include_test: 'true' to include test platform funds (default: false)
 */
fundsRouter.get('/aggregate', async (req, res, next) => {
  const allFunds = await readAllFunds(FUNDS_DIR).catch(next)
  if (!allFunds) return

  const includeTest = req.query.include_test === 'true'
  const funds = includeTest
    ? allFunds.filter(f => f.platform === 'test')
    : allFunds.filter(f => f.platform !== 'test')

  const today = new Date().toISOString().split('T')[0] as string
  const fundMetrics = []

  for (const fund of funds) {
    const trades = entriesToTrades(fund.entries)
    const dividends = entriesToDividends(fund.entries)
    const expenses = entriesToExpenses(fund.entries)
    const latest = getLatestEquity(fund.entries)

    // For cash funds, use the cash field as the balance
    const isCashFund = fund.config.fund_type === 'cash'
    const latestEntry = fund.entries[fund.entries.length - 1]
    const latestValue = latest && isCashFund && latestEntry?.cash !== undefined
      ? latestEntry.cash
      : latest?.value

    // Use actual fund_size from latest entry instead of config
    const actualFundSize = latestEntry?.fund_size ?? fund.config.fund_size_usd
    const configWithActualFundSize = { ...fund.config, fund_size_usd: actualFundSize }

    let state = null
    if (latest && latestValue !== undefined) {
      state = computeFundState(
        configWithActualFundSize,
        trades,
        [],
        dividends,
        expenses,
        latestValue,
        latest.date
      )
    }

    const metrics = computeFundMetrics(
      fund.id,
      fund.platform,
      fund.ticker,
      configWithActualFundSize,
      trades,
      state,
      today
    )
    fundMetrics.push(metrics)
  }

  const aggregate = computeAggregateMetrics(fundMetrics)
  res.json(aggregate)
})

/**
 * GET /funds/history - Get historical aggregate metrics for charting
 * Returns time-series data for all funds
 * Query params:
 *   - include_test: 'true' to include test platform funds (default: false)
 */
fundsRouter.get('/history', async (req, res, next) => {
  const allFunds = await readAllFunds(FUNDS_DIR).catch(next)
  if (!allFunds) return

  const includeTest = req.query.include_test === 'true'
  const funds = includeTest
    ? allFunds.filter(f => f.platform === 'test')
    : allFunds.filter(f => f.platform !== 'test')

  // Collect all unique dates across all funds
  const allDates = new Set<string>()
  for (const fund of funds) {
    for (const entry of fund.entries) {
      allDates.add(entry.date)
    }
  }
  const sortedDates = Array.from(allDates).sort()

  // Build time series data
  interface TimeSeriesPoint {
    date: string
    totalFundSize: number
    totalValue: number
    totalCash: number
    totalMarginBorrowed: number
    totalStartInput: number
    totalDividends: number
    totalExpenses: number
    realizedAPY: number
    dpiLiquid: number
    dpiExtracted: number
  }

  const timeSeries: TimeSeriesPoint[] = []

  for (const date of sortedDates) {
    let totalFundSize = 0
    let totalValue = 0
    let totalCash = 0
    let totalMarginBorrowed = 0
    let totalStartInput = 0
    let totalDividends = 0
    let totalExpenses = 0
    let totalMarginAccess = 0

    for (const fund of funds) {
      // Find the latest entry on or before this date
      const entriesUpToDate = fund.entries.filter(e => e.date <= date)
      if (entriesUpToDate.length === 0) continue

      const latestEntry = entriesUpToDate[entriesUpToDate.length - 1]
      if (!latestEntry) continue

      // Use fund_size from entry if present, otherwise from config
      const fundSize = latestEntry.fund_size ?? fund.config.fund_size_usd
      totalFundSize += fundSize
      totalValue += latestEntry.value

      // Calculate start_input from trades up to this date
      let startInput = 0
      for (const entry of entriesUpToDate) {
        if (entry.action === 'BUY' && entry.amount) {
          startInput += entry.amount
        } else if (entry.action === 'SELL' && entry.amount) {
          startInput -= entry.amount
        }
      }
      totalStartInput += startInput

      // Cash available = fund_size - start_input
      const cash = Math.max(0, fundSize - startInput)
      totalCash += cash

      // Margin borrowed
      if (latestEntry.margin_borrowed) {
        totalMarginBorrowed += latestEntry.margin_borrowed
      }

      // Margin access
      if (fund.config.margin_access_usd) {
        totalMarginAccess += fund.config.margin_access_usd
      }

      // Cumulative dividends and expenses up to date (all positive in data)
      for (const entry of entriesUpToDate) {
        if (entry.dividend) totalDividends += Math.abs(entry.dividend)
        if (entry.expense) totalExpenses += Math.abs(entry.expense)
      }
    }

    // Calculate DPI metrics
    // DPI (Liquid) = (totalValue + totalCash - totalMarginBorrowed) / totalStartInput
    const liquidValue = totalValue + totalCash - totalMarginBorrowed
    const dpiLiquid = totalStartInput > 0 ? liquidValue / totalStartInput : 1

    // DPI (Extracted) = (totalDividends - totalExpenses) / totalStartInput
    const extracted = totalDividends - totalExpenses
    const dpiExtracted = totalStartInput > 0 ? extracted / totalStartInput : 0

    // Simple realized APY approximation for the time series
    // This is a simplified version - actual realized APY uses time-weighted calculations
    const realizedAPY = totalStartInput > 0
      ? (totalValue - totalStartInput + extracted) / totalStartInput
      : 0

    timeSeries.push({
      date,
      totalFundSize,
      totalValue,
      totalCash,
      totalMarginBorrowed,
      totalStartInput,
      totalDividends,
      totalExpenses,
      realizedAPY,
      dpiLiquid,
      dpiExtracted
    })
  }

  // Calculate current allocation data for pie charts
  interface AllocationData {
    id: string
    ticker: string
    platform: string
    value: number
    cash: number
    fundSize: number
    marginAccess: number
    marginBorrowed: number
  }

  const currentAllocations: AllocationData[] = []
  let totalCurrentValue = 0
  let totalCurrentCash = 0
  let totalCurrentMarginAccess = 0
  let totalCurrentMarginBorrowed = 0

  for (const fund of funds) {
    const latest = fund.entries[fund.entries.length - 1]
    if (!latest) continue

    const fundSize = latest.fund_size ?? fund.config.fund_size_usd

    // Calculate start_input
    let startInput = 0
    for (const entry of fund.entries) {
      if (entry.action === 'BUY' && entry.amount) {
        startInput += entry.amount
      } else if (entry.action === 'SELL' && entry.amount) {
        startInput -= entry.amount
      }
    }

    const cash = Math.max(0, fundSize - startInput)

    currentAllocations.push({
      id: fund.id,
      ticker: fund.ticker,
      platform: fund.platform,
      value: latest.value,
      cash,
      fundSize,
      marginAccess: fund.config.margin_access_usd ?? 0,
      marginBorrowed: latest.margin_borrowed ?? 0
    })

    totalCurrentValue += latest.value
    totalCurrentCash += cash

    if (fund.config.margin_access_usd) {
      totalCurrentMarginAccess += fund.config.margin_access_usd
    }
    if (latest.margin_borrowed) {
      totalCurrentMarginBorrowed += latest.margin_borrowed
    }
  }

  res.json({
    timeSeries,
    currentAllocations,
    totals: {
      totalCurrentValue,
      totalCurrentCash,
      totalCurrentMarginAccess,
      totalCurrentMarginBorrowed
    }
  })
})

/**
 * GET /funds/:id - Get fund details with all entries
 */
fundsRouter.get('/:id', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }
  res.json(fund)
})

/**
 * GET /funds/:id/state - Get computed state and recommendation
 */
fundsRouter.get('/:id/state', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  const trades = entriesToTrades(fund.entries)
  const dividends = entriesToDividends(fund.entries)
  const expenses = entriesToExpenses(fund.entries)

  // Get the full latest entry (not just equity)
  const latestEntry = fund.entries.length > 0 ? fund.entries[fund.entries.length - 1] : null

  if (!latestEntry) {
    return res.json({
      fund,
      state: null,
      recommendation: null,
      closedMetrics: null,
      margin_available: 0,
      cash_available: 0,
      message: 'No entries yet'
    })
  }

  // Use actual fund_size from latest entry instead of config
  const actualFundSize = latestEntry.fund_size ?? fund.config.fund_size_usd
  const configWithActualFundSize = { ...fund.config, fund_size_usd: actualFundSize }

  // Calculate invested amount (total buys - total sells, accounting for full liquidations)
  let totalBuys = 0
  let totalSells = 0
  let cumShares = 0
  const hasShareTracking = fund.entries.some(e => e.shares !== undefined && e.shares !== 0)
  const sortedEntries = [...fund.entries].sort((a, b) => a.date.localeCompare(b.date))

  for (const entry of sortedEntries) {
    // Track shares for full liquidation detection
    if (entry.shares) {
      const sharesAbs = Math.abs(entry.shares)
      cumShares += entry.action === 'SELL' ? -sharesAbs : sharesAbs
    }

    if (entry.action === 'BUY' && entry.amount) {
      totalBuys += entry.amount
    } else if (entry.action === 'SELL' && entry.amount) {
      // Check for full liquidation
      const isFullLiquidation = hasShareTracking
        ? Math.abs(cumShares) < 0.0001
        : entry.value <= entry.amount + 0.01

      if (isFullLiquidation) {
        // Reset on full liquidation
        totalBuys = 0
        totalSells = 0
        cumShares = 0
      } else {
        totalSells += entry.amount
      }
    }
  }

  const manageCash = fund.config.manage_cash ?? true

  const state = computeFundState(
    configWithActualFundSize,
    trades,
    [],  // cashflows not stored in entries
    dividends,
    expenses,
    latestEntry.value,
    latestEntry.date
  )

  // Calculate post-action cash (cash available AFTER the latest entry's action)
  // Entry.cash is pre-action cash; we need to adjust for the action taken
  let cashAvailable: number
  let cashSource: string | null = null  // Track where cash comes from
  if (!manageCash) {
    // Fund doesn't manage its own cash - look up platform cash fund
    const cashFundId = fund.config.cash_fund ?? `${fund.platform.toLowerCase()}-cash`
    const cashFundPath = join(FUNDS_DIR, `${cashFundId}.tsv`)

    // Try to read the platform cash fund
    const cashFundData = await readFund(cashFundPath).catch(() => null)
    if (cashFundData && cashFundData.entries.length > 0) {
      // Calculate cash balance from the cash fund
      const cashFundLatest = cashFundData.entries[cashFundData.entries.length - 1]
      // Use 'cash' field (post-action balance) for current available cash
      cashAvailable = cashFundLatest?.cash ?? cashFundLatest?.value ?? 0
      cashSource = cashFundId
    } else {
      // No platform cash fund found - fall back to 0
      cashAvailable = 0
    }
  } else if (latestEntry.cash !== undefined && latestEntry.cash !== null) {
    // Manual tracked cash - adjust for the action to get post-action cash
    let postActionCash = latestEntry.cash
    if (latestEntry.action === 'BUY' && latestEntry.amount) {
      postActionCash = latestEntry.cash - latestEntry.amount
    } else if (latestEntry.action === 'SELL' && latestEntry.amount) {
      postActionCash = latestEntry.cash + latestEntry.amount
    }
    cashAvailable = Math.max(0, postActionCash)
  } else {
    // Latest entry has no cash - look back to find most recent entry with cash
    // then apply subsequent actions to compute current cash
    let foundCash: number | null = null
    let foundIdx = -1
    for (let i = sortedEntries.length - 1; i >= 0; i--) {
      const entry = sortedEntries[i]
      if (entry && entry.cash !== undefined && entry.cash !== null) {
        foundCash = entry.cash
        foundIdx = i
        break
      }
    }

    if (foundCash !== null) {
      // Apply the action from the entry where we found cash, plus all subsequent entries
      let runningCash = foundCash
      for (let i = foundIdx; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i]
        if (!entry) continue
        // Apply action to cash
        if (entry.action === 'BUY' && entry.amount) {
          runningCash -= entry.amount
        } else if (entry.action === 'SELL' && entry.amount) {
          runningCash += entry.amount
        }
        // Add cash interest if present
        if (entry.cash_interest) {
          runningCash += entry.cash_interest
        }
      }
      cashAvailable = Math.max(0, runningCash)
    } else {
      // No tracked cash found - use engine's computed value
      cashAvailable = state.cash_available_usd
    }
  }

  const correctedState = { ...state, cash_available_usd: cashAvailable }

  const recommendation = computeRecommendation(configWithActualFundSize, correctedState)

  // Compute closed fund metrics if fund is closed (explicit status or legacy undefined status with zero fund size)
  let closedMetrics = null
  const isClosed = fund.config.status === 'closed' || (fund.config.status === undefined && fund.config.fund_size_usd === 0)
  if (isClosed && fund.entries.length > 0) {
    const firstEntry = fund.entries[0]
    const lastEntry = fund.entries[fund.entries.length - 1]
    if (firstEntry && lastEntry) {
      const cashInterest = entriesToCashInterest(fund.entries)

      closedMetrics = computeClosedFundMetrics(
        trades,
        dividends,
        expenses,
        cashInterest,
        firstEntry.date,
        lastEntry.date
      )
    }
  }

  // Get margin info from latest entry
  const marginAvailable = latestEntry.margin_available ?? 0
  const marginBorrowed = latestEntry.margin_borrowed ?? 0

  res.json({
    fund: { id: fund.id, platform: fund.platform, ticker: fund.ticker, config: fund.config },
    state: correctedState,
    recommendation,
    closedMetrics,
    margin_available: marginAvailable,
    margin_borrowed: marginBorrowed,
    cash_available: cashAvailable,
    cash_source: cashSource,  // null if from own fund, fund ID if from shared cash fund
    fund_size: actualFundSize
  })
})

/**
 * POST /funds - Create a new fund
 *
 * Auto-creates a platform cash fund if one doesn't exist.
 * Trading funds are automatically set to manage_cash=false since
 * cash is managed at the platform level.
 */
fundsRouter.post('/', async (req, res, next) => {
  const { platform, ticker, config, initialEntry } = req.body as {
    platform: string
    ticker: string
    config: FundData['config']
    initialEntry?: FundEntry
  }

  if (!platform) return next(badRequest('platform is required'))
  if (!ticker) return next(badRequest('ticker is required'))
  if (!config) return next(badRequest('config is required'))

  const platformId = platform.toLowerCase()
  const tickerLower = ticker.toLowerCase()
  const id = `${platformId}-${tickerLower}`
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  // Check if this is a cash fund being created
  const isCashFund = config.fund_type === 'cash' || tickerLower === 'cash'

  // If creating a trading fund, auto-create cash fund if it doesn't exist
  let cashFundCreated = false
  if (!isCashFund) {
    const cashFundId = `${platformId}-cash`
    const cashFundPath = join(FUNDS_DIR, `${cashFundId}.tsv`)

    if (!existsSync(cashFundPath)) {
      // Get or create platform config
      const platformsData = await readPlatformsData()
      const platformConfig = platformsData[platformId] ?? { name: platform }

      // Set platform to manage cash at platform level
      platformConfig.manage_cash = true
      platformsData[platformId] = platformConfig
      await writePlatformsData(platformsData)

      // Create the cash fund
      const today = new Date().toISOString().split('T')[0] as string
      const cashFundConfig: FundData['config'] = {
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
        margin_access_usd: 0,
        accumulate: true,
        manage_cash: true,
        start_date: today
      }

      const cashFundData: FundData = {
        id: cashFundId,
        platform: platformId,
        ticker: 'cash',
        config: cashFundConfig,
        entries: []
      }

      await writeFund(cashFundPath, cashFundData)
      cashFundCreated = true
    }

    // Trading funds default to not managing their own cash (use platform cash fund)
    // But respect explicit manage_cash=true if set
    if (config.manage_cash !== true) {
      config.manage_cash = false
    }
  }

  const fund: FundData = {
    id,
    platform,
    ticker,
    config,
    entries: initialEntry ? [initialEntry] : []
  }

  await writeFund(filePath, fund).catch(next)
  res.status(201).json({
    ...fund,
    cashFundCreated
  })
})

/**
 * PUT /funds/:id - Update fund config, platform, and/or ticker
 */
fundsRouter.put('/:id', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  const { config, platform, ticker } = req.body as {
    config?: Partial<FundData['config']>
    platform?: string
    ticker?: string
  }

  // Update config if provided
  if (config) {
    fund.config = { ...fund.config, ...config }
    // Handle clearing of optional fields (empty string means delete)
    if (config.audited === '') {
      delete fund.config.audited
    }
  }

  // Check if rename is needed (platform or ticker change)
  const newPlatform = platform ? platform.toLowerCase().replace(/[^a-z0-9-]/g, '-') : fund.platform.toLowerCase()
  const newTicker = ticker ? ticker.toLowerCase().replace(/[^a-z0-9-]/g, '-') : fund.ticker.toLowerCase()
  const needsRename = newPlatform !== fund.platform.toLowerCase() || newTicker !== fund.ticker.toLowerCase()

  if (needsRename) {
    const newId = `${newPlatform}-${newTicker}`
    const newPath = join(FUNDS_DIR, `${newId}.tsv`)
    const newConfigPath = join(FUNDS_DIR, `${newId}.json`)
    const oldConfigPath = join(FUNDS_DIR, `${id}.json`)

    if (existsSync(newPath)) {
      return next(badRequest(`Cannot rename: fund ${newId} already exists`))
    }

    // Write updated fund data first (this creates both TSV and JSON at old paths)
    await writeFund(filePath, fund).catch(next)

    // Rename both files
    await rename(filePath, newPath).catch(next)
    if (existsSync(oldConfigPath)) {
      await rename(oldConfigPath, newConfigPath).catch(next)
    }

    // Return the updated fund with new id/platform/ticker
    const renamedFund = await readFund(newPath).catch(next)
    if (!renamedFund) {
      return next(notFound('Fund after rename'))
    }

    return res.json(renamedFund)
  }

  await writeFund(filePath, fund).catch(next)
  res.json(fund)
})

/**
 * POST /funds/:id/preview - Preview recommendation for a hypothetical equity value
 */
fundsRouter.post('/:id/preview', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  const { equity_value_usd, date } = req.body as { equity_value_usd: number; date?: string }
  if (equity_value_usd === undefined) {
    return next(badRequest('equity_value_usd is required'))
  }

  const snapshotDate = date ?? new Date().toISOString().split('T')[0] as string

  // For historical dates, only consider entries on or before the snapshot date
  // Sort entries by date first
  const sortedEntries = [...fund.entries].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  const entriesUpToDate = sortedEntries.filter(e => e.date < snapshotDate)
  const precedingEntry = entriesUpToDate[entriesUpToDate.length - 1]

  const trades = entriesToTrades(entriesUpToDate)
  const dividends = entriesToDividends(entriesUpToDate)
  const expenses = entriesToExpenses(entriesUpToDate)

  // Use fund_size from preceding entry if available, otherwise from config
  const actualFundSize = precedingEntry?.fund_size ?? fund.config.fund_size_usd
  const configWithActualFundSize = { ...fund.config, fund_size_usd: actualFundSize }

  // Calculate invested amount with full liquidation reset (same as FundDetail.tsx)
  // Only consider entries up to the snapshot date
  let totalBuys = 0
  let totalSells = 0
  let cumShares = 0
  for (const entry of entriesUpToDate) {
    // Track shares first - BUY adds, SELL subtracts
    if (entry.shares) {
      const sharesAbs = Math.abs(entry.shares)
      cumShares += entry.action === 'SELL' ? -sharesAbs : sharesAbs
    }

    if (entry.action === 'BUY' && entry.amount) {
      totalBuys += entry.amount
    } else if (entry.action === 'SELL' && entry.amount) {
      totalSells += entry.amount
      // Check for full liquidation
      // Use cumShares check if fund has share tracking, otherwise fall back to value-based check
      const hasShareTracking = entry.shares !== undefined && entry.shares !== 0
      const isFullLiquidation = hasShareTracking
        ? Math.abs(cumShares) < 0.0001
        : entry.value <= entry.amount + 0.01
      if (isFullLiquidation) {
        totalBuys = 0
        totalSells = 0
        cumShares = 0
      }
    }
  }
  const manageCash = fund.config.manage_cash ?? true

  const state = computeFundState(
    configWithActualFundSize,
    trades,
    [],
    dividends,
    expenses,
    equity_value_usd,
    snapshotDate
  )

  // Calculate cash available
  let correctedCashAvailable: number
  if (!manageCash) {
    // Fund doesn't manage its own cash - look up platform cash fund
    const cashFundId = fund.config.cash_fund ?? `${fund.platform.toLowerCase()}-cash`
    const cashFundPath = join(FUNDS_DIR, `${cashFundId}.tsv`)

    const cashFundData = await readFund(cashFundPath).catch(() => null)
    if (cashFundData && cashFundData.entries.length > 0) {
      // Get entries up to the snapshot date
      const cashEntries = cashFundData.entries
        .filter(e => e.date <= snapshotDate)
        .sort((a, b) => a.date.localeCompare(b.date))
      const cashFundLatest = cashEntries[cashEntries.length - 1]
      // Use 'cash' field (post-action balance) for current available cash
      correctedCashAvailable = cashFundLatest?.cash ?? cashFundLatest?.value ?? 0
    } else {
      correctedCashAvailable = 0
    }
  } else {
    correctedCashAvailable = state.cash_available_usd
  }
  const correctedState = { ...state, cash_available_usd: correctedCashAvailable }

  const recommendation = computeRecommendation(configWithActualFundSize, correctedState)

  // Include margin info for UI suggestions (from preceding entry)
  const marginAvailable = precedingEntry?.margin_available ?? 0

  res.json({
    state: correctedState,
    recommendation,
    margin_available: marginAvailable,
    fund_size: actualFundSize
  })
})

/**
 * POST /funds/:id/entries - Add an entry to fund
 *
 * For trading funds, cash is managed at the platform level.
 * DEPOSIT/WITHDRAW actions should be made to the platform cash fund.
 */
fundsRouter.post('/:id/entries', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  const entry = req.body as FundEntry
  if (!entry.date) return next(badRequest('date is required'))
  if (entry.value === undefined) return next(badRequest('value is required'))

  // Enforce cash isolation for trading funds that don't manage their own cash
  const isCashFund = fund.config.fund_type === 'cash'
  const manageCashSelf = fund.config.manage_cash === true
  if (!isCashFund && !manageCashSelf) {
    // Clear cash field - trading funds that don't manage their own cash
    delete entry.cash

    // Reject DEPOSIT/WITHDRAW actions - these should go to cash fund
    if (entry.action === 'DEPOSIT' || entry.action === 'WITHDRAW') {
      const cashFundId = `${fund.platform.toLowerCase()}-cash`
      return next(badRequest(
        `Trading funds cannot have DEPOSIT/WITHDRAW actions. ` +
        `Use the cash fund (${cashFundId}) for deposits and withdrawals.`
      ))
    }
  }

  // Auto-calculate fund_size if not provided
  const manageCash = fund.config.manage_cash !== false
  if (!entry.fund_size) {
    if (!manageCash) {
      // Non-cash managing funds: fund_size = invested amount
      // Calculate invested from all entries including the new one
      const allEntries = [...fund.entries, entry].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      let invested = 0
      let cumShares = 0
      for (const e of allEntries) {
        if (e.date > entry.date) break // Only consider entries up to this one
        // Track shares for liquidation detection
        if (e.shares) {
          const sharesAbs = Math.abs(e.shares)
          cumShares += e.action === 'SELL' ? -sharesAbs : sharesAbs
        }
        if (e.action === 'BUY' && e.amount) {
          invested += e.amount
        } else if (e.action === 'SELL' && e.amount) {
          invested -= e.amount
          // Check for full liquidation
          const hasShareTracking = e.shares !== undefined && e.shares !== 0
          const isFullLiquidation = hasShareTracking
            ? Math.abs(cumShares) < 0.0001
            : (e.value !== undefined && e.value <= e.amount + 0.01)
          if (isFullLiquidation) {
            invested = 0
            cumShares = 0
          }
        }
      }
      entry.fund_size = Math.max(0, invested)
    } else {
      // Cash managing funds: fund_size based on deposits/withdrawals
      const sortedEntries = [...fund.entries].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      const entriesBefore = sortedEntries.filter(e => e.date < entry.date)
      const prevEntry = entriesBefore[entriesBefore.length - 1]
      const prevFundSize = prevEntry?.fund_size ?? fund.config.fund_size_usd

      // Check for deposit in notes (format: "Deposit: $X")
      let depositAmount = 0
      let withdrawalAmount = 0
      if (entry.notes) {
        const depositMatch = entry.notes.match(/Deposit:\s*\$?([\d.]+)/)
        if (depositMatch) depositAmount = parseFloat(depositMatch[1] ?? '0') || 0
        const withdrawalMatch = entry.notes.match(/Withdrawal:\s*\$?([\d.]+)/)
        if (withdrawalMatch) withdrawalAmount = parseFloat(withdrawalMatch[1] ?? '0') || 0
      }
      // Also check for DEPOSIT/WITHDRAW actions
      if (entry.action === 'DEPOSIT' && entry.amount) depositAmount = entry.amount
      if (entry.action === 'WITHDRAW' && entry.amount) withdrawalAmount = entry.amount

      const adjustment = depositAmount - withdrawalAmount
      if (adjustment !== 0) {
        entry.fund_size = prevFundSize + adjustment
      } else {
        // Carry forward previous fund_size
        entry.fund_size = prevFundSize
      }
    }
  }

  await appendEntry(filePath, entry).catch(next)

  // Re-read to get updated fund
  const updated = await readFund(filePath).catch(next)
  if (!updated) {
    return next(notFound('Fund'))
  }

  // Compute new state
  const trades = entriesToTrades(updated.entries)
  const dividends = entriesToDividends(updated.entries)
  const expenses = entriesToExpenses(updated.entries)

  // Use actual fund_size from new entry instead of config
  const actualFundSize = entry.fund_size ?? updated.config.fund_size_usd
  const configWithActualFundSize = { ...updated.config, fund_size_usd: actualFundSize }

  const state = computeFundState(
    configWithActualFundSize,
    trades,
    [],
    dividends,
    expenses,
    entry.value,
    entry.date
  )

  const recommendation = computeRecommendation(configWithActualFundSize, state)

  res.status(201).json({
    entry,
    state,
    recommendation
  })
})

/**
 * PUT /funds/:id/entries/:entryIndex - Update an entry
 */
fundsRouter.put('/:id/entries/:entryIndex', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const entryIndex = parseInt(req.params['entryIndex'] ?? '', 10)
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  if (isNaN(entryIndex)) return next(badRequest('Invalid entry index'))

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  if (entryIndex < 0 || entryIndex >= fund.entries.length) {
    return next(badRequest(`Entry index out of bounds: ${entryIndex}`))
  }

  const entry = req.body as FundEntry
  if (!entry.date) return next(badRequest('date is required'))
  if (entry.value === undefined) return next(badRequest('value is required'))

  // Calculate fund_size change to propagate to subsequent entries
  const oldEntry = fund.entries[entryIndex]
  const oldFundSize = oldEntry?.fund_size ?? 0
  const newFundSize = entry.fund_size ?? 0
  const fundSizeDelta = newFundSize - oldFundSize

  // Update the entry
  fund.entries[entryIndex] = entry

  // Propagate fund_size changes to all subsequent entries
  if (entry.fund_size !== undefined && entry.fund_size > 0) {
    const entryDate = new Date(entry.date)
    for (let i = 0; i < fund.entries.length; i++) {
      if (i === entryIndex) continue
      const e = fund.entries[i]
      if (!e) continue
      const eDate = new Date(e.date)
      // Update entries after this one (by date)
      if (eDate > entryDate) {
        if (e.fund_size !== undefined && e.fund_size > 0) {
          // Entry has explicit fund_size - apply delta
          e.fund_size = e.fund_size + fundSizeDelta
        } else {
          // Entry doesn't have fund_size - set it to match current entry's fund_size
          e.fund_size = entry.fund_size
        }
      }
    }
  }

  // Write the entire fund with propagated changes
  await writeFund(filePath, fund).catch(next)

  // Re-read to get updated fund
  const updated = await readFund(filePath).catch(next)
  if (!updated) {
    return next(notFound('Fund'))
  }

  res.json({ entry, fund: updated })
})

/**
 * DELETE /funds/:id/entries/:entryIndex - Delete an entry
 */
fundsRouter.delete('/:id/entries/:entryIndex', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const entryIndex = parseInt(req.params['entryIndex'] ?? '', 10)
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  if (isNaN(entryIndex)) return next(badRequest('Invalid entry index'))

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  if (entryIndex < 0 || entryIndex >= fund.entries.length) {
    return next(badRequest(`Entry index out of bounds: ${entryIndex}`))
  }

  await deleteEntry(filePath, entryIndex).catch(next)

  // Re-read to get updated fund
  const updated = await readFund(filePath).catch(next)
  if (!updated) {
    return next(notFound('Fund'))
  }

  res.json({ fund: updated })
})

/**
 * POST /funds/:id/recalculate - Recalculate fund_size for all entries
 *
 * Recalculates fund_size based on:
 * - Initial fund_size_usd from config
 * - + cumulative BUYs
 * - + DEPOSITs
 * - - WITHDRAWs
 * - + dividends (if dividend_reinvest)
 * - + cash_interest (if interest_reinvest)
 * - - expenses (if expense_from_fund)
 *
 * For accumulate mode: SELLs don't reduce fund_size unless full liquidation
 * For liquidate mode: SELLs reduce fund_size
 */
fundsRouter.post('/:id/recalculate', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  const config = fund.config
  const isAccumulate = config.accumulate
  const dividendReinvest = config.dividend_reinvest !== false
  const interestReinvest = config.interest_reinvest !== false
  const expenseFromFund = config.expense_from_fund !== false

  // Sort entries by date
  const sorted = [...fund.entries].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  let cumBuys = 0
  let cumSells = 0
  let cumDeposits = 0
  let cumWithdrawals = 0
  let cumDividends = 0
  let cumCashInterest = 0
  let cumExpenses = 0
  let cumShares = 0
  let baseFundSize = config.fund_size_usd // Base starts from config, resets to 0 after liquidation

  // Recalculate fund_size and equity for each entry
  for (const entry of sorted) {
    // Recalculate equity FIRST (before this entry's action): equity = cumShares × price
    // Equity represents portfolio value BEFORE the action on this row
    if (entry.price && entry.price > 0) {
      entry.value = Math.round(cumShares * entry.price * 100) / 100
    }

    // Track shares AFTER calculating equity - BUY adds, SELL subtracts
    if (entry.shares) {
      const sharesAbs = Math.abs(entry.shares)
      cumShares += entry.action === 'SELL' ? -sharesAbs : sharesAbs
    }

    // Check for full liquidation (cumShares should be ~0 after a full sell)
    const isFullLiquidation = entry.action === 'SELL' && Math.abs(cumShares) < 0.0001

    // Track action amounts
    if (entry.action === 'BUY' && entry.amount) {
      cumBuys += entry.amount
    } else if (entry.action === 'SELL' && entry.amount) {
      if (!isAccumulate || isFullLiquidation) {
        cumSells += entry.amount
      }
      // For accumulate mode partial sells, fund_size stays the same (profit extraction)
    } else if (entry.action === 'DEPOSIT' && entry.amount) {
      cumDeposits += entry.amount
    } else if (entry.action === 'WITHDRAW' && entry.amount) {
      cumWithdrawals += entry.amount
    }

    // Track dividends, interest, expenses (all stored as positive values)
    if (entry.dividend) {
      cumDividends += dividendReinvest ? Math.abs(entry.dividend) : 0
    }
    if (entry.cash_interest) {
      cumCashInterest += interestReinvest ? Math.abs(entry.cash_interest) : 0
    }
    if (entry.expense) {
      cumExpenses += expenseFromFund ? Math.abs(entry.expense) : 0
    }

    // Calculate new fund_size
    const newFundSize = baseFundSize
      + cumBuys
      - cumSells
      + cumDeposits
      - cumWithdrawals
      + cumDividends
      + cumCashInterest
      - cumExpenses

    entry.fund_size = Math.max(0, newFundSize)

    // After full liquidation, reset all cumulative values for fresh start
    if (isFullLiquidation) {
      cumBuys = 0
      cumSells = 0
      cumDeposits = 0
      cumWithdrawals = 0
      cumDividends = 0
      cumCashInterest = 0
      cumExpenses = 0
      cumShares = 0
      baseFundSize = 0 // After liquidation, start from 0
    }
  }

  // Re-sort back to original order (by index in original array)
  // Actually, we need to update the original entries array
  // Create a map of date -> recalculated values
  const recalcMap = new Map<string, { fund_size: number; value: number }>()
  for (const entry of sorted) {
    // Use date + action + shares as key (since value may have changed)
    const key = `${entry.date}|${entry.action}|${entry.shares}`
    recalcMap.set(key, {
      fund_size: entry.fund_size ?? 0,
      value: entry.value
    })
  }

  // Update original entries
  for (const entry of fund.entries) {
    const key = `${entry.date}|${entry.action}|${entry.shares}`
    const recalculated = recalcMap.get(key)
    if (recalculated) {
      entry.fund_size = recalculated.fund_size
      entry.value = recalculated.value
    }
  }

  // Write the updated fund
  await writeFund(filePath, fund).catch(next)

  // Re-read to get updated fund
  const updated = await readFund(filePath).catch(next)
  if (!updated) {
    return next(notFound('Fund'))
  }

  res.json({
    message: `Recalculated fund_size for ${fund.entries.length} entries`,
    fund: updated
  })
})

/**
 * DELETE /funds/:id - Delete a fund (both TSV and JSON config)
 */
fundsRouter.delete('/:id', async (req, res, next) => {
  const id = req.params['id'] ?? ''
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund = await readFund(filePath).catch(next)
  if (!fund) {
    return next(notFound('Fund'))
  }

  await deleteFund(filePath).catch(next)

  res.status(204).send()
})

// Numeric columns that can be interpolated
const INTERPOLATABLE_COLUMNS = ['margin_available', 'margin_borrowed', 'fund_size', 'value'] as const
type InterpolatableColumn = typeof INTERPOLATABLE_COLUMNS[number]

/**
 * POST /funds/:id/interpolate
 * Interpolate missing values for a specified column based on surrounding known values.
 * Uses linear interpolation by date.
 * Request body: { column: 'margin_available' | 'margin_borrowed' | 'fund_size' | 'value' }
 */
fundsRouter.post('/:id/interpolate', async (req, res, next) => {
  const { id } = req.params
  const { column } = req.body as { column?: string }
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  // Validate column
  if (!column || !INTERPOLATABLE_COLUMNS.includes(column as InterpolatableColumn)) {
    return res.status(400).json({
      error: `Invalid column. Must be one of: ${INTERPOLATABLE_COLUMNS.join(', ')}`
    })
  }

  const col = column as InterpolatableColumn

  // Read the fund
  const fund = await readFund(filePath).catch(next)
  if (!fund) return

  if (fund.entries.length === 0) {
    return res.json({ success: true, message: 'No entries to interpolate', interpolated: 0 })
  }

  // Sort entries by date for interpolation
  const sorted = [...fund.entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Find entries with known values for the specified column
  const knownIndices: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    const val = sorted[i]![col]
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      knownIndices.push(i)
    }
  }

  if (knownIndices.length === 0) {
    return res.json({ success: true, message: `No ${column} values to interpolate from`, interpolated: 0 })
  }

  let interpolated = 0

  // Interpolate missing values
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]!
    const existingVal = entry[col]
    if (existingVal !== undefined && existingVal !== null && !isNaN(Number(existingVal))) {
      continue // Already has a value
    }

    const entryTime = new Date(entry.date).getTime()

    // Find surrounding known values
    let prevKnown: { idx: number; time: number; value: number } | null = null
    let nextKnown: { idx: number; time: number; value: number } | null = null

    for (const ki of knownIndices) {
      const knownEntry = sorted[ki]!
      const knownTime = new Date(knownEntry.date).getTime()
      const knownValue = Number(knownEntry[col])

      if (knownTime <= entryTime) {
        prevKnown = { idx: ki, time: knownTime, value: knownValue }
      }
      if (knownTime > entryTime && !nextKnown) {
        nextKnown = { idx: ki, time: knownTime, value: knownValue }
        break
      }
    }

    // Interpolate
    let interpolatedValue: number | null = null
    if (prevKnown && nextKnown) {
      // Linear interpolation
      const timeDiff = nextKnown.time - prevKnown.time
      const valueDiff = nextKnown.value - prevKnown.value
      const entryTimeDiff = entryTime - prevKnown.time
      interpolatedValue = prevKnown.value + (valueDiff * entryTimeDiff / timeDiff)
    } else if (prevKnown && !nextKnown) {
      // Use previous value (extrapolate forward)
      interpolatedValue = prevKnown.value
    } else if (!prevKnown && nextKnown) {
      // Use next value (extrapolate backward)
      interpolatedValue = nextKnown.value
    }

    if (interpolatedValue !== null) {
      ;(entry as unknown as Record<string, unknown>)[col] = Math.round(interpolatedValue * 100) / 100
      interpolated++
    }
  }

  // Update original entries with interpolated values
  const sortedMap = new Map<string, number | undefined>()
  for (const entry of sorted) {
    const key = `${entry.date}|${entry.action ?? ''}|${entry.amount ?? ''}|${entry.notes ?? ''}`
    sortedMap.set(key, entry[col] as number | undefined)
  }

  for (const entry of fund.entries) {
    const key = `${entry.date}|${entry.action ?? ''}|${entry.amount ?? ''}|${entry.notes ?? ''}`
    const interpolatedValue = sortedMap.get(key)
    if (interpolatedValue !== undefined) {
      ;(entry as unknown as Record<string, unknown>)[col] = interpolatedValue
    }
  }

  // Write back the fund
  await writeFund(filePath, fund).catch(next)

  res.json({
    success: true,
    message: `Interpolated ${interpolated} ${column} values`,
    interpolated,
    column,
    totalEntries: fund.entries.length,
    knownValues: knownIndices.length
  })
})

/**
 * POST /funds/:id/sync-from-subfunds
 * For cash funds, sync trading activity from related sub-funds.
 * Creates WITHDRAW entries for BUYs and DEPOSIT entries for SELLs/dividends.
 */
fundsRouter.post('/:id/sync-from-subfunds', async (req, res, next) => {
  const { id } = req.params
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  // Read the cash fund
  const cashFund = await readFund(filePath).catch(next)
  if (!cashFund) {
    return next(notFound('Fund'))
  }

  // Verify this is a cash fund
  if (cashFund.config.fund_type !== 'cash') {
    return res.status(400).json({
      error: 'This endpoint is only for cash funds'
    })
  }

  // Extract platform from fund ID (e.g., robinhood-cash -> robinhood)
  const platform = cashFund.platform.toLowerCase()

  // Find all sub-funds for this platform
  const allFunds = await readAllFunds(FUNDS_DIR)
  const subFunds = allFunds.filter(f =>
    f.platform.toLowerCase() === platform &&
    f.config.fund_type !== 'cash' &&
    f.id !== id
  )

  if (subFunds.length === 0) {
    return res.json({
      success: true,
      message: 'No sub-funds found for this platform',
      added: 0,
      skipped: 0
    })
  }

  // Build a set of existing entries to avoid duplicates
  // Key: date|action|amount|notes_prefix
  const existingKeys = new Set<string>()
  for (const entry of cashFund.entries) {
    const notesPrefix = entry.notes?.substring(0, 50) ?? ''
    const key = `${entry.date}|${entry.action}|${entry.amount?.toFixed(2)}|${notesPrefix}`
    existingKeys.add(key)
  }

  const newEntries: FundEntry[] = []
  let skipped = 0

  for (const subFund of subFunds) {
    for (const entry of subFund.entries) {
      // Skip entries without amounts
      if (!entry.amount || entry.amount === 0) continue

      let cashEntry: FundEntry | null = null

      if (entry.action === 'BUY') {
        // BUY in sub-fund = WITHDRAW from cash
        cashEntry = {
          date: entry.date,
          value: 0, // Will be recalculated
          action: 'WITHDRAW',
          amount: entry.amount,
          notes: `Trade: Buy ${subFund.ticker.toUpperCase()} (${entry.shares ?? ''} shares @ $${entry.price ?? ''})`
        }
      } else if (entry.action === 'SELL') {
        // SELL in sub-fund = DEPOSIT to cash
        cashEntry = {
          date: entry.date,
          value: 0, // Will be recalculated
          action: 'DEPOSIT',
          amount: entry.amount,
          notes: `Trade: Sell ${subFund.ticker.toUpperCase()} (${entry.shares ?? ''} shares @ $${entry.price ?? ''})`
        }
      }

      // Also capture dividends
      if (entry.dividend && entry.dividend > 0) {
        const divEntry: FundEntry = {
          date: entry.date,
          value: 0,
          action: 'DEPOSIT',
          amount: entry.dividend,
          notes: `Dividend: ${subFund.ticker.toUpperCase()}`
        }
        const divNotesPrefix = divEntry.notes?.substring(0, 50) ?? ''
        const divKey = `${divEntry.date}|${divEntry.action}|${divEntry.amount?.toFixed(2)}|${divNotesPrefix}`
        if (!existingKeys.has(divKey)) {
          newEntries.push(divEntry)
          existingKeys.add(divKey)
        } else {
          skipped++
        }
      }

      if (cashEntry) {
        const notesPrefix = cashEntry.notes?.substring(0, 50) ?? ''
        const key = `${cashEntry.date}|${cashEntry.action}|${cashEntry.amount?.toFixed(2)}|${notesPrefix}`
        if (!existingKeys.has(key)) {
          newEntries.push(cashEntry)
          existingKeys.add(key)
        } else {
          skipped++
        }
      }
    }
  }

  // Add new entries to the fund
  for (const entry of newEntries) {
    cashFund.entries.push(entry)
  }

  // Sort entries by date
  cashFund.entries.sort((a, b) => a.date.localeCompare(b.date))

  // Recalculate running balance
  let runningBalance = 0
  for (const entry of cashFund.entries) {
    if (entry.action === 'DEPOSIT' && entry.amount) {
      runningBalance += entry.amount
    } else if (entry.action === 'WITHDRAW' && entry.amount) {
      runningBalance -= entry.amount
    }
    if (entry.cash_interest) {
      runningBalance += entry.cash_interest
    }
    if (entry.expense) {
      runningBalance -= entry.expense
    }

    entry.value = Math.round(runningBalance * 100) / 100
    entry.cash = entry.value
    entry.fund_size = entry.value
  }

  // Write back the updated fund
  await writeFund(filePath, cashFund).catch(next)

  res.json({
    success: true,
    message: `Synced trading activity from ${subFunds.length} sub-funds`,
    added: newEntries.length,
    skipped,
    subFundsSynced: subFunds.map(f => f.id),
    finalBalance: runningBalance
  })
})
