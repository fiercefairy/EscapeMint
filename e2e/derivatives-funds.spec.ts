import { test, expect } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  addEntryViaAPI,
  getFundStateViaAPI,
  getFundViaAPI,
  generateTestConfig,
  addDays,
  type FundConfig,
  type FundEntry
} from './test-utils'
import { TEST_PLATFORM, TEST_TICKERS } from './test-fixtures'

// Derivatives-specific entry type with extra fields
interface DerivativesEntry extends FundEntry {
  contracts?: number
  fee?: number
  margin?: number
}

// Contract multiplier for BTC perpetuals (0.01 BTC per contract)
const CONTRACT_MULTIPLIER = 0.01

// Use dates in the future to ensure test data remains valid
const TEST_START_DATE = '2027-01-01'

/**
 * Generate a derivatives fund configuration
 */
function generateDerivativesConfig(overrides: Partial<FundConfig> = {}): FundConfig {
  return generateTestConfig({
    fund_size_usd: 100000,  // $100k margin deposit
    target_apy: 0.30,
    margin_enabled: true,
    manage_cash: true,  // Track margin balance
    accumulate: false,  // Full liquidation mode
    start_date: TEST_START_DATE,
    ...overrides
  })
}

/**
 * Helper to add a derivatives entry with proper fields
 */
async function addDerivativesEntry(
  page: import('@playwright/test').Page,
  fundId: string,
  entry: DerivativesEntry
) {
  return addEntryViaAPI(page, fundId, entry as FundEntry)
}

