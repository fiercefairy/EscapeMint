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
 * and WITHDRAW/DEPOSIT entries from trading fund movements
 */
function generateCashFundEntries(
  initialDeposit: number,
  priceData: PriceDataPoint[],
  cashTracker: CashTracker
): FundEntry[] {
  const entries: FundEntry[] = []
  const startDate = priceData[0]?.date

  if (!startDate) return entries

  // Get all movements sorted by date
  const movements = [...cashTracker.movements].sort((a, b) => a.date.localeCompare(b.date))

  // Track fund_size (initial deposit + dividends - withdrawn profits)
  // For liquidate mode funds, we don't increase fund_size on SELL deposits
  let fundSize = initialDeposit
  let currentCash = initialDeposit
  let lastMonth = startDate.substring(0, 7)
  const monthlyRate = 0.01 / 12
  let movementIndex = 0

  // Initial deposit
  entries.push({
    date: startDate,
    value: 0,
    cash: currentCash,
    action: 'DEPOSIT',
    amount: initialDeposit,
    fund_size: fundSize
  })

  // Walk through all price points to handle interest and movements
  for (let i = 1; i < priceData.length; i++) {
    const point = priceData[i]
    if (!point) continue

    // Process all movements that occurred before or on this date
    // Use HOLD actions with signed amounts: negative = cash out, positive = cash in
    while (movementIndex < movements.length && movements[movementIndex]!.date <= point.date) {
      const movement = movements[movementIndex]!
      const valueBeforeMove = currentCash

      if (movement.type === 'withdraw') {
        // Cash leaving to buy assets (negative amount)
        currentCash -= movement.amount
        entries.push({
          date: movement.date,
          value: valueBeforeMove,
          cash: currentCash,
          action: 'HOLD',
          amount: -movement.amount,
          notes: `${movement.source} BUY`
        })
      } else {
        // Cash coming back from selling assets or dividends (positive amount)
        currentCash += movement.amount
        const isDividend = movement.source.endsWith('-dividend')
        if (isDividend) {
          // Dividends increase fund_size (reinvested)
          fundSize += movement.amount
          entries.push({
            date: movement.date,
            value: valueBeforeMove,
            cash: currentCash,
            action: 'HOLD',
            amount: movement.amount,
            fund_size: fundSize,
            notes: movement.source
          })
        } else {
          // SELL proceeds - no fund_size change
          entries.push({
            date: movement.date,
            value: valueBeforeMove,
            cash: currentCash,
            action: 'HOLD',
            amount: movement.amount,
            notes: `${movement.source} SELL`
          })
        }
      }
      movementIndex++
    }

    // Check for month boundary to credit interest
    const currentMonth = point.date.substring(0, 7)
    if (currentMonth !== lastMonth) {
      const interest = currentCash * monthlyRate
      if (interest > 0.01) {
        const valueBeforeInterest = currentCash
        currentCash += interest
        entries.push({
          date: point.date,
          value: valueBeforeInterest,
          cash: currentCash,
          action: 'HOLD',
          cash_interest: interest
        })
      }
      lastMonth = currentMonth
    }
  }

  return entries
}

/**
 * Cash movement record for generating cash fund entries
 */
interface CashMovement {
  date: string
  amount: number
  type: 'withdraw' | 'deposit'
  source: string // Which fund caused this movement (e.g., 'btc', 'tqqq')
}

/**
 * Shared cash tracker for a platform
 * Allows multiple trading funds to draw from the same cash pool
 * Records all movements for generating cash fund entries
 */
interface CashTracker {
  balance: number
  movements: CashMovement[]
  withdraw: (amount: number, date: string, source: string) => number
  deposit: (amount: number, date: string, source: string) => void
}

function createCashTracker(initialBalance: number): CashTracker {
  let balance = initialBalance
  const movements: CashMovement[] = []
  return {
    get balance() {
      return balance
    },
    get movements() {
      return movements
    },
    withdraw(amount: number, date: string, source: string): number {
      const available = Math.min(amount, balance)
      if (available > 0) {
        balance -= available
        movements.push({ date, amount: available, type: 'withdraw', source })
      }
      return available
    },
    deposit(amount: number, date: string, source: string): void {
      if (amount > 0) {
        balance += amount
        movements.push({ date, amount, type: 'deposit', source })
      }
    }
  }
}

/**
 * Fund state for interleaved generation
 */
interface TradingFundState {
  config: SubFundConfig
  ticker: string
  dividendPayments: DividendPayment[]
  priceData: PriceDataPoint[]
  entries: FundEntry[]
  trades: Trade[]
  dividends: Dividend[]
  totalShares: number
  previousDate: string
}

