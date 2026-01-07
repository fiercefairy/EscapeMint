export {
  computeStartInput,
  computeExpectedTarget,
  computeCashAvailable,
  computeCashInterest,
  computeRealizedGains,
  computeFundState,
  computeClosedFundMetrics
} from './expected-equity.js'
export {
  processTrade,
  calculateLiquidationPrice,
  calculateEquityAtPrice,
  calculateSafeLimitOrders,
  mergeFundingData,
  calculateDailyPnL,
  processTradeHistory,
  computeDerivativesState,
  computeDerivativesEntriesState,
  formatPositionSummary
} from './derivatives-calculations.js'
export type { DerivativesEntryState } from './derivatives-calculations.js'
export { computeLimit, computeRecommendation } from './recommendation.js'
export { formatCurrency, formatPercent, summarizeFundState } from './explainer.js'
export {
  computeTimeWeightedFundSize,
  computeRealizedAPY,
  computeProjectedAnnualReturn,
  computeFundMetrics,
  computeAggregateMetrics
} from './aggregate.js'
export type {
  ActionType,
  FundStatus,
  FundType,
  SubFundConfig,
  Trade,
  CashFlow,
  Dividend,
  Expense,
  RecommendationInput,
  Explanation,
  Recommendation,
  FundState,
  ClosedFundMetrics
} from './types.js'
export type {
  CostBasisLot,
  DerivativesPosition,
  FundingPayment,
  RewardPayment,
  ProcessedTrade,
  DailyPnL,
  SuggestedOrder,
  OrderLadder,
  CoinbasePosition,
  CoinbaseFill,
  CoinbaseFundingPayment,
  ApiKeyReference,
  SyncResult
} from './derivatives-types.js'
export type {
  FundMetrics,
  AggregateMetrics
} from './aggregate.js'
