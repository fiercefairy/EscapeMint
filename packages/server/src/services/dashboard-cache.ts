/**
 * Dashboard Cache Service
 *
 * Caches computed dashboard data in memory for fast subsequent loads.
 * Invalidates cache when fund data changes.
 */

import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { readFund, type FundData, type FundEntry } from '@escapemint/storage'
import {
  computeFundState,
  computeDerivativesEntriesState,
  type SubFundConfig,
  type Trade,
  type Dividend,
  type Expense
} from '@escapemint/engine'
import { computeFundFinalMetrics } from '../utils/fund-metrics.js'

const FUNDS_DIR = join(process.env['DATA_DIR'] ?? './data', 'funds')

// Test platforms: 'test' or any platform ending in '-test' (matches REST API)
const isTestPlatform = (platform: string) =>
  platform === 'test' || platform.endsWith('-test')

// Cache entry with timestamp
interface CacheEntry<T> {
  data: T
  timestamp: number
  computing?: boolean
}

// Dashboard data types
export interface DashboardFundSummary {
  id: string
  platform: string
  ticker: string
  config: SubFundConfig
  entryCount: number
  latestEquity: { date: string; value: number } | null
  latestFundSize?: number
  firstEntryDate?: string | undefined
}

export interface DashboardMetrics {
  totalFundSize: number
  totalValue: number
  totalStartInput: number
  totalTimeWeightedFundSize: number
  totalDaysActive: number
  totalRealizedGains: number
  totalUnrealizedGains: number
  unrealizedGainPct: number
  realizedAPY: number
  liquidAPY: number
  projectedAnnualReturn: number
  totalGainUsd: number
  totalGainPct: number
  activeFunds: number
  closedFunds: number
  funds: FundMetrics[]
}

export interface FundMetrics {
  id: string
  platform: string
  ticker: string
  status: 'active' | 'closed'
  fundType: 'cash' | 'stock' | 'crypto' | 'derivatives'
  fundSize: number
  currentValue: number
  startInput: number
  daysActive: number
  timeWeightedFundSize: number
  realizedGains: number
  unrealizedGains: number
  realizedAPY: number
  liquidAPY: number
  projectedAnnualReturn: number
  gainUsd: number
  gainPct: number
  fundShares: number
  fundSharesPct: number
}

export interface TimeSeriesPoint {
  date: string
  totalFundSize: number
  totalValue: number
  totalCash: number
  totalMarginBorrowed: number
  totalMarginAccess: number
  totalStartInput: number
  totalDividends: number
  totalExpenses: number
  totalCashInterest: number
  totalRealizedGain: number
  realizedAPY: number
  liquidAPY: number
  totalGainUsd: number
  totalGainPct: number
  fundBreakdown: Record<string, number>
}

export interface AllocationData {
  id: string
  ticker: string
  platform: string
  value: number
  cash: number
  fundSize: number
  marginAccess: number
  marginBorrowed: number
}

export interface DashboardHistory {
  timeSeries: TimeSeriesPoint[]
  currentAllocations: AllocationData[]
  totals: {
    totalCurrentValue: number
    totalCurrentCash: number
    totalCurrentMarginAccess: number
    totalCurrentMarginBorrowed: number
  }
  aggregateTotals: {
    totalGainUsd: number
    totalRealizedGains: number
    totalValue: number
    totalStartInput: number
  }
}

// Cache storage
const cache = {
  funds: null as CacheEntry<DashboardFundSummary[]> | null,
  metrics: null as CacheEntry<DashboardMetrics> | null,
  history: null as CacheEntry<DashboardHistory> | null,
  rawFunds: null as CacheEntry<FundData[]> | null
}

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000

// Event listeners for cache updates
type CacheListener = (event: string, data: unknown) => void
const listeners: Set<CacheListener> = new Set()

export function addCacheListener(listener: CacheListener): void {
  listeners.add(listener)
}

export function removeCacheListener(listener: CacheListener): void {
  listeners.delete(listener)
}

function notifyListeners(event: string, data: unknown): void {
  for (const listener of listeners) {
    listener(event, data)
  }
}

// Check if cache entry is valid
function isCacheValid<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL
}

