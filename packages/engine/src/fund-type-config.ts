import type { FundType, SubFundConfig } from './types.js'

/**
 * Default configuration values by fund type.
 * Used when creating new funds or resetting to defaults.
 */
export const FUND_TYPE_DEFAULTS: Record<FundType, Partial<SubFundConfig>> = {
  cash: {
    fund_size_usd: 0,
    target_apy: 0,
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
    margin_enabled: false
  },
  stock: {
    target_apy: 0.10,
    interval_days: 7,
    input_min_usd: 100,
    input_mid_usd: 150,
    input_max_usd: 200,
    max_at_pct: -0.25,
    min_profit_usd: 100,
    cash_apy: 0.044,
    margin_apr: 0.0725,
    margin_access_usd: 0,
    accumulate: true,
    manage_cash: true,
    margin_enabled: false
  },
  crypto: {
    target_apy: 0.15,
    interval_days: 7,
    input_min_usd: 100,
    input_mid_usd: 150,
    input_max_usd: 200,
    max_at_pct: -0.30,
    min_profit_usd: 100,
    cash_apy: 0.05,
    margin_apr: 0,
    margin_access_usd: 0,
    accumulate: true,
    manage_cash: true,
    margin_enabled: false
  },
  derivatives: {
    fund_size_usd: 0,
    target_apy: 0,
    interval_days: 1,
    input_min_usd: 0,
    input_mid_usd: 0,
    input_max_usd: 0,
    max_at_pct: 0,
    min_profit_usd: 0,
    cash_apy: 0.05, // USDC interest
    margin_apr: 0,
    margin_access_usd: 0,
    accumulate: false,
    manage_cash: true,
    margin_enabled: true,
    initial_margin_rate: 0.20,
    maintenance_margin_rate: 0.05,
    contract_multiplier: 0.01
  }
}

/**
 * Feature flags for each fund type.
 * Determines what UI elements and features are available.
 */
export interface FundTypeFeatures {
  /** Whether the fund supports BUY/SELL trading */
  allowsTrading: boolean
  /** Whether recommendations engine supports this fund type */
  allowsRecommendations: boolean
  /** Whether the fund can receive dividends */
  supportsDividends: boolean
  /** Whether the fund earns cash interest */
  supportsCashInterest: boolean
  /** Whether the fund tracks share counts */
  supportsShares: boolean
  /** Whether the fund can use margin */
  supportsMargin: boolean
  /** Whether the fund uses contract-based trading */
  supportsContracts: boolean
  /** Whether the fund receives funding payments */
  supportsFunding: boolean
  /** Whether the fund tracks a cash balance */
  tracksCashBalance: boolean
  /** Display label for the fund type */
  label: string
  /** Color theme for UI elements */
  color: 'blue' | 'green' | 'yellow' | 'orange'
  /** Tailwind color class for text */
  textColorClass: string
  /** Tailwind color class for hover border */
  borderHoverClass: string
}

export const FUND_TYPE_FEATURES: Record<FundType, FundTypeFeatures> = {
  cash: {
    allowsTrading: false,
    allowsRecommendations: false,
    supportsDividends: false,
    supportsCashInterest: true,
    supportsShares: false,
    supportsMargin: true,
    supportsContracts: false,
    supportsFunding: false,
    tracksCashBalance: true,
    label: 'Cash',
    color: 'blue',
    textColorClass: 'text-blue-400',
    borderHoverClass: 'hover:border-blue-500'
  },
  stock: {
    allowsTrading: true,
    allowsRecommendations: true,
    supportsDividends: true,
    supportsCashInterest: true,
    supportsShares: true,
    supportsMargin: true,
    supportsContracts: false,
    supportsFunding: false,
    tracksCashBalance: true,
    label: 'Stock',
    color: 'green',
    textColorClass: 'text-mint-400',
    borderHoverClass: 'hover:border-mint-500'
  },
  crypto: {
    allowsTrading: true,
    allowsRecommendations: true,
    supportsDividends: false,
    supportsCashInterest: true, // Staking rewards
    supportsShares: true,
    supportsMargin: false,
    supportsContracts: false,
    supportsFunding: false,
    tracksCashBalance: true,
    label: 'Crypto',
    color: 'yellow',
    textColorClass: 'text-yellow-300',
    borderHoverClass: 'hover:border-yellow-500'
  },
  derivatives: {
    allowsTrading: true,
    allowsRecommendations: false,
    supportsDividends: false,
    supportsCashInterest: true, // USDC interest
    supportsShares: false,
    supportsMargin: true,
    supportsContracts: true,
    supportsFunding: true,
    tracksCashBalance: true,
    label: 'Futures',
    color: 'orange',
    textColorClass: 'text-orange-300',
    borderHoverClass: 'hover:border-orange-500'
  }
}

