/**
 * Derivatives calculation engine for BTC perpetual futures.
 *
 * Provides FIFO cost basis tracking, liquidation price calculations,
 * position state computation, and safe order ladder suggestions.
 */

import type {
  CostBasisLot,
  DerivativesPosition,
  FundingPayment,
  ProcessedTrade,
  DailyPnL,
  SuggestedOrder,
  OrderLadder,
  CoinbaseFill
} from './derivatives-types.js'

// Default margin rates per Coinbase documentation
const DEFAULT_INITIAL_MARGIN_RATE = 0.20  // 20%
const DEFAULT_MAINTENANCE_MARGIN_RATE = 0.05  // 5%
const DEFAULT_CONTRACT_MULTIPLIER = 0.01  // BIP micro-futures

/**
 * Process a single trade and update FIFO cost basis queue.
 *
 * @param side - 'BUY' or 'SELL'
 * @param contracts - Number of contracts
 * @param price - Price per BTC
 * @param contractMultiplier - BTC per contract (0.01 for BIP)
 * @param marginRate - Initial margin rate (default 0.20)
 * @param costBasisQueue - Current FIFO queue (will be mutated)
 * @returns Trade result with realized gain and margin change
 */
export const processTrade = (
  side: 'BUY' | 'SELL',
  contracts: number,
  price: number,
  contractMultiplier: number = DEFAULT_CONTRACT_MULTIPLIER,
  marginRate: number = DEFAULT_INITIAL_MARGIN_RATE,
  costBasisQueue: CostBasisLot[]
): {
  realizedGain: number
  marginChange: number
  newQueue: CostBasisLot[]
} => {
  const btcSize = contracts * contractMultiplier
  const dollarValue = btcSize * price
  const marginRequired = dollarValue * marginRate

  if (side === 'BUY') {
    // Add new lot to queue
    const newLot: CostBasisLot = {
      contracts,
      pricePerContract: price,
      totalCost: dollarValue,
      margin: marginRequired,
      timestamp: new Date().toISOString()
    }

    return {
      realizedGain: 0,
      marginChange: marginRequired,
      newQueue: [...costBasisQueue, newLot]
    }
  }

  // SELL - Match against oldest lots (FIFO)
  let contractsToSell = contracts
  let totalCostBasis = 0
  let totalMarginReleased = 0
  const remainingQueue = [...costBasisQueue]

  while (contractsToSell > 0 && remainingQueue.length > 0) {
    const oldest = remainingQueue[0]
    if (!oldest) break

    if (oldest.contracts <= contractsToSell) {
      // Sell entire lot
      totalCostBasis += oldest.totalCost
      totalMarginReleased += oldest.margin
      contractsToSell -= oldest.contracts
      remainingQueue.shift()
    } else {
      // Partial sale
      const ratio = contractsToSell / oldest.contracts
      totalCostBasis += oldest.totalCost * ratio
      totalMarginReleased += oldest.margin * ratio
      oldest.contracts -= contractsToSell
      oldest.totalCost -= oldest.totalCost * ratio
      oldest.margin -= oldest.margin * ratio
      contractsToSell = 0
    }
  }

  // Realized gain = proceeds - cost basis
  const realizedGain = dollarValue - totalCostBasis

  return {
    realizedGain,
    marginChange: -totalMarginReleased,
    newQueue: remainingQueue
  }
}

/**
 * Calculate liquidation price for a position.
 *
 * Liquidation occurs when: Equity = Maintenance Margin
 * Equity = TotalCash + (Price * Contracts * Multiplier) - CostBasis
 *
 * @param position - Current derivatives position
 * @returns Liquidation price (0 if fully collateralized)
 */
export const calculateLiquidationPrice = (
  position: DerivativesPosition
): number => {
  const {
    contracts,
    costBasisQueue,
    marginLocked,
    maintenanceMargin,
    contractMultiplier
  } = position

  if (contracts <= 0) return 0

  const totalCostBasis = costBasisQueue.reduce((sum, lot) => sum + lot.totalCost, 0)
  const btcSize = contracts * contractMultiplier

  // Liquidation price formula:
  // LiqPrice = (MaintenanceMargin + CostBasis - TotalCash) / btcSize
  const liqPrice = (maintenanceMargin + totalCostBasis - marginLocked) / btcSize

  return Math.max(0, liqPrice)
}

/**
 * Calculate equity at a given BTC price.
 *
 * @param position - Current position
 * @param btcPrice - BTC price to calculate equity at
 * @returns Equity value in USD
 */