// Invalidate all caches
export function invalidateCache(): void {
  cache.funds = null
  cache.metrics = null
  cache.history = null
  cache.rawFunds = null
  notifyListeners('cache:invalidated', null)
}

// Load all fund files
async function loadAllFunds(includeTest = false): Promise<FundData[]> {
  // Check cache first
  if (isCacheValid(cache.rawFunds)) {
    const funds = cache.rawFunds.data
    if (!includeTest) {
      return funds.filter(f => !isTestPlatform(f.platform))
    }
    return funds
  }

  const files = await readdir(FUNDS_DIR)
  const tsvFiles = files.filter(f => f.endsWith('.tsv'))

  const funds: FundData[] = []
  for (const file of tsvFiles) {
    const fund = await readFund(join(FUNDS_DIR, file))
    if (fund) {
      funds.push(fund)
    }
  }

  // Cache raw funds
  cache.rawFunds = {
    data: funds,
    timestamp: Date.now()
  }

  if (!includeTest) {
    return funds.filter(f => !isTestPlatform(f.platform))
  }
  return funds
}

// Convert entries to trades
function entriesToTrades(entries: FundEntry[]): Trade[] {
  return entries
    .filter(e => (e.action === 'BUY' || e.action === 'SELL') && e.amount)
    .map(e => {
      const trade: Trade = {
        date: e.date,
        type: e.action?.toLowerCase() as 'buy' | 'sell',
        amount_usd: e.amount!
      }
      if (e.shares !== undefined) trade.shares = e.shares
      if (e.value !== undefined) trade.value = e.value
      return trade
    })
}

// Convert entries to dividends
function entriesToDividends(entries: FundEntry[]): Dividend[] {
  return entries
    .filter(e => e.dividend && e.dividend > 0)
    .map(e => ({
      date: e.date,
      amount_usd: e.dividend!
    }))
}

// Convert entries to expenses
function entriesToExpenses(entries: FundEntry[]): Expense[] {
  return entries
    .filter(e => e.expense && e.expense > 0)
    .map(e => ({
      date: e.date,
      amount_usd: e.expense!
    }))
}

