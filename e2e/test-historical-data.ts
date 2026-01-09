/**
 * Deterministic historical price data for E2E tests
 *
 * Uses real market data from TQQQ, SPXL, and BTC to ensure reproducible tests.
 * Weekly returns are pre-computed from actual historical prices.
 */

import tqqqData from '../packages/server/src/data/tqqq-weekly.json' with { type: 'json' }
import spxlData from '../packages/server/src/data/spxl-weekly.json' with { type: 'json' }
import btcData from '../packages/server/src/data/btcusd-weekly.json' with { type: 'json' }

interface WeeklyPrice {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Compute weekly returns from price data
 */
function computeWeeklyReturns(data: WeeklyPrice[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < data.length; i++) {
    const prevClose = data[i - 1].close
    const currClose = data[i].close
    const weeklyReturn = (currClose - prevClose) / prevClose
    returns.push(weeklyReturn)
  }
  return returns
}

// Pre-compute all returns
const tqqqReturns = computeWeeklyReturns(tqqqData as WeeklyPrice[])
const spxlReturns = computeWeeklyReturns(spxlData as WeeklyPrice[])
const btcReturns = computeWeeklyReturns(btcData as WeeklyPrice[])

/**
 * Get 52 weeks of returns starting from a specific index
 */
function getReturnsSlice(returns: number[], startIndex: number, weeks = 52): number[] {
  const slice = returns.slice(startIndex, startIndex + weeks)
  // Pad with zeros if not enough data
  while (slice.length < weeks) {
    slice.push(0)
  }
  return slice
}

/**
 * Find index by approximate date (YYYY-MM-DD)
 */
function findIndexByDate(data: WeeklyPrice[], targetDate: string): number {
  const target = new Date(targetDate).getTime()
  let closestIndex = 0
  let closestDiff = Infinity

  for (let i = 0; i < data.length; i++) {
    const diff = Math.abs(new Date(data[i].date).getTime() - target)
    if (diff < closestDiff) {
      closestDiff = diff
      closestIndex = i
    }
  }
  return closestIndex
}

// === DETERMINISTIC MARKET SCENARIOS ===
// These use real historical data from specific time periods

/**
 * Bull Market: TQQQ 2023 rally (Jan 2023 - Jan 2024)
 * Strong uptrend with consistent gains
 */
export function getBullMarketReturns(): number[] {
  const startIndex = findIndexByDate(tqqqData as WeeklyPrice[], '2023-01-05')
  return getReturnsSlice(tqqqReturns, startIndex, 52)
}

/**
 * Bear Market: TQQQ 2022 crash (Jan 2022 - Jan 2023)
 * Sustained downtrend with significant losses
 */
export function getBearMarketReturns(): number[] {
  const startIndex = findIndexByDate(tqqqData as WeeklyPrice[], '2022-01-06')
  return getReturnsSlice(tqqqReturns, startIndex, 52)
}

/**
 * Volatile Market: BTC 2022 (high volatility with large swings)
 */
export function getVolatileMarketReturns(): number[] {
  const startIndex = findIndexByDate(btcData as WeeklyPrice[], '2022-01-01')
  return getReturnsSlice(btcReturns, startIndex, 52)
}

/**
 * Crash and Recovery: TQQQ Feb 2022 - Feb 2023
 * Includes the sharp crash and partial recovery
 */
export function getCrashRecoveryReturns(): number[] {
  const startIndex = findIndexByDate(tqqqData as WeeklyPrice[], '2022-02-01')
  return getReturnsSlice(tqqqReturns, startIndex, 52)
}

/**
 * Sideways Market: SPXL mid-2023 (relatively flat with small moves)
 */
export function getSidewaysMarketReturns(): number[] {
  const startIndex = findIndexByDate(spxlData as WeeklyPrice[], '2023-06-01')
  return getReturnsSlice(spxlReturns, startIndex, 52)
}

/**
 * Steady Growth: SPXL 2024 (moderate consistent gains)
 */
export function getSteadyGrowthReturns(): number[] {
  const startIndex = findIndexByDate(spxlData as WeeklyPrice[], '2024-01-01')
  return getReturnsSlice(spxlReturns, startIndex, 52)
}

// Export raw data for custom scenarios
export { tqqqReturns, spxlReturns, btcReturns }
export { tqqqData, spxlData, btcData }
