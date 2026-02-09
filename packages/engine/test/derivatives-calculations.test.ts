import { describe, it, expect } from 'vitest'
import {
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
} from '../src/derivatives-calculations.js'
import type {
  CostBasisLot,
  DerivativesPosition,
  FundingPayment,
  ProcessedTrade,
  CoinbaseFill
} from '../src/derivatives-types.js'

describe('processTrade', () => {
  it('adds BUY trade to empty queue', () => {
    const result = processTrade('BUY', 100, 100000, 0.01, 0.20, [])

    expect(result.realizedGain).toBe(0)
    expect(result.marginChange).toBe(20000) // 100 contracts * 0.01 * 100000 * 0.20 = $20,000
    expect(result.newQueue).toHaveLength(1)
    expect(result.newQueue[0]?.contracts).toBe(100)
    expect(result.newQueue[0]?.pricePerContract).toBe(100000)
  })

  it('adds multiple BUY trades to queue', () => {
    const queue: CostBasisLot[] = [
      { contracts: 50, pricePerContract: 90000, totalCost: 45000, margin: 9000, timestamp: '2024-01-01' }
    ]

    const result = processTrade('BUY', 100, 100000, 0.01, 0.20, queue)

    expect(result.realizedGain).toBe(0)
    expect(result.newQueue).toHaveLength(2)
    expect(result.newQueue[1]?.contracts).toBe(100)
  })

  it('SELL trade realizes gain using FIFO', () => {
    const queue: CostBasisLot[] = [
      { contracts: 100, pricePerContract: 90000, totalCost: 90000, margin: 18000, timestamp: '2024-01-01' }
    ]

    // Sell all 100 contracts at higher price
    const result = processTrade('SELL', 100, 100000, 0.01, 0.20, queue)

    // Proceeds = 100 * 0.01 * 100000 = $100,000
    // Cost basis = $90,000
    // Realized gain = $100,000 - $90,000 = $10,000
    expect(result.realizedGain).toBe(10000)
    expect(result.marginChange).toBe(-18000) // Returns margin
    expect(result.newQueue).toHaveLength(0)
  })

  it('SELL trade realizes loss when price drops', () => {
    const queue: CostBasisLot[] = [
      { contracts: 100, pricePerContract: 100000, totalCost: 100000, margin: 20000, timestamp: '2024-01-01' }
    ]

    // Sell at lower price
    const result = processTrade('SELL', 100, 80000, 0.01, 0.20, queue)

    // Proceeds = 100 * 0.01 * 80000 = $80,000
    // Cost basis = $100,000
    // Realized gain = $80,000 - $100,000 = -$20,000
    expect(result.realizedGain).toBe(-20000)
    expect(result.newQueue).toHaveLength(0)
  })

  it('partial SELL consumes from FIFO queue correctly', () => {
    const queue: CostBasisLot[] = [
      { contracts: 100, pricePerContract: 90000, totalCost: 90000, margin: 18000, timestamp: '2024-01-01' },
      { contracts: 100, pricePerContract: 95000, totalCost: 95000, margin: 19000, timestamp: '2024-01-02' }
    ]

    // Sell 50 contracts - should come from first lot (FIFO)
    const result = processTrade('SELL', 50, 100000, 0.01, 0.20, queue)

    // Proceeds = 50 * 0.01 * 100000 = $50,000
    // Cost basis = 50/100 * $90,000 = $45,000
    // Realized gain = $50,000 - $45,000 = $5,000
    expect(result.realizedGain).toBe(5000)

    // First lot should have 50 remaining
    expect(result.newQueue).toHaveLength(2)
    expect(result.newQueue[0]?.contracts).toBe(50)
    expect(result.newQueue[1]?.contracts).toBe(100)
  })

  it('SELL across multiple lots uses FIFO', () => {
    const queue: CostBasisLot[] = [
      { contracts: 50, pricePerContract: 90000, totalCost: 45000, margin: 9000, timestamp: '2024-01-01' },
      { contracts: 100, pricePerContract: 95000, totalCost: 95000, margin: 19000, timestamp: '2024-01-02' }
    ]

    // Sell 100 contracts - consumes all of first lot and 50 from second
    const result = processTrade('SELL', 100, 100000, 0.01, 0.20, queue)

    // Proceeds = 100 * 0.01 * 100000 = $100,000
    // Cost basis = $45,000 (all of lot 1) + $47,500 (half of lot 2) = $92,500
    // Realized gain = $100,000 - $92,500 = $7,500
    expect(result.realizedGain).toBe(7500)

    // Only second lot should remain with 50 contracts
    expect(result.newQueue).toHaveLength(1)
    expect(result.newQueue[0]?.contracts).toBe(50)
  })
})