// Get fund summaries (fast, for fund list)
export async function getFundSummaries(includeTest = false): Promise<DashboardFundSummary[]> {
  if (isCacheValid(cache.funds)) {
    const funds = cache.funds.data
    if (!includeTest) {
      return funds.filter(f => f.platform !== 'test')
    }
    return funds
  }

  const funds = await loadAllFunds(true) // Load all, filter later

  const summaries: DashboardFundSummary[] = funds.map(fund => {
    const sortedEntries = [...fund.entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    const latestEntry = sortedEntries[sortedEntries.length - 1]
    const firstEntry = sortedEntries[0]

    // Calculate actual fund size from latest entry or config
    const actualFundSize = latestEntry?.fund_size ?? fund.config.fund_size_usd

    return {
      id: fund.id,
      platform: fund.platform,
      ticker: fund.ticker,
      config: fund.config,
      entryCount: fund.entries.length,
      latestEquity: latestEntry ? { date: latestEntry.date, value: latestEntry.value } : null,
      latestFundSize: actualFundSize,
      firstEntryDate: firstEntry?.date
    }
  })

  cache.funds = {
    data: summaries,
    timestamp: Date.now()
  }

  notifyListeners('dashboard:funds', summaries)

  if (!includeTest) {
    return summaries.filter(f => !isTestPlatform(f.platform))
  }
  return summaries
}

// Get aggregate metrics (medium complexity)
export async function getAggregateMetrics(includeTest = false): Promise<DashboardMetrics> {
  if (isCacheValid(cache.metrics)) {
    const metrics = cache.metrics.data
    if (!includeTest) {
      const filteredFunds = metrics.funds.filter(f => !isTestPlatform(f.platform))
      return recalculateAggregates(filteredFunds)
    }
    return metrics
  }

  const funds = await loadAllFunds(true)
  const fundMetrics: FundMetrics[] = []

  for (const fund of funds) {
    const metrics = computeFundMetrics(fund)
    if (metrics) {
      fundMetrics.push(metrics)
    }
  }

  const aggregated = recalculateAggregates(fundMetrics)

  cache.metrics = {
    data: aggregated,
    timestamp: Date.now()
  }

  notifyListeners('dashboard:metrics', aggregated)

  if (!includeTest) {
    const filteredFunds = aggregated.funds.filter(f => !isTestPlatform(f.platform))
    return recalculateAggregates(filteredFunds)
  }
  return aggregated
}

// Compute metrics for a single fund using the same logic as /aggregate endpoint
function computeFundMetrics(fund: FundData): FundMetrics | null {
  if (fund.entries.length === 0) return null

  const sortedEntries = [...fund.entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const latestEntry = sortedEntries[sortedEntries.length - 1]!

  // Use computeFundFinalMetrics for accurate calculations (same as /aggregate endpoint)
  // This handles manage_cash=false correctly (uses netInvested instead of entry.fund_size)
  const finalMetrics = computeFundFinalMetrics(fund)

  // Use fundSize from finalMetrics for all funds (correctly handles manage_cash and derivatives)
  const actualFundSize = finalMetrics.fundSize
  const daysActive = finalMetrics.daysActive

  // Time-weighted AVERAGE fund size calculation (for APY and share weighting)
  // Sum dollar-days, then divide by daysActive to get average
  let dollarDays = 0
  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i]!
    const nextEntry = sortedEntries[i + 1]
    const entryFundSize = entry.fund_size ?? fund.config.fund_size_usd

    const startDate = new Date(entry.date)
    const endDate = nextEntry ? new Date(nextEntry.date) : new Date(latestEntry.date)
    const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)))

    dollarDays += entryFundSize * days
  }
  // Convert to time-weighted average (same as engine's computeTimeWeightedFundSize)
  const timeWeightedFundSize = daysActive > 0 ? dollarDays / daysActive : 0

  const isCashFund = fund.config.fund_type === 'cash'
  // Match REST API logic: only treat zero fund_size as closed if status is undefined
  const isClosed = fund.config.status === 'closed' ||
    (fund.config.status === undefined && fund.config.fund_size_usd === 0)

  // Use APY from finalMetrics (proper TWAB and compound interest formula)
  const realizedAPY = finalMetrics.realizedApy
  const liquidAPY = finalMetrics.liquidApy

  // Projected annual return (based on realized APY - actual income, not paper gains)
  const projectedAnnualReturn = realizedAPY * actualFundSize

  // For cash funds, gain = interest earned only
  const gainUsd = isCashFund ? finalMetrics.realized : finalMetrics.liquidPnl
  const gainPct = finalMetrics.totalInvested > 0 ? gainUsd / finalMetrics.totalInvested : 0

  return {
    id: fund.id,
    platform: fund.platform,
    ticker: fund.ticker,
    status: isClosed ? 'closed' : 'active',
    fundType: (fund.config.fund_type ?? 'stock') as 'cash' | 'stock' | 'crypto' | 'derivatives',
    fundSize: actualFundSize,
    currentValue: finalMetrics.currentValue,
    startInput: finalMetrics.totalInvested,
    daysActive,
    timeWeightedFundSize,
    realizedGains: finalMetrics.realized,
    unrealizedGains: finalMetrics.unrealized,
    realizedAPY,
    liquidAPY,
    projectedAnnualReturn,
    gainUsd,
    gainPct,
    fundShares: 0, // Calculated in aggregation
    fundSharesPct: 0 // Calculated in aggregation
  }
}