/**
 * Valid entry actions by fund type.
 */
export type CashFundAction = 'DEPOSIT' | 'WITHDRAW' | 'HOLD' | 'MARGIN'
export type TradingFundAction = 'BUY' | 'SELL' | 'HOLD' | 'DEPOSIT' | 'WITHDRAW'
export type DerivativesFundAction =
  | 'BUY'
  | 'SELL'
  | 'FUNDING'
  | 'INTEREST'
  | 'REBATE'
  | 'FEE'
  | 'DEPOSIT'
  | 'WITHDRAW'

export const ALLOWED_ACTIONS: Record<FundType, readonly string[]> = {
  cash: ['DEPOSIT', 'WITHDRAW', 'HOLD', 'MARGIN'] as const,
  stock: ['BUY', 'SELL', 'HOLD', 'DEPOSIT', 'WITHDRAW'] as const,
  crypto: ['BUY', 'SELL', 'HOLD', 'DEPOSIT', 'WITHDRAW'] as const,
  derivatives: [
    'BUY',
    'SELL',
    'FUNDING',
    'INTEREST',
    'REBATE',
    'FEE',
    'DEPOSIT',
    'WITHDRAW'
  ] as const
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if fund type is a cash fund.
 */
export const isCashFund = (fundType: FundType | undefined): boolean =>
  fundType === 'cash'

/**
 * Check if fund type is a derivatives fund.
 */
export const isDerivativesFund = (fundType: FundType | undefined): boolean =>
  fundType === 'derivatives'

/**
 * Check if fund type is a trading fund (stock or crypto).
 */
export const isTradingFund = (fundType: FundType | undefined): boolean =>
  fundType === 'stock' || fundType === 'crypto'

/**
 * Get feature flags for a fund type.
 */
export const getFundTypeFeatures = (
  fundType: FundType = 'stock'
): FundTypeFeatures => FUND_TYPE_FEATURES[fundType]

/**
 * Get default configuration for a fund type.
 */
export const getFundTypeDefaults = (
  fundType: FundType = 'stock'
): Partial<SubFundConfig> => FUND_TYPE_DEFAULTS[fundType]

/**
 * Get allowed actions for a fund type.
 */
export const getAllowedActions = (
  fundType: FundType = 'stock'
): readonly string[] => ALLOWED_ACTIONS[fundType]

/**
 * Check if an action is valid for a fund type.
 */
export const isValidAction = (fundType: FundType, action: string): boolean =>
  ALLOWED_ACTIONS[fundType].includes(action)

/**
 * Apply fund type defaults to form data.
 * For cash and derivatives funds, override certain fields with fixed values.
 * For trading funds, use the provided form values.
 */
export const applyFundTypeDefaults = <
  T extends {
    target_apy: number
    interval_days: number
    input_min_usd: number
    input_mid_usd: number
    input_max_usd: number
    max_at_pct: number
    min_profit_usd: number
    accumulate: boolean
    manage_cash: boolean
    margin_enabled: boolean
  }
>(
  fundType: FundType,
  formData: T
): T => {
  const defaults = FUND_TYPE_DEFAULTS[fundType]
  const features = FUND_TYPE_FEATURES[fundType]

  // For non-trading funds, use defaults for trading-related fields
  if (!features.allowsTrading) {
    return {
      ...formData,
      target_apy: defaults.target_apy ?? 0,
      interval_days: defaults.interval_days ?? 1,
      input_min_usd: defaults.input_min_usd ?? 0,
      input_mid_usd: defaults.input_mid_usd ?? 0,
      input_max_usd: defaults.input_max_usd ?? 0,
      max_at_pct: defaults.max_at_pct ?? 0,
      min_profit_usd: defaults.min_profit_usd ?? 0,
      accumulate: defaults.accumulate ?? true,
      manage_cash: defaults.manage_cash ?? true,
      margin_enabled: defaults.margin_enabled ?? false
    }
  }

  return formData
}