describe('calculateLiquidationPrice', () => {
  it('returns 0 when no position', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 0,
      avgEntryPrice: 0,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 1000,
      marginAvailable: 1000,
      maintenanceMargin: 0,
      costBasisQueue: [],
      totalCostBasis: 0,
      contractMultiplier: 0.01
    }

    expect(calculateLiquidationPrice(position)).toBe(0)
  })

  it('calculates liquidation price for long position', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 25000, // $25,000 in margin
      marginAvailable: 20000,
      maintenanceMargin: 5000, // 5% of $100,000 notional
      costBasisQueue: [
        { contracts: 100, pricePerContract: 100000, totalCost: 100000, margin: 20000, timestamp: '2024-01-01' }
      ],
      totalCostBasis: 100000,
      contractMultiplier: 0.01
    }

    // Liq price = (maintenanceMargin + costBasis - totalCash) / notionalSize
    // = (5000 + 100000 - 25000) / (100 * 0.01)
    // = 80000 / 1 = $80,000
    const liqPrice = calculateLiquidationPrice(position)
    expect(liqPrice).toBe(80000)
  })

  it('returns 0 for fully collateralized position', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 200000, // More than cost basis
      marginAvailable: 100000,
      maintenanceMargin: 5000,
      costBasisQueue: [
        { contracts: 100, pricePerContract: 100000, totalCost: 100000, margin: 20000, timestamp: '2024-01-01' }
      ],
      totalCostBasis: 100000,
      contractMultiplier: 0.01
    }

    // Liq price = (5000 + 100000 - 200000) / 1 = -95000 -> clamped to 0
    expect(calculateLiquidationPrice(position)).toBe(0)
  })
})

describe('calculateEquityAtPrice', () => {
  it('calculates equity at current price', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 100000,
      marginAvailable: 80000,
      maintenanceMargin: 5000,
      costBasisQueue: [
        { contracts: 100, pricePerContract: 100000, totalCost: 100000, margin: 20000, timestamp: '2024-01-01' }
      ],
      totalCostBasis: 100000,
      contractMultiplier: 0.01
    }

    // At entry price, unrealized PnL = 0
    // Equity = marginLocked + unrealizedPnl = 100000 + 0 = 100000
    expect(calculateEquityAtPrice(position, 100000)).toBe(100000)
  })

  it('calculates equity at higher price (profit)', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 100000,
      marginAvailable: 80000,
      maintenanceMargin: 5000,
      costBasisQueue: [
        { contracts: 100, pricePerContract: 100000, totalCost: 100000, margin: 20000, timestamp: '2024-01-01' }
      ],
      totalCostBasis: 100000,
      contractMultiplier: 0.01
    }

    // At 110000: notional = 100 * 0.01 * 110000 = 110000
    // Unrealized PnL = 110000 - 100000 = 10000
    // Equity = 100000 + 10000 = 110000
    expect(calculateEquityAtPrice(position, 110000)).toBe(110000)
  })

  it('calculates equity at lower price (loss)', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 100000,
      marginAvailable: 80000,
      maintenanceMargin: 5000,
      costBasisQueue: [
        { contracts: 100, pricePerContract: 100000, totalCost: 100000, margin: 20000, timestamp: '2024-01-01' }
      ],
      totalCostBasis: 100000,
      contractMultiplier: 0.01
    }

    // At 90000: notional = 100 * 0.01 * 90000 = 90000
    // Unrealized PnL = 90000 - 100000 = -10000
    // Equity = 100000 - 10000 = 90000
    expect(calculateEquityAtPrice(position, 90000)).toBe(90000)
  })
})