/**
 * Process a single week for one trading fund
 * Returns true if an entry was created
 */
function processWeekForFund(
  fundState: TradingFundState,
  weekIndex: number,
  cashTracker: CashTracker
): boolean {
  const point = fundState.priceData[weekIndex]
  if (!point) return false

  const price = point.close
  const currentValue = fundState.totalShares * price

  // Check for dividends that occurred since the last price point
  if (fundState.previousDate && fundState.totalShares > 0) {
    const periodDividends = getDividendsInRange(
      fundState.dividendPayments,
      fundState.previousDate,
      point.date
    )
    for (const div of periodDividends) {
      const dividendAmount = fundState.totalShares * div.amount
      // Add dividend to cash tracker (simulates receiving dividend in brokerage cash)
      cashTracker.deposit(dividendAmount, div.exDate, `${fundState.ticker}-dividend`)
      // Track dividend for engine calculations
      fundState.dividends.push({ date: div.exDate, amount_usd: dividendAmount })

      fundState.entries.push({
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
    fundState.config,
    fundState.trades,
    [], // cashflows
    fundState.dividends,
    [], // expenses
    currentValue,
    point.date
  )

  // Override cash_available_usd with our shared cash tracker
  // This allows multiple funds to share the same cash pool
  state.cash_available_usd = cashTracker.balance

  // Get recommendation from the engine
  const recommendation = computeRecommendation(fundState.config, state)

  if (!recommendation) {
    // No recommendation (shouldn't happen for trading funds)
    fundState.entries.push({
      date: point.date,
      value: currentValue,
      action: 'HOLD',
      price: price,
      ...(weekIndex === 0 ? { fund_size: fundState.config.fund_size_usd } : {})
    })
  } else if (recommendation.action === 'SELL') {
    // SELL: liquidate mode sells entire position, accumulate sells DCA amount
    const sellAmount = recommendation.amount
    const sharesToSell = sellAmount / price
    const actualSharesToSell = Math.min(sharesToSell, fundState.totalShares)
    const actualSellAmount = actualSharesToSell * price

    if (actualSharesToSell > 0) {
      fundState.totalShares -= actualSharesToSell
      // Return proceeds to cash tracker
      cashTracker.deposit(actualSellAmount, point.date, fundState.ticker)
      // Track trade for engine
      fundState.trades.push({
        date: point.date,
        amount_usd: actualSellAmount,
        type: 'sell',
        shares: actualSharesToSell,
        value: currentValue
      })

      fundState.entries.push({
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
    const actualBuyAmount = cashTracker.withdraw(buyAmount, point.date, fundState.ticker)

    if (actualBuyAmount > 0) {
      const sharesToBuy = actualBuyAmount / price
      fundState.totalShares += sharesToBuy
      // Track trade for engine
      fundState.trades.push({
        date: point.date,
        amount_usd: actualBuyAmount,
        type: 'buy',
        shares: sharesToBuy
      })

      fundState.entries.push({
        date: point.date,
        value: weekIndex === 0 ? 0 : currentValue,
        action: 'BUY',
        amount: actualBuyAmount,
        shares: sharesToBuy,
        price: price,
        ...(weekIndex === 0 ? { fund_size: fundState.config.fund_size_usd } : {})
      })
    } else {
      // No cash available - HOLD
      fundState.entries.push({
        date: point.date,
        value: currentValue,
        action: 'HOLD',
        price: price,
        ...(weekIndex === 0 ? { fund_size: fundState.config.fund_size_usd } : {})
      })
    }
  } else {
    // HOLD
    fundState.entries.push({
      date: point.date,
      value: currentValue,
      action: 'HOLD',
      price: price,
      ...(weekIndex === 0 ? { fund_size: fundState.config.fund_size_usd } : {})
    })
  }

  fundState.previousDate = point.date
  return true
}

/**
 * Generate entries for multiple trading funds together, week by week.
 * This ensures funds properly share the same cash pool, preventing negative balances.
 *
 * The recommendation system determines:
 * - BUY: when below target, limited by available cash
 * - SELL: when above target by min_profit_usd
 *   - Liquidate mode (accumulate=false): sell entire position
 *   - Accumulate mode (accumulate=true): sell only DCA amount
 * - HOLD: when no cash available for buying
 */
function generateInterleavedTradingFundEntries(
  funds: Array<{
    config: SubFundConfig
    priceData: PriceDataPoint[]
    ticker: string
    dividendPayments?: DividendPayment[]
  }>,
  cashTracker: CashTracker
): Map<string, FundEntry[]> {
  // Initialize state for each fund
  const fundStates: TradingFundState[] = funds.map(f => ({
    config: f.config,
    ticker: f.ticker,
    dividendPayments: f.dividendPayments ?? [],
    priceData: f.priceData,
    entries: [],
    trades: [],
    dividends: [],
    totalShares: 0,
    previousDate: ''
  }))

  // Find the maximum number of weeks across all funds
  const maxWeeks = Math.max(...fundStates.map(f => f.priceData.length))

  // Process each week for all funds together
  for (let weekIndex = 0; weekIndex < maxWeeks; weekIndex++) {
    for (const fundState of fundStates) {
      if (weekIndex < fundState.priceData.length) {
        processWeekForFund(fundState, weekIndex, cashTracker)
      }
    }
  }

  // Return entries keyed by ticker
  const result = new Map<string, FundEntry[]>()
  for (const fundState of fundStates) {
    result.set(fundState.ticker, fundState.entries)
  }
  return result
}

/**
 * Generate all test funds
 *
 * Order matters:
 * 1. Generate trading fund entries first (populates cash tracker with movements)
 * 2. Generate cash fund entries after (reflects all WITHDRAW/DEPOSIT from trading)
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

  // Create cash trackers for each platform
  // These track the available cash and record all movements
  const coinbaseCashTracker = createCashTracker(initialFundSize)
  const robinhoodCashTracker = createCashTracker(initialFundSize * 2)

  // === STEP 1: Generate trading fund entries (populates cash tracker movements) ===

  // coinbasetest-btc (accumulate mode) - single fund, doesn't need interleaving
  const btcConfig = createTradingFundConfig('crypto', initialFundSize, startDate)
  const coinbaseEntries = generateInterleavedTradingFundEntries(
    [{ config: btcConfig, priceData: btcPrices, ticker: 'btc' }],
    coinbaseCashTracker
  )
  const btcEntries = coinbaseEntries.get('btc') ?? []

  // robinhoodtest funds (liquidate mode) - interleaved to share cash properly
  const tqqqConfig = createTradingFundConfig('stock', initialFundSize, startDate)
  tqqqConfig.accumulate = false

  const spxlConfig = createTradingFundConfig('stock', initialFundSize, startDate)
  spxlConfig.accumulate = false

  // Generate TQQQ and SPXL together, week by week, so they properly share cash
  const robinhoodEntries = generateInterleavedTradingFundEntries(
    [
      { config: tqqqConfig, priceData: tqqqPrices, ticker: 'tqqq', dividendPayments: TQQQ_DIVIDENDS },
      { config: spxlConfig, priceData: spxlPrices, ticker: 'spxl', dividendPayments: SPXL_DIVIDENDS }
    ],
    robinhoodCashTracker
  )
  const tqqqEntries = robinhoodEntries.get('tqqq') ?? []
  const spxlEntries = robinhoodEntries.get('spxl') ?? []

  // === STEP 2: Generate cash fund entries (using recorded movements) ===

  const coinbaseCashEntries = generateCashFundEntries(
    initialFundSize,
    btcPrices,
    coinbaseCashTracker
  )

  const robinhoodCashEntries = generateCashFundEntries(
    initialFundSize * 2,
    tqqqPrices,
    robinhoodCashTracker
  )

  // === STEP 3: Assemble funds array ===

  const funds: FundData[] = []

  // coinbasetest platform
  funds.push({
    id: 'coinbasetest-cash',
    platform: 'coinbasetest',
    ticker: 'cash',
    config: createCashFundConfig(startDate),
    entries: coinbaseCashEntries
  })

  funds.push({
    id: 'coinbasetest-btc',
    platform: 'coinbasetest',
    ticker: 'btc',
    config: btcConfig,
    entries: btcEntries
  })

  // robinhoodtest platform
  funds.push({
    id: 'robinhoodtest-cash',
    platform: 'robinhoodtest',
    ticker: 'cash',
    config: createCashFundConfig(startDate),
    entries: robinhoodCashEntries
  })

  funds.push({
    id: 'robinhoodtest-tqqq',
    platform: 'robinhoodtest',
    ticker: 'tqqq',
    config: tqqqConfig,
    entries: tqqqEntries
  })

  funds.push({
    id: 'robinhoodtest-spxl',
    platform: 'robinhoodtest',
    ticker: 'spxl',
    config: spxlConfig,
    entries: spxlEntries
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
