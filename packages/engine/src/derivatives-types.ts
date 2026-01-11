/**
 * Derivatives-specific types for BTC perpetual futures tracking.
 * Supports FIFO cost basis, position tracking, funding rates, and order management.
 */

/**
 * A single cost basis lot for FIFO tracking.
 * Created on each BUY, consumed on each SELL.
 */
export interface CostBasisLot {
  /** Number of contracts in this lot */
  contracts: number
  /** Price per BTC when acquired */
  pricePerContract: number
  /** Total dollar cost (contracts * multiplier * price) */
  totalCost: number
  /** Margin locked for this lot */
  margin: number
  /** ISO timestamp when this lot was acquired */
  timestamp: string
  /** Optional trade ID from exchange */
  tradeId?: string
}

/**
 * Current state of a perpetual futures position.
 */
export interface DerivativesPosition {
  /** Coinbase product ID (e.g., 'BIP-20DEC30-CDE') */
  productId: string
  /** Total contracts held (net long position) */
  contracts: number
  /** Volume-weighted average entry price */
  avgEntryPrice: number
  /** Current BTC price */
  currentPrice: number
  /** Price at which position would be liquidated */
  liquidationPrice: number
  /** Unrealized P&L based on current price */
  unrealizedPnl: number
  /** Total margin locked in position */
  marginLocked: number
  /** Available margin for new positions */
  marginAvailable: number
  /** Maintenance margin requirement */
  maintenanceMargin: number
  /** FIFO cost basis queue for P&L tracking */
  costBasisQueue: CostBasisLot[]
  /** Total cost basis (sum of all lots) */
  totalCostBasis: number
  /** Contract multiplier (0.01 for BIP, 1.0 for standard) */
  contractMultiplier: number
}

/**
 * A funding payment record (hourly rate applied to position).
 */
export interface FundingPayment {
  /** ISO timestamp of funding payment */
  timestamp: string
  /** Amount paid (+) or received (-) in USD */
  amount: number
  /** Product the funding applies to */
  productId: string
  /** Funding rate as decimal (e.g., 0.0001 for 0.01%) */
  rate: number
  /** Source: 'api' or 'manual' */
  source?: 'api' | 'manual'
}

/**
 * A reward payment record (USDC interest, etc.).
 */
export interface RewardPayment {
  /** ISO timestamp of reward */
  timestamp: string
  /** Amount received in USD */
  amount: number
  /** Type of reward */
  type: 'usdc_interest' | 'bonus' | 'other'
  /** Optional notes */
  notes?: string
}

/**
 * A processed trade with calculated metrics.
 */
export interface ProcessedTrade {
  /** ISO timestamp */
  timestamp: string
  /** Trade ID from exchange */
  tradeId: string
  /** Order ID */
  orderId: string
  /** 'BUY' or 'SELL' */
  side: 'BUY' | 'SELL'
  /** Number of contracts */
  contracts: number
  /** Notional size in underlying asset (contracts * multiplier) */
  notionalSize: number
  /** Price per unit of underlying asset */
  price: number
  /** Total value (notionalSize * price) */
  total: number
  /** Trading fee paid */
  commission: number
  /** Margin required/released */
  marginChange: number
  /** Realized P&L (for SELL trades) */
  realizedPnl: number
  /** Cumulative contracts after trade */
  cumulativeContracts: number
  /** Cumulative margin after trade */
  cumulativeMargin: number
}

/**
 * Daily P&L breakdown for reporting.
 */
export interface DailyPnL {
  /** Date (YYYY-MM-DD) */
  date: string
  /** Funding profit (positive funding received) */
  fundingProfit: number
  /** Funding loss (negative funding paid) */
  fundingLoss: number
  /** Rewards received */
  rewards: number
  /** Trading profit (realized gains) */
  tradingProfit: number
  /** Trading loss (realized losses) */
  tradingLoss: number
  /** Total fees paid */
  fees: number
  /** Net daily P&L */
  netPnl: number
  /** Ending contract count */
  contracts: number
  /** Ending equity value */
  equity: number
}

/**
 * A suggested limit order with safety analysis.
 */
export interface SuggestedOrder {
  /** Suggested limit price */
  price: number
  /** Number of contracts to buy */
  contracts: number
  /** Dollar amount */
  dollarAmount: number
  /** Margin required for this order */
  marginRequired: number
  /** New average entry if filled */
  newAvgEntry: number
  /** New liquidation price if filled */
  newLiquidationPrice: number
  /** Equity value at BTC = $0 (safety check) */
  equityAtZero: number
  /** Whether this order keeps position safe (equity at $0 > 0) */
  isSafe: boolean
  /** Explanation of order */
  explanation: string
}

/**
 * Order ladder configuration and results.
 */
export interface OrderLadder {
  /** Starting price for ladder */
  startPrice: number
  /** Price increment between orders */
  priceIncrement: number
  /** Dollar amount per order */
  dollarPerOrder: number
  /** Maximum number of orders to suggest */
  maxOrders: number
  /** Generated order suggestions */
  orders: SuggestedOrder[]
  /** Total margin needed for all orders */
  totalMarginRequired: number
  /** Number of safe orders (before hitting safety limit) */
  safeOrderCount: number
}

/**
 * Coinbase API position response (normalized).
 */
export interface CoinbasePosition {
  productId: string
  side: 'LONG' | 'SHORT'
  numberOfContracts: string
  entryVwap: string
  unrealizedPnl: string
  aggregatedPnl: string
}

/**
 * Coinbase API fill response (normalized).
 */
export interface CoinbaseFill {
  tradeId: string
  orderId: string
  productId: string
  side: 'BUY' | 'SELL'
  size: string
  price: string
  commission: string
  tradeTime: string
  sequenceTimestamp: string
  liquidityIndicator: 'MAKER' | 'TAKER'
}

/**
 * Coinbase API funding payment response (normalized).
 */
export interface CoinbaseFundingPayment {
  time: string
  amount: string
  rate: string
  productId: string
}

/**
 * API credentials reference (name only, not the actual keys).
 */
export interface ApiKeyReference {
  /** Display name for the key */
  name: string
  /** When the key was stored */
  createdAt: string
  /** Last successful API call */
  lastUsed?: string
}

/**
 * Sync result from API to fund entries.
 */
export interface SyncResult {
  /** Number of new fills added */
  fillsAdded: number
  /** Number of new funding payments added */
  fundingAdded: number
  /** Number of entries updated */
  entriesUpdated: number
  /** Any errors encountered */
  errors: string[]
  /** Timestamp of sync */
  syncedAt: string
}