export const calculateEquityAtPrice = (
  position: DerivativesPosition,
  btcPrice: number
): number => {
  const { contracts, costBasisQueue, marginLocked, contractMultiplier } = position
  const totalCostBasis = costBasisQueue.reduce((sum, lot) => sum + lot.totalCost, 0)
  const currentNotional = contracts * contractMultiplier * btcPrice
  const unrealizedPnl = currentNotional - totalCostBasis
  return marginLocked + unrealizedPnl
}

/**
 * Calculate safe limit order ladder.
 *
 * Generates order suggestions that keep the liquidation price at $0 or below.
 *
 * @param position - Current position
 * @param startPrice - Starting price for order ladder
 * @param priceIncrement - Price decrement per order (default $1000)
 * @param dollarPerOrder - USD amount per order (default $1000)
 * @param maxOrders - Maximum orders to generate
 * @param safetyBuffer - Safety buffer as fraction (default 0.90 = 90%)
 * @returns Order ladder with safety analysis
 */
export const calculateSafeLimitOrders = (
  position: DerivativesPosition,
  startPrice: number,
  priceIncrement: number = 1000,
  dollarPerOrder: number = 1000,
  maxOrders: number = 20,
  safetyBuffer: number = 0.90
): OrderLadder => {
  const {
    contracts: currentContracts,
    costBasisQueue,
    marginLocked,
    contractMultiplier,
    maintenanceMargin
  } = position

  const totalCash = marginLocked
  const currentCostBasis = costBasisQueue.reduce((sum, lot) => sum + lot.totalCost, 0)

  // Calculate maintenance margin rate from current position
  const currentNotional = currentContracts * contractMultiplier * position.currentPrice
  const maintenanceRate = currentNotional > 0
    ? maintenanceMargin / currentNotional
    : DEFAULT_MAINTENANCE_MARGIN_RATE

  // Maximum cost basis allowed (with safety buffer)
  const maxCostBasis = totalCash * safetyBuffer

  const orders: SuggestedOrder[] = []
  let cumulativeContracts = currentContracts
  let cumulativeCostBasis = currentCostBasis
  let totalMarginRequired = 0
  let safeOrderCount = 0

  for (let i = 0; i < maxOrders; i++) {
    const orderPrice = startPrice - (i * priceIncrement)
    if (orderPrice <= 0) break

    // Check remaining budget
    const remainingBudget = maxCostBasis - cumulativeCostBasis
    if (remainingBudget <= 0) break

    // Calculate contracts for this order
    const costPerContract = orderPrice * contractMultiplier
    const contractsFromDollar = Math.floor(dollarPerOrder / costPerContract)
    const contractsFromBudget = Math.floor(remainingBudget / costPerContract)
    const orderContracts = Math.min(contractsFromDollar, contractsFromBudget)

    if (orderContracts < 1) break

    // Calculate new position metrics
    const addedCostBasis = orderContracts * costPerContract
    const newContracts = cumulativeContracts + orderContracts
    const newCostBasis = cumulativeCostBasis + addedCostBasis
    const newAvgEntry = newCostBasis / (newContracts * contractMultiplier)

    // Calculate new liquidation price
    const estimatedNewMaintMargin = newContracts * contractMultiplier * orderPrice * maintenanceRate
    const newLiqPrice = (estimatedNewMaintMargin + newCostBasis - totalCash) / (newContracts * contractMultiplier)

    // Equity at BTC = $0
    const equityAtZero = totalCash - newCostBasis

    const isSafe = equityAtZero > 0

    const order: SuggestedOrder = {
      price: orderPrice,
      contracts: orderContracts,
      dollarAmount: orderContracts * costPerContract,
      marginRequired: orderContracts * costPerContract * DEFAULT_INITIAL_MARGIN_RATE,
      newAvgEntry,
      newLiquidationPrice: Math.max(0, newLiqPrice),
      equityAtZero,
      isSafe,
      explanation: isSafe
        ? `Safe: Equity at $0 = $${equityAtZero.toFixed(2)}`
        : `UNSAFE: Would go negative at $0 by $${Math.abs(equityAtZero).toFixed(2)}`
    }

    orders.push(order)
    totalMarginRequired += order.marginRequired

    if (isSafe) {
      safeOrderCount++
    }

    // Update cumulative for next iteration
    cumulativeContracts = newContracts
    cumulativeCostBasis = newCostBasis
  }

  return {
    startPrice,
    priceIncrement,
    dollarPerOrder,
    maxOrders,
    orders,
    totalMarginRequired,
    safeOrderCount
  }
}

