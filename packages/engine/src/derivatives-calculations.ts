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
 * Derivatives entry state - calculated for each fund entry
 */
export interface DerivativesEntryState {
  date: string
  action: string
  amount: number
  contracts: number
  price: number
  // Running calculations
  marginBalance: number      // Running cash/margin balance (funds for margin)
  position: number           // Running net contracts
  avgEntry: number           // Weighted average entry price (BTC price)
  costBasis: number          // Total cost basis of open position
  unrealizedPnl: number      // Unrealized P&L (0 for historical, calculated for current)
  realizedPnl: number        // Running realized P&L from closed trades
  cumFunding: number         // Cumulative funding payments
  cumInterest: number        // Cumulative USDC interest
  cumRebates: number         // Cumulative rebates
  cumFees: number            // Cumulative trading fees
  equity: number             // Position value at entry price (cost basis)
  // Margin tracking
  notionalValue: number      // Position value at avgEntry price
  initialMargin: number      // Margin locked (typically 20% of notional) - DEPRECATED: use marginLocked
  marginLocked: number       // Sum of actual margin in open positions (from FIFO queue)
  maintenanceMargin: number  // Minimum margin required (typically 5% of notional)
  availableFunds: number     // marginBalance - marginLocked
  marginRatio: number        // maintenanceMargin / marginBalance (lower is safer)
  leverage: number           // Dynamic leverage: notionalValue / equity
  // Liquidation tracking
  liquidationPrice: number   // Estimated price at which position would be liquidated
  marginHealth: number       // Buffer above liquidation: (equity - maintenanceMargin) / maintenanceMargin (higher is safer)
  distanceToLiquidation: number  // Percentage distance from current price to liquidation
  notes?: string
}

/**
 * Entry from fund TSV for derivatives calculations
 */
interface DerivativesFundEntry {
  date: string
  action?: string
  amount?: number
  contracts?: number
  price?: number
  fee?: number  // Trading fee associated with BUY/SELL
  margin?: number  // Actual margin locked for this trade
  notes?: string
}

/**
 * Compute derivatives state for each fund entry.
 * Returns an array of entry states with running calculations.
 *
 * @param entries - Fund entries from TSV
 * @param contractMultiplier - BTC per contract (default 0.01)
 * @returns Array of entry states with running calculations
 */
