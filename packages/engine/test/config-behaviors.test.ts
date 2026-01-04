import { describe, it, expect } from 'vitest'
import { computeRecommendation, computeLimit } from '../src/recommendation.js'
import { computeFundState } from '../src/expected-equity.js'
import type { SubFundConfig, FundState, Trade, CashFlow } from '../src/types.js'

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

function makeState(overrides: Partial<FundState> = {}): FundState {
  return {
    cash_available_usd: 5000,
    expected_target_usd: 1000,
    actual_value_usd: 1000,
    start_input_usd: 1000,
    gain_usd: 0,
    gain_pct: 0,
    target_diff_usd: 0,
    cash_interest_usd: 0,
    realized_gains_usd: 0,
    ...overrides
  }
}

describe('accumulate mode behavior', () => {
  describe('accumulate: false (default)', () => {
    it('liquidates entire position when above target by min_profit', () => {
      const config = { ...baseConfig, accumulate: false }
      const state = makeState({
        expected_target_usd: 1000,
        actual_value_usd: 1200,
        target_diff_usd: 200 // Above min_profit_usd of 100
      })
      const result = computeRecommendation(config, state)
      expect(result?.action).toBe('SELL')
      expect(result?.amount).toBe(1200) // Full liquidation
    })

    it('includes liquidation reasoning in explanation', () => {
      const config = { ...baseConfig, accumulate: false }
      const state = makeState({
        expected_target_usd: 1000,
        actual_value_usd: 1500,
        target_diff_usd: 500
      })
      const result = computeRecommendation(config, state)
      expect(result?.explanation.reasoning).toContain('Liquidating entire position')
    })

    it('sells full position regardless of limit tier', () => {
      const config = { ...baseConfig, accumulate: false }
      // Even with significant loss history, full liquidation on profit
      const state = makeState({
        expected_target_usd: 1000,
        actual_value_usd: 2000,
        target_diff_usd: 1000,
        gain_usd: 500,
        gain_pct: 0.5
      })
      const result = computeRecommendation(config, state)
      expect(result?.amount).toBe(2000)
    })
  })

  describe('accumulate: true', () => {
    it('sells only limit amount when above target by min_profit', () => {
      const config = { ...baseConfig, accumulate: true }
      const state = makeState({
        expected_target_usd: 1000,
        actual_value_usd: 1200,
        target_diff_usd: 200
      })
      const result = computeRecommendation(config, state)
      expect(result?.action).toBe('SELL')
      expect(result?.amount).toBe(100) // Only limit (input_min_usd)
    })

    it('includes accumulate mode reasoning in explanation', () => {
      const config = { ...baseConfig, accumulate: true }
      const state = makeState({
        expected_target_usd: 1000,
        actual_value_usd: 1500,
        target_diff_usd: 500
      })
      const result = computeRecommendation(config, state)
      expect(result?.explanation.reasoning).toContain('Accumulate mode')
    })

    it('preserves investment for compound growth', () => {
      const config = { ...baseConfig, accumulate: true }
      const state = makeState({
        expected_target_usd: 1000,
        actual_value_usd: 5000,
        target_diff_usd: 4000,
        start_input_usd: 2000
      })
      const result = computeRecommendation(config, state)
      // Only sells limit, leaving most of position intact
      expect(result?.amount).toBe(100)
      expect(result?.amount).toBeLessThan(state.actual_value_usd * 0.1)
    })
  })
})