describe('mergeFundingData', () => {
  it('merges empty arrays', () => {
    const result = mergeFundingData([], [])
    expect(result).toHaveLength(0)
  })

  it('includes all API funding payments', () => {
    const apiFunding: FundingPayment[] = [
      { timestamp: '2024-01-01T08:00:00Z', amount: 0.50, productId: 'BIP', rate: 0.0001 },
      { timestamp: '2024-01-01T16:00:00Z', amount: 0.75, productId: 'BIP', rate: 0.00015 }
    ]

    const result = mergeFundingData(apiFunding, [])
    expect(result).toHaveLength(2)
    expect(result[0]?.source).toBe('api')
    expect(result[1]?.source).toBe('api')
  })

  it('includes all manual funding payments', () => {
    const manualFunding: FundingPayment[] = [
      { timestamp: '2024-01-01T08:00:00Z', amount: 0.50, productId: 'BIP', rate: 0.0001 }
    ]

    const result = mergeFundingData([], manualFunding)
    expect(result).toHaveLength(1)
    expect(result[0]?.source).toBe('manual')
  })

  it('manual overrides API for same timestamp and amount', () => {
    const apiFunding: FundingPayment[] = [
      { timestamp: '2024-01-01T08:00:00Z', amount: 0.50, productId: 'BIP', rate: 0.0001 }
    ]
    const manualFunding: FundingPayment[] = [
      { timestamp: '2024-01-01T08:00:00Z', amount: 0.50, productId: 'BIP', rate: 0.00012 }
    ]

    const result = mergeFundingData(apiFunding, manualFunding)
    expect(result).toHaveLength(1)
    expect(result[0]?.source).toBe('manual')
    expect(result[0]?.rate).toBe(0.00012) // Manual rate overrides
  })

  it('sorts results by timestamp', () => {
    const apiFunding: FundingPayment[] = [
      { timestamp: '2024-01-02T08:00:00Z', amount: 0.75, productId: 'BIP', rate: 0.0001 }
    ]
    const manualFunding: FundingPayment[] = [
      { timestamp: '2024-01-01T08:00:00Z', amount: 0.50, productId: 'BIP', rate: 0.0001 }
    ]

    const result = mergeFundingData(apiFunding, manualFunding)
    expect(result[0]?.timestamp).toBe('2024-01-01T08:00:00Z')
    expect(result[1]?.timestamp).toBe('2024-01-02T08:00:00Z')
  })
})

