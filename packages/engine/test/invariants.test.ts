import { describe, it, expect } from 'vitest'
import {
  computeExpectedTarget,
  computeCashAvailable,
  computeStartInput,
  computeFundState
} from '../src/expected-equity.js'
import type { SubFundConfig, Trade, CashFlow, Dividend, Expense } from '../src/types.js'

/**
 * Property-based tests for mathematical invariants.
 * These tests verify that core computation functions maintain
 * expected mathematical properties across a range of inputs.
 */

const baseConfig: SubFundConfig = {
  fund_size_usd: 10000,
  target_apy: 0.30,
  interval_days: 7,
  input_min_usd: 100,
  input_mid_usd: 200,
  input_max_usd: 300,
  max_at_pct: -0.25,
  min_profit_usd: 100,
  cash_apy: 0.044,
  margin_apr: 0.0725,
  margin_access_usd: 0,
  accumulate: false,
  start_date: '2024-01-01'
}

// Helper to generate random trades
function generateRandomTrades(count: number, seed: number): Trade[] {
  const trades: Trade[] = []
  let currentDate = new Date('2024-01-01')

  for (let i = 0; i < count; i++) {
    const pseudoRandom = Math.sin(seed + i) * 10000
    const amount = Math.abs(pseudoRandom % 1000) + 10
    const type = (Math.floor(pseudoRandom) % 2 === 0) ? 'buy' : 'sell'

    trades.push({
      date: currentDate.toISOString().split('T')[0],
      amount_usd: Math.round(amount * 100) / 100,
      type
    })

    currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000)
  }

  return trades
}

// Helper to generate random cashflows
function generateRandomCashflows(count: number, seed: number): CashFlow[] {
  const cashflows: CashFlow[] = []
  let currentDate = new Date('2024-02-01')

  for (let i = 0; i < count; i++) {
    const pseudoRandom = Math.sin(seed + i + 100) * 10000
    const amount = Math.abs(pseudoRandom % 500) + 10
    const type = (Math.floor(pseudoRandom) % 2 === 0) ? 'deposit' : 'withdrawal'

    cashflows.push({
      date: currentDate.toISOString().split('T')[0],
      amount_usd: Math.round(amount * 100) / 100,
      type
    })

    currentDate = new Date(currentDate.getTime() + 14 * 24 * 60 * 60 * 1000)
  }

  return cashflows
}

