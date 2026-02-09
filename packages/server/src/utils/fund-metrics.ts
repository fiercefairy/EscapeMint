import type { FundData } from '@escapemint/storage'
import {
  computeDerivativesEntriesState,
  isCashFund as checkIsCashFund,
  isDerivativesFund as checkIsDerivativesFund
} from '@escapemint/engine'

/**
 * Computed metrics for the latest state of a fund.
 * These are calculated once and used by both fund detail and platform aggregation.
 */
export interface FundComputedMetrics {
  // Core values
  fundSize: number
  currentValue: number
  cash: number
  totalInvested: number

  // Cumulative totals
  sumDividends: number
  sumExpenses: number
  sumCashInterest: number
  sumExtracted: number

  // Gains
  unrealized: number
  realized: number
  liquidPnl: number

  // APY calculations
  realizedApy: number
  liquidApy: number

  // Tracking
  daysActive: number
  costBasis: number

  // Derivatives-specific fields (only present for derivatives funds)
  position?: number           // Net contracts held
  avgEntry?: number          // Average entry price
  marginBalance?: number     // Total margin balance
  sumFunding?: number        // Cumulative funding payments
  sumRebates?: number        // Cumulative rebates
  sumFees?: number           // Cumulative trading fees
}

/**
 * Compute the final metrics for a fund by processing all entries.
 * This matches the calculation logic in FundDetail.tsx.
 */
