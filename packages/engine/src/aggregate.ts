import type { SubFundConfig, Trade, FundState } from './types.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DAYS_PER_YEAR = 365

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY)
}

export interface FundMetrics {
  id: string
  platform: string
  ticker: string
  fundSize: number
  currentValue: number
  startInput: number
  daysActive: number
  timeWeightedFundSize: number
  realizedGains: number
  realizedAPY: number
  projectedAnnualReturn: number
  gainUsd: number
  gainPct: number
}

export interface AggregateMetrics {
  totalFundSize: number
  totalValue: number
  totalStartInput: number
  totalTimeWeightedFundSize: number
  totalDaysActive: number
  totalRealizedGains: number
  realizedAPY: number
  projectedAnnualReturn: number
  totalGainUsd: number
  totalGainPct: number
  activeFunds: number
  closedFunds: number
  funds: FundMetrics[]
}

/**
 * Computes time-weighted fund size for a single fund.
 *
 * Time-weighted fund size accounts for when capital was deployed.
 * If fund started at $1000 and grew to $5000 over time through deposits,
 * the time-weighted size gives proper weight to each contribution.
 */
export function computeTimeWeightedFundSize(
  trades: Trade[],
  startDate: string,
  asOfDate: string
): number {
  const totalDays = daysBetween(startDate, asOfDate)
  if (totalDays <= 0) return 0

  // Sort trades by date
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  let cumulativeInvestment = 0
  let weightedSum = 0
  let lastDate = startDate

  for (const trade of sortedTrades) {
    if (daysBetween(trade.date, asOfDate) < 0) continue
    if (daysBetween(startDate, trade.date) < 0) continue

    // Add time-weighted value for the period before this trade
    const periodDays = daysBetween(lastDate, trade.date)
    if (periodDays > 0) {
      weightedSum += cumulativeInvestment * periodDays
    }

    // Update cumulative investment
    if (trade.type === 'buy') {
      cumulativeInvestment += trade.amount_usd
    } else {
      cumulativeInvestment -= trade.amount_usd
    }
    cumulativeInvestment = Math.max(0, cumulativeInvestment)
    lastDate = trade.date
  }

  // Add final period to asOfDate
  const finalDays = daysBetween(lastDate, asOfDate)
  if (finalDays > 0) {
    weightedSum += cumulativeInvestment * finalDays
  }

  return weightedSum / totalDays
}

/**
 * Computes realized APY for a fund.
 *
 * Realized APY = (Realized Gains / Time-Weighted Fund Size) * (365 / Days Active)
 *
 * This gives an annualized return based on actual gains realized from:
 * - Cash interest
 * - Dividends
 * - Sell profits
 * - Less expenses
 */
export function computeRealizedAPY(
  realizedGains: number,
  timeWeightedFundSize: number,
  daysActive: number
): number {
  if (timeWeightedFundSize <= 0 || daysActive <= 0) return 0
  return (realizedGains / timeWeightedFundSize) * (DAYS_PER_YEAR / daysActive)
}

/**
 * Computes projected annual return for a fund.
 *
 * Uses realized APY to project what a full year would return
 * on the current fund value.
 */
export function computeProjectedAnnualReturn(
  currentValue: number,
  realizedAPY: number
): number {
  return currentValue * realizedAPY
}

/**
 * Computes metrics for a single fund.
 */
export function computeFundMetrics(
  id: string,
  platform: string,
  ticker: string,
  config: SubFundConfig,
  trades: Trade[],
  state: FundState | null,
  asOfDate: string
): FundMetrics {
  const daysActive = daysBetween(config.start_date, asOfDate)
  const timeWeightedFundSize = computeTimeWeightedFundSize(trades, config.start_date, asOfDate)
  const realizedGains = state?.realized_gains_usd ?? 0
  const realizedAPY = computeRealizedAPY(realizedGains, timeWeightedFundSize, daysActive)
  const currentValue = state?.actual_value_usd ?? 0
  const projectedAnnualReturn = computeProjectedAnnualReturn(currentValue, realizedAPY)

  return {
    id,
    platform,
    ticker,
    fundSize: config.fund_size_usd,
    currentValue,
    startInput: state?.start_input_usd ?? 0,
    daysActive,
    timeWeightedFundSize,
    realizedGains,
    realizedAPY,
    projectedAnnualReturn,
    gainUsd: state?.gain_usd ?? 0,
    gainPct: state?.gain_pct ?? 0
  }
}

/**
 * Computes aggregate metrics across all funds.
 */
export function computeAggregateMetrics(fundMetrics: FundMetrics[]): AggregateMetrics {
  let totalFundSize = 0
  let totalValue = 0
  let totalStartInput = 0
  let totalTimeWeightedFundSize = 0
  let totalDaysActive = 0
  let totalRealizedGains = 0
  let activeFunds = 0
  let closedFunds = 0

  for (const fund of fundMetrics) {
    totalFundSize += fund.fundSize
    totalValue += fund.currentValue
    totalStartInput += fund.startInput
    totalTimeWeightedFundSize += fund.timeWeightedFundSize
    totalDaysActive += fund.daysActive
    totalRealizedGains += fund.realizedGains

    if (fund.platform === 'closed' || fund.currentValue === 0) {
      closedFunds++
    } else {
      activeFunds++
    }
  }

  // Compute weighted realized APY
  // Use time-weighted fund size for proper weighting
  const realizedAPY = totalTimeWeightedFundSize > 0
    ? totalRealizedGains / totalTimeWeightedFundSize * (DAYS_PER_YEAR / (totalDaysActive / fundMetrics.length || 1))
    : 0

  // Projected annual return is sum of all active funds' projections
  const projectedAnnualReturn = fundMetrics
    .filter(f => f.platform !== 'closed' && f.currentValue > 0)
    .reduce((sum, f) => sum + f.projectedAnnualReturn, 0)

  const totalGainUsd = totalValue - totalStartInput
  const totalGainPct = totalStartInput > 0 ? (totalValue / totalStartInput - 1) : 0

  return {
    totalFundSize,
    totalValue,
    totalStartInput,
    totalTimeWeightedFundSize,
    totalDaysActive,
    totalRealizedGains,
    realizedAPY,
    projectedAnnualReturn,
    totalGainUsd,
    totalGainPct,
    activeFunds,
    closedFunds,
    funds: fundMetrics
  }
}