// Recalculate aggregates from fund metrics
function recalculateAggregates(fundMetrics: FundMetrics[]): DashboardMetrics {
  const totalFundSize = fundMetrics.reduce((sum, f) => sum + f.fundSize, 0)
  const totalValue = fundMetrics.reduce((sum, f) => sum + f.currentValue, 0)
  const totalStartInput = fundMetrics.reduce((sum, f) => sum + f.startInput, 0)
  const totalTimeWeightedFundSize = fundMetrics.reduce((sum, f) => sum + f.timeWeightedFundSize, 0)
  const totalDaysActive = fundMetrics.reduce((sum, f) => sum + f.daysActive, 0)
  const totalRealizedGains = fundMetrics.reduce((sum, f) => sum + f.realizedGains, 0)
  const totalUnrealizedGains = fundMetrics.reduce((sum, f) => sum + f.unrealizedGains, 0)
  const activeFunds = fundMetrics.filter(f => f.status !== 'closed').length
  const closedFunds = fundMetrics.filter(f => f.status === 'closed').length

  // Calculate fund shares
  const dollarsPerDay = totalTimeWeightedFundSize > 0 && totalDaysActive > 0
    ? totalTimeWeightedFundSize / totalDaysActive
    : 0

  let totalFundShares = 0
  const fundsWithShares = fundMetrics.map(fund => {
    const fundShares = dollarsPerDay > 0 && fund.daysActive > 0
      ? (fund.timeWeightedFundSize / dollarsPerDay) * fund.daysActive
      : 0
    totalFundShares += fundShares
    return { ...fund, fundShares }
  })

  const fundsWithSharesPct = fundsWithShares.map(fund => ({
    ...fund,
    fundSharesPct: totalFundShares > 0 ? fund.fundShares / totalFundShares : 0
  }))

  // Weighted realized APY
  let weightedRealizedAPY = 0
  for (const fund of fundsWithSharesPct) {
    weightedRealizedAPY += fund.realizedAPY * fund.fundSharesPct
  }

  // Sum projected returns
  const projectedAnnualReturn = fundsWithSharesPct
    .filter(f => f.currentValue > 0)
    .reduce((sum, f) => sum + f.projectedAnnualReturn, 0)

  // Total liquid gain = sum of each fund's liquidPnl (unrealized + realized)
  // This includes dividends, interest, and extracted profits - the full lifetime gain
  const totalGainUsd = fundMetrics.reduce((sum, f) => sum + f.gainUsd, 0)
  const totalGainPct = totalStartInput > 0 ? totalGainUsd / totalStartInput : 0

  // Aggregate liquid APY: (totalGainUsd / totalTimeWeightedFundSize) * (365 / avgDaysActive)
  // totalTimeWeightedFundSize is now the AVERAGE fund size (not dollar-days)
  const avgDaysActive = fundMetrics.length > 0 ? totalDaysActive / fundMetrics.length : 1
  const liquidAPY = totalTimeWeightedFundSize > 0 && avgDaysActive > 0
    ? (totalGainUsd / totalTimeWeightedFundSize) * (365 / avgDaysActive)
    : 0

  // Unrealized gain percentage
  const unrealizedGainPct = totalStartInput > 0 ? totalUnrealizedGains / totalStartInput : 0

  return {
    totalFundSize,
    totalValue,
    totalStartInput,
    totalTimeWeightedFundSize,
    totalDaysActive,
    totalRealizedGains,
    totalUnrealizedGains,
    unrealizedGainPct,
    realizedAPY: weightedRealizedAPY,
    liquidAPY,
    projectedAnnualReturn,
    totalGainUsd,
    totalGainPct,
    activeFunds,
    closedFunds,
    funds: fundsWithSharesPct
  }
}

// Get history (most expensive, computed last)
export async function getHistory(includeTest = false): Promise<DashboardHistory> {
  if (isCacheValid(cache.history)) {
    // Filter if needed
    if (!includeTest) {
      const history = cache.history.data
      const filteredAllocations = history.currentAllocations.filter(a => !isTestPlatform(a.platform))
      return {
        ...history,
        currentAllocations: filteredAllocations,
        totals: recalculateTotals(filteredAllocations)
      }
    }
    return cache.history.data
  }

  notifyListeners('dashboard:history:computing', { status: 'started' })

  const funds = await loadAllFunds(true)

  // Build time series and allocations
  const history = computeHistory(funds)

  cache.history = {
    data: history,
    timestamp: Date.now()
  }

  notifyListeners('dashboard:history', history)

  if (!includeTest) {
    const filteredAllocations = history.currentAllocations.filter(a => !isTestPlatform(a.platform))
    return {
      ...history,
      currentAllocations: filteredAllocations,
      totals: recalculateTotals(filteredAllocations)
    }
  }
  return history
}