export function computeFundFinalMetrics(fund: FundData): FundComputedMetrics {
  const entries = fund.entries
  const config = fund.config
  const isCashFund = checkIsCashFund(config.fund_type)
  const isDerivativesFund = checkIsDerivativesFund(config.fund_type)
  const isAccumulate = config.accumulate ?? false
  const manageCash = config.manage_cash !== false

  // Handle derivatives funds separately
  if (isDerivativesFund && entries.length > 0) {
    const contractMultiplier = config.contract_multiplier ?? 0.01
    const maintenanceMarginRate = config.maintenance_margin_rate ?? 0.20
    const initialMarginRate = config.initial_margin_rate ?? 0.25
    const derivStates = computeDerivativesEntriesState(entries, contractMultiplier, maintenanceMarginRate, undefined, initialMarginRate)
    const lastState = derivStates[derivStates.length - 1]

    if (lastState) {
      const startDate = config.start_date ?? entries[0]?.date ?? new Date().toISOString().split('T')[0]
      const endDate = lastState.date
      const daysActive = Math.max(1, Math.floor(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
      ))

      // Realized P&L already includes funding + interest + rebates - fees from the engine
      const realized = lastState.realizedPnl
      const liquidPnl = lastState.unrealizedPnl + realized
      const denominator = lastState.costBasis > 0 ? lastState.costBasis : 1

      // Calculate APY
      let realizedApy = 0
      let liquidApy = 0
      if (daysActive > 0 && denominator > 0) {
        const realizedReturnPct = realized / denominator
        const clampedRealizedPct = Math.max(-0.99, realizedReturnPct)
        realizedApy = Math.pow(1 + clampedRealizedPct, 365 / daysActive) - 1

        const liquidReturnPct = liquidPnl / denominator
        const clampedLiquidPct = Math.max(-0.99, liquidReturnPct)
        liquidApy = Math.pow(1 + clampedLiquidPct, 365 / daysActive) - 1
      }

      return {
        fundSize: lastState.marginBalance,
        currentValue: lastState.equity,
        cash: lastState.availableFunds,  // Available funds = marginBalance - marginLocked
        totalInvested: lastState.costBasis,
        sumDividends: 0,
        sumExpenses: lastState.sumFees,
        sumCashInterest: lastState.sumInterest,
        sumExtracted: lastState.realizedPnl,
        unrealized: lastState.unrealizedPnl,
        realized,
        liquidPnl,
        realizedApy,
        liquidApy,
        daysActive,
        costBasis: lastState.costBasis,
        // Derivatives-specific fields
        position: lastState.position,
        avgEntry: lastState.avgEntry,
        marginBalance: lastState.marginBalance,
        sumFunding: lastState.sumFunding,
        sumRebates: lastState.sumRebates,
        sumFees: lastState.sumFees
      }
    }
  }

  // Initialize tracking variables
  let totalBuys = 0
  let totalSells = 0
  let sumShares = 0
  let costBasis = 0
  let sumDividends = 0
  let sumExpenses = 0
  let sumCashInterest = 0
  let sumExtracted = 0
  let _previousCyclesGain = 0  // Accumulated gains from previous cycles; tracked for future multi-cycle reporting
  // Track total ever invested across all cycles (for APY calculation on fully liquidated funds)
  let totalEverInvested = 0

  // For TWAB calculation (cash funds)
  let twabNumerator = 0
  let lastCashBalance = 0
  let lastDate: string | null = null

  // Process all entries
  for (const entry of entries) {
    // Track days between entries for TWAB
    if (lastDate && isCashFund) {
      const daysBetween = Math.max(1, Math.floor(
        (new Date(entry.date).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
      ))
      twabNumerator += lastCashBalance * daysBetween
    }

    // Track shares
    if (entry.shares !== undefined) {
      if (entry.action === 'BUY') sumShares += entry.shares
      else if (entry.action === 'SELL') sumShares -= entry.shares
    }

    // Track cumulative income/expenses
    if (entry.dividend) sumDividends += entry.dividend
    if (entry.expense) sumExpenses += entry.expense
    if (entry.cash_interest) sumCashInterest += entry.cash_interest

    // Process buys and sells
    if (entry.action === 'BUY' && entry.amount) {
      totalBuys += entry.amount
      costBasis += entry.amount
      totalEverInvested += entry.amount  // Track across all cycles for APY
    } else if (entry.action === 'SELL' && entry.amount) {
      // Check for full liquidation
      const hasShareTracking = entry.shares !== undefined && entry.shares !== 0
      const sharesLiquidated = hasShareTracking && Math.abs(sumShares) < 0.0001
      const valueLiquidated = (entry.value ?? 0) <= entry.amount + 0.01
      const isFullLiquidation = sharesLiquidated || valueLiquidated

      // Calculate extracted profit
      let extracted = 0
      if (isFullLiquidation) {
        extracted = entry.amount - costBasis
        _previousCyclesGain += extracted
        costBasis = 0
        totalBuys = 0
        totalSells = 0
      } else if (isAccumulate) {
        // Accumulate mode: entire sell is profit extraction
        extracted = entry.amount
      } else {
        // Harvest mode: proportional cost basis
        const sellProportion = entry.amount / ((entry.value ?? 0) + entry.amount)
        const costBasisReturned = costBasis * sellProportion
        extracted = entry.amount - costBasisReturned
        costBasis -= costBasisReturned
        totalSells += entry.amount
      }
      sumExtracted += extracted

      // In accumulate mode, partial sells don't reduce totalSells
      if (!isAccumulate || isFullLiquidation) {
        if (!isFullLiquidation) totalSells += entry.amount
      }
    }

    // Update TWAB tracking
    if (isCashFund) {
      lastCashBalance = entry.cash ?? entry.value ?? 0
    }
    lastDate = entry.date
  }

  // Get latest entry for final values
  const latestEntry = entries[entries.length - 1]
  const today = new Date().toISOString().split('T')[0] as string
  const startDate = config.start_date ?? entries[0]?.date ?? today
  const endDate = latestEntry?.date ?? today
  const daysActive = Math.max(1, Math.floor(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  ))

  // Calculate final values
  const netInvested = Math.max(0, totalBuys - totalSells)

  let fundSize: number
  let currentValue: number
  let cash: number

  if (config.status === 'closed') {
    fundSize = 0
    currentValue = 0
    cash = 0
  } else if (isCashFund) {
    // For cash funds: fund_size = cash = currentValue
    cash = latestEntry?.cash ?? latestEntry?.fund_size ?? latestEntry?.value ?? 0
    fundSize = latestEntry?.fund_size ?? cash
    currentValue = cash
  } else {
    // For trading funds with manage_cash=false, fundSize = netInvested (matches FundDetail.tsx)
    // For trading funds with manage_cash=true, use entry's fund_size or config
    fundSize = !manageCash ? netInvested : (latestEntry?.fund_size ?? config.fund_size_usd)
    // Calculate post-action value (entry.value is pre-action)
    // After a BUY, the equity value increases by the buy amount
    // After a SELL, the equity value decreases by the sell amount
    let postActionValue = latestEntry?.value ?? 0
    if (latestEntry?.action === 'BUY' && latestEntry?.amount) {
      postActionValue += latestEntry.amount
    } else if (latestEntry?.action === 'SELL' && latestEntry?.amount) {
      postActionValue = Math.max(0, postActionValue - latestEntry.amount)
    }
    currentValue = postActionValue
    if (!manageCash) {
      cash = 0
    } else {
      cash = latestEntry?.cash ?? Math.max(0, fundSize - netInvested)
    }
  }

  // Calculate unrealized and realized gains
  // For cash funds: no unrealized (cash doesn't appreciate), all gains are realized (interest)
  // For trading funds: unrealized = asset value - cost basis
  const unrealized = isCashFund ? 0 : (currentValue - costBasis)

  const realized = isCashFund
    ? sumCashInterest - sumExpenses
    : sumCashInterest + sumDividends + sumExtracted - sumExpenses

  const liquidPnl = unrealized + realized

  // Calculate APY
  let realizedApy = 0
  let liquidApy = 0

  if (daysActive > 0) {
    if (isCashFund) {
      // Cash fund APY: based on TWAB
      const twab = daysActive > 0 ? twabNumerator / daysActive : lastCashBalance
      const denominator = twab > 0 ? twab : (fundSize > 0 ? fundSize : 1)
      if (Math.abs(realized) >= 0.01) {
        const returnPct = realized / denominator
        const clampedPct = Math.max(-0.99, Math.min(returnPct, 1))
        realizedApy = Math.pow(1 + clampedPct, 365 / daysActive) - 1
        realizedApy = Math.max(-0.99, Math.min(realizedApy, 10))
        liquidApy = realizedApy
      }
    } else {
      // Trading fund APY: based on invested capital
      // Use totalEverInvested as fallback for fully liquidated funds with realized gains
      const denominator = netInvested > 0 ? netInvested : (costBasis > 0 ? costBasis : (totalEverInvested > 0 ? totalEverInvested : currentValue))
      if (denominator > 0) {
        const realizedReturnPct = realized / denominator
        const clampedRealizedPct = Math.max(-0.99, realizedReturnPct)
        realizedApy = Math.pow(1 + clampedRealizedPct, 365 / daysActive) - 1

        const liquidReturnPct = liquidPnl / denominator
        const clampedLiquidPct = Math.max(-0.99, liquidReturnPct)
        liquidApy = Math.pow(1 + clampedLiquidPct, 365 / daysActive) - 1
      }
    }
  }

  return {
    fundSize,
    currentValue,
    cash,
    totalInvested: isCashFund ? cash : netInvested,
    sumDividends,
    sumExpenses,
    sumCashInterest,
    sumExtracted,
    unrealized,
    realized,
    liquidPnl,
    realizedApy,
    liquidApy,
    daysActive,
    costBasis
  }
}