describe('calculateDailyPnL', () => {
  it('returns empty array for no data', () => {
    const result = calculateDailyPnL([], [])
    expect(result).toHaveLength(0)
  })

  it('aggregates trading P&L by day', () => {
    const trades: ProcessedTrade[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        tradeId: '1',
        orderId: 'O1',
        side: 'SELL',
        contracts: 100,
        notionalSize: 1,
        price: 100000,
        total: 1000,
        commission: 5,
        marginChange: -200,
        realizedPnl: 50,
        cumulativeContracts: 0,
        cumulativeMargin: 800
      }
    ]

    const result = calculateDailyPnL([], trades)
    expect(result).toHaveLength(1)
    expect(result[0]?.date).toBe('2024-01-01')
    expect(result[0]?.tradingProfit).toBe(50)
    expect(result[0]?.fees).toBe(5)
  })

  it('aggregates funding by day', () => {
    const funding: FundingPayment[] = [
      { timestamp: '2024-01-01T08:00:00Z', amount: 0.50, productId: 'BIP', rate: 0.0001 },
      { timestamp: '2024-01-01T16:00:00Z', amount: 0.25, productId: 'BIP', rate: 0.0001 },
      { timestamp: '2024-01-01T20:00:00Z', amount: -0.10, productId: 'BIP', rate: -0.00005 }
    ]

    const result = calculateDailyPnL(funding, [])
    expect(result).toHaveLength(1)
    expect(result[0]?.fundingProfit).toBe(0.75)
    expect(result[0]?.fundingLoss).toBe(-0.10)
    expect(result[0]?.netPnl).toBeCloseTo(0.65)
  })

  it('combines funding and trading into net P&L', () => {
    const funding: FundingPayment[] = [
      { timestamp: '2024-01-01T08:00:00Z', amount: 10, productId: 'BIP', rate: 0.0001 }
    ]
    const trades: ProcessedTrade[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        tradeId: '1',
        orderId: 'O1',
        side: 'SELL',
        contracts: 100,
        notionalSize: 1,
        price: 100000,
        total: 1000,
        commission: 5,
        marginChange: -200,
        realizedPnl: 50,
        cumulativeContracts: 0,
        cumulativeMargin: 800
      }
    ]

    const result = calculateDailyPnL(funding, trades)
    // Net = funding_profit + funding_loss + trading_profit + trading_loss - fees + rewards
    // = 10 + 0 + 50 + 0 - 5 + 0 = 55
    expect(result[0]?.netPnl).toBe(55)
  })
})

describe('processTradeHistory', () => {
  it('processes empty fills array', () => {
    const result = processTradeHistory([])
    expect(result).toHaveLength(0)
  })

  it('processes single BUY fill', () => {
    const fills: CoinbaseFill[] = [
      {
        tradeId: 'T1',
        orderId: 'O1',
        productId: 'BIP',
        side: 'BUY',
        size: '100',
        price: '100000',
        commission: '5',
        tradeTime: '2024-01-01T10:00:00Z',
        sequenceTimestamp: '2024-01-01T10:00:00Z',
        liquidityIndicator: 'TAKER'
      }
    ]

    const result = processTradeHistory(fills)
    expect(result).toHaveLength(1)
    expect(result[0]?.side).toBe('BUY')
    expect(result[0]?.contracts).toBe(100)
    expect(result[0]?.notionalSize).toBe(1) // 100 * 0.01
    expect(result[0]?.realizedPnl).toBe(0)
    expect(result[0]?.cumulativeContracts).toBe(100)
  })

  it('processes BUY then SELL with realized gain', () => {
    const fills: CoinbaseFill[] = [
      {
        tradeId: 'T1',
        orderId: 'O1',
        productId: 'BIP',
        side: 'BUY',
        size: '100',
        price: '100000',
        commission: '5',
        tradeTime: '2024-01-01T10:00:00Z',
        sequenceTimestamp: '2024-01-01T10:00:00Z',
        liquidityIndicator: 'TAKER'
      },
      {
        tradeId: 'T2',
        orderId: 'O2',
        productId: 'BIP',
        side: 'SELL',
        size: '100',
        price: '110000',
        commission: '5.5',
        tradeTime: '2024-01-02T10:00:00Z',
        sequenceTimestamp: '2024-01-02T10:00:00Z',
        liquidityIndicator: 'TAKER'
      }
    ]

    const result = processTradeHistory(fills)
    expect(result).toHaveLength(2)

    // SELL trade should have realized gain
    // Proceeds = 100 * 0.01 * 110000 = 110000
    // Cost = 100 * 0.01 * 100000 = 100000
    // Gain = 10000
    expect(result[1]?.realizedPnl).toBe(10000)
    expect(result[1]?.cumulativeContracts).toBe(0)
  })

  it('sorts fills by timestamp', () => {
    const fills: CoinbaseFill[] = [
      {
        tradeId: 'T2',
        orderId: 'O2',
        productId: 'BIP',
        side: 'SELL',
        size: '100',
        price: '110000',
        commission: '5',
        tradeTime: '2024-01-02T10:00:00Z',
        sequenceTimestamp: '2024-01-02T10:00:00Z',
        liquidityIndicator: 'TAKER'
      },
      {
        tradeId: 'T1',
        orderId: 'O1',
        productId: 'BIP',
        side: 'BUY',
        size: '100',
        price: '100000',
        commission: '5',
        tradeTime: '2024-01-01T10:00:00Z',
        sequenceTimestamp: '2024-01-01T10:00:00Z',
        liquidityIndicator: 'TAKER'
      }
    ]

    const result = processTradeHistory(fills)
    expect(result[0]?.side).toBe('BUY')
    expect(result[1]?.side).toBe('SELL')
  })
})