describe('invariant: start_input is always >= 0', () => {
  it('holds with no trades', () => {
    const result = computeStartInput([], '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('holds with only buy trades', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 100, type: 'buy' },
      { date: '2024-02-15', amount_usd: 200, type: 'buy' }
    ]
    const result = computeStartInput(trades, '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBe(300)
  })

  it('holds when sells exceed buys', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 100, type: 'buy' },
      { date: '2024-02-15', amount_usd: 500, type: 'sell' }
    ]
    const result = computeStartInput(trades, '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBe(0) // Clamped to 0
  })

  it('holds with random trade sequences', () => {
    for (let seed = 0; seed < 20; seed++) {
      const trades = generateRandomTrades(10, seed)
      const result = computeStartInput(trades, '2025-01-01')
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })

  it('holds with extreme sell amounts', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 100, type: 'buy' },
      { date: '2024-02-15', amount_usd: 999999, type: 'sell' }
    ]
    const result = computeStartInput(trades, '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

describe('invariant: cash_available is always >= 0', () => {
  it('holds with no activity', () => {
    const result = computeCashAvailable(baseConfig, [], [], [], [], '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('holds when buys exceed fund size', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 20000, type: 'buy' }
    ]
    const result = computeCashAvailable(baseConfig, trades, [], [], [], '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBe(0) // Clamped to 0
  })

  it('holds when withdrawals exceed available', () => {
    const cashflows: CashFlow[] = [
      { date: '2024-01-15', amount_usd: 50000, type: 'withdrawal' }
    ]
    const result = computeCashAvailable(baseConfig, [], cashflows, [], [], '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('holds with random trades and cashflows', () => {
    for (let seed = 0; seed < 20; seed++) {
      const trades = generateRandomTrades(5, seed)
      const cashflows = generateRandomCashflows(3, seed)
      const result = computeCashAvailable(baseConfig, trades, cashflows, [], [], '2025-01-01')
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })

  it('holds with extreme withdrawal sequences', () => {
    const cashflows: CashFlow[] = [
      { date: '2024-01-15', amount_usd: 5000, type: 'withdrawal' },
      { date: '2024-02-15', amount_usd: 5000, type: 'withdrawal' },
      { date: '2024-03-15', amount_usd: 5000, type: 'withdrawal' }
    ]
    const result = computeCashAvailable(baseConfig, [], cashflows, [], [], '2024-06-01')
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

describe('invariant: expected_target >= start_input when APY >= 0', () => {
  it('holds with no trades', () => {
    const expectedTarget = computeExpectedTarget(baseConfig, [], '2024-06-01')
    const startInput = computeStartInput([], '2024-06-01')
    // Both should be 0
    expect(expectedTarget).toBeGreaterThanOrEqual(startInput)
  })

  it('holds with single buy', () => {
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]
    const expectedTarget = computeExpectedTarget(baseConfig, trades, '2024-06-01')
    const startInput = computeStartInput(trades, '2024-06-01')
    expect(expectedTarget).toBeGreaterThanOrEqual(startInput)
  })

  it('holds with 0% APY (equality case)', () => {
    const zeroApyConfig = { ...baseConfig, target_apy: 0 }
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]
    const expectedTarget = computeExpectedTarget(zeroApyConfig, trades, '2024-06-01')
    const startInput = computeStartInput(trades, '2024-06-01')
    expect(expectedTarget).toBe(startInput)
  })

  it('holds with multiple buys', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 500, type: 'buy' },
      { date: '2024-03-15', amount_usd: 500, type: 'buy' },
      { date: '2024-05-15', amount_usd: 500, type: 'buy' }
    ]
    const expectedTarget = computeExpectedTarget(baseConfig, trades, '2024-12-01')
    const startInput = computeStartInput(trades, '2024-12-01')
    expect(expectedTarget).toBeGreaterThanOrEqual(startInput)
  })

  it('holds with buys and sells', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 1000, type: 'buy' },
      { date: '2024-03-15', amount_usd: 200, type: 'sell' },
      { date: '2024-05-15', amount_usd: 500, type: 'buy' }
    ]
    const expectedTarget = computeExpectedTarget(baseConfig, trades, '2024-12-01')
    const startInput = computeStartInput(trades, '2024-12-01')
    expect(expectedTarget).toBeGreaterThanOrEqual(startInput)
  })

  it('holds with very high APY', () => {
    const highApyConfig = { ...baseConfig, target_apy: 2.0 } // 200% APY
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]
    const expectedTarget = computeExpectedTarget(highApyConfig, trades, '2024-12-01')
    const startInput = computeStartInput(trades, '2024-12-01')
    expect(expectedTarget).toBeGreaterThanOrEqual(startInput)
  })

  it('holds with random buy-only trade sequences and various APY', () => {
    const apyValues = [0, 0.05, 0.10, 0.25, 0.50, 1.0, 2.0]

    for (const apy of apyValues) {
      const config = { ...baseConfig, target_apy: apy }
      for (let seed = 0; seed < 10; seed++) {
        // Use only buy trades to test the invariant (sells can cause expected to go negative)
        const trades = generateRandomTrades(5, seed).filter(t => t.type === 'buy')
        if (trades.length === 0) continue
        const expectedTarget = computeExpectedTarget(config, trades, '2025-01-01')
        const startInput = computeStartInput(trades, '2025-01-01')
        expect(expectedTarget).toBeGreaterThanOrEqual(startInput)
      }
    }
  })
})

describe('invariant: fund state computed values are consistent', () => {
  it('gain_usd = actual_value - start_input (when start_input > 0)', () => {
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]
    const actualValue = 1500
    const state = computeFundState(baseConfig, trades, [], [], [], actualValue, '2024-06-01')

    expect(state.gain_usd).toBe(actualValue - state.start_input_usd)
  })

  it('gain_pct = (actual_value / start_input) - 1 (when start_input > 0)', () => {
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]
    const actualValue = 1200
    const state = computeFundState(baseConfig, trades, [], [], [], actualValue, '2024-06-01')

    const expectedGainPct = (actualValue / state.start_input_usd) - 1
    expect(state.gain_pct).toBeCloseTo(expectedGainPct, 10)
  })

  it('target_diff = actual_value - expected_target', () => {
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]
    const actualValue = 1100
    const state = computeFundState(baseConfig, trades, [], [], [], actualValue, '2024-06-01')

    expect(state.target_diff_usd).toBeCloseTo(actualValue - state.expected_target_usd, 10)
  })

  it('gain_usd and gain_pct are 0 when start_input is 0', () => {
    const state = computeFundState(baseConfig, [], [], [], [], 0, '2024-06-01')
    expect(state.start_input_usd).toBe(0)
    expect(state.gain_usd).toBe(0)
    expect(state.gain_pct).toBe(0)
  })
})