/**
 * Merge API funding payments with manual entries.
 *
 * @param apiFunding - Funding payments from API
 * @param manualFunding - Manual funding entries
 * @returns Merged and deduplicated funding payments
 */
export const mergeFundingData = (
  apiFunding: FundingPayment[],
  manualFunding: FundingPayment[]
): FundingPayment[] => {
  const merged = new Map<string, FundingPayment>()

  // API data first (keyed by timestamp + amount)
  for (const payment of apiFunding) {
    const key = `${payment.timestamp}-${payment.amount.toFixed(8)}`
    merged.set(key, { ...payment, source: 'api' })
  }

  // Manual entries can override or add
  for (const payment of manualFunding) {
    const key = `${payment.timestamp}-${payment.amount.toFixed(8)}`
    merged.set(key, { ...payment, source: 'manual' })
  }

  // Sort by timestamp
  return Array.from(merged.values()).sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp)
  )
}

/**
 * Calculate daily P&L breakdown from funding and trades.
 *
 * @param fundingPayments - All funding payments
 * @param trades - All processed trades
 * @returns Array of daily P&L summaries
 */
export const calculateDailyPnL = (
  fundingPayments: FundingPayment[],
  trades: ProcessedTrade[]
): DailyPnL[] => {
  const dailyMap = new Map<string, DailyPnL>()

  // Initialize from trades
  for (const trade of trades) {
    const date = trade.timestamp.split('T')[0] ?? trade.timestamp.substring(0, 10)
    let daily = dailyMap.get(date)

    if (!daily) {
      daily = {
        date,
        fundingProfit: 0,
        fundingLoss: 0,
        rewards: 0,
        tradingProfit: 0,
        tradingLoss: 0,
        fees: 0,
        netPnl: 0,
        contracts: 0,
        equity: 0
      }
      dailyMap.set(date, daily)
    }

    // Add trading P&L
    if (trade.realizedPnl > 0) {
      daily.tradingProfit += trade.realizedPnl
    } else {
      daily.tradingLoss += trade.realizedPnl
    }

    daily.fees += trade.commission
    daily.contracts = trade.cumulativeContracts
  }

  // Add funding payments
  for (const payment of fundingPayments) {
    const date = payment.timestamp.split('T')[0] ?? payment.timestamp.substring(0, 10)
    let daily = dailyMap.get(date)

    if (!daily) {
      daily = {
        date,
        fundingProfit: 0,
        fundingLoss: 0,
        rewards: 0,
        tradingProfit: 0,
        tradingLoss: 0,
        fees: 0,
        netPnl: 0,
        contracts: 0,
        equity: 0
      }
      dailyMap.set(date, daily)
    }

    const amount = payment.amount
    if (amount >= 0) {
      daily.fundingProfit += amount
    } else {
      daily.fundingLoss += amount
    }
  }

  // Calculate net P&L for each day
  for (const daily of dailyMap.values()) {
    daily.netPnl = daily.fundingProfit + daily.fundingLoss +
                   daily.tradingProfit + daily.tradingLoss -
                   daily.fees + daily.rewards
  }

  // Sort by date
  return Array.from(dailyMap.values()).sort(
    (a, b) => a.date.localeCompare(b.date)
  )
}

/**
 * Process raw Coinbase fills into trade records with FIFO tracking.
 *
 * @param fills - Array of Coinbase fill objects
 * @param contractMultiplier - BTC per contract
 * @param marginRate - Initial margin rate
 * @returns Processed trades with cumulative position tracking
 */
export const processTradeHistory = (
  fills: CoinbaseFill[],
  contractMultiplier: number = DEFAULT_CONTRACT_MULTIPLIER,
  marginRate: number = DEFAULT_INITIAL_MARGIN_RATE
): ProcessedTrade[] => {
  const costBasisQueue: CostBasisLot[] = []
  let cumulativeContracts = 0
  let cumulativeMargin = 0

  // Sort fills by timestamp
  const sortedFills = [...fills].sort(
    (a, b) => a.tradeTime.localeCompare(b.tradeTime)
  )

  return sortedFills.map(fill => {
    const contracts = parseFloat(fill.size)
    const price = parseFloat(fill.price)
    const commission = parseFloat(fill.commission)
    const btcSize = contracts * contractMultiplier
    const total = btcSize * price

    const result = processTrade(
      fill.side,
      contracts,
      price,
      contractMultiplier,
      marginRate,
      costBasisQueue
    )

    // Update queue (processTrade returns new queue)
    costBasisQueue.length = 0
    costBasisQueue.push(...result.newQueue)

    // Update cumulative
    if (fill.side === 'BUY') {
      cumulativeContracts += contracts
    } else {
      cumulativeContracts -= contracts
    }
    cumulativeMargin += result.marginChange

    return {
      timestamp: fill.tradeTime,
      tradeId: fill.tradeId,
      orderId: fill.orderId,
      side: fill.side,
      contracts,
      btcSize,
      price,
      total,
      commission,
      marginChange: result.marginChange,
      realizedPnl: result.realizedGain,
      cumulativeContracts,
      cumulativeMargin
    }
  })
}