describe('computeDerivativesState', () => {
  it('computes position from trade history', () => {
    const trades: ProcessedTrade[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        tradeId: 'T1',
        orderId: 'O1',
        side: 'BUY',
        contracts: 100,
        notionalSize: 1,
        price: 100000,
        total: 100000,
        commission: 5,
        marginChange: 20000,
        realizedPnl: 0,
        cumulativeContracts: 100,
        cumulativeMargin: 20000
      }
    ]

    const result = computeDerivativesState(trades, 105000, 'BIP')

    expect(result.contracts).toBe(100)
    expect(result.avgEntryPrice).toBe(100000)
    expect(result.totalCostBasis).toBe(100000)
    // Unrealized = (100 * 0.01 * 105000) - 100000 = 105000 - 100000 = 5000
    expect(result.unrealizedPnl).toBe(5000)
  })

  it('computes zero position after full close', () => {
    const trades: ProcessedTrade[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        tradeId: 'T1',
        orderId: 'O1',
        side: 'BUY',
        contracts: 100,
        notionalSize: 1,
        price: 100000,
        total: 100000,
        commission: 5,
        marginChange: 20000,
        realizedPnl: 0,
        cumulativeContracts: 100,
        cumulativeMargin: 20000
      },
      {
        timestamp: '2024-01-02T10:00:00Z',
        tradeId: 'T2',
        orderId: 'O2',
        side: 'SELL',
        contracts: 100,
        notionalSize: 1,
        price: 110000,
        total: 110000,
        commission: 5,
        marginChange: -20000,
        realizedPnl: 10000,
        cumulativeContracts: 0,
        cumulativeMargin: 0
      }
    ]

    const result = computeDerivativesState(trades, 105000, 'BIP')

    expect(result.contracts).toBe(0)
    expect(result.avgEntryPrice).toBe(0)
    expect(result.totalCostBasis).toBe(0)
    expect(result.unrealizedPnl).toBe(0)
  })
})

