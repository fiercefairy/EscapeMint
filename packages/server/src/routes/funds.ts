import { Router } from 'express'
import { join } from 'node:path'
import { rename, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  readFund,
  writeFund,
  readAllFunds,
  appendEntry,
  updateEntry,
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

export const fundsRouter = Router()

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const FUNDS_DIR = join(DATA_DIR, 'funds')
const PLATFORMS_FILE = join(DATA_DIR, 'platforms.json')

interface PlatformConfig {
  name: string
  cash_apy?: number
  auto_calculate_interest?: boolean
}

async function getPlatformConfig(platformId: string): Promise<PlatformConfig | undefined> {
  if (!existsSync(PLATFORMS_FILE)) return undefined
  const content = await readFile(PLATFORMS_FILE, 'utf-8')
  const data = JSON.parse(content) as Record<string, PlatformConfig>
  return data[platformId.toLowerCase()]
}

function calculateCashInterest(
  fund: FundData,
  entry: FundEntry,
  cashApy: number
): number | undefined {
  const entries = fund.entries
  if (entries.length === 0) return undefined

  const prevEntry = entries[entries.length - 1]
  if (!prevEntry) return undefined

  const prevDate = new Date(prevEntry.date)
  const currDate = new Date(entry.date)
  const days = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))

  if (days <= 0) return undefined

  // Calculate total invested
  let totalInvested = 0
  for (const e of entries) {
    if (e.action === 'BUY' && e.amount) totalInvested += e.amount
    else if (e.action === 'SELL' && e.amount) totalInvested -= e.amount
  }

  const fundSize = entry.fund_size ?? prevEntry.fund_size ?? fund.config.fund_size_usd
  const cash = Math.max(0, fundSize - totalInvested)

  const dailyRate = Math.pow(1 + cashApy, 1/365) - 1
  const interest = cash * dailyRate * days

  // Only return if month changed (monthly payout)
  const prevMonth = prevDate.toISOString().slice(0, 7)
  const currMonth = currDate.toISOString().slice(0, 7)

  if (currMonth !== prevMonth && interest > 0.01) {
    return Math.round(interest * 100) / 100
  }

  return undefined
}

/**
 * GET /funds - List all funds
 */
fundsRouter.get('/', async (_req, res, next) => {
  const funds = await readAllFunds(FUNDS_DIR).catch(next)
  if (funds) {
    res.json(funds.map(f => ({
      id: f.id,
      platform: f.platform,
      ticker: f.ticker,
      config: f.config,
      entryCount: f.entries.length,
      latestEquity: getLatestEquity(f.entries)
    })))
  }
})

/**
 * GET /funds/aggregate - Get aggregate metrics across all funds
 */
fundsRouter.get('/aggregate', async (_req, res, next) => {
  const funds = await readAllFunds(FUNDS_DIR).catch(next)
  if (!funds) return

  const today = new Date().toISOString().split('T')[0] as string
  const fundMetrics = []

  for (const fund of funds) {
    const trades = entriesToTrades(fund.entries)
    const dividends = entriesToDividends(fund.entries)
    const expenses = entriesToExpenses(fund.entries)
    const latest = getLatestEquity(fund.entries)

    let state = null
    if (latest) {
      state = computeFundState(
        fund.config,
        trades,
        [],
        dividends,
        expenses,
        latest.value,
        latest.date
      )
    }

    const metrics = computeFundMetrics(
      fund.id,
      fund.platform,
      fund.ticker,
      fund.config,
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
 */
fundsRouter.get('/history', async (_req, res, next) => {
  const funds = await readAllFunds(FUNDS_DIR).catch(next)
  if (!funds) return

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

      // Cumulative dividends and expenses up to date
      for (const entry of entriesUpToDate) {
        if (entry.dividend) totalDividends += entry.dividend
        if (entry.expense) totalExpenses += entry.expense
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
  const latest = getLatestEquity(fund.entries)

  if (!latest) {
    return res.json({
      fund,
      state: null,
      recommendation: null,
      closedMetrics: null,
      message: 'No entries yet'
    })
  }

  const state = computeFundState(
    fund.config,
    trades,
    [],  // cashflows not stored in entries
    dividends,
    expenses,
    latest.value,
    latest.date
  )

  const recommendation = computeRecommendation(fund.config, state)

  // Compute closed fund metrics if fund is closed
  let closedMetrics = null
  if (fund.config.fund_size_usd === 0 && fund.entries.length > 0) {
    const firstEntry = fund.entries[0]
    const lastEntry = fund.entries[fund.entries.length - 1]
    if (firstEntry && lastEntry) {
      const cashInterest = entriesToCashInterest(fund.entries)

      // Find the last non-zero equity value (final value before full liquidation)
      let finalEquityValue = 0
      for (let i = fund.entries.length - 1; i >= 0; i--) {
        const entry = fund.entries[i]
        if (entry && entry.value > 0) {
          finalEquityValue = entry.value
          break
        }
      }

      closedMetrics = computeClosedFundMetrics(
        trades,
        dividends,
        expenses,
        cashInterest,
        firstEntry.date,
        lastEntry.date,
        finalEquityValue
      )
    }
  }

  res.json({
    fund: { id: fund.id, platform: fund.platform, ticker: fund.ticker, config: fund.config },
    state,
    recommendation,
    closedMetrics
  })
})

/**
 * POST /funds - Create a new fund
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

  const id = `${platform.toLowerCase()}-${ticker.toLowerCase()}`
  const filePath = join(FUNDS_DIR, `${id}.tsv`)

  const fund: FundData = {
    id,
    platform,
    ticker,
    config,
    entries: initialEntry ? [initialEntry] : []
  }

  await writeFund(filePath, fund).catch(next)
  res.status(201).json(fund)
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
  const trades = entriesToTrades(fund.entries)
  const dividends = entriesToDividends(fund.entries)
  const expenses = entriesToExpenses(fund.entries)

  const state = computeFundState(
    fund.config,
    trades,
    [],
    dividends,
    expenses,
    equity_value_usd,
    snapshotDate
  )

  const recommendation = computeRecommendation(fund.config, state)

  res.json({
    state,
    recommendation
  })
})

/**
 * POST /funds/:id/entries - Add an entry to fund
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

  // Auto-calculate cash interest if platform has it enabled
  const platformConfig = await getPlatformConfig(fund.platform).catch(() => undefined)
  if (platformConfig?.auto_calculate_interest && platformConfig.cash_apy && !entry.cash_interest) {
    const calculatedInterest = calculateCashInterest(fund, entry, platformConfig.cash_apy)
    if (calculatedInterest) {
      entry.cash_interest = calculatedInterest
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

  const state = computeFundState(
    updated.config,
    trades,
    [],
    dividends,
    expenses,
    entry.value,
    entry.date
  )

  const recommendation = computeRecommendation(updated.config, state)

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

  await updateEntry(filePath, entryIndex, entry).catch(next)

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
