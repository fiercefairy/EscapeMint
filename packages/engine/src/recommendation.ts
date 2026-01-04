import type { SubFundConfig, Recommendation, FundState } from './types.js'

/**
 * Determines the action amount (limit) based on fund performance.
 *
 * Logic from spreadsheet:
 * - If gain_usd < 0 (lost money):
 *   - If gain_pct < max_at_pct (significant loss): use input_max_usd
 *   - Else: use input_mid_usd
 * - Else (made money or break-even): use input_min_usd
 */
export function computeLimit(config: SubFundConfig, state: FundState): number {
  const { input_min_usd, input_mid_usd, input_max_usd, max_at_pct } = config

  // If no investment yet, use min amount for initial buy
  if (state.start_input_usd === 0) {
    return input_min_usd
  }

  // If lost money this period
  if (state.gain_usd < 0) {
    // If loss exceeds threshold (e.g., -25%), use max amount
    if (state.gain_pct < max_at_pct) {
      return input_max_usd
    }
    // Otherwise use mid amount
    return input_mid_usd
  }

  // Made money or break-even: use min amount
  return input_min_usd
}

/**
 * Computes a buy/sell recommendation based on fund state.
 *
 * Logic from spreadsheet:
 * - If target_diff > min_profit (above target by profit threshold):
 *   - If accumulate mode: SELL the limit amount
 *   - Else: SELL everything
 * - Else if cash < limit:
 *   - BUY what we can afford
 * - Else:
 *   - BUY the limit amount (normal DCA)
 */
export function computeRecommendation(
  config: SubFundConfig,
  state: FundState
): Recommendation | null {
  // Cash funds don't need trading recommendations - only DEPOSIT/WITHDRAW
  if (config.fund_type === 'cash') {
    return null
  }

  // Closed fund - no recommendation (only if explicitly closed or legacy undefined status with zero fund size)
  const isClosed = config.status === 'closed' || (config.status === undefined && config.fund_size_usd === 0)
  if (isClosed) {
    return null
  }

  const { min_profit_usd, accumulate, manage_cash } = config
  const hasCashPool = manage_cash ?? true // Default to true for backwards compatibility

  const limit = computeLimit(config, state)
  const { start_input_usd, expected_target_usd, actual_value_usd, gain_usd, gain_pct, target_diff_usd, cash_available_usd } = state

  // Special case: no investment yet, recommend initial BUY
  if (start_input_usd === 0 && actual_value_usd === 0) {
    // For non-cash managed funds, always use full limit (no cash pool to check)
    const buyAmount = hasCashPool ? Math.min(limit, cash_available_usd) : limit
    return {
      action: 'BUY',
      amount: buyAmount,
      explanation: {
        start_input_usd,
        expected_target_usd,
        actual_value_usd,
        gain_usd,
        gain_pct,
        target_diff_usd,
        cash_available_usd,
        limit_usd: limit,
        reasoning: `Initial DCA purchase of $${buyAmount.toFixed(2)}.`
      },
      insufficient_cash: hasCashPool && cash_available_usd < limit
    }
  }

  // Above target by more than min_profit: SELL
  if (target_diff_usd > min_profit_usd) {
    // Determine sell amount based on accumulate mode
    const sellAmount = accumulate ? limit : actual_value_usd

    return {
      action: 'SELL',
      amount: sellAmount,
      explanation: {
        start_input_usd,
        expected_target_usd,
        actual_value_usd,
        gain_usd,
        gain_pct,
        target_diff_usd,
        cash_available_usd,
        limit_usd: limit,
        reasoning: accumulate
          ? `Above target by $${target_diff_usd.toFixed(2)} (> $${min_profit_usd} threshold). Accumulate mode: SELL $${sellAmount.toFixed(2)}.`
          : `Above target by $${target_diff_usd.toFixed(2)} (> $${min_profit_usd} threshold). Liquidating entire position of $${sellAmount.toFixed(2)}.`
      },
      insufficient_cash: false
    }
  }

  // Below or at target: BUY
  // For non-cash managed funds, always use full limit (no cash pool to check)
  const buyAmount = hasCashPool ? Math.min(limit, cash_available_usd) : limit
  const insufficient = hasCashPool && cash_available_usd < limit

  // Determine reasoning based on performance
  let reasoning: string
  if (gain_usd < 0 && gain_pct < config.max_at_pct) {
    reasoning = `Significant loss (${(gain_pct * 100).toFixed(1)}% < ${(config.max_at_pct * 100).toFixed(0)}% threshold). DCA max amount: $${limit.toFixed(2)}.`
  } else if (gain_usd < 0) {
    reasoning = `Below cost basis (${(gain_pct * 100).toFixed(1)}% loss). DCA mid amount: $${limit.toFixed(2)}.`
  } else {
    reasoning = `On track or above cost. DCA min amount: $${limit.toFixed(2)}.`
  }

  // If no cash available for buying, recommend HOLD instead of BUY $0
  // Check both: cash-managed funds with no cash, OR non-cash-managed funds with zero cash
  if ((hasCashPool && buyAmount < 0.01) || (!hasCashPool && cash_available_usd < 0.01)) {
    reasoning = `No cash available for DCA. Holding position.`
    return {
      action: 'HOLD',
      amount: 0,
      explanation: {
        start_input_usd,
        expected_target_usd,
        actual_value_usd,
        gain_usd,
        gain_pct,
        target_diff_usd,
        cash_available_usd,
        limit_usd: limit,
        reasoning
      },
      insufficient_cash: true
    }
  }

  if (insufficient) {
    reasoning += ` Insufficient cash: only $${cash_available_usd.toFixed(2)} available.`
  }

  return {
    action: 'BUY',
    amount: buyAmount,
    explanation: {
      start_input_usd,
      expected_target_usd,
      actual_value_usd,
      gain_usd,
      gain_pct,
      target_diff_usd,
      cash_available_usd,
      limit_usd: limit,
      reasoning
    },
    insufficient_cash: insufficient
  }
}