describe('computeDerivativesEntriesState', () => {
  it('handles empty entries', () => {
    const result = computeDerivativesEntriesState([])
    expect(result).toHaveLength(0)
  })

  it('tracks DEPOSIT and WITHDRAW', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-02', action: 'WITHDRAW', amount: 200 }
    ]

    const result = computeDerivativesEntriesState(entries)
    expect(result).toHaveLength(2)
    expect(result[0]?.marginBalance).toBe(1000)
    expect(result[1]?.marginBalance).toBe(800)
  })

  it('tracks BUY and updates position', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-02', action: 'BUY', contracts: 100, price: 1000 } // $1000 per contract
    ]

    const result = computeDerivativesEntriesState(entries)
    expect(result).toHaveLength(2)

    const buyEntry = result[1]
    expect(buyEntry?.position).toBe(100)
    expect(buyEntry?.avgEntry).toBe(100000) // 1000 / 0.01 = $100,000 BTC price
    expect(buyEntry?.costBasis).toBe(100000) // 100 * $1000
  })

  it('tracks FUNDING as realized gain', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-02', action: 'FUNDING', amount: 5.50 }
    ]

    const result = computeDerivativesEntriesState(entries)
    expect(result[1]?.sumFunding).toBe(5.50)
    expect(result[1]?.realizedPnl).toBe(5.50)
    expect(result[1]?.marginBalance).toBe(1005.50)
  })

  it('tracks INTEREST as realized gain', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-02', action: 'INTEREST', amount: 2.00 }
    ]

    const result = computeDerivativesEntriesState(entries)
    expect(result[1]?.sumInterest).toBe(2.00)
    expect(result[1]?.realizedPnl).toBe(2.00)
    expect(result[1]?.marginBalance).toBe(1002.00)
  })

  it('tracks REBATE as realized gain', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-02', action: 'REBATE', amount: 1.50 }
    ]

    const result = computeDerivativesEntriesState(entries)
    expect(result[1]?.sumRebates).toBe(1.50)
    expect(result[1]?.realizedPnl).toBe(1.50)
  })

  it('tracks FEE as expense', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-02', action: 'FEE', amount: 3.00 }
    ]

    const result = computeDerivativesEntriesState(entries)
    expect(result[1]?.sumFees).toBe(3.00)
    expect(result[1]?.realizedPnl).toBe(-3.00)
    expect(result[1]?.marginBalance).toBe(997.00)
  })

  it('calculates realized P&L on SELL using FIFO', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 },
      { date: '2024-01-02', action: 'BUY', contracts: 100, price: 500 }, // $50,000 BTC
      { date: '2024-01-03', action: 'SELL', contracts: 100, price: 600 } // $60,000 BTC
    ]

    const result = computeDerivativesEntriesState(entries)

    // Cost basis = 100 * $500 = $50,000
    // Sale proceeds = 100 * $600 = $60,000
    // Realized P&L = $60,000 - $50,000 = $10,000
    const sellEntry = result[2]
    expect(sellEntry?.realizedPnl).toBe(10000)
    expect(sellEntry?.position).toBe(0)
    expect(sellEntry?.costBasis).toBe(0)
  })

  it('sorts entries by date then action priority', () => {
    const entries = [
      { date: '2024-01-01', action: 'BUY', contracts: 100, price: 1000 },
      { date: '2024-01-01', action: 'DEPOSIT', amount: 1000 }
    ]

    const result = computeDerivativesEntriesState(entries)
    // DEPOSIT should be processed before BUY on the same day
    expect(result[0]?.action).toBe('DEPOSIT')
    expect(result[1]?.action).toBe('BUY')
  })

  it('calculates leverage correctly', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 500 },
      { date: '2024-01-02', action: 'BUY', contracts: 100, price: 1000 } // $100,000 notional
    ]

    const result = computeDerivativesEntriesState(entries)

    // Margin locked = 100 * $1000 * 0.25 = $25,000 (25% initial margin per Coinbase)
    // Current notional = 100 * 0.01 * 100000 = $100,000 (using BTC price from trade)
    // Leverage = notional / margin_locked
    const buyEntry = result[1]
    expect(buyEntry?.marginLocked).toBe(25000)
    expect(buyEntry?.leverage).toBe(4) // $100,000 / $25,000
  })

  it('recalculates marginLocked at mark price on final entry', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 50000 },
      { date: '2024-01-02', action: 'BUY', contracts: 100, price: 1000 } // entry at $100k BTC
    ]

    // With currentMarkPrice of $120,000 (i.e., 1200 per contract at 0.01 multiplier)
    const result = computeDerivativesEntriesState(entries, 0.01, 0.20, 120000)

    const buyEntry = result[1]
    // Final entry marginLocked = abs(100) * 0.01 * 120000 * 0.25 = $30,000
    expect(buyEntry?.marginLocked).toBe(30000)
    // Notional at mark = 100 * 0.01 * 120000 = $120,000
    // Leverage = $120,000 / $30,000 = 4
    expect(buyEntry?.leverage).toBe(4)
  })

  it('uses custom initialMarginRate for marginLocked', () => {
    const entries = [
      { date: '2024-01-01', action: 'DEPOSIT', amount: 50000 },
      { date: '2024-01-02', action: 'BUY', contracts: 100, price: 1000 }
    ]

    // Pass custom initialMarginRate of 0.10 (10%)
    const result = computeDerivativesEntriesState(entries, 0.01, 0.20, undefined, 0.10)

    const buyEntry = result[1]
    // marginLocked = abs(100) * 0.01 * 100000 * 0.10 = $10,000
    expect(buyEntry?.marginLocked).toBe(10000)
    // Leverage = $100,000 / $10,000 = 10
    expect(buyEntry?.leverage).toBe(10)
  })
})