export const computeDerivativesEntriesState = (
  entries: DerivativesFundEntry[],
  contractMultiplier: number = DEFAULT_CONTRACT_MULTIPLIER
): DerivativesEntryState[] => {
  // Action priority order within the same date
  const actionOrder: Record<string, number> = {
    'DEPOSIT': 1,
    'WITHDRAW': 2,
    'INTEREST': 3,
    'REBATE': 4,
    'FEE': 5,
    'BUY': 6,
    'SELL': 7,
    'FUNDING': 8,
    'HOLD': 9
  }

  // Sort entries by date, then by action priority within same date
  const sortedEntries = [...entries].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare

    const aAction = a.action ?? 'HOLD'
    const bAction = b.action ?? 'HOLD'
    const aPriority = actionOrder[aAction] ?? 99
    const bPriority = actionOrder[bAction] ?? 99
    return aPriority - bPriority
  })

  // Running state
  let marginBalance = 0
  let position = 0  // Net contracts
  let avgEntry = 0
  let realizedPnl = 0
  let cumFunding = 0
  let cumInterest = 0
  let cumRebates = 0
  let cumFees = 0
  let snapshotBtcPrice = 0  // BTC price at each snapshot (derived from trade prices)

  // FIFO cost basis queue for realized P&L calculation (includes margin per lot)
  const costBasisQueue: { contracts: number; price: number; cost: number; margin: number }[] = []

  const results: DerivativesEntryState[] = []

  for (const entry of sortedEntries) {
    const action = entry.action ?? 'HOLD'
    const amount = entry.amount ?? 0
    const contracts = entry.contracts ?? 0
    const price = entry.price ?? 0
    const fee = entry.fee ?? 0

    // Process based on action type
    switch (action) {
      case 'DEPOSIT':
        marginBalance += amount
        break

      case 'WITHDRAW':
        marginBalance -= amount
        break

      case 'FUNDING':
        cumFunding += amount
        marginBalance += amount  // Funding affects margin balance
        break

      case 'INTEREST':
        cumInterest += amount
        marginBalance += amount  // Interest adds to margin
        break

      case 'REBATE':
        cumRebates += amount
        marginBalance += amount  // Rebates add to margin
        break

      case 'FEE':
        cumFees += Math.abs(amount)
        marginBalance -= Math.abs(amount)  // Fees reduce margin
        break

      case 'BUY': {
        // Add to position
        position += contracts
        // Update average entry price (weighted average)
        // Note: price is "cost per contract" (e.g., $1056 when BTC = $105,600)
        // We want avgEntry to be BTC price = totalDollarCost / (position * contractMultiplier)
        if (position > 0) {
          const oldCost = avgEntry * (position - contracts) * contractMultiplier
          const newCost = price * contracts  // Total dollar cost (price is already per contract)
          avgEntry = (oldCost + newCost) / (position * contractMultiplier)
        }
        // Calculate margin for this trade
        const notionalForTrade = price * contracts  // Total dollar cost
        // Use stored margin if present, otherwise calculate from fixed 20% rate
        const tradeMargin = entry.margin ?? (notionalForTrade * DEFAULT_INITIAL_MARGIN_RATE)
        // Add to cost basis queue for FIFO (including actual margin)
        costBasisQueue.push({
          contracts,
          price,
          cost: notionalForTrade,
          margin: tradeMargin
        })
        // Process fee if present on entry
        if (fee > 0) {
          cumFees += fee
          marginBalance -= fee  // Fees reduce margin
        }
        // Update snapshot BTC price from trade price
        // BTC price = contract price / contractMultiplier
        if (price > 0) {
          snapshotBtcPrice = price / contractMultiplier
        }
        break
      }

      case 'SELL': {
        // Close position using FIFO
        let contractsToClose = contracts
        const saleProceeds = price * contracts  // Total dollar proceeds (price is cost per contract)
        let costBasis = 0

        while (contractsToClose > 0 && costBasisQueue.length > 0) {
          const oldest = costBasisQueue[0]
          if (!oldest) break

          if (oldest.contracts <= contractsToClose) {
            // Close entire lot - margin is released automatically by removing lot
            costBasis += oldest.cost
            contractsToClose -= oldest.contracts
            costBasisQueue.shift()
          } else {
            // Partial close - reduce margin proportionally
            const ratio = contractsToClose / oldest.contracts
            costBasis += oldest.cost * ratio
            oldest.contracts -= contractsToClose
            oldest.cost -= oldest.cost * ratio
            oldest.margin -= oldest.margin * ratio  // Release proportional margin
            contractsToClose = 0
          }
        }

        // Realized P&L from this trade
        const tradePnl = saleProceeds - costBasis
        realizedPnl += tradePnl
        marginBalance += tradePnl  // Add realized P&L to margin

        // Update position
        position -= contracts

        // Recalculate average entry from remaining queue
        if (position > 0 && costBasisQueue.length > 0) {
          const totalCost = costBasisQueue.reduce((sum, lot) => sum + lot.cost, 0)
          avgEntry = totalCost / (position * contractMultiplier)
        } else if (position === 0) {
          avgEntry = 0
        }
        // Process fee if present on entry
        if (fee > 0) {
          cumFees += fee
          marginBalance -= fee  // Fees reduce margin
        }
        // Update snapshot BTC price from trade price
        // BTC price = contract price / contractMultiplier
        if (price > 0) {
          snapshotBtcPrice = price / contractMultiplier
        }
        break
      }
    }

    // Calculate cost basis (what you paid for open positions)
    const costBasisTotal = costBasisQueue.reduce((sum, lot) => sum + lot.cost, 0)

    // Notional value at average entry price (position value at cost)
    // This equals costBasisTotal for the current position
    const notionalValue = costBasisTotal

    // Calculate actual margin locked from FIFO queue (sum of margin in open lots)
    const marginLocked = costBasisQueue.reduce((sum, lot) => sum + lot.margin, 0)

    // Margin calculations (futures don't spend cash, they lock margin)
    // initialMargin: DEPRECATED - kept for backward compatibility, use marginLocked instead
    // marginLocked: Sum of actual margin from cost basis queue
    // Maintenance margin: typically 5% of notional value (exchange enforced)
    const initialMargin = notionalValue * DEFAULT_INITIAL_MARGIN_RATE  // Deprecated
    const maintenanceMargin = notionalValue * DEFAULT_MAINTENANCE_MARGIN_RATE
    const availableFunds = marginBalance - marginLocked  // Use actual margin locked

    // Margin ratio = maintenance margin / funds for margin
    // Lower is safer (Coinbase shows this as a percentage)
    const marginRatio = marginBalance > 0 ? maintenanceMargin / marginBalance : 0

    // Unrealized P&L at this snapshot using the BTC price at this moment
    // unrealizedPnl = (position * contractMultiplier * snapshotBtcPrice) - costBasis
    let unrealizedPnl = 0
    if (position > 0 && costBasisTotal > 0 && snapshotBtcPrice > 0) {
      const currentPositionValue = position * contractMultiplier * snapshotBtcPrice
      unrealizedPnl = currentPositionValue - costBasisTotal
    }

    // Equity = total account value = marginBalance + unrealizedPnl
    // This is what your account would be worth if you closed all positions
    const equity = marginBalance + unrealizedPnl

    // Dynamic leverage = Total Notional / Margin Locked
    // This matches Coinbase's leverage display: how leveraged the position is relative to collateral
    const leverage = marginLocked > 0 ? notionalValue / marginLocked : 0

    // Liquidation price calculation for long positions
    // At liquidation: equity = maintenanceMargin
    // equity = marginBalance + (liqPrice - avgEntry) * btcSize
    // So: liqPrice = avgEntry - (marginBalance - maintenanceMargin) / btcSize
    // For short positions, the formula is: liqPrice = avgEntry + (marginBalance - maintenanceMargin) / btcSize
    const btcSize = position * contractMultiplier
    let liquidationPrice = 0
    if (position > 0 && btcSize > 0) {
      // Long position: price going down triggers liquidation
      // Negative values indicate position is over-collateralized (safer than 0)
      const buffer = marginBalance - maintenanceMargin
      liquidationPrice = avgEntry - (buffer / btcSize)
    } else if (position < 0 && btcSize < 0) {
      // Short position: price going up triggers liquidation
      const buffer = marginBalance - maintenanceMargin
      liquidationPrice = avgEntry - (buffer / btcSize)  // btcSize is negative, so this adds
    }

    // Margin health: how much buffer above liquidation (higher is safer)
    // marginHealth = (equity - maintenanceMargin) / maintenanceMargin
    const marginHealth = maintenanceMargin > 0 ? (equity - maintenanceMargin) / maintenanceMargin : 0

    // Distance to liquidation as percentage from current/avg price
    // For long: (avgEntry - liquidationPrice) / avgEntry
    // Negative liq price means over-collateralized; distance > 100% means price can drop past 0
    let distanceToLiquidation = 0
    if (position > 0 && avgEntry > 0) {
      distanceToLiquidation = (avgEntry - liquidationPrice) / avgEntry
    } else if (position < 0 && avgEntry > 0) {
      distanceToLiquidation = (liquidationPrice - avgEntry) / avgEntry
    }

    const entryState: DerivativesEntryState = {
      date: entry.date,
      action,
      amount,
      contracts: action === 'BUY' || action === 'SELL' ? contracts : 0,
      price: action === 'BUY' || action === 'SELL' ? price : 0,
      marginBalance,
      position,
      avgEntry,
      costBasis: costBasisTotal,
      unrealizedPnl,
      realizedPnl,
      cumFunding,
      cumInterest,
      cumRebates,
      cumFees,
      equity,
      notionalValue,
      initialMargin,
      marginLocked,
      maintenanceMargin,
      availableFunds,
      marginRatio,
      leverage,
      liquidationPrice,
      marginHealth,
      distanceToLiquidation
    }
    if (entry.notes !== undefined) {
      entryState.notes = entry.notes
    }
    results.push(entryState)
  }

  return results
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
