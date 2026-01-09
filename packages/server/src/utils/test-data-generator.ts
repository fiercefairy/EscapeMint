/**
 * Test Data Generator
 *
 * Generates simulated fund data using historical price data and a DCA strategy.
 * Creates test funds with realistic transaction history for testing/demo purposes.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FundData, FundEntry } from '@escapemint/storage'
import type { SubFundConfig, Trade, Dividend } from '@escapemint/engine'
import { computeFundState, computeRecommendation } from '@escapemint/engine'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Price data directory (bundled with the app)
const PRICE_DATA_DIR = join(__dirname, '../data')

// Historical dividend data for SPXL (ex-dividend dates and amounts per share)
const SPXL_DIVIDENDS: DividendPayment[] = [
  { exDate: '2021-06-22', amount: 0.04113 },
  { exDate: '2021-12-21', amount: 0.11481 },
  { exDate: '2022-06-22', amount: 0.07763 },
  { exDate: '2022-12-20', amount: 0.12356 },
  { exDate: '2023-03-21', amount: 0.26189 },
  { exDate: '2023-06-21', amount: 0.25846 },
  { exDate: '2023-09-19', amount: 0.19445 },
  { exDate: '2023-12-21', amount: 0.30383 },
  { exDate: '2024-03-19', amount: 0.39478 },
  { exDate: '2024-06-25', amount: 0.33671 },
  { exDate: '2024-09-24', amount: 0.19251 },
  { exDate: '2024-12-23', amount: 0.3207 },
  { exDate: '2025-03-25', amount: 0.4935 },
  { exDate: '2025-06-24', amount: 0.57306 },
  { exDate: '2025-09-23', amount: 0.28356 },
  { exDate: '2025-12-23', amount: 0.17186 }
]

// Historical dividend data for TQQQ (ex-dividend dates and amounts per share)
const TQQQ_DIVIDENDS: DividendPayment[] = [
  { exDate: '2021-12-23', amount: 0.00003 },
  { exDate: '2022-12-22', amount: 0.04896 },
  { exDate: '2023-03-22', amount: 0.0749 },
  { exDate: '2023-06-21', amount: 0.06379 },
  { exDate: '2023-09-20', amount: 0.06932 },
  { exDate: '2023-12-20', amount: 0.11172 },
  { exDate: '2024-03-20', amount: 0.10757 },
  { exDate: '2024-06-26', amount: 0.14139 },
  { exDate: '2024-09-25', amount: 0.11511 },
  { exDate: '2024-12-23', amount: 0.13771 },
  { exDate: '2025-03-26', amount: 0.09886 },
  { exDate: '2025-06-25', amount: 0.10916 },
  { exDate: '2025-09-24', amount: 0.04891 },
  { exDate: '2025-12-24', amount: 0.08554 }
]

interface DividendPayment {
  exDate: string // YYYY-MM-DD
  amount: number // per share
}

/**
 * Find dividends that fall within a date range (exclusive start, inclusive end)
 * Used to check which dividends occurred between weekly price points
 */
function getDividendsInRange(
  dividends: DividendPayment[],
  startDate: string,
  endDate: string
): DividendPayment[] {
  return dividends.filter(d => d.exDate > startDate && d.exDate <= endDate)
}

interface PriceDataPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface GeneratorOptions {
  initialFundSize?: number // Default: 10000
}

/**
 * Load price data from JSON file
 */
function loadPriceData(filename: string): PriceDataPoint[] {
  const filePath = join(PRICE_DATA_DIR, filename)
  if (!existsSync(filePath)) {
    throw new Error(`Price data file not found: ${filePath}`)
  }
  const content = readFileSync(filePath, 'utf-8')
  return JSON.parse(content) as PriceDataPoint[]
}

/**
 * Create a cash fund config
 */
function createCashFundConfig(startDate: string): SubFundConfig {
  return {
    fund_type: 'cash',
    status: 'active',
    fund_size_usd: 0,
    target_apy: 0.01,
    interval_days: 7,
    input_min_usd: 0,
    input_mid_usd: 0,
    input_max_usd: 0,
    max_at_pct: 0,
    min_profit_usd: 0,
    cash_apy: 0.01,
    margin_apr: 0,
    margin_access_usd: 0,
    accumulate: true,
    manage_cash: true,
    start_date: startDate
  }
}

/**
 * Create a trading fund config
 */
function createTradingFundConfig(
  fundType: 'stock' | 'crypto',
  fundSize: number,
  startDate: string
): SubFundConfig {
  return {
    fund_type: fundType,
    status: 'active',
    fund_size_usd: fundSize,
    target_apy: 0.30, // 30% target APY
    interval_days: 7, // Weekly
    input_min_usd: 100,
    input_mid_usd: 150,
    input_max_usd: 200,
    max_at_pct: -0.25,
    min_profit_usd: 500,
    cash_apy: 0.04,
    margin_apr: 0,
    margin_access_usd: 0,
    accumulate: true,
    manage_cash: false, // Use platform cash fund
    start_date: startDate
  }
}

