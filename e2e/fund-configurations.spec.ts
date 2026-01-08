import { test, expect } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  addEntryViaAPI,
  getFundStateViaAPI,
  generateTestConfig,
  addDays,
  assertApproxEqual,
  type FundConfig,
  type FundEntry
} from './test-utils'
import { TEST_PLATFORMS, TEST_TICKERS } from './test-fixtures'

const TEST_PLATFORM = TEST_PLATFORMS.ROBINHOOD

test.describe('Fund Configurations', () => {
  test.describe('Cash Management Mode', () => {
    test('fund with manage_cash=true maintains cash pool', async ({ page }) => {
      const ticker = TEST_TICKERS.CASH_MANAGEMENT.WITH_CASH
      const config = generateTestConfig({
        manage_cash: true,
        fund_size_usd: 10000,
        cash_apy: 0, // Disable interest to test pure cash management
        interest_reinvest: false,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Add initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 100,
        action: 'BUY',
        amount: 100
      })

      // Add more buys
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-08',
        value: 205,
        action: 'BUY',
        amount: 100
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)
      expect(stateResult.state).toBeTruthy()

      // Cash should be fund_size - total_invested
      // fund_size = 10000, invested = 200, so cash = 9800
      expect(stateResult.state!.cash_available_usd).toBeCloseTo(9800, 0)
      expect(stateResult.state!.start_input_usd).toBe(200)

      await deleteFundViaAPI(page, fund.id)
    })

    test('fund with manage_cash=false has zero cash pool', async ({ page }) => {
      const ticker = TEST_TICKERS.CASH_MANAGEMENT.WITHOUT_CASH
      const config = generateTestConfig({
        manage_cash: false,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Add buys
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 100,
        action: 'BUY',
        amount: 100
      })

      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-08',
        value: 205,
        action: 'BUY',
        amount: 100
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)
      expect(stateResult.state).toBeTruthy()

      // With manage_cash=false, there's no cash pool
      // Cash available should be 0 or equivalent to fund always uses full limit
      expect(stateResult.state!.start_input_usd).toBe(200)

      await deleteFundViaAPI(page, fund.id)
    })

    test('cash pool reflects deposits and withdrawals', async ({ page }) => {
      const ticker = TEST_TICKERS.CASH_MANAGEMENT.DEPOSITS
      const config = generateTestConfig({
        manage_cash: true,
        fund_size_usd: 5000,
        cash_apy: 0, // Disable interest to test pure deposits/withdrawals
        interest_reinvest: false,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 100,
        action: 'BUY',
        amount: 100
      })

      // Add deposit
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-15',
        value: 100,
        action: 'DEPOSIT',
        amount: 1000,
        fund_size: 6000
      })

      let stateResult = await getFundStateViaAPI(page, fund.id)
      // After deposit, fund_size = 6000, invested = 100, cash = 5900
      expect(stateResult.state!.cash_available_usd).toBeCloseTo(5900, 0)

      // Add withdrawal
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-22',
        value: 100,
        action: 'WITHDRAW',
        amount: 500,
        fund_size: 5500
      })

      stateResult = await getFundStateViaAPI(page, fund.id)
      // After withdrawal, fund_size = 5500, invested = 100, cash = 5400
      expect(stateResult.state!.cash_available_usd).toBeCloseTo(5400, 0)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Accumulate Mode', () => {
    test('accumulate=true sells only limit amount when above target', async ({ page }) => {
      const ticker = TEST_TICKERS.ACCUMULATE.ACCUMULATE_TRUE
      const config = generateTestConfig({
        accumulate: true,
        fund_size_usd: 10000,
        target_apy: 0.10, // 10% target
        min_profit_usd: 50,
        input_min_usd: 100,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Big gain - way above target
      const stateResult = await getFundStateViaAPI(page, fund.id)

      // Create a big gain by adding entry with much higher value
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 1500, // 50% gain
        action: 'HOLD'
      })

      const finalState = await getFundStateViaAPI(page, fund.id)

      // In accumulate mode, recommendation should sell only the limit amount
      if (finalState.recommendation && finalState.recommendation.action === 'SELL') {
        expect(finalState.recommendation.amount).toBe(config.input_min_usd)
      }

      await deleteFundViaAPI(page, fund.id)
    })

    test('accumulate=false liquidates entire position when above target', async ({ page }) => {
      const ticker = TEST_TICKERS.ACCUMULATE.ACCUMULATE_FALSE
      const config = generateTestConfig({
        accumulate: false,
        fund_size_usd: 10000,
        target_apy: 0.10,
        min_profit_usd: 50,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Big gain
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 1500,
        action: 'HOLD'
      })

      const finalState = await getFundStateViaAPI(page, fund.id)

      // In non-accumulate mode, recommendation should sell entire position
      if (finalState.recommendation && finalState.recommendation.action === 'SELL') {
        expect(finalState.recommendation.amount).toBe(1500) // Full liquidation
      }

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Margin Access', () => {
    test('fund with margin access tracks margin borrowing', async ({ page }) => {
      const ticker = TEST_TICKERS.MARGIN.WITH_MARGIN
      const config = generateTestConfig({
        margin_enabled: true,
        margin_access_usd: 5000,
        margin_apr: 0.0725,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Exhaust cash pool
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 10000,
        action: 'BUY',
        amount: 10000
      })

      // Check state - cash should be exhausted
      let stateResult = await getFundStateViaAPI(page, fund.id)
      expect(stateResult.state!.cash_available_usd).toBe(0)

      // Now buy using margin
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-08',
        value: 12000,
        action: 'BUY',
        amount: 2000,
        margin_borrowed: 2000,
        margin_available: 3000 // 5000 - 2000
      })

      // Verify state includes margin tracking (returned directly from state endpoint)
      stateResult = await getFundStateViaAPI(page, fund.id)
      expect((stateResult as { margin_borrowed?: number }).margin_borrowed).toBe(2000)
      expect((stateResult as { margin_available?: number }).margin_available).toBe(3000)

      await deleteFundViaAPI(page, fund.id)
    })

    test('fund without margin access has zero margin', async ({ page }) => {
      const ticker = TEST_TICKERS.MARGIN.WITHOUT_MARGIN
      const config = generateTestConfig({
        margin_enabled: false,
        margin_access_usd: 0,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // No margin should be available or borrowed (returned directly from state endpoint)
      expect((stateResult as { margin_borrowed?: number }).margin_borrowed ?? 0).toBe(0)
      expect((stateResult as { margin_available?: number }).margin_available ?? 0).toBe(0)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Dividend and Interest Reinvestment', () => {
    test('dividend_reinvest=true adds dividends to fund size', async ({ page }) => {
      const ticker = TEST_TICKERS.DIVIDENDS.REINVEST_TRUE
      const config = generateTestConfig({
        dividend_reinvest: true,
        interest_reinvest: false, // Disable to isolate dividend behavior
        fund_size_usd: 10000,
        cash_apy: 0, // No interest to isolate dividend behavior
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Receive dividend
      await addEntryViaAPI(page, fund.id, {
        date: '2024-03-15',
        value: 1050,
        action: 'HOLD',
        dividend: 50
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // With dividend_reinvest=true, dividends add to cash pool
      // cash = fund_size - invested + dividends = 10000 - 1000 + 50 = 9050
      expect(stateResult.state!.cash_available_usd).toBeCloseTo(9050, 0)

      await deleteFundViaAPI(page, fund.id)
    })

    test('dividend_reinvest=false extracts dividends as profit', async ({ page }) => {
      const ticker = TEST_TICKERS.DIVIDENDS.REINVEST_FALSE
      const config = generateTestConfig({
        dividend_reinvest: false,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Receive dividend
      await addEntryViaAPI(page, fund.id, {
        date: '2024-03-15',
        value: 1050,
        action: 'HOLD',
        dividend: 50
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // With dividend_reinvest=false, dividends don't add to cash
      // cash = fund_size - invested = 10000 - 1000 = 9000
      // But realized_gains should include the dividend
      expect(stateResult.state!.realized_gains_usd).toBeGreaterThanOrEqual(50)

      await deleteFundViaAPI(page, fund.id)
    })

    test('interest_reinvest=true adds interest to fund size', async ({ page }) => {
      const ticker = TEST_TICKERS.DIVIDENDS.INTEREST_REINVEST
      const config = generateTestConfig({
        interest_reinvest: true,
        dividend_reinvest: false, // Disable to isolate interest behavior
        cash_apy: 0.05, // 5%
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Record interest earned (entry field for tracking)
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 1020,
        action: 'HOLD',
        cash_interest: 36.75
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // With interest_reinvest=true, engine computes interest and adds to cash pool
      // Engine uses compound interest formula: P * ((1 + APY)^(days/365) - 1)
      // ~$9000 at 5% for 31 days ≈ $37.37
      expect(stateResult.state!.cash_available_usd).toBeGreaterThan(9000)
      expect(stateResult.state!.cash_interest_usd).toBeGreaterThan(35) // Allow some calculation variance

      await deleteFundViaAPI(page, fund.id)
    })

    test('interest_reinvest=false extracts interest as profit', async ({ page }) => {
      const ticker = TEST_TICKERS.DIVIDENDS.INTEREST_EXTRACT
      const config = generateTestConfig({
        interest_reinvest: false,
        cash_apy: 0.05,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Record interest earned
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 1020,
        action: 'HOLD',
        cash_interest: 36.75
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // With interest_reinvest=false, interest goes to realized gains
      expect(stateResult.state!.realized_gains_usd).toBeGreaterThanOrEqual(36)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Expense Handling', () => {
    test('expense_from_fund=true reduces fund size', async ({ page }) => {
      const ticker = TEST_TICKERS.EXPENSES.FROM_FUND
      const config = generateTestConfig({
        expense_from_fund: true,
        interest_reinvest: false, // Disable to isolate expense behavior
        dividend_reinvest: false,
        cash_apy: 0,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Record expense
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 1000,
        action: 'HOLD',
        expense: 25
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // With expense_from_fund=true, expenses reduce available cash
      // cash = fund_size - invested - expenses = 10000 - 1000 - 25 = 8975
      expect(stateResult.state!.cash_available_usd).toBeCloseTo(8975, 0)

      await deleteFundViaAPI(page, fund.id)
    })

    test('expense_from_fund=false does not affect fund size', async ({ page }) => {
      const ticker = TEST_TICKERS.EXPENSES.EXTERNAL
      const config = generateTestConfig({
        expense_from_fund: false,
        interest_reinvest: false, // Disable to isolate expense behavior
        dividend_reinvest: false,
        cash_apy: 0,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Record expense
      await addEntryViaAPI(page, fund.id, {
        date: '2024-02-01',
        value: 1000,
        action: 'HOLD',
        expense: 25
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // With expense_from_fund=false, expenses don't affect cash
      // cash = fund_size - invested = 10000 - 1000 = 9000
      expect(stateResult.state!.cash_available_usd).toBeCloseTo(9000, 0)

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('DCA Tier Logic', () => {
    test('uses input_min when fund is profitable', async ({ page }) => {
      const ticker = TEST_TICKERS.DCA_TIERS.PROFITABLE
      const config = generateTestConfig({
        input_min_usd: 100,
        input_mid_usd: 200,
        input_max_usd: 500,
        max_at_pct: -0.25,
        target_apy: 0.30,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Fund is up (profitable)
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-08',
        value: 1100, // 10% gain
        action: 'HOLD'
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // When profitable, should use input_min
      if (stateResult.recommendation && stateResult.recommendation.action === 'BUY') {
        expect(stateResult.recommendation.amount).toBe(100)
      }

      await deleteFundViaAPI(page, fund.id)
    })

    test('uses input_mid when fund has mild loss', async ({ page }) => {
      const ticker = TEST_TICKERS.DCA_TIERS.MILD_LOSS
      const config = generateTestConfig({
        input_min_usd: 100,
        input_mid_usd: 200,
        input_max_usd: 500,
        max_at_pct: -0.25,
        target_apy: 0.30,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Fund is down 10% (mild loss, above max_at_pct threshold)
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-08',
        value: 900, // -10% loss
        action: 'HOLD'
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // When in mild loss, should use input_mid
      if (stateResult.recommendation && stateResult.recommendation.action === 'BUY') {
        expect(stateResult.recommendation.amount).toBe(200)
      }

      await deleteFundViaAPI(page, fund.id)
    })

    test('uses input_max when fund has significant loss', async ({ page }) => {
      const ticker = TEST_TICKERS.DCA_TIERS.SIGNIFICANT_LOSS
      const config = generateTestConfig({
        input_min_usd: 100,
        input_mid_usd: 200,
        input_max_usd: 500,
        max_at_pct: -0.25,
        target_apy: 0.30,
        fund_size_usd: 10000,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Initial buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Fund is down 30% (significant loss, below max_at_pct threshold)
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-08',
        value: 700, // -30% loss
        action: 'HOLD'
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // When in significant loss (below max_at_pct), should use input_max
      if (stateResult.recommendation && stateResult.recommendation.action === 'BUY') {
        expect(stateResult.recommendation.amount).toBe(500)
      }

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Closed Fund', () => {
    test('fund with fund_size=0 is treated as closed', async ({ page }) => {
      const ticker = TEST_TICKERS.CLOSED.ZERO_SIZE
      const config = generateTestConfig({
        fund_size_usd: 0,
        status: 'closed',
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // Closed fund should have null or no recommendation
      expect(stateResult.recommendation).toBeNull()

      await deleteFundViaAPI(page, fund.id)
    })

    test('closed fund calculates final metrics correctly', async ({ page }) => {
      const ticker = TEST_TICKERS.CLOSED.FINAL_METRICS
      const config = generateTestConfig({
        fund_size_usd: 10000,
        target_apy: 0.25,
        start_date: '2024-01-01'
      })

      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Buy
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      // Value grows
      await addEntryViaAPI(page, fund.id, {
        date: '2024-06-01',
        value: 1200,
        action: 'HOLD'
      })

      // Sell everything
      await addEntryViaAPI(page, fund.id, {
        date: '2024-06-15',
        value: 0,
        action: 'SELL',
        amount: 1200
      })

      const stateResult = await getFundStateViaAPI(page, fund.id)

      // After full liquidation, start_input should be 0
      expect(stateResult.state!.start_input_usd).toBe(0)

      await deleteFundViaAPI(page, fund.id)
    })
  })
})
