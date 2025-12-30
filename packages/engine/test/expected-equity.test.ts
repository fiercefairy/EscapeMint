import { describe, it, expect } from 'vitest'
import { computeExpectedTarget, computeCashAvailable, computeStartInput } from '../src/expected-equity.js'
import type { SubFundConfig, Trade, CashFlow } from '../src/types.js'

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

describe('computeStartInput', () => {
  it('returns 0 when no trades', () => {
    const result = computeStartInput([], '2024-01-01')
    expect(result).toBe(0)
  })

  it('adds BUY trades to total', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 100, type: 'buy' },
      { date: '2024-01-08', amount_usd: 100, type: 'buy' }
    ]
    const result = computeStartInput(trades, '2024-01-15')
    expect(result).toBe(200)
  })

  it('subtracts SELL trades from total', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 500, type: 'buy' },
      { date: '2024-01-08', amount_usd: 300, type: 'sell' }
    ]
    const result = computeStartInput(trades, '2024-01-15')
    expect(result).toBe(200)
  })

  it('skips future trades', () => {
    const trades: Trade[] = [
      { date: '2024-02-01', amount_usd: 100, type: 'buy' }
    ]
    const result = computeStartInput(trades, '2024-01-15')
    expect(result).toBe(0)
  })

  it('returns 0 if sells exceed buys', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 100, type: 'buy' },
      { date: '2024-01-08', amount_usd: 500, type: 'sell' }
    ]
    const result = computeStartInput(trades, '2024-01-15')
    expect(result).toBe(0)
  })
})

describe('computeExpectedTarget', () => {
  it('returns 0 when no trades', () => {
    const result = computeExpectedTarget(baseConfig, [], '2024-01-01')
    expect(result).toBe(0)
  })

  it('compounds a single BUY trade from trade date', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 1000, type: 'buy' }
    ]
    const result = computeExpectedTarget(baseConfig, trades, '2025-01-01')
    // $1000 * (1.30)^(366/365) ≈ $1301 (leap year)
    expect(result).toBeCloseTo(1301, 0)
  })

  it('compounds multiple BUY trades correctly', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 1000, type: 'buy' },
      { date: '2024-07-01', amount_usd: 1000, type: 'buy' }
    ]
    const result = computeExpectedTarget(baseConfig, trades, '2025-01-01')
    // First buy: $1000 * (1.30)^1 = $1300
    // Second buy: $1000 * (1.30)^0.5 ≈ $1140
    // Total: $2440
    expect(result).toBeCloseTo(2440, -1)
  })

  it('subtracts SELL trades at face value', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 1000, type: 'buy' },
      { date: '2024-07-01', amount_usd: 200, type: 'sell' }
    ]
    const result = computeExpectedTarget(baseConfig, trades, '2025-01-01')
    // Buy: $1000 * (1.30)^(366/365) ≈ $1301 expected
    // Sell: reduces start_input by $200
    // Expected = 800 + gain on 1000 ≈ 1101 (leap year)
    expect(result).toBeCloseTo(1101, 0)
  })
})

describe('computeCashAvailable', () => {
  it('returns full fund size when no trades', () => {
    const result = computeCashAvailable(baseConfig, [], [], '2024-01-01')
    expect(result).toBe(10000)
  })

  it('reduces cash after BUY trades', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 100, type: 'buy' },
      { date: '2024-01-08', amount_usd: 100, type: 'buy' }
    ]
    const result = computeCashAvailable(baseConfig, trades, [], '2024-01-15')
    expect(result).toBe(9800)
  })

  it('increases cash after SELL trades', () => {
    const trades: Trade[] = [
      { date: '2024-01-01', amount_usd: 1000, type: 'buy' },
      { date: '2024-01-08', amount_usd: 500, type: 'sell' }
    ]
    const result = computeCashAvailable(baseConfig, trades, [], '2024-01-15')
    expect(result).toBe(9500)
  })

  it('handles external deposits', () => {
    const cashflows: CashFlow[] = [
      { date: '2024-01-15', amount_usd: 1000, type: 'deposit' }
    ]
    const result = computeCashAvailable(baseConfig, [], cashflows, '2024-02-01')
    expect(result).toBe(11000)
  })

  it('handles external withdrawals', () => {
    const cashflows: CashFlow[] = [
      { date: '2024-01-15', amount_usd: 2000, type: 'withdrawal' }
    ]
    const result = computeCashAvailable(baseConfig, [], cashflows, '2024-02-01')
    expect(result).toBe(8000)
  })

  it('skips future events', () => {
    const trades: Trade[] = [
      { date: '2024-02-01', amount_usd: 100, type: 'buy' }
    ]
    const result = computeCashAvailable(baseConfig, trades, [], '2024-01-15')
    expect(result).toBe(10000)
  })
})
