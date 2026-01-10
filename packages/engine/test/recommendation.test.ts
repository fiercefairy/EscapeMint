import { describe, it, expect } from 'vitest'
import { computeRecommendation, computeLimit } from '../src/recommendation.js'
import type { SubFundConfig, FundState } from '../src/types.js'

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

describe('computeLimit', () => {
  it('returns min amount when no investment', () => {
    const state = makeState({ start_input_usd: 0 })
    expect(computeLimit(baseConfig, state)).toBe(100)
  })

  it('returns min amount when making money', () => {
    const state = makeState({ gain_usd: 50, gain_pct: 0.05 })
    expect(computeLimit(baseConfig, state)).toBe(100)
  })

  it('returns mid amount when losing money but not significant', () => {
    const state = makeState({ gain_usd: -50, gain_pct: -0.05 })
    expect(computeLimit(baseConfig, state)).toBe(200)
  })

  it('returns max amount when losing significantly', () => {
    const state = makeState({ gain_usd: -300, gain_pct: -0.30 })
    expect(computeLimit(baseConfig, state)).toBe(300)
  })
})

describe('computeRecommendation', () => {
  it('returns null for closed fund', () => {
    const closedConfig = { ...baseConfig, fund_size_usd: 0 }
    const state = makeState()
    const result = computeRecommendation(closedConfig, state)
    expect(result).toBeNull()
  })

  it('recommends initial BUY when no investment', () => {
    const state = makeState({
      start_input_usd: 0,
      actual_value_usd: 0,
      expected_target_usd: 0
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(100)
    expect(result?.insufficient_cash).toBe(false)
  })

  it('flags insufficient cash for initial BUY', () => {
    const state = makeState({
      start_input_usd: 0,
      actual_value_usd: 0,
      expected_target_usd: 0,
      cash_available_usd: 50
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(50)
    expect(result?.insufficient_cash).toBe(true)
  })

  it('recommends BUY when below target', () => {
    const state = makeState({
      expected_target_usd: 1100,
      actual_value_usd: 1000,
      target_diff_usd: -100
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(100)
  })

  it('recommends SELL when above target by min_profit', () => {
    const state = makeState({
      expected_target_usd: 1000,
      actual_value_usd: 1200,
      target_diff_usd: 200
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('SELL')
    expect(result?.amount).toBe(1200) // Full liquidation (accumulate=false)
  })

  it('sells only limit amount in accumulate mode', () => {
    const accumulateConfig = { ...baseConfig, accumulate: true }
    const state = makeState({
      expected_target_usd: 1000,
      actual_value_usd: 1200,
      target_diff_usd: 200
    })
    const result = computeRecommendation(accumulateConfig, state)
    expect(result?.action).toBe('SELL')
    expect(result?.amount).toBe(100) // Only limit amount
  })

  it('uses mid amount when below cost basis', () => {
    const state = makeState({
      gain_usd: -50,
      gain_pct: -0.05,
      target_diff_usd: -50
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(200)
  })

  it('uses max amount when significantly below cost basis', () => {
    const state = makeState({
      gain_usd: -300,
      gain_pct: -0.30,
      target_diff_usd: -300
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(300)
  })

  it('limits buy to available cash', () => {
    const state = makeState({
      gain_usd: -300,
      gain_pct: -0.30,
      target_diff_usd: -300,
      cash_available_usd: 150
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(150)
    expect(result?.insufficient_cash).toBe(true)
  })

  it('recommends BUY when cash + margin available (M1 scenario)', () => {
    // For M1 funds, server adds margin_available to cash_available before calling this
    // Test verifies that when combined cash is sufficient, recommendation is correct
    const state = makeState({
      gain_usd: -200,
      gain_pct: -0.20,
      target_diff_usd: -200,
      cash_available_usd: 250  // e.g., -50 cash + 300 margin = 250 effective cash
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('BUY')
    expect(result?.amount).toBe(200)  // Mid amount for moderate loss
    expect(result?.insufficient_cash).toBe(false)
  })

  it('recommends HOLD when cash + margin still insufficient', () => {
    const state = makeState({
      gain_usd: -300,
      gain_pct: -0.30,
      target_diff_usd: -300,
      cash_available_usd: 0  // e.g., -500 cash + 500 margin = 0
    })
    const result = computeRecommendation(baseConfig, state)
    expect(result?.action).toBe('HOLD')
    expect(result?.amount).toBe(0)
    expect(result?.insufficient_cash).toBe(true)
  })
})