/**
 * Compute full derivatives position state from trade history.
 *
 * @param trades - Processed trade history
 * @param fundingPayments - Funding payments
 * @param currentPrice - Current BTC price
 * @param productId - Coinbase product ID
 * @param contractMultiplier - BTC per contract
 * @returns Current position state
 */
export const computeDerivativesState = (
  trades: ProcessedTrade[],
  _fundingPayments: FundingPayment[], // Reserved for future funding P&L integration
  currentPrice: number,
  productId: string,
  contractMultiplier: number = DEFAULT_CONTRACT_MULTIPLIER
): DerivativesPosition => {
  // Rebuild cost basis queue from trades
  const costBasisQueue: CostBasisLot[] = []

  for (const trade of trades) {
    if (trade.side === 'BUY') {
      costBasisQueue.push({
        contracts: trade.contracts,
        pricePerContract: trade.price,
        totalCost: trade.total,
        margin: trade.marginChange,
        timestamp: trade.timestamp,
        tradeId: trade.tradeId
      })
    } else {
      // SELL - consume from queue
      let toSell = trade.contracts
      while (toSell > 0 && costBasisQueue.length > 0) {
        const oldest = costBasisQueue[0]
        if (!oldest) break

        if (oldest.contracts <= toSell) {
          toSell -= oldest.contracts
          costBasisQueue.shift()
        } else {
          const ratio = toSell / oldest.contracts
          oldest.contracts -= toSell
          oldest.totalCost -= oldest.totalCost * ratio
          oldest.margin -= oldest.margin * ratio
          toSell = 0
        }
      }
    }
  }

  // Current position from last trade
  const lastTrade = trades[trades.length - 1]
  const contracts = lastTrade?.cumulativeContracts ?? 0
  const marginLocked = lastTrade?.cumulativeMargin ?? 0

  // Calculate metrics
  const totalCostBasis = costBasisQueue.reduce((sum, lot) => sum + lot.totalCost, 0)
  const avgEntryPrice = contracts > 0
    ? totalCostBasis / (contracts * contractMultiplier)
    : 0

  const currentNotional = contracts * contractMultiplier * currentPrice
  const unrealizedPnl = currentNotional - totalCostBasis
  const maintenanceMargin = currentNotional * DEFAULT_MAINTENANCE_MARGIN_RATE
  const marginAvailable = marginLocked + unrealizedPnl - maintenanceMargin

  // Build position object
  const position: DerivativesPosition = {
    productId,
    contracts,
    avgEntryPrice,
    currentPrice,
    liquidationPrice: 0,  // Will calculate
    unrealizedPnl,
    marginLocked,
    marginAvailable: Math.max(0, marginAvailable),
    maintenanceMargin,
    costBasisQueue,
    totalCostBasis,
    contractMultiplier
  }

  // Calculate liquidation price
  position.liquidationPrice = calculateLiquidationPrice(position)

  return position
}

/**
 * Format position summary for display.
 *
 * @param position - Derivatives position
 * @returns Formatted summary object
 */
export const formatPositionSummary = (position: DerivativesPosition): {
  contracts: string
  btcSize: string
  avgEntry: string
  currentPrice: string
  liquidationPrice: string
  unrealizedPnl: string
  unrealizedPnlPct: string
  marginLocked: string
  marginAvailable: string
} => {
  const btcSize = position.contracts * position.contractMultiplier

  return {
    contracts: position.contracts.toLocaleString(),
    btcSize: btcSize.toFixed(4),
    avgEntry: `$${position.avgEntryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    currentPrice: `$${position.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    liquidationPrice: position.liquidationPrice > 0
      ? `$${position.liquidationPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : '$0 (fully collateralized)',
    unrealizedPnl: position.unrealizedPnl >= 0
      ? `+$${position.unrealizedPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `-$${Math.abs(position.unrealizedPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    unrealizedPnlPct: position.totalCostBasis > 0
      ? `${((position.unrealizedPnl / position.totalCostBasis) * 100).toFixed(2)}%`
      : '0%',
    marginLocked: `$${position.marginLocked.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    marginAvailable: `$${position.marginAvailable.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}
