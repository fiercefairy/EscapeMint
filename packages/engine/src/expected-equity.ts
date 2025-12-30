import type { SubFundConfig, Trade, CashFlow, Dividend, Expense, FundState, ClosedFundMetrics } from './types.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DAYS_PER_YEAR = 365

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY)
}

/**
 * Computes the total amount currently invested (start input / cost basis).
 * This is the sum of all buys minus the sum of all sells.
 */
export function computeStartInput(trades: Trade[], asOfDate: string): number {
  let invested = 0

  for (const trade of trades) {
    if (daysBetween(trade.date, asOfDate) < 0) continue // Skip future
    if (trade.type === 'buy') {
      invested += trade.amount_usd
    } else {
      invested -= trade.amount_usd
    }
  }

  return Math.max(0, invested)
}

/**
 * Computes the expected target value based on compounding each trade.
 *
 * Uses periodic compounding (not continuous):
 * ExpectedGain = Σ(Trade_i * ((1 + TargetAPY)^(DaysElapsed_i / 365) - 1))
 * ExpectedTarget = StartInput + ExpectedGain
 */
export function computeExpectedTarget(
  config: SubFundConfig,
  trades: Trade[],
  asOfDate: string
): number {
  const { target_apy } = config

  let startInput = 0
  let expectedGain = 0

  for (const trade of trades) {
    const tradeDays = daysBetween(trade.date, asOfDate)
    if (tradeDays < 0) continue // Skip future trades

    if (trade.type === 'buy') {
      startInput += trade.amount_usd
      // Each buy compounds from its trade date
      const gain = trade.amount_usd * (Math.pow(1 + target_apy, tradeDays / DAYS_PER_YEAR) - 1)
      expectedGain += gain
    } else {
      // SELL reduces the invested amount
      startInput -= trade.amount_usd
      // Note: We don't subtract from expected gain - selling realizes the gain
    }
  }

  return startInput + expectedGain
}

/**
 * Computes the available cash in the pool.
 *
 * Cash = FundSize - StartInput + Deposits - Withdrawals
 */
export function computeCashAvailable(
  config: SubFundConfig,
  trades: Trade[],
  cashflows: CashFlow[],
  asOfDate: string
): number {
  const startInput = computeStartInput(trades, asOfDate)
  let cash = config.fund_size_usd - startInput

  // Apply external cash flows (deposits/withdrawals to the fund)
  for (const cf of cashflows) {
    if (daysBetween(cf.date, asOfDate) < 0) continue // Skip future
    if (cf.type === 'deposit') {
      cash += cf.amount_usd
    } else {
      cash -= cf.amount_usd
    }
  }

  return Math.max(0, cash)
}

/**
 * Computes cumulative cash interest earned on idle cash.
 * Interest accrues on the cash balance between each event date.
 */