// Compute history time series
function computeHistory(funds: FundData[]): DashboardHistory {
  // Collect all unique dates
  const allDates = new Set<string>()
  for (const fund of funds) {
    for (const entry of fund.entries) {
      allDates.add(entry.date)
    }
  }

  const sortedDates = [...allDates].sort()
  const timeSeries: TimeSeriesPoint[] = []

  // Pre-compute derivatives state for each derivatives fund (matches REST API)
  type DerivState = { equity: number; costBasis: number; marginBalance: number; availableFunds: number; realizedPnl: number; cumInterest: number }
  const derivativesStateByFund = new Map<string, Map<string, DerivState>>()
  for (const fund of funds) {
    if (fund.config.fund_type === 'derivatives' && fund.entries.length > 0) {
      const contractMultiplier = fund.config.contract_multiplier ?? 0.01
      const derivStates = computeDerivativesEntriesState(fund.entries, contractMultiplier)
      const dateMap = new Map<string, DerivState>()
      for (const entry of derivStates) {
        dateMap.set(entry.date, {
          equity: entry.equity,
          costBasis: entry.costBasis,
          marginBalance: entry.marginBalance,
          availableFunds: entry.availableFunds,
          realizedPnl: entry.realizedPnl,
          cumInterest: entry.cumInterest
        })
      }
      derivativesStateByFund.set(fund.id, dateMap)
    }
  }

  // Track earliest start date for APY calculation
  let earliestStartDate: string | null = null
  for (const fund of funds) {
    const firstEntry = fund.entries[0]
    if (firstEntry && (!earliestStartDate || firstEntry.date < earliestStartDate)) {
      earliestStartDate = firstEntry.date
    }
  }

  for (const date of sortedDates) {
    let totalFundSize = 0
    let totalValue = 0
    let totalCash = 0
    let totalMarginBorrowed = 0
    let totalMarginAccess = 0
    let totalStartInput = 0
    let totalDividends = 0
    let totalExpenses = 0
    let totalCashInterest = 0
    let totalRealizedGain = 0
    let totalGainUsd = 0
    const fundBreakdown: Record<string, number> = {}

    for (const fund of funds) {
      const entriesUpToDate = fund.entries.filter(e => e.date <= date)
      if (entriesUpToDate.length === 0) continue

      const sortedEntries = [...entriesUpToDate].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      const latestEntry = sortedEntries[sortedEntries.length - 1]!

      const isCashFund = fund.config.fund_type === 'cash'
      const isDerivativesFund = fund.config.fund_type === 'derivatives'

      // Handle derivatives funds specially (matches REST API)
      if (isDerivativesFund) {
        const derivDateMap = derivativesStateByFund.get(fund.id)
        let derivValue = 0
        let derivCostBasis = 0
        let derivAvailableFunds = 0
        let derivRealizedPnl = 0
        let derivCumInterest = 0
        if (derivDateMap) {
          for (const entry of sortedEntries) {
            const state = derivDateMap.get(entry.date)
            if (state) {
              derivValue = state.equity
              derivCostBasis = state.costBasis
              derivAvailableFunds = state.availableFunds
              derivRealizedPnl = state.realizedPnl
              derivCumInterest = state.cumInterest
            }
          }
        }
        totalValue += derivValue
        totalFundSize += derivValue
        totalStartInput += derivCostBasis
        totalRealizedGain += derivRealizedPnl + derivCumInterest
        totalCashInterest += derivCumInterest
        totalCash += Math.max(0, derivAvailableFunds)
        fundBreakdown[fund.id] = derivValue
        // Derivatives gain = unrealized (equity - costBasis) + realized P&L
        totalGainUsd += (derivValue - derivCostBasis) + derivRealizedPnl
      } else {
        // Cash and trading funds - use original logic
        const actualFundSize = latestEntry.fund_size ?? fund.config.fund_size_usd
        totalFundSize += actualFundSize
        totalValue += latestEntry.value
        fundBreakdown[fund.id] = latestEntry.value

        // Compute state for this fund at this date
        const trades = entriesToTrades(sortedEntries)
        const dividends = entriesToDividends(sortedEntries)
        const expenses = entriesToExpenses(sortedEntries)

        const configWithActualFundSize = { ...fund.config, fund_size_usd: actualFundSize }
        const state = computeFundState(
          configWithActualFundSize,
          trades,
          [],
          dividends,
          expenses,
          latestEntry.value,
          date
        )

        totalStartInput += state.start_input_usd
        totalRealizedGain += state.realized_gains_usd
        totalCashInterest += state.cash_interest_usd

        const fundGain = isCashFund ? state.realized_gains_usd : state.gain_usd
        totalGainUsd += fundGain

        // Track dividends and expenses
        for (const entry of sortedEntries) {
          if (entry.dividend) totalDividends += Math.abs(entry.dividend)
          if (entry.expense) totalExpenses += Math.abs(entry.expense)
        }

        // Cash
        const cash = isCashFund
          ? (latestEntry.cash ?? latestEntry.value)
          : (latestEntry.cash ?? 0)
        totalCash += cash
      }

      // Margin
      if (latestEntry.margin_borrowed) {
        totalMarginBorrowed += latestEntry.margin_borrowed
      }
      if (fund.config.margin_access_usd) {
        totalMarginAccess += fund.config.margin_access_usd
      }
    }

    // Calculate gains and APY
    const totalGainUsdForChart = totalValue - totalStartInput
    const totalGainPct = totalStartInput > 0 ? totalGainUsdForChart / totalStartInput : 0

    const daysActive = earliestStartDate
      ? Math.max(1, Math.floor((new Date(date).getTime() - new Date(earliestStartDate).getTime()) / (24 * 60 * 60 * 1000)))
      : 1

    const apyBase = Math.max(totalStartInput, totalFundSize * 0.1)
    const realizedAPY = apyBase > 0 && daysActive > 0
      ? (totalRealizedGain / apyBase) * (365 / daysActive)
      : 0
    const liquidAPY = apyBase > 0 && daysActive > 0
      ? (totalGainUsd / apyBase) * (365 / daysActive)
      : 0

    timeSeries.push({
      date,
      totalFundSize,
      totalValue,
      totalCash,
      totalMarginBorrowed,
      totalMarginAccess,
      totalStartInput,
      totalDividends,
      totalExpenses,
      totalCashInterest,
      totalRealizedGain,
      realizedAPY,
      liquidAPY,
      totalGainUsd: totalGainUsdForChart,
      totalGainPct,
      fundBreakdown
    })
  }

  // Current allocations
  const currentAllocations: AllocationData[] = []
  for (const fund of funds) {
    const latest = fund.entries[fund.entries.length - 1]
    if (!latest) continue

    const isCashFund = fund.config.fund_type === 'cash'
    const isDerivativesFund = fund.config.fund_type === 'derivatives'

    let value = latest.value
    let cash = 0
    let fundSize = latest.fund_size ?? fund.config.fund_size_usd

    if (isDerivativesFund) {
      // Use computed derivatives equity and available funds (matches REST API)
      const derivDateMap = derivativesStateByFund.get(fund.id)
      if (derivDateMap) {
        const state = derivDateMap.get(latest.date)
        if (state) {
          value = state.equity
          fundSize = state.equity  // Use equity as fund size for derivatives
          cash = Math.max(0, state.availableFunds)  // Available margin (not locked)
        }
      }
    } else if (isCashFund) {
      cash = latest.cash ?? latest.value
    } else {
      cash = latest.cash ?? 0
    }

    currentAllocations.push({
      id: fund.id,
      ticker: fund.ticker,
      platform: fund.platform,
      value,
      cash,
      fundSize,
      marginAccess: fund.config.margin_access_usd ?? 0,
      marginBorrowed: latest.margin_borrowed ?? 0
    })
  }

  const totals = recalculateTotals(currentAllocations)

  // Aggregate totals from latest time series point
  const lastPoint = timeSeries[timeSeries.length - 1]
  const aggregateTotals = {
    totalGainUsd: lastPoint?.totalGainUsd ?? 0,
    totalRealizedGains: lastPoint?.totalRealizedGain ?? 0,
    totalValue: lastPoint?.totalValue ?? 0,
    totalStartInput: lastPoint?.totalStartInput ?? 0
  }

  return {
    timeSeries,
    currentAllocations,
    totals,
    aggregateTotals
  }
}

function recalculateTotals(allocations: AllocationData[]) {
  return {
    totalCurrentValue: allocations.reduce((sum, a) => sum + a.value, 0),
    totalCurrentCash: allocations.reduce((sum, a) => sum + a.cash, 0),
    totalCurrentMarginAccess: allocations.reduce((sum, a) => sum + a.marginAccess, 0),
    totalCurrentMarginBorrowed: allocations.reduce((sum, a) => sum + a.marginBorrowed, 0)
  }
}