test.describe('Derivatives Fund Creation', () => {
  test('can create a BTC perpetual futures fund', async ({ page }) => {
    const ticker = TEST_TICKERS.DERIVATIVES.BTC_PERP
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    expect(fund.id).toBe(`${TEST_PLATFORM}-${ticker}`)
    expect(fund.platform).toBe(TEST_PLATFORM)
    expect(fund.ticker).toBe(ticker)
    expect(fund.config.margin_enabled).toBe(true)
    expect(fund.config.manage_cash).toBe(true)
    expect(fund.config.fund_size_usd).toBe(100000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('can create an ETH perpetual futures fund', async ({ page }) => {
    const ticker = TEST_TICKERS.DERIVATIVES.ETH_PERP
    const config = generateDerivativesConfig({
      fund_size_usd: 50000
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    expect(fund.id).toBe(`${TEST_PLATFORM}-${ticker}`)
    expect(fund.config.fund_size_usd).toBe(50000)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Derivatives Entry Types', () => {
  test('DEPOSIT adds to margin balance', async ({ page }) => {
    const ticker = 'deriv-deposit-test'
    const config = generateDerivativesConfig({
      fund_size_usd: 50000
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 50000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Cash available should equal the deposit
    expect(state.state!.cash_available_usd).toBe(50000)

    // Add another deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-15',
      value: 0,
      action: 'DEPOSIT',
      amount: 25000
    })

    const state2 = await getFundStateViaAPI(page, fund.id)
    expect(state2.state!.cash_available_usd).toBe(75000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('WITHDRAW reduces margin balance', async ({ page }) => {
    const ticker = 'deriv-withdraw-test'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Withdraw some margin
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-15',
      value: 0,
      action: 'WITHDRAW',
      amount: 30000
    })

    const state = await getFundStateViaAPI(page, fund.id)
    expect(state.state!.cash_available_usd).toBe(70000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('FUNDING payment affects margin balance and realized gains', async ({ page }) => {
    const ticker = 'deriv-funding-test'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Positive funding received (shorts pay longs)
    // Funding payments are recorded as HOLD entries with dividend field for income
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 0,
      action: 'HOLD',
      amount: 0,
      dividend: 50  // Funding income stored in dividend field
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Funding should be added to realized gains
    expect(state.state!.realized_gains_usd).toBe(50)

    // Negative funding paid (longs pay shorts)
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-03',
      value: 0,
      action: 'HOLD',
      amount: 0,
      expense: 30  // Use expense field for negative funding
    })

    const state2 = await getFundStateViaAPI(page, fund.id)
    expect(state2.state!.realized_gains_usd).toBe(20)  // 50 - 30

    await deleteFundViaAPI(page, fund.id)
  })

  test('INTEREST (USDC interest) adds to realized gains', async ({ page }) => {
    const ticker = 'deriv-interest-test'
    const config = generateDerivativesConfig({
      interest_reinvest: true
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Interest earned on USDC balance
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-08',
      value: 0,
      action: 'HOLD',
      amount: 0,
      cash_interest: 87.76
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Interest should be in cash_interest_usd
    expect(state.state!.cash_interest_usd).toBeCloseTo(87.76, 2)

    await deleteFundViaAPI(page, fund.id)
  })

  test('FEE reduces margin balance', async ({ page }) => {
    const ticker = 'deriv-fee-test'
    const config = generateDerivativesConfig({
      expense_from_fund: true
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Trading fee
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 0,
      action: 'HOLD',
      amount: 0,
      expense: 8.30
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Fee reduces available cash (since expense_from_fund is true)
    expect(state.state!.cash_available_usd).toBeLessThan(100000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('REBATE adds to margin balance', async ({ page }) => {
    const ticker = 'deriv-rebate-test'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Rebate from exchange (modeled as negative expense or dividend)
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 0,
      action: 'HOLD',
      amount: 0,
      dividend: 5.25  // Rebate treated as income
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Rebate should add to realized gains
    expect(state.state!.realized_gains_usd).toBe(5.25)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Position Tracking', () => {
  test('BUY creates a long position and tracks margin', async ({ page }) => {
    const ticker = 'deriv-buy-test'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Buy 10 contracts at $105,825 BTC price
    // Contract value = 10 * 0.01 * 105825 = $10,582.50
    const btcPrice = 105825
    const contractCount = 10
    const contractValue = contractCount * CONTRACT_MULTIPLIER * btcPrice

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: contractValue,  // Position value
      action: 'BUY',
      amount: contractValue,
      contracts: contractCount,
      price: btcPrice * CONTRACT_MULTIPLIER  // Price per contract
    })

    const fundData = await getFundViaAPI(page, fund.id)

    // Verify entry was recorded
    expect(fundData.entries.length).toBe(2)
    const buyEntry = fundData.entries[1]
    expect(buyEntry?.action).toBe('BUY')
    expect(buyEntry?.amount).toBeCloseTo(contractValue, 2)

    await deleteFundViaAPI(page, fund.id)
  })

  test('SELL closes position and calculates realized P&L', async ({ page }) => {
    const ticker = 'deriv-sell-test'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Buy 10 contracts at $100,000 BTC price
    const buyPrice = 100000
    const contractCount = 10
    const buyValue = contractCount * CONTRACT_MULTIPLIER * buyPrice  // $10,000

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: buyValue,
      action: 'BUY',
      amount: buyValue,
      contracts: contractCount,
      price: buyPrice * CONTRACT_MULTIPLIER
    })

    // Sell at higher price - $105,000 BTC price
    const sellPrice = 105000
    const sellValue = contractCount * CONTRACT_MULTIPLIER * sellPrice  // $10,500

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-10',
      value: 0,  // Position closed
      action: 'SELL',
      amount: sellValue,
      contracts: contractCount,
      price: sellPrice * CONTRACT_MULTIPLIER
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Realized P&L = $10,500 - $10,000 = $500
    // This should be reflected in realized gains
    expect(state.state!.realized_gains_usd).toBeCloseTo(500, 0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('partial position close uses FIFO cost basis', async ({ page }) => {
    const ticker = 'deriv-fifo-test'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // First buy: 5 contracts at $100,000
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 5000,  // 5 * 0.01 * 100000
      action: 'BUY',
      amount: 5000,
      contracts: 5,
      price: 1000  // 100000 * 0.01
    })

    // Second buy: 5 contracts at $110,000
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-05',
      value: 10500,  // Total position value at current price
      action: 'BUY',
      amount: 5500,  // 5 * 0.01 * 110000
      contracts: 5,
      price: 1100  // 110000 * 0.01
    })

    // Sell 5 contracts at $115,000 (should use FIFO - close first lot at $100k)
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-10',
      value: 5750,  // Remaining 5 contracts
      action: 'SELL',
      amount: 5750,  // 5 * 0.01 * 115000
      contracts: 5,
      price: 1150  // 115000 * 0.01
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // FIFO P&L: sold first lot (bought at $5000) for $5750 = $750 profit
    expect(state.state!.realized_gains_usd).toBeCloseTo(750, 0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('multiple buys accumulate contracts correctly', async ({ page }) => {
    const ticker = 'deriv-accum-test'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // First buy: 10 contracts
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 10000,
      action: 'BUY',
      amount: 10000,
      contracts: 10,
      price: 1000
    })

    // Second buy: 20 contracts
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-05',
      value: 30000,  // 30 contracts total
      action: 'BUY',
      amount: 20000,
      contracts: 20,
      price: 1000
    })

    // Third buy: 5 contracts
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-08',
      value: 35000,  // 35 contracts total
      action: 'BUY',
      amount: 5000,
      contracts: 5,
      price: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Total invested = 35000
    expect(state.state!.start_input_usd).toBe(35000)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Margin Calculations', () => {
  test('tracks margin usage after trades', async ({ page }) => {
    const ticker = 'deriv-margin-track'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Buy position worth $20,000
    // With 20% initial margin, this locks $4,000
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 20000,
      action: 'BUY',
      amount: 20000,
      contracts: 20,
      price: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // start_input should track the invested amount
    expect(state.state!.start_input_usd).toBe(20000)

    // Available cash should be reduced by the position cost
    // fund_size - invested = 100000 - 20000 = 80000
    expect(state.state!.cash_available_usd).toBeCloseTo(80000, 0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('cash constraint prevents over-leveraging', async ({ page }) => {
    const ticker = 'deriv-cash-constraint'
    const config = generateDerivativesConfig({
      fund_size_usd: 10000  // Small fund
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 10000
    })

    // Buy position worth $8,000
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 8000,
      action: 'BUY',
      amount: 8000,
      contracts: 8,
      price: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Only $2000 remaining
    expect(state.state!.cash_available_usd).toBeCloseTo(2000, 0)

    // Recommendation should account for limited cash
    // Cannot recommend buying more than available cash
    if (state.recommendation) {
      expect(state.recommendation.amount).toBeLessThanOrEqual(2000)
    }

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('P&L Calculations', () => {
  test('unrealized P&L calculated from current value vs cost basis', async ({ page }) => {
    const ticker = 'deriv-unrealized-pnl'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Buy position at $100k
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 10000,
      action: 'BUY',
      amount: 10000,
      contracts: 10,
      price: 1000
    })

    // Price increases - mark position at $110k (10% gain)
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-10',
      value: 11000,  // Current position value
      action: 'HOLD',
      amount: 0
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Unrealized gain = 11000 - 10000 = 1000
    expect(state.state!.gain_usd).toBeCloseTo(1000, 0)
    expect(state.state!.actual_value_usd).toBeCloseTo(11000, 0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('realized P&L accumulated from closed trades', async ({ page }) => {
    const ticker = 'deriv-realized-pnl'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Trade 1: Buy at $1000, Sell at $1100 (10% gain)
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 10000,
      action: 'BUY',
      amount: 10000,
      contracts: 10,
      price: 1000
    })

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-05',
      value: 0,
      action: 'SELL',
      amount: 11000,
      contracts: 10,
      price: 1100
    })

    // Trade 2: Buy at $1050, Sell at $1000 (loss)
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-10',
      value: 10500,
      action: 'BUY',
      amount: 10500,
      contracts: 10,
      price: 1050
    })

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-15',
      value: 0,
      action: 'SELL',
      amount: 10000,
      contracts: 10,
      price: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Total realized = $1000 (trade 1) - $500 (trade 2) = $500
    expect(state.state!.realized_gains_usd).toBeCloseTo(500, 0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('funding payments affect realized P&L', async ({ page }) => {
    const ticker = 'deriv-funding-pnl'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Accumulate funding over several days
    // Day 1: Receive $10 funding
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 0,
      action: 'HOLD',
      dividend: 10
    })

    // Day 2: Receive $15 funding
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-03',
      value: 0,
      action: 'HOLD',
      dividend: 15
    })

    // Day 3: Pay $5 funding
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-04',
      value: 0,
      action: 'HOLD',
      expense: 5
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Net funding = $10 + $15 - $5 = $20
    expect(state.state!.realized_gains_usd).toBeCloseTo(20, 0)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Full Derivatives Lifecycle', () => {
  test('complete trading lifecycle with deposits, trades, funding, and withdrawal', async ({ page }) => {
    const ticker = 'deriv-lifecycle'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Step 1: Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Step 2: Open position
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 20000,
      action: 'BUY',
      amount: 20000,
      contracts: 20,
      price: 1000
    })

    // Step 3: Receive funding
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-03',
      value: 20000,
      action: 'HOLD',
      dividend: 50
    })

    // Step 4: Receive interest
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-04',
      value: 20100,
      action: 'HOLD',
      cash_interest: 87.76
    })

    // Step 5: Add to position
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-05',
      value: 30000,
      action: 'BUY',
      amount: 10000,
      contracts: 10,
      price: 1000
    })

    // Step 6: Pay trading fee
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-05',
      value: 30000,
      action: 'HOLD',
      expense: 8.30
    })

    // Step 7: Partial close at profit
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-10',
      value: 16500,  // 15 contracts remaining at higher price
      action: 'SELL',
      amount: 16500,  // 15 contracts at $1100
      contracts: 15,
      price: 1100
    })

    // Step 8: More funding
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-15',
      value: 16500,
      action: 'HOLD',
      dividend: 25
    })

    // Step 9: Close remaining position
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-20',
      value: 0,
      action: 'SELL',
      amount: 16500,  // 15 contracts at $1100
      contracts: 15,
      price: 1100
    })

    // Step 10: Withdraw profits
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-25',
      value: 0,
      action: 'WITHDRAW',
      amount: 10000
    })

    const state = await getFundStateViaAPI(page, fund.id)
    const fundData = await getFundViaAPI(page, fund.id)

    // Verify entry count
    expect(fundData.entries.length).toBe(10)

    // Position should be closed (no invested)
    expect(state.state!.start_input_usd).toBe(0)

    // Should have realized gains from:
    // - Funding: $50 + $25 = $75
    // - Interest: $87.76
    // - Trading P&L from selling at $1100 what was bought at $1000
    // - Minus fees: $8.30
    expect(state.state!.realized_gains_usd).toBeGreaterThan(0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('volatile market scenario with multiple position adjustments', async ({ page }) => {
    const ticker = 'deriv-volatile'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
    let date = '2027-01-01'

    // Initial deposit
    await addDerivativesEntry(page, fund.id, {
      date,
      value: 0,
      action: 'DEPOSIT',
      amount: 100000
    })

    // Simulate volatile week with multiple trades
    const trades = [
      { day: 1, action: 'BUY', contracts: 10, price: 1000 },
      { day: 2, action: 'BUY', contracts: 5, price: 980 },   // Price dips, add
      { day: 3, action: 'BUY', contracts: 10, price: 950 },  // More dip, add more
      { day: 4, action: 'SELL', contracts: 10, price: 1020 }, // Bounce, take profit
      { day: 5, action: 'BUY', contracts: 5, price: 990 },   // Dip again
      { day: 6, action: 'SELL', contracts: 20, price: 1050 }, // Rally, close all
    ]

    let totalPosition = 0

    for (const trade of trades) {
      date = addDays('2027-01-01', trade.day)
      const tradeValue = trade.contracts * trade.price

      if (trade.action === 'BUY') {
        totalPosition += trade.contracts
      } else {
        totalPosition -= trade.contracts
      }

      await addDerivativesEntry(page, fund.id, {
        date,
        value: totalPosition * 1000,  // Approximate position value
        action: trade.action as 'BUY' | 'SELL',
        amount: tradeValue,
        contracts: trade.contracts,
        price: trade.price
      })
    }

    const state = await getFundStateViaAPI(page, fund.id)

    // Position should be closed
    expect(state.state!.start_input_usd).toBe(0)

    // Should have net profit from volatile trading
    // (exact amount depends on FIFO matching)
    expect(state.state!.realized_gains_usd).toBeGreaterThan(0)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Edge Cases', () => {
  test('handles zero position correctly after full liquidation', async ({ page }) => {
    const ticker = 'deriv-zero-pos'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Deposit and trade
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 50000
    })

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 10000,
      action: 'BUY',
      amount: 10000,
      contracts: 10,
      price: 1000
    })

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-05',
      value: 0,
      action: 'SELL',
      amount: 10000,
      contracts: 10,
      price: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    // Position should be zero
    expect(state.state!.start_input_usd).toBe(0)
    expect(state.state!.actual_value_usd).toBe(0)

    await deleteFundViaAPI(page, fund.id)
  })

  test('handles very small contract amounts', async ({ page }) => {
    const ticker = 'deriv-small-amt'
    const config = generateDerivativesConfig()

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 1000
    })

    // Buy just 1 contract (worth about $1000 at 100k BTC)
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 1000,
      action: 'BUY',
      amount: 1000,
      contracts: 1,
      price: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    expect(state.state!.start_input_usd).toBe(1000)

    await deleteFundViaAPI(page, fund.id)
  })

  test('handles large positions', async ({ page }) => {
    const ticker = 'deriv-large-pos'
    const config = generateDerivativesConfig({
      fund_size_usd: 1000000  // $1M fund
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-01',
      value: 0,
      action: 'DEPOSIT',
      amount: 1000000
    })

    // Large position: 500 contracts = 5 BTC = ~$500k position
    await addDerivativesEntry(page, fund.id, {
      date: '2027-01-02',
      value: 500000,
      action: 'BUY',
      amount: 500000,
      contracts: 500,
      price: 1000
    })

    const state = await getFundStateViaAPI(page, fund.id)

    expect(state.state!.start_input_usd).toBe(500000)
    expect(state.state!.cash_available_usd).toBeCloseTo(500000, 0)

    await deleteFundViaAPI(page, fund.id)
  })
})