/**
 * Generate entries for a cash fund with monthly 1% APY interest
 */
function generateCashFundEntries(
  initialDeposit: number,
  priceData: PriceDataPoint[]
): FundEntry[] {
  const entries: FundEntry[] = []
  const startDate = priceData[0]?.date

  if (!startDate) return entries

  // Initial deposit
  entries.push({
    date: startDate,
    value: 0,
    cash: initialDeposit,
    action: 'DEPOSIT',
    amount: initialDeposit,
    fund_size: initialDeposit
  })

  // Monthly interest at 1% APY
  const monthlyRate = 0.01 / 12
  let currentCash = initialDeposit
  let lastMonth = startDate.substring(0, 7) // YYYY-MM

  // Walk through all weeks and add interest at month boundaries
  for (let i = 1; i < priceData.length; i++) {
    const point = priceData[i]
    if (!point) continue

    const currentMonth = point.date.substring(0, 7)

    // When month changes, credit interest for the previous month
    if (currentMonth !== lastMonth) {
      const interest = currentCash * monthlyRate
      currentCash += interest

      entries.push({
        date: point.date,
        value: currentCash - interest, // Value before interest
        cash: currentCash,
        action: 'HOLD',
        cash_interest: interest
      })

      lastMonth = currentMonth
    }
  }

  return entries
}

/**
 * Shared cash tracker for a platform
 * Allows multiple trading funds to draw from the same cash pool
 */
interface CashTracker {
  balance: number
  withdraw: (amount: number) => number // Returns amount actually withdrawn
  deposit: (amount: number) => void // Add funds back to cash pool
}

function createCashTracker(initialBalance: number): CashTracker {
  let balance = initialBalance
  return {
    get balance() {
      return balance
    },
    withdraw(amount: number): number {
      const available = Math.min(amount, balance)
      balance -= available
      return available
    },
    deposit(amount: number): void {
      balance += amount
    }
  }
}

/**
 * Generate entries for a trading fund using the engine's recommendation system.
 * Uses cashTracker to draw from and return to platform's shared cash pool.
 * Includes dividend payments based on shares held at ex-dividend dates.
 *
 * The recommendation system determines:
 * - BUY: when below target, limited by available cash
 * - SELL: when above target by min_profit_usd
 *   - Liquidate mode (accumulate=false): sell entire position
 *   - Accumulate mode (accumulate=true): sell only DCA amount
 * - HOLD: when no cash available for buying
 */
function generateTradingFundEntries(
  config: SubFundConfig,
  priceData: PriceDataPoint[],
  cashTracker: CashTracker,
  dividendPayments: DividendPayment[] = []
): FundEntry[] {
  const entries: FundEntry[] = []

  if (priceData.length === 0) return entries

  // Track position state
  let totalShares = 0
  let previousDate = ''

  // Build up trade and dividend history for the engine
  const trades: Trade[] = []
  const dividends: Dividend[] = []

  for (let i = 0; i < priceData.length; i++) {
    const point = priceData[i]
    if (!point) continue

    const price = point.close
    const currentValue = totalShares * price

    // Check for dividends that occurred since the last price point
    if (previousDate && totalShares > 0) {
      const periodDividends = getDividendsInRange(dividendPayments, previousDate, point.date)
      for (const div of periodDividends) {
        const dividendAmount = totalShares * div.amount
        // Add dividend to cash tracker (simulates receiving dividend in brokerage cash)
        cashTracker.deposit(dividendAmount)
        // Track dividend for engine calculations
        dividends.push({ date: div.exDate, amount_usd: dividendAmount })

        entries.push({
          date: div.exDate,
          value: currentValue,
          action: 'HOLD',
          dividend: dividendAmount,
          price: price
        })
      }
    }

    // Compute fund state using the engine
    const state = computeFundState(
      config,
      trades,
      [], // cashflows
      dividends,
      [], // expenses
      currentValue,
      point.date
    )

    // Override cash_available_usd with our shared cash tracker
    // This allows multiple funds to share the same cash pool
    state.cash_available_usd = cashTracker.balance

    // Get recommendation from the engine
    const recommendation = computeRecommendation(config, state)

    if (!recommendation) {
      // No recommendation (shouldn't happen for trading funds)
      entries.push({
        date: point.date,
        value: currentValue,
        action: 'HOLD',
        price: price,
        ...(i === 0 ? { fund_size: config.fund_size_usd } : {})
      })
    } else if (recommendation.action === 'SELL') {
      // SELL: liquidate mode sells entire position, accumulate sells DCA amount
      const sellAmount = recommendation.amount
      const sharesToSell = sellAmount / price
      const actualSharesToSell = Math.min(sharesToSell, totalShares)
      const actualSellAmount = actualSharesToSell * price

      if (actualSharesToSell > 0) {
        totalShares -= actualSharesToSell
        // Return proceeds to cash tracker
        cashTracker.deposit(actualSellAmount)
        // Track trade for engine
        trades.push({
          date: point.date,
          amount_usd: actualSellAmount,
          type: 'sell',
          shares: actualSharesToSell,
          value: currentValue
        })

        entries.push({
          date: point.date,
          value: currentValue,
          action: 'SELL',
          amount: actualSellAmount,
          shares: actualSharesToSell,
          price: price
        })
      }
    } else if (recommendation.action === 'BUY') {
      // BUY: limited by available cash from shared tracker
      const buyAmount = Math.min(recommendation.amount, cashTracker.balance)
      const actualBuyAmount = cashTracker.withdraw(buyAmount)

      if (actualBuyAmount > 0) {
        const sharesToBuy = actualBuyAmount / price
        totalShares += sharesToBuy
        // Track trade for engine
        trades.push({
          date: point.date,
          amount_usd: actualBuyAmount,
          type: 'buy',
          shares: sharesToBuy
        })

        entries.push({
          date: point.date,
          value: i === 0 ? 0 : currentValue,
          action: 'BUY',
          amount: actualBuyAmount,
          shares: sharesToBuy,
          price: price,
          ...(i === 0 ? { fund_size: config.fund_size_usd } : {})
        })
      } else {
        // No cash available - HOLD
        entries.push({
          date: point.date,
          value: currentValue,
          action: 'HOLD',
          price: price,
          ...(i === 0 ? { fund_size: config.fund_size_usd } : {})
        })
      }
    } else {
      // HOLD
      entries.push({
        date: point.date,
        value: currentValue,
        action: 'HOLD',
        price: price,
        ...(i === 0 ? { fund_size: config.fund_size_usd } : {})
      })
    }

    previousDate = point.date
  }

  return entries
}