describe('limit tier calculations', () => {
  describe('input_min_usd tier (making money)', () => {
    it('uses min when gain_usd > 0', () => {
      const state = makeState({ gain_usd: 50, gain_pct: 0.05 })
      expect(computeLimit(baseConfig, state)).toBe(100)
    })

    it('uses min when gain_usd = 0 (break-even)', () => {
      const state = makeState({ gain_usd: 0, gain_pct: 0 })
      expect(computeLimit(baseConfig, state)).toBe(100)
    })

    it('uses min for very small gains', () => {
      const state = makeState({ gain_usd: 0.01, gain_pct: 0.00001 })
      expect(computeLimit(baseConfig, state)).toBe(100)
    })
  })

  describe('input_mid_usd tier (minor loss)', () => {
    it('uses mid when loss < max_at_pct', () => {
      // max_at_pct = -0.25, so -10% loss should use mid
      const state = makeState({ gain_usd: -100, gain_pct: -0.10 })
      expect(computeLimit(baseConfig, state)).toBe(200)
    })

    it('uses mid at boundary just above max_at_pct', () => {
      // -24.9% is just above -25% threshold
      const state = makeState({ gain_usd: -249, gain_pct: -0.249 })
      expect(computeLimit(baseConfig, state)).toBe(200)
    })

    it('uses mid for very small loss', () => {
      const state = makeState({ gain_usd: -1, gain_pct: -0.001 })
      expect(computeLimit(baseConfig, state)).toBe(200)
    })
  })

  describe('input_max_usd tier (significant loss)', () => {
    it('uses max when loss >= max_at_pct', () => {
      // -30% loss exceeds -25% threshold
      const state = makeState({ gain_usd: -300, gain_pct: -0.30 })
      expect(computeLimit(baseConfig, state)).toBe(300)
    })

    it('uses max when below threshold boundary', () => {
      // -25.1% is below -25% threshold, should use max
      const state = makeState({ gain_usd: -251, gain_pct: -0.251 })
      expect(computeLimit(baseConfig, state)).toBe(300)
    })

    it('uses max for catastrophic loss', () => {
      // -80% loss
      const state = makeState({ gain_usd: -800, gain_pct: -0.80 })
      expect(computeLimit(baseConfig, state)).toBe(300)
    })

    it('uses max for complete loss (-100%)', () => {
      const state = makeState({ gain_usd: -1000, gain_pct: -1.0 })
      expect(computeLimit(baseConfig, state)).toBe(300)
    })
  })

  describe('initial investment tier', () => {
    it('uses min for first purchase (no investment)', () => {
      const state = makeState({ start_input_usd: 0 })
      expect(computeLimit(baseConfig, state)).toBe(100)
    })

    it('uses min regardless of other state values when no investment', () => {
      const state = makeState({
        start_input_usd: 0,
        gain_usd: -999,
        gain_pct: -0.99
      })
      expect(computeLimit(baseConfig, state)).toBe(100)
    })
  })

  describe('custom tier configurations', () => {
    it('respects custom tier amounts', () => {
      const customConfig = {
        ...baseConfig,
        input_min_usd: 50,
        input_mid_usd: 150,
        input_max_usd: 500
      }
      const stateMax = makeState({ gain_usd: -300, gain_pct: -0.30 })
      const stateMid = makeState({ gain_usd: -50, gain_pct: -0.05 })
      const stateMin = makeState({ gain_usd: 50, gain_pct: 0.05 })

      expect(computeLimit(customConfig, stateMax)).toBe(500)
      expect(computeLimit(customConfig, stateMid)).toBe(150)
      expect(computeLimit(customConfig, stateMin)).toBe(50)
    })

    it('respects custom max_at_pct threshold', () => {
      const tightConfig = { ...baseConfig, max_at_pct: -0.10 } // Trigger max at -10%
      const wideConfig = { ...baseConfig, max_at_pct: -0.50 } // Trigger max at -50%

      const state15pctLoss = makeState({ gain_usd: -150, gain_pct: -0.15 })

      expect(computeLimit(tightConfig, state15pctLoss)).toBe(300) // Uses max (below -10%)
      expect(computeLimit(wideConfig, state15pctLoss)).toBe(200) // Uses mid (above -50%)
    })
  })
})