describe('calculateSafeLimitOrders', () => {
  it('generates order ladder', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 200000, // Enough margin
      marginAvailable: 100000,
      maintenanceMargin: 5000,
      costBasisQueue: [
        { contracts: 100, pricePerContract: 100000, totalCost: 100000, margin: 20000, timestamp: '2024-01-01' }
      ],
      totalCostBasis: 100000,
      contractMultiplier: 0.01
    }

    const result = calculateSafeLimitOrders(position, 95000, 1000, 5000, 5)

    expect(result.startPrice).toBe(95000)
    expect(result.priceIncrement).toBe(1000)
    expect(result.dollarPerOrder).toBe(5000)
    expect(result.orders.length).toBeGreaterThan(0)
    expect(result.orders.length).toBeLessThanOrEqual(5)
  })

  it('marks safe orders correctly', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 0,
      avgEntryPrice: 0,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 50000, // Large margin for safety
      marginAvailable: 50000,
      maintenanceMargin: 0,
      costBasisQueue: [],
      totalCostBasis: 0,
      contractMultiplier: 0.01
    }

    const result = calculateSafeLimitOrders(position, 95000, 1000, 5000, 3)

    // With enough margin and low orders, should be safe
    for (const order of result.orders) {
      if (order.isSafe) {
        expect(order.equityAtZero).toBeGreaterThan(0)
      }
    }
  })
})

describe('formatPositionSummary', () => {
  it('formats position with profit', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 110000,
      liquidationPrice: 80000,
      unrealizedPnl: 100,
      marginLocked: 1000,
      marginAvailable: 500,
      maintenanceMargin: 50,
      costBasisQueue: [],
      totalCostBasis: 1000,
      contractMultiplier: 0.01
    }

    const result = formatPositionSummary(position)

    expect(result.contracts).toBe('100')
    expect(result.notionalSize).toBe('1.0000')
    expect(result.avgEntry).toContain('100,000')
    expect(result.currentPrice).toContain('110,000')
    expect(result.liquidationPrice).toContain('80,000')
    expect(result.unrealizedPnl).toContain('+')
    expect(result.unrealizedPnlPct).toBe('10.00%')
  })

  it('formats position with loss', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 90000,
      liquidationPrice: 80000,
      unrealizedPnl: -100,
      marginLocked: 1000,
      marginAvailable: 500,
      maintenanceMargin: 50,
      costBasisQueue: [],
      totalCostBasis: 1000,
      contractMultiplier: 0.01
    }

    const result = formatPositionSummary(position)
    expect(result.unrealizedPnl).toContain('-')
  })

  it('formats fully collateralized position', () => {
    const position: DerivativesPosition = {
      productId: 'BIP',
      contracts: 100,
      avgEntryPrice: 100000,
      currentPrice: 100000,
      liquidationPrice: 0,
      unrealizedPnl: 0,
      marginLocked: 1000,
      marginAvailable: 500,
      maintenanceMargin: 50,
      costBasisQueue: [],
      totalCostBasis: 1000,
      contractMultiplier: 0.01
    }

    const result = formatPositionSummary(position)
    expect(result.liquidationPrice).toBe('$0 (fully collateralized)')
  })
})