/**
 * Generate all test funds
 */
export function generateTestFunds(options: GeneratorOptions = {}): FundData[] {
  const { initialFundSize = 10000 } = options

  // Load all price data files
  const btcPrices = loadPriceData('btcusd-weekly.json')
  const tqqqPrices = loadPriceData('tqqq-weekly.json')
  const spxlPrices = loadPriceData('spxl-weekly.json')

  // Use the earliest common start date
  const startDate = btcPrices[0]?.date ?? tqqqPrices[0]?.date ?? spxlPrices[0]?.date

  if (!startDate) {
    throw new Error('No price data available')
  }

  const funds: FundData[] = []

  // Create cash trackers for each platform
  // These track the available cash as trading funds draw from them
  const coinbaseCashTracker = createCashTracker(initialFundSize)
  const robinhoodCashTracker = createCashTracker(initialFundSize * 2)

  // Generate coinbasetest-cash (no dash in platform name due to filename parsing)
  funds.push({
    id: 'coinbasetest-cash',
    platform: 'coinbasetest',
    ticker: 'cash',
    config: createCashFundConfig(startDate),
    entries: generateCashFundEntries(initialFundSize, btcPrices)
  })

  // Generate coinbasetest-btc (accumulate mode)
  const btcConfig = createTradingFundConfig('crypto', initialFundSize, startDate)
  funds.push({
    id: 'coinbasetest-btc',
    platform: 'coinbasetest',
    ticker: 'btc',
    config: btcConfig,
    entries: generateTradingFundEntries(
      btcConfig,
      btcPrices,
      coinbaseCashTracker
    )
  })

  // Generate robinhoodtest-cash (larger to support both funds)
  funds.push({
    id: 'robinhoodtest-cash',
    platform: 'robinhoodtest',
    ticker: 'cash',
    config: createCashFundConfig(startDate),
    entries: generateCashFundEntries(initialFundSize * 2, tqqqPrices)
  })

  // Generate robinhoodtest-tqqq (liquidate mode)
  const tqqqConfig = createTradingFundConfig('stock', initialFundSize, startDate)
  tqqqConfig.accumulate = false
  funds.push({
    id: 'robinhoodtest-tqqq',
    platform: 'robinhoodtest',
    ticker: 'tqqq',
    config: tqqqConfig,
    entries: generateTradingFundEntries(
      tqqqConfig,
      tqqqPrices,
      robinhoodCashTracker,
      TQQQ_DIVIDENDS
    )
  })

  // Generate robinhoodtest-spxl (liquidate mode)
  const spxlConfig = createTradingFundConfig('stock', initialFundSize, startDate)
  spxlConfig.accumulate = false
  funds.push({
    id: 'robinhoodtest-spxl',
    platform: 'robinhoodtest',
    ticker: 'spxl',
    config: spxlConfig,
    entries: generateTradingFundEntries(
      spxlConfig,
      spxlPrices,
      robinhoodCashTracker,
      SPXL_DIVIDENDS
    )
  })

  return funds
}

/**
 * Check if price data files exist
 */
export function checkPriceDataExists(): { exists: boolean; missing: string[] } {
  const files = ['btcusd-weekly.json', 'tqqq-weekly.json', 'spxl-weekly.json']
  const missing: string[] = []

  for (const file of files) {
    const filePath = join(PRICE_DATA_DIR, file)
    if (!existsSync(filePath)) {
      missing.push(file)
    }
  }

  return {
    exists: missing.length === 0,
    missing
  }
}