describe('min_profit_usd threshold edge cases', () => {
  it('requires profit > min_profit_usd (not >=) for SELL', () => {
    const config = { ...baseConfig, min_profit_usd: 100 }
    const stateAtThreshold = makeState({
      expected_target_usd: 1000,
      actual_value_usd: 1100,
      target_diff_usd: 100 // Exactly at threshold
    })
    const result = computeRecommendation(config, stateAtThreshold)
    // target_diff must be > min_profit, not >=
    expect(result?.action).toBe('BUY')
  })

  it('triggers SELL when profit just above min_profit_usd', () => {
    const config = { ...baseConfig, min_profit_usd: 100 }
    const state = makeState({
      expected_target_usd: 1000,
      actual_value_usd: 1101,
      target_diff_usd: 101
    })
    const result = computeRecommendation(config, state)
    expect(result?.action).toBe('SELL')
  })

  it('handles min_profit_usd of 0', () => {
    const config = { ...baseConfig, min_profit_usd: 0 }
    const state = makeState({
      expected_target_usd: 1000,
      actual_value_usd: 1001,
      target_diff_usd: 1
    })
    const result = computeRecommendation(config, state)
    expect(result?.action).toBe('SELL')
  })

  it('handles very high min_profit_usd', () => {
    const config = { ...baseConfig, min_profit_usd: 10000 }
    const state = makeState({
      expected_target_usd: 1000,
      actual_value_usd: 5000,
      target_diff_usd: 4000
    })
    const result = computeRecommendation(config, state)
    // 4000 profit < 10000 threshold, so BUY
    expect(result?.action).toBe('BUY')
  })

  it('handles negative target_diff (below target)', () => {
    const state = makeState({
      expected_target_usd: 1500,
      actual_value_usd: 1000,
      target_diff_usd: -500
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
  })
})

describe('cash constraints', () => {
  it('limits BUY to available cash', () => {
    const state = makeState({
      cash_available_usd: 50,
      gain_usd: -300,
      gain_pct: -0.30,
      target_diff_usd: -300
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(50)
    expect(result?.insufficient_cash).toBe(true)
  })

  it('does not limit SELL by cash', () => {
    const state = makeState({
      cash_available_usd: 0,
      expected_target_usd: 1000,
      actual_value_usd: 1500,
      target_diff_usd: 500
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('SELL')
    expect(result?.amount).toBe(1500) // Full position
    expect(result?.insufficient_cash).toBe(false)
  })

  it('handles exact cash match to limit', () => {
    const state = makeState({
      cash_available_usd: 100,
      target_diff_usd: -50
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.amount).toBe(100)
    expect(result?.insufficient_cash).toBe(false)
  })
})

describe('closed fund behavior (fund_size_usd = 0)', () => {
  it('returns null recommendation for closed fund', () => {
    const closedConfig = { ...baseConfig, fund_size_usd: 0 }
    const state = makeState()
    const result = computeRecommendation(closedConfig, state)
    expect(result).toBeNull()
  })

  it('works with any state values for closed fund', () => {
    const closedConfig = { ...baseConfig, fund_size_usd: 0 }
    const state = makeState({
      actual_value_usd: 50000,
      target_diff_usd: 40000
    })
    const result = computeRecommendation(closedConfig, state)
    expect(result).toBeNull()
  })
})

describe('target_apy configuration', () => {
  it('higher APY creates higher expected target', () => {
    const lowApyConfig = { ...baseConfig, target_apy: 0.10 }
    const highApyConfig = { ...baseConfig, target_apy: 0.50 }

    const trades: Trade[] = [{ date: '2024-01-01', amount_usd: 1000, type: 'buy' }]
    const cashflows: CashFlow[] = []

    const lowState = computeFundState(lowApyConfig, trades, cashflows, [], [], 1200, '2025-01-01')
    const highState = computeFundState(highApyConfig, trades, cashflows, [], [], 1200, '2025-01-01')

    expect(highState.expected_target_usd).toBeGreaterThan(lowState.expected_target_usd)
    // Same actual value, so different target_diff
    expect(lowState.target_diff_usd).toBeGreaterThan(highState.target_diff_usd)
  })
})
