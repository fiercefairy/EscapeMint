export type ActionType = 'BUY' | 'SELL'

export type FundStatus = 'active' | 'closed'

export interface SubFundConfig {
  /**
   * Fund status: 'active' for running funds, 'closed' for completed funds.
   * Defaults to 'active' if not specified.
   */
  status?: FundStatus

  /**
   * Total capital allocated to this sub-fund (e.g., $10,000).
   * This is the total fund size including both cash and invested amounts.
   */
  fund_size_usd: number

  /**
   * Target annual percentage yield (e.g., 0.25 for 25% APY).
   * Used to calculate expected growth of invested amounts.
   */
  target_apy: number

  /**
   * Trading interval in days (1=daily, 7=weekly, 30=monthly).
   */
  interval_days: number

  /**
   * DCA amount when asset is performing at or above target.
   */
  input_min_usd: number

  /**
   * DCA amount when asset is below target but not significantly.
   */
  input_mid_usd: number

  /**
   * DCA amount when asset is significantly below target (loss exceeds max_at_pct).
   */
  input_max_usd: number

  /**
   * Threshold for using max DCA amount (e.g., -0.25 for -25% loss).
   * When gain_pct < max_at_pct, use input_max_usd.
   */
  max_at_pct: number

  /**
   * Minimum profit (in USD) above expected target to trigger SELL.
   * If target_diff_usd > min_profit_usd, recommend selling.
   */
  min_profit_usd: number

  /**
   * Interest rate earned on idle cash (e.g., 0.044 for 4.4% APY).
   */
  cash_apy: number

  /**
   * Margin interest rate if borrowing (e.g., 0.0725 for 7.25% APR).
   */
  margin_apr: number

  /**
   * Maximum margin available for this fund (0 if no margin access).
   */
  margin_access_usd: number

  /**
   * Accumulation mode:
   * - true: Buy/sell only the DCA amount (reinvest profits)
   * - false: When above target, liquidate entire position back to cash
   */
  accumulate: boolean

  /**
   * Date when the fund tracking begins (ISO 8601 date: YYYY-MM-DD).
   */
  start_date: string

  /**
   * Optional chart display settings for Y-axis bounds.
   * Keys are chart names, values are {yMin?, yMax?} bounds.
   */
  chart_bounds?: Record<string, { yMin?: number; yMax?: number }>

  /**
   * Optional column order for entries table display.
   * Array of column IDs in user-preferred order.
   */
  entries_column_order?: string[]

  /**
   * Optional set of visible columns for entries table.
   * Array of column IDs that should be shown.
   */
  entries_visible_columns?: string[]
}

/**
 * A purchase (BUY) or sale (SELL) of the asset.
 * BUY: moves cash from pool into the investment
 * SELL: moves value from investment back to cash
 */
export interface Trade {
  date: string
  amount_usd: number
  type: 'buy' | 'sell'
}

/**
 * External cash added to or removed from the cash pool.
 * deposit: adding more cash to invest (e.g., monthly contribution)
 * withdrawal: removing cash from pool (e.g., taking profits)
 */
export interface CashFlow {
  date: string
  amount_usd: number
  type: 'deposit' | 'withdrawal'
}

export interface Dividend {
  date: string
  amount_usd: number
}

export interface Expense {
  date: string
  amount_usd: number
}

export interface RecommendationInput {
  config: SubFundConfig
  trades: Trade[]
  cashflows: CashFlow[]
  dividends: Dividend[]
  expenses: Expense[]
  snapshot_date: string
  equity_value_usd: number
}

export interface Explanation {
  start_input_usd: number
  expected_target_usd: number
  actual_value_usd: number
  gain_usd: number
  gain_pct: number
  target_diff_usd: number
  cash_available_usd: number
  limit_usd: number
  reasoning: string
}

export interface Recommendation {
  action: ActionType
  amount: number
  explanation: Explanation
  insufficient_cash?: boolean
}

/**
 * Computed state of a subfund at a point in time.
 */
export interface FundState {
  /** Total cash remaining in pool (fund_size - total_invested + deposits - withdrawals) */
  cash_available_usd: number
  /** Expected target value based on compounded growth of purchases */
  expected_target_usd: number
  /** Actual equity value from latest snapshot */
  actual_value_usd: number
  /** Total amount invested (sum of buys - sells) */
  start_input_usd: number
  /** Gain in USD (actual - start_input) */
  gain_usd: number
  /** Gain as percentage ((actual / start_input) - 1) */
  gain_pct: number
  /** Difference from expected (actual - expected_target) */
  target_diff_usd: number
  /** Cumulative cash interest earned */
  cash_interest_usd: number
  /** Cumulative realized gains (interest + dividends + sell profits - expenses) */
  realized_gains_usd: number
}

/**
 * Historical performance metrics for a closed fund.
 */
export interface ClosedFundMetrics {
  /** Total amount invested (sum of all BUY transactions) */
  total_invested_usd: number
  /** Total amount returned (sum of all SELL transactions) */
  total_returned_usd: number
  /** Total dividends received */
  total_dividends_usd: number
  /** Total cash interest earned */
  total_cash_interest_usd: number
  /** Total expenses paid */
  total_expenses_usd: number
  /** Net gain/loss (returned + dividends + cash_interest - expenses - invested) */
  net_gain_usd: number
  /** Return percentage (net_gain / total_invested) */
  return_pct: number
  /** Annualized return (APY) */
  apy: number
  /** First entry date */
  start_date: string
  /** Last entry date */
  end_date: string
  /** Duration in days */
  duration_days: number
}
