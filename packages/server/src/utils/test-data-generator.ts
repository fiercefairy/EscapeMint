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
import type { SubFundConfig } from '@escapemint/engine'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Price data directory (bundled with the app)
const PRICE_DATA_DIR = join(__dirname, '../data')

interface PriceDataPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface GeneratorOptions {
  weeklyAmount?: number // Default: 100
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
    target_apy: 0.25, // 25% target APY
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
 * Generate entries for a trading fund using DCA strategy
 */
function generateTradingFundEntries(
  priceData: PriceDataPoint[],
  initialFundSize: number,
  weeklyDCA: number
): FundEntry[] {
  const entries: FundEntry[] = []

  if (priceData.length === 0) return entries

  let totalShares = 0

  for (let i = 0; i < priceData.length; i++) {
    const point = priceData[i]
    if (!point) continue

    const price = point.close
    const currentValue = totalShares * price

    if (i === 0) {
      // Initial entry - just record the starting point with a BUY
      const sharesToBuy = weeklyDCA / price
      totalShares = sharesToBuy

      entries.push({
        date: point.date,
        value: 0, // Value BEFORE the action
        action: 'BUY',
        amount: weeklyDCA,
        shares: sharesToBuy,
        price: price,
        fund_size: initialFundSize
      })
    } else {
      // Weekly DCA - buy more shares
      const sharesToBuy = weeklyDCA / price
      const valueBeforeBuy = currentValue

      totalShares += sharesToBuy

      entries.push({
        date: point.date,
        value: valueBeforeBuy, // Value BEFORE this week's buy
        action: 'BUY',
        amount: weeklyDCA,
        shares: sharesToBuy,
        price: price
      })
    }
  }

  return entries
}

/**
 * Generate all test funds
 */
export function generateTestFunds(options: GeneratorOptions = {}): FundData[] {
  const { weeklyAmount = 100, initialFundSize = 10000 } = options

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

  // Generate coinbasetest-cash (no dash in platform name due to filename parsing)
  funds.push({
    id: 'coinbasetest-cash',
    platform: 'coinbasetest',
    ticker: 'cash',
    config: createCashFundConfig(startDate),
    entries: generateCashFundEntries(initialFundSize, btcPrices)
  })

  // Generate coinbasetest-btc
  funds.push({
    id: 'coinbasetest-btc',
    platform: 'coinbasetest',
    ticker: 'btc',
    config: createTradingFundConfig('crypto', initialFundSize, startDate),
    entries: generateTradingFundEntries(btcPrices, initialFundSize, weeklyAmount)
  })

  // Generate robinhoodtest-cash (larger to support both funds)
  funds.push({
    id: 'robinhoodtest-cash',
    platform: 'robinhoodtest',
    ticker: 'cash',
    config: createCashFundConfig(startDate),
    entries: generateCashFundEntries(initialFundSize * 2, tqqqPrices)
  })

  // Generate robinhoodtest-tqqq
  funds.push({
    id: 'robinhoodtest-tqqq',
    platform: 'robinhoodtest',
    ticker: 'tqqq',
    config: createTradingFundConfig('stock', initialFundSize, startDate),
    entries: generateTradingFundEntries(tqqqPrices, initialFundSize, weeklyAmount)
  })

  // Generate robinhoodtest-spxl
  funds.push({
    id: 'robinhoodtest-spxl',
    platform: 'robinhoodtest',
    ticker: 'spxl',
    config: createTradingFundConfig('stock', initialFundSize, startDate),
    entries: generateTradingFundEntries(spxlPrices, initialFundSize, weeklyAmount)
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