export function computeCashInterest(
  config: SubFundConfig,
  trades: Trade[],
  cashflows: CashFlow[],
  asOfDate: string
): number {
  const { cash_apy, start_date, fund_size_usd } = config

  // Collect all events sorted by date
  const events: { date: string; type: 'trade' | 'cashflow'; amount: number; sign: number }[] = []

  for (const trade of trades) {
    events.push({
      date: trade.date,
      type: 'trade',
      amount: trade.amount_usd,
      sign: trade.type === 'buy' ? -1 : 1 // Buy decreases cash, sell increases
    })
  }

  for (const cf of cashflows) {
    events.push({
      date: cf.date,
      type: 'cashflow',
      amount: cf.amount_usd,
      sign: cf.type === 'deposit' ? 1 : -1
    })
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let totalInterest = 0
  let currentCash = fund_size_usd
  let lastDate = start_date

  for (const event of events) {
    if (daysBetween(event.date, asOfDate) < 0) continue
    if (daysBetween(lastDate, event.date) < 0) continue

    // Calculate interest on cash balance for this period
    const periodDays = daysBetween(lastDate, event.date)
    if (periodDays > 0 && currentCash > 0) {
      const periodInterest = currentCash * (Math.pow(1 + cash_apy, periodDays / DAYS_PER_YEAR) - 1)
      totalInterest += periodInterest
    }

    // Update cash balance
    currentCash += event.sign * event.amount
    currentCash = Math.max(0, currentCash)
    lastDate = event.date
  }

  // Interest from last event to asOfDate
  const finalDays = daysBetween(lastDate, asOfDate)
  if (finalDays > 0 && currentCash > 0) {
    const finalInterest = currentCash * (Math.pow(1 + cash_apy, finalDays / DAYS_PER_YEAR) - 1)
    totalInterest += finalInterest
  }

  return totalInterest
}

/**
 * Computes cumulative realized gains.
 * Realized gains include: cash interest, dividends, expenses (negative)
 */
export function computeRealizedGains(
  config: SubFundConfig,
  trades: Trade[],
  cashflows: CashFlow[],
  dividends: Dividend[],
  expenses: Expense[],
  asOfDate: string
): number {
  let realized = 0

  // Add cash interest
  realized += computeCashInterest(config, trades, cashflows, asOfDate)

  // Add dividends
  for (const div of dividends) {
    if (daysBetween(div.date, asOfDate) < 0) continue
    realized += div.amount_usd
  }

  // Subtract expenses
  for (const exp of expenses) {
    if (daysBetween(exp.date, asOfDate) < 0) continue
    realized -= exp.amount_usd
  }

  return realized
}

/**
 * Computes the complete fund state at a given date.
 */
export function computeFundState(
  config: SubFundConfig,
  trades: Trade[],
  cashflows: CashFlow[],
  dividends: Dividend[],
  expenses: Expense[],
  actualValue: number,
  asOfDate: string
): FundState {
  // Closed fund (no allocation) - return zeroed state
  if (config.fund_size_usd === 0) {
    return {
      cash_available_usd: 0,
      expected_target_usd: 0,
      actual_value_usd: actualValue,
      start_input_usd: 0,
      gain_usd: 0,
      gain_pct: 0,
      target_diff_usd: 0,
      cash_interest_usd: 0,
      realized_gains_usd: 0
    }
  }

  const startInput = computeStartInput(trades, asOfDate)
  const expectedTarget = computeExpectedTarget(config, trades, asOfDate)
  const cashAvailable = computeCashAvailable(config, trades, cashflows, asOfDate)
  const cashInterest = computeCashInterest(config, trades, cashflows, asOfDate)
  const realizedGains = computeRealizedGains(config, trades, cashflows, dividends, expenses, asOfDate)

  const gainUsd = startInput > 0 ? actualValue - startInput : 0
  const gainPct = startInput > 0 ? (actualValue / startInput) - 1 : 0
  const targetDiff = actualValue - expectedTarget

  return {
    cash_available_usd: cashAvailable,
    expected_target_usd: expectedTarget,
    actual_value_usd: actualValue,
    start_input_usd: startInput,
    gain_usd: gainUsd,
    gain_pct: gainPct,
    target_diff_usd: targetDiff,
    cash_interest_usd: cashInterest,
    realized_gains_usd: realizedGains
  }
}

/**
 * Computes historical performance metrics for a closed fund.
 * Used to show overall return, APY, etc. for funds that have been liquidated.
 */
export function computeClosedFundMetrics(
  trades: Trade[],
  dividends: Dividend[],
  expenses: Expense[],
  cashInterest: number,
  startDate: string,
  endDate: string,
  finalEquityValue?: number
): ClosedFundMetrics {
  let totalInvested = 0
  let totalReturned = 0

  for (const trade of trades) {
    if (trade.type === 'buy') {
      totalInvested += trade.amount_usd
    } else {
      totalReturned += trade.amount_usd
    }
  }

  let totalDividends = 0
  for (const div of dividends) {
    totalDividends += div.amount_usd
  }

  let totalExpenses = 0
  for (const exp of expenses) {
    totalExpenses += exp.amount_usd
  }

  const netGain = totalReturned + totalDividends + cashInterest - totalExpenses - totalInvested

  // For APY calculation, use the final equity value if provided (last non-zero value before closure)
  // Otherwise fall back to total returned
  const denominatorForApy = finalEquityValue ?? totalReturned

  // Simple return = profit / finalValue
  const returnPct = denominatorForApy > 0 ? netGain / denominatorForApy : 0

  const durationDays = daysBetween(startDate, endDate)

  // APY = (1 + returnPct)^(365/days) - 1
  // For very short periods, avoid division issues
  const apy = durationDays > 3
    ? Math.pow(1 + returnPct, DAYS_PER_YEAR / durationDays) - 1
    : returnPct

  return {
    total_invested_usd: totalInvested,
    total_returned_usd: totalReturned,
    total_dividends_usd: totalDividends,
    total_cash_interest_usd: cashInterest,
    total_expenses_usd: totalExpenses,
    net_gain_usd: netGain,
    return_pct: returnPct,
    apy,
    start_date: startDate,
    end_date: endDate,
    duration_days: durationDays
  }
}