describe('invariant: temporal consistency', () => {
  it('expected_target grows over time with positive APY', () => {
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]

    const target6mo = computeExpectedTarget(baseConfig, trades, '2024-07-15')
    const target12mo = computeExpectedTarget(baseConfig, trades, '2025-01-15')

    expect(target12mo).toBeGreaterThan(target6mo)
  })

  it('expected_target remains constant over time with 0% APY', () => {
    const zeroApyConfig = { ...baseConfig, target_apy: 0 }
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]

    const target6mo = computeExpectedTarget(zeroApyConfig, trades, '2024-07-15')
    const target12mo = computeExpectedTarget(zeroApyConfig, trades, '2025-01-15')

    expect(target12mo).toBe(target6mo)
    expect(target12mo).toBe(1000) // No growth
  })

  it('start_input is same regardless of asOfDate (for past trades)', () => {
    const trades: Trade[] = [{ date: '2024-01-15', amount_usd: 1000, type: 'buy' }]

    const input6mo = computeStartInput(trades, '2024-07-15')
    const input12mo = computeStartInput(trades, '2025-01-15')

    expect(input12mo).toBe(input6mo)
    expect(input12mo).toBe(1000)
  })
})

describe('invariant: commutativity of buy trades', () => {
  it('order of same-day trades does not affect start_input', () => {
    const trades1: Trade[] = [
      { date: '2024-01-15', amount_usd: 100, type: 'buy' },
      { date: '2024-01-15', amount_usd: 200, type: 'buy' },
      { date: '2024-01-15', amount_usd: 300, type: 'buy' }
    ]

    const trades2: Trade[] = [
      { date: '2024-01-15', amount_usd: 300, type: 'buy' },
      { date: '2024-01-15', amount_usd: 100, type: 'buy' },
      { date: '2024-01-15', amount_usd: 200, type: 'buy' }
    ]

    const input1 = computeStartInput(trades1, '2024-06-01')
    const input2 = computeStartInput(trades2, '2024-06-01')

    expect(input1).toBe(input2)
    expect(input1).toBe(600)
  })

  it('order of same-day trades does not affect expected_target', () => {
    const trades1: Trade[] = [
      { date: '2024-01-15', amount_usd: 100, type: 'buy' },
      { date: '2024-01-15', amount_usd: 200, type: 'buy' }
    ]

    const trades2: Trade[] = [
      { date: '2024-01-15', amount_usd: 200, type: 'buy' },
      { date: '2024-01-15', amount_usd: 100, type: 'buy' }
    ]

    const target1 = computeExpectedTarget(baseConfig, trades1, '2024-12-01')
    const target2 = computeExpectedTarget(baseConfig, trades2, '2024-12-01')

    expect(target1).toBeCloseTo(target2, 10)
  })
})

describe('invariant: fund_size conservation', () => {
  // Note: With reinvest options disabled, conservation formula changes
  // This tests default behavior (all reinvest options = true)
  const noReinvestConfig = {
    ...baseConfig,
    dividend_reinvest: false,
    interest_reinvest: false,
    expense_from_fund: false
  }

  it('cash_available + start_input = fund_size (with no cashflows, reinvest disabled)', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 3000, type: 'buy' }
    ]

    const startInput = computeStartInput(trades, '2024-06-01')
    const cashAvailable = computeCashAvailable(noReinvestConfig, trades, [], [], [], '2024-06-01')

    expect(startInput + cashAvailable).toBe(baseConfig.fund_size_usd)
  })

  it('cash_available + start_input = fund_size + deposits - withdrawals (reinvest disabled)', () => {
    const trades: Trade[] = [
      { date: '2024-01-15', amount_usd: 3000, type: 'buy' }
    ]
    const cashflows: CashFlow[] = [
      { date: '2024-02-01', amount_usd: 500, type: 'deposit' },
      { date: '2024-03-01', amount_usd: 200, type: 'withdrawal' }
    ]

    const startInput = computeStartInput(trades, '2024-06-01')
    const cashAvailable = computeCashAvailable(noReinvestConfig, trades, cashflows, [], [], '2024-06-01')
    const netCashflow = 500 - 200

    expect(startInput + cashAvailable).toBe(baseConfig.fund_size_usd + netCashflow)
  })
})
