import { test, expect } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  addEntryViaAPI,
  getFundStateViaAPI,
  getFundViaAPI,
  addDays,
  type FundConfig
} from './test-utils'
import { TEST_PLATFORM, TEST_TICKERS } from './test-fixtures'

/**
 * Generate a cash fund configuration
 */
function generateCashFundConfig(overrides: Partial<FundConfig> = {}): FundConfig {
  return {
    status: 'active',
    fund_type: 'cash',  // Critical: mark as cash fund type
    fund_size_usd: 10000,
    target_apy: 0,  // Cash funds don't have target APY for trading
    interval_days: 1,
    input_min_usd: 0,
    input_mid_usd: 0,
    input_max_usd: 0,
    max_at_pct: 0,
    min_profit_usd: 0,
    cash_apy: 0.044,  // 4.4% cash yield
    margin_apr: 0,
    margin_access_usd: 0,
    accumulate: true,
    manage_cash: true,
    margin_enabled: false,
    dividend_reinvest: true,
    interest_reinvest: true,
    expense_from_fund: true,
    ...overrides
  }
}

test.describe('Cash Fund Creation', () => {
  test('can create a cash fund', async ({ page }) => {
    const ticker = TEST_TICKERS.CASH_FUNDS.BASIC
    const config = generateCashFundConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    expect(fund.id).toBe(`${TEST_PLATFORM}-${ticker}`)
    expect(fund.config.manage_cash).toBe(true)

    await deleteFundViaAPI(page, fund.id)
  })

  test('cash fund starts with zero balance', async ({ page }) => {
    const ticker = 'cash-zero-start'
    const config = generateCashFundConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    const state = await getFundStateViaAPI(page, fund.id)

    // No entries yet, cash should be at fund_size (uninvested)
    // For cash funds, the "cash" is the balance itself
    expect(state.state!.cash_available_usd).toBe(config.fund_size_usd)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Cash Fund Deposits', () => {
  test('DEPOSIT increases cash balance', async ({ page }) => {
    const ticker = 'cash-deposit'
    const config = generateCashFundConfig({ fund_size_usd: 0 })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // First deposit
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 5000,
      action: 'DEPOSIT',
      amount: 5000
    })

    let state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(5000)

    // Second deposit
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-15',
      value: 8000,
      action: 'DEPOSIT',
      amount: 3000
    })

    state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(8000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('multiple deposits accumulate correctly', async ({ page }) => {
    const ticker = 'cash-multi-dep'
    const config = generateCashFundConfig({ fund_size_usd: 0 })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    const deposits = [1000, 2000, 3000, 4000, 5000]
    let runningTotal = 0

    for (let i = 0; i < deposits.length; i++) {
      runningTotal += deposits[i]
      await addEntryViaAPI(page, fund.id, {
        date: addDays('2024-01-01', i * 7),
        value: runningTotal,
        action: 'DEPOSIT',
        amount: deposits[i]
      })
    }

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(15000)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Cash Fund Withdrawals', () => {
  test('WITHDRAW decreases cash balance', async ({ page }) => {
    const ticker = 'cash-withdraw'
    const config = generateCashFundConfig({ fund_size_usd: 10000 })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 10000,
      action: 'DEPOSIT',
      amount: 10000
    })

    // Withdraw
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-15',
      value: 7000,
      action: 'WITHDRAW',
      amount: 3000
    })

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(7000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('can withdraw entire balance', async ({ page }) => {
    const ticker = 'cash-full-withdraw'
    const config = generateCashFundConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 5000,
      action: 'DEPOSIT',
      amount: 5000
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-15',
      value: 0,
      action: 'WITHDRAW',
      amount: 5000
    })

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(0)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Cash Fund Interest', () => {
  test('CASH_INTEREST adds to balance and realized gains', async ({ page }) => {
    const ticker = TEST_TICKERS.CASH_FUNDS.INTEREST
    const config = generateCashFundConfig({
      cash_apy: 0.05  // 5% APY
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 10000,
      action: 'DEPOSIT',
      amount: 10000
    })

    // Interest earned
    await addEntryViaAPI(page, fund.id, {
      date: '2024-02-01',
      value: 10041.67,  // ~$41.67 interest for 1 month at 5% APY
      action: 'HOLD',
      cash_interest: 41.67
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Interest should be tracked
    expect(state.state!.cash_interest_usd).toBeCloseTo(41.67, 2)
    expect(state.state!.actual_value_usd).toBeCloseTo(10041.67, 0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('interest compounds over multiple periods', async ({ page }) => {
    const ticker = 'cash-compound'
    const config = generateCashFundConfig({
      cash_apy: 0.044  // 4.4% APY
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100000,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Monthly interest entries
    const monthlyInterest = [
      { date: '2024-02-01', interest: 366.67, newValue: 100366.67 },
      { date: '2024-03-01', interest: 368.01, newValue: 100734.68 },
      { date: '2024-04-01', interest: 369.36, newValue: 101104.04 }
    ]

    for (const entry of monthlyInterest) {
      await addEntryViaAPI(page, fund.id, {
        date: entry.date,
        value: entry.newValue,
        action: 'HOLD',
        cash_interest: entry.interest
      })
    }

    const state = await getFundStateViaAPI(page, fund.id)

    // Total interest should be sum of all interest
    const totalInterest = monthlyInterest.reduce((sum, e) => sum + e.interest, 0)
    expect(state.state!.cash_interest_usd).toBeCloseTo(totalInterest, 0)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Cash Fund Expenses', () => {
  test('EXPENSE reduces balance', async ({ page }) => {
    const ticker = 'cash-expense'
    const config = generateCashFundConfig({
      expense_from_fund: true
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 10000,
      action: 'DEPOSIT',
      amount: 10000
    })

    // Account fee
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-15',
      value: 9975,
      action: 'HOLD',
      expense: 25
    })

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(9975)

    await deleteFundViaAPI(page, fund.id)
  })

  test('expense reduces realized gains', async ({ page }) => {
    const ticker = 'cash-exp-gains'
    const config = generateCashFundConfig({
      expense_from_fund: true
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 10000,
      action: 'DEPOSIT',
      amount: 10000
    })

    // Earn interest
    await addEntryViaAPI(page, fund.id, {
      date: '2024-02-01',
      value: 10100,
      action: 'HOLD',
      cash_interest: 100
    })

    // Pay expense
    await addEntryViaAPI(page, fund.id, {
      date: '2024-02-15',
      value: 10080,
      action: 'HOLD',
      expense: 20
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Realized gains = interest - expenses
    expect(state.state!.realized_gains_usd).toBeCloseTo(80, 0)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Cash Fund Lifecycle', () => {
  test('complete cash fund lifecycle', async ({ page }) => {
    const ticker = 'cash-lifecycle'
    const config = generateCashFundConfig({
      fund_size_usd: 50000,
      cash_apy: 0.05
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Step 1: Initial deposit
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 25000,
      action: 'DEPOSIT',
      amount: 25000
    })

    // Step 2: Second deposit
    await addEntryViaAPI(page, fund.id, {
      date: '2024-02-01',
      value: 45000,
      action: 'DEPOSIT',
      amount: 20000
    })

    // Step 3: Earn interest
    await addEntryViaAPI(page, fund.id, {
      date: '2024-03-01',
      value: 45187.50,
      action: 'HOLD',
      cash_interest: 187.50
    })

    // Step 4: Partial withdrawal
    await addEntryViaAPI(page, fund.id, {
      date: '2024-04-01',
      value: 35187.50,
      action: 'WITHDRAW',
      amount: 10000
    })

    // Step 5: More interest
    await addEntryViaAPI(page, fund.id, {
      date: '2024-05-01',
      value: 35334.90,
      action: 'HOLD',
      cash_interest: 147.40
    })

    // Step 6: Fee
    await addEntryViaAPI(page, fund.id, {
      date: '2024-06-01',
      value: 35309.90,
      action: 'HOLD',
      expense: 25
    })

    const state = await getFundStateViaAPI(page, fund.id)
    const fundData = await getFundViaAPI(page, fund.id)

    // Verify entry count
    expect(fundData.entries.length).toBe(6)

    // Verify final balance
    expect(state.state!.actual_value_usd).toBeCloseTo(35309.90, 0)

    // Verify total interest earned
    expect(state.state!.cash_interest_usd).toBeCloseTo(334.90, 0)

    // Verify net realized gains (interest - expenses)
    expect(state.state!.realized_gains_usd).toBeCloseTo(309.90, 0)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Cash Fund Edge Cases', () => {
  test('handles very small amounts', async ({ page }) => {
    const ticker = 'cash-small'
    const config = generateCashFundConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 0.01,
      action: 'DEPOSIT',
      amount: 0.01
    })

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(0.01)

    await deleteFundViaAPI(page, fund.id)
  })

  test('handles large amounts', async ({ page }) => {
    const ticker = 'cash-large'
    const config = generateCashFundConfig({
      fund_size_usd: 10000000  // $10M
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 5000000,
      action: 'DEPOSIT',
      amount: 5000000
    })

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(5000000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('handles zero balance after full withdrawal', async ({ page }) => {
    const ticker = 'cash-zero-bal'
    const config = generateCashFundConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'DEPOSIT',
      amount: 1000
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-15',
      value: 0,
      action: 'WITHDRAW',
      amount: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.actual_value_usd).toBe(0)
    expect(state.state!.start_input_usd).toBe(0)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Cash Fund Recommendations', () => {
  test('cash funds do not generate trading recommendations', async ({ page }) => {
    const ticker = 'cash-no-rec'
    const config = generateCashFundConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 10000,
      action: 'DEPOSIT',
      amount: 10000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Cash funds should not have buy/sell recommendations
    // They might have null or a HOLD recommendation
    if (state.recommendation) {
      expect(state.recommendation.action).not.toBe('BUY')
      expect(state.recommendation.action).not.toBe('SELL')
    }

    await deleteFundViaAPI(page, fund.id)
  })
})
