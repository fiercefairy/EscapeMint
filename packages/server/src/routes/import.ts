import { Router } from 'express'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { platform } from 'node:os'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { chromium, type Browser, type Page } from 'playwright'
import { readAllFunds, appendEntry, type FundEntry, type FundData } from '@escapemint/storage'
import { badRequest, validationError } from '../middleware/error-handler.js'
import { PDFParse } from 'pdf-parse'

export const importRouter = Router()

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const FUNDS_DIR = join(DATA_DIR, 'funds')
const SCRAPE_ARCHIVE_DIR = join(DATA_DIR, 'scrape-archives')
const CRYPTO_STATEMENTS_DIR = join(DATA_DIR, 'crypto-statements')

// CDP connection for browser scraping
let connectedBrowser: Browser | null = null
let launchedChromeProcess: ChildProcess | null = null

// ============================================================================
// Types
// ============================================================================

interface RobinhoodTransaction {
  activityDate: string
  settleDate: string
  transCode: string
  description: string
  symbol: string
  quantity: number
  price: number
  amount: number
}

interface ParsedTransaction {
  date: string
  action: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'DIVIDEND' | 'INTEREST' | 'STOCK_LENDING' | 'FEE' | 'TRANSFER' | 'SPLIT' | 'MERGER' | 'OPTION' | 'CRYPTO' | 'REINVEST' | 'ADJUSTMENT' | 'OTHER'
  symbol: string
  quantity: number
  price: number
  amount: number
  description: string
  fundId: string | null
  fundExists: boolean
  rawDetails?: Record<string, string>  // Preserve all raw details for later processing
}

interface ImportPreview {
  transactions: ParsedTransaction[]
  summary: {
    total: number
    matched: number
    unmatched: number
    bySymbol: Record<string, { count: number; fundId: string | null; fundExists: boolean }>
  }
}

interface ImportResult {
  applied: number
  skipped: number
  errors: string[]
}

// Scraped transaction from Robinhood UI - captures ALL transaction types
interface ScrapedTransaction {
  id: string  // unique ID based on date + type + amount + title hash
  date: string  // ISO date YYYY-MM-DD
  type: 'buy' | 'sell' | 'dividend' | 'interest' | 'deposit' | 'withdrawal' | 'stock_lending' | 'fee' | 'transfer' | 'split' | 'merger' | 'option' | 'crypto' | 'reinvest' | 'adjustment' | 'other'
  title: string  // Full title from the header (raw, unmodified)
  amount: number  // Total amount in USD (0 if not applicable)
  symbol?: string  // Ticker symbol (if trade or dividend)
  shares?: number  // Number of shares (if trade)
  pricePerShare?: number  // Price per share (if trade)
  details: Record<string, string>  // All detail fields from expanded view (captures everything)
  rawHtml?: string  // For debugging unknown types
  rawText?: string  // Full text content for searching/analysis
}

interface ScrapeArchive {
  platform: string
  createdAt: string
  updatedAt: string
  transactions: ScrapedTransaction[]
}

// Crypto statement types
interface CryptoTransaction {
  date: string  // YYYY-MM-DD
  type: 'buy' | 'sell' | 'transfer' | 'interest' | 'staking' | 'other'
  symbol: string  // BTC, ETH, etc.
  quantity: number
  price: number  // Price per unit in USD
  value: number  // Total USD value
  rawText?: string  // Original text for debugging
}

interface CryptoHolding {
  name: string
  symbol: string
  quantity: number
  marketValue: number
  portfolioPercent: number
}

interface CryptoStatementData {
  filename: string
  periodStart: string
  periodEnd: string
  openingBalance: number
  closingBalance: number
  holdings: CryptoHolding[]
  transactions: CryptoTransaction[]
}

interface CryptoStatementInfo {
  filename: string
  monthYear: string  // "November 2025"
  downloadUrl: string
  downloaded: boolean
}

// ============================================================================
// CSV Parsing (functional, no external deps)
// ============================================================================

/**
 * Parse CSV content into array of objects using first row as headers.
 * Handles multi-line quoted fields properly.
 */
const parseCSV = (content: string): Record<string, string>[] => {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  // Process character by character to handle multi-line quoted fields
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote - add literal quote
        currentField += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      currentRow.push(currentField.trim())
      currentField = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      // End of row (skip \n if preceded by \r)
      if (char === '\r' && nextChar === '\n') {
        i++
      }
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim())
        if (currentRow.some(f => f)) { // Only add non-empty rows
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
      }
    } else {
      // Regular character (including newlines inside quotes)
      currentField += char
    }
  }

  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(f => f)) {
      rows.push(currentRow)
    }
  }

  if (rows.length < 2) return []

  const headerRow = rows[0]
  if (!headerRow) return []

  const headers = headerRow.map(h => h.toLowerCase().replace(/\s+/g, '_'))

  return rows.slice(1).map(row => {
    const record: Record<string, string> = {}
    headers.forEach((header, i) => {
      record[header] = row[i] ?? ''
    })
    return record
  })
}

// ============================================================================
// Robinhood Transaction Mapping
// ============================================================================

/**
 * Map Robinhood transaction code to FundEntry action.
 * Comprehensive mapping of all Robinhood transaction codes.
 *
 * Common Robinhood codes:
 * - ACH: ACH transfer (deposit/withdrawal)
 * - CDIV: Cash Dividend
 * - SLIP: Stock Lending Income Payment
 * - INT: Interest payment
 * - BTO: Buy To Open (options)
 * - STC: Sell To Close (options)
 * - STO: Sell To Open (options)
 * - BTC: Buy To Close (options)
 * - GOLD: Robinhood Gold subscription fee
 * - GDBP: Gold Deposit Boost Payout
 * - GMPC: Gold Margin Payment Credit
 * - NOA: Nasdaq Opening Auction
 * - IADJ: Interest Adjustment
 * - T/A: Transfer/Adjustment
 * - DTAX: Dividend Tax Withheld
 * - OEXP: Option Expiration
 * - OEXCS: Option Exercise
 * - FUTSWP: Futures Sweep
 * - CONV: Conversion
 * - ROC: Return of Capital
 * - MINT: Margin Interest
 * - MDIV: Mutual Fund Dividend
 * - LIQ: Liquidation
 * - DFEE: Various fees
 * - ABIP: ACATS Buy-In Protection
 * - CIL: Cash In Lieu
 * - MISC: Miscellaneous
 */
const mapTransCode = (code: string, description: string, amount: number = 0): ParsedTransaction['action'] => {
  const upper = code.toUpperCase().trim()
  const descUpper = description.toUpperCase()

  // === Trading - Stocks ===
  if (upper === 'BUY' || upper.includes('BUY')) return 'BUY'
  if (upper === 'SELL' || upper.includes('SELL')) return 'SELL'
  // Market orders at specific auctions
  if (upper === 'NOA' || upper === 'NOC') { // Nasdaq Opening/Closing Auction
    return descUpper.includes('SELL') || amount < 0 ? 'SELL' : 'BUY'
  }

  // === Trading - Options ===
  if (upper === 'BTO' || upper === 'BTC') return 'OPTION'  // Buy To Open/Close
  if (upper === 'STO' || upper === 'STC') return 'OPTION'  // Sell To Open/Close
  if (upper === 'OEXP') return 'OPTION'  // Option Expiration
  if (upper === 'OEXCS') return 'OPTION'  // Option Exercise
  if (upper === 'CIL') return 'OPTION'  // Cash In Lieu (from options)

  // === Transfers (deposits/withdrawals) ===
  if (upper === 'ACH' || upper === 'WIRE') {
    // ACH can be deposit or withdrawal - check amount or description
    if (descUpper.includes('WITHDRAW') || amount < 0) return 'WITHDRAW'
    return 'DEPOSIT'
  }
  if (upper.includes('DEPOSIT')) return 'DEPOSIT'
  if (upper.includes('WITHDRAW')) return 'WITHDRAW'
  if (upper === 'FUTSWP') return 'TRANSFER'  // Futures Sweep
  if (upper === 'T/A' || upper === 'TA') return 'TRANSFER'  // Transfer/Adjustment
  if (upper === 'ABIP') return 'TRANSFER'  // ACATS Buy-In Protection
  if (upper === 'ACATI' || upper === 'ACATO') return 'TRANSFER'  // ACATS In/Out (broker transfer)
  if (upper === 'CONV') return 'TRANSFER'  // Conversion (stock conversion)
  if (upper === 'LIQ') return 'SELL'  // Liquidation

  // === Income - Dividends ===
  if (upper === 'CDIV' || upper === 'DIV') return 'DIVIDEND'
  if (upper === 'MDIV') return 'DIVIDEND'  // Mutual Fund Dividend
  if (upper === 'ROC') return 'DIVIDEND'  // Return of Capital
  if (upper === 'GDBP') return 'DIVIDEND'  // Gold Deposit Boost Payout (bonus)
  if (upper === 'GMPC') return 'INTEREST'  // Gold Margin Payment Credit
  if (descUpper.includes('DIVIDEND') && !descUpper.includes('TAX')) return 'DIVIDEND'

  // === Income - Interest ===
  if (upper === 'INT') return 'INTEREST'
  if (upper === 'IADJ') return 'INTEREST'  // Interest Adjustment
  if (upper === 'MINT') return 'INTEREST'  // Margin Interest (negative = fee)
  if (descUpper.includes('INTEREST') && !descUpper.includes('TAX')) return 'INTEREST'

  // === Income - Stock Lending ===
  if (upper === 'SLIP') return 'STOCK_LENDING'
  if (descUpper.includes('LENDING') || descUpper.includes('SECURITIES LENDING')) return 'STOCK_LENDING'

  // === Fees ===
  if (upper === 'GOLD') return 'FEE'  // Robinhood Gold subscription
  if (upper === 'DFEE') return 'FEE'  // Dividend fee
  if (upper === 'FEE') return 'FEE'
  if (descUpper.includes('FEE') || descUpper.includes('SUBSCRIPTION')) return 'FEE'

  // === Tax Withholdings (treated as fees) ===
  if (upper === 'DTAX') return 'FEE'  // Dividend Tax Withheld

  // === Corporate Actions ===
  if (upper === 'SPLIT' || upper === 'SPR' || upper === 'SPL' || descUpper.includes('SPLIT')) return 'SPLIT'
  if (upper === 'SXCH') return 'MERGER'  // Symbol Exchange (ticker change)
  if (descUpper.includes('MERGER') || descUpper.includes('ACQUISITION')) return 'MERGER'

  // === Referral/Promotional Stock ===
  if (upper === 'SCXL' || upper === 'BCXL') return 'DIVIDEND'  // Stock credits (referral bonuses)

  // === Stock Split/Internal Transfers ===
  if (upper === 'ITRF') return 'SPLIT'  // Internal Transfer (stock split fractional adjustments)
  if (upper === 'REC') return 'REINVEST'  // Receive (dividend reinvestment or stock grant)

  // === Reinvestment ===
  if (upper === 'DRIP' || descUpper.includes('REINVEST')) return 'REINVEST'

  // === Adjustments ===
  if (upper === 'ADJ' || descUpper.includes('ADJUSTMENT') || descUpper.includes('CORRECTION')) return 'ADJUSTMENT'

  // === Miscellaneous ===
  if (upper === 'MISC') {
    // Try to infer from description
    if (descUpper.includes('DIVIDEND')) return 'DIVIDEND'
    if (descUpper.includes('INTEREST')) return 'INTEREST'
    if (descUpper.includes('DEPOSIT')) return 'DEPOSIT'
    if (descUpper.includes('WITHDRAW')) return 'WITHDRAW'
    if (descUpper.includes('FEE')) return 'FEE'
    if (descUpper.includes('REWARD') || descUpper.includes('CASH REWARD') || descUpper.includes('BONUS')) return 'DIVIDEND'
    if (descUpper.includes('CORRECTION') || descUpper.includes('CREDIT')) return 'ADJUSTMENT'
  }

  // === Fallback: Check description for common patterns ===
  if (descUpper.includes('BOUGHT') || descUpper.includes('MARKET BUY') || descUpper.includes('LIMIT BUY')) return 'BUY'
  if (descUpper.includes('SOLD') || descUpper.includes('MARKET SELL') || descUpper.includes('LIMIT SELL')) return 'SELL'
  if (descUpper.includes('OPTION')) return 'OPTION'
  if (descUpper.includes('CRYPTO')) return 'CRYPTO'

  return 'OTHER'
}

/**
 * Parse a date string into ISO format (YYYY-MM-DD).
 * Handles formats like "12/31/2024", "2024-12-31", etc.
 */
const parseDate = (dateStr: string): string => {
  if (!dateStr) return ''

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10)
  }

  // US format: MM/DD/YYYY
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (usMatch) {
    const [, month, day, year] = usMatch
    return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`
  }

  // Try Date parsing as fallback
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return dateStr
}


/**
 * Parse Robinhood date formats like "Jan 2", "Dec 31, 2025", etc.
 */
const parseRobinhoodDate = (dateText: string): string => {
  const currentYear = new Date().getFullYear()

  // Clean the date text
  const cleaned = dateText.trim()

  // Format: "Dec 31, 2025" or "Jan 2, 2025"
  const withYearMatch = cleaned.match(/([A-Z][a-z]{2})\s+(\d{1,2}),?\s*(\d{4})/)
  if (withYearMatch) {
    const [, month, day, year] = withYearMatch
    const monthNum = monthToNumber(month ?? '')
    return `${year}-${monthNum.toString().padStart(2, '0')}-${(day ?? '').padStart(2, '0')}`
  }

  // Format: "Jan 2" (no year, assume current year)
  const noYearMatch = cleaned.match(/([A-Z][a-z]{2})\s+(\d{1,2})/)
  if (noYearMatch) {
    const [, month, day] = noYearMatch
    const monthNum = monthToNumber(month ?? '')
    return `${currentYear}-${monthNum.toString().padStart(2, '0')}-${(day ?? '').padStart(2, '0')}`
  }

  return cleaned
}

const monthToNumber = (month: string): number => {
  const months: Record<string, number> = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
  }
  return months[month] ?? 1
}

/**
 * Parse amount from Robinhood format like "+$1,000.00" or "$100.00"
 */
const parseAmount = (amountText: string): number => {
  const cleaned = amountText.replace(/[+$,]/g, '')
  return parseFloat(cleaned) || 0
}

/**
 * Parse shares from text like "1.009998 shares at $99.01" or "0.01132829 Bitcoin at $88,274.51"
 */
const parseSharesAndPrice = (text: string): { shares: number; price: number } => {
  // Pattern: "X shares at $Y" or "X Bitcoin at $Y"
  const match = text.match(/([\d.]+)\s+(?:shares?|Bitcoin)\s+at\s+\$([\d,]+\.?\d*)/)
  if (match) {
    return {
      shares: parseFloat(match[1] ?? '0') || 0,
      price: parseFloat((match[2] ?? '0').replace(/,/g, '')) || 0
    }
  }
  return { shares: 0, price: 0 }
}

/**
 * Determine transaction type from title - captures ALL transaction types
 * We NEVER skip transactions, even if we can't categorize them - they go into 'other'
 * Order matters! More specific patterns first, then general patterns.
 */
const determineTransactionType = (title: string): ScrapedTransaction['type'] => {
  const lower = title.toLowerCase()

  // Income - check FIRST since "Dividend from X Option ETF" is still a dividend
  if (lower.includes('dividend from') || (lower.includes('dividend') && !lower.includes('split'))) return 'dividend'
  if (lower.includes('interest') && !lower.includes('interest rate')) return 'interest'
  if (lower.includes('staking earnings') || lower.includes('staking reward')) return 'interest'  // Staking yields = interest
  if (lower.includes('stock lending') || lower.includes('lending income') || lower.includes('securities lending') || lower.includes('lending payment')) return 'stock_lending'
  if (lower.includes('reward') || lower.includes('bonus') || lower.includes('payout') || lower.includes('trivia')) return 'dividend'  // Promotional rewards = income

  // Trading actions - specific phrases
  if (lower.includes('market buy') || lower.includes('limit buy') || lower.startsWith('buy ') || lower.includes(' buy ') || lower.includes('bought')) return 'buy'
  if (lower.includes('market sell') || lower.includes('limit sell') || lower.startsWith('sell ') || lower.includes(' sell ') || lower.includes('sold')) return 'sell'

  // Reinvestments (DRIP)
  if (lower.includes('reinvest') || lower.includes('drip') || lower.includes('automatic reinvestment')) return 'reinvest'

  // Corporate actions - before options since "Reverse Split" shouldn't match "option"
  if (lower.includes('forward split') || lower.includes('reverse split') || (lower.includes(' split') && !lower.includes('option'))) return 'split'
  if (lower.includes('merger') || lower.includes('acquisition') || lower.includes('spinoff') || lower.includes('spin-off') || lower.includes('reorganization')) return 'merger'

  // Options trading - only actual option transactions, not ETFs with "option" in name
  if (lower.includes(' call ') || lower.includes(' put ') || lower.includes('exercise') || lower.includes('assignment') || lower.includes(' expir')) return 'option'

  // Crypto - check for crypto-specific patterns
  if (lower.includes('bitcoin') || lower.includes('ethereum') || lower.includes('crypto') || lower.includes(' btc ') || lower.includes(' eth ') || lower.includes(' sol ') || lower.includes(' doge ')) return 'crypto'

  // Transfers
  if (lower.includes('deposit')) return 'deposit'
  if (lower.includes('withdraw') || lower.includes('unstake')) return 'withdrawal'
  if (lower.includes('transfer') || lower.includes('sweep') || lower.includes('ach') || lower.includes(' sent') || lower.includes(' received') || lower.includes('stake ')) return 'transfer'

  // Adjustments (corrections, cost basis, etc.)
  if (lower.includes('adjust') || lower.includes('correction') || lower.includes('cost basis') || lower.includes('amendment')) return 'adjustment'

  // Fees and charges
  if (lower.includes('fee') || lower.includes('robinhood gold') || lower.includes('subscription') || lower.includes('charge')) return 'fee'

  // If we can't categorize it, return 'other' - but we STILL capture all the data
  return 'other'
}

/**
 * Extract symbol from title or expanded content
 */
const extractSymbol = (title: string, details: Record<string, string>): string | undefined => {
  // Check if Symbol is in details
  if (details['Symbol']) {
    return details['Symbol']
  }

  // For crypto, check title like "BTC Market Buy"
  const cryptoMatch = title.match(/^(BTC|ETH|SOL|DOGE|SHIB|XRP|ADA|AVAX|MATIC|DOT|LINK|UNI|ATOM)\s/)
  if (cryptoMatch) {
    return cryptoMatch[1]
  }

  return undefined
}


/**
 * Load or create scrape archive for a platform
 */
const loadArchive = async (platform: string): Promise<ScrapeArchive> => {
  await mkdir(SCRAPE_ARCHIVE_DIR, { recursive: true })
  const archivePath = join(SCRAPE_ARCHIVE_DIR, `${platform}.json`)

  const content = await readFile(archivePath, 'utf-8').catch(() => null)
  if (content) {
    return JSON.parse(content) as ScrapeArchive
  }

  return {
    platform,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    transactions: []
  }
}

/**
 * Save archive to disk
 */
const saveArchive = async (archive: ScrapeArchive): Promise<void> => {
  await mkdir(SCRAPE_ARCHIVE_DIR, { recursive: true })
  const archivePath = join(SCRAPE_ARCHIVE_DIR, `${archive.platform}.json`)
  archive.updatedAt = new Date().toISOString()
  await writeFile(archivePath, JSON.stringify(archive, null, 2), 'utf-8')
}

/**
 * Add transaction to archive if not already present
 */
const addToArchive = (archive: ScrapeArchive, tx: ScrapedTransaction): boolean => {
  const exists = archive.transactions.some(t => t.id === tx.id)
  if (!exists) {
    archive.transactions.push(tx)
    // Sort by date descending (newest first)
    archive.transactions.sort((a, b) => b.date.localeCompare(a.date))
    return true
  }
  return false
}

/**
 * Parse Robinhood CSV row into RobinhoodTransaction.
 * Handles various column name formats.
 */
const parseRobinhoodRow = (row: Record<string, string>): RobinhoodTransaction => {
  // Activity date - try various column names
  const activityDate = row['activity_date'] || row['date'] || row['trans_date'] || row['transaction_date'] || ''
  const settleDate = row['settle_date'] || row['settlement_date'] || ''

  // Transaction code/type
  const transCode = row['trans_code'] || row['type'] || row['transaction_type'] || row['action'] || ''

  // Symbol - Robinhood calls it "Instrument"
  const symbol = (row['instrument'] || row['symbol'] || row['ticker'] || '').toUpperCase()

  // Quantity - handle negative for sells
  const quantityStr = row['quantity'] || row['qty'] || row['shares'] || '0'
  const quantity = Math.abs(parseFloat(quantityStr.replace(/[,$]/g, '')) || 0)

  // Price
  const priceStr = row['price'] || row['avg_price'] || row['average_price'] || '0'
  const price = parseFloat(priceStr.replace(/[,$]/g, '')) || 0

  // Amount - total transaction value
  const amountStr = row['amount'] || row['total'] || row['value'] || '0'
  const amount = Math.abs(parseFloat(amountStr.replace(/[,$()]/g, '')) || 0)

  // Description
  const description = row['description'] || row['name'] || row['desc'] || ''

  return {
    activityDate: parseDate(activityDate),
    settleDate: parseDate(settleDate),
    transCode,
    description,
    symbol,
    quantity,
    price,
    amount
  }
}

/**
 * Build fund ID from platform and symbol.
 */
const buildFundId = (platform: string, symbol: string): string => {
  return `${platform.toLowerCase()}-${symbol.toLowerCase()}`
}

/**
 * Check if a fund exists by ID.
 */
const fundExists = (fundId: string, funds: FundData[]): boolean => {
  return funds.some(f => f.id === fundId)
}

// ============================================================================
// Preview Endpoint
// ============================================================================

/**
 * POST /import/robinhood/preview
 * Parse CSV and return preview with fund mappings.
 */
importRouter.post('/robinhood/preview', async (req, res, next) => {
  const { csvContent, platform = 'robinhood' } = req.body as {
    csvContent?: string
    platform?: string
  }

  if (!csvContent) {
    return next(badRequest('csvContent is required'))
  }

  // Parse CSV
  const rows = parseCSV(csvContent)
  if (rows.length === 0) {
    return next(validationError('No valid data rows found in CSV'))
  }

  // Load existing funds
  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])

  // Parse and map transactions
  const transactions: ParsedTransaction[] = []
  const bySymbol: Record<string, { count: number; fundId: string | null; fundExists: boolean }> = {}

  for (const row of rows) {
    const parsed = parseRobinhoodRow(row)
    const action = mapTransCode(parsed.transCode, parsed.description, parsed.amount)

    // Determine fund ID for trades, dividends, options, etc.
    let fundId: string | null = null
    let exists = false

    // Actions that should be associated with a symbol/fund
    const symbolActions: ParsedTransaction['action'][] = [
      'BUY', 'SELL', 'DIVIDEND', 'OPTION', 'STOCK_LENDING', 'SPLIT', 'MERGER', 'REINVEST', 'CRYPTO'
    ]

    if (parsed.symbol && symbolActions.includes(action)) {
      fundId = buildFundId(platform, parsed.symbol)
      exists = fundExists(fundId, funds)

      // Track by symbol
      if (!bySymbol[parsed.symbol]) {
        bySymbol[parsed.symbol] = { count: 0, fundId, fundExists: exists }
      }
      bySymbol[parsed.symbol]!.count++
    }

    transactions.push({
      date: parsed.activityDate,
      action,
      symbol: parsed.symbol,
      quantity: parsed.quantity,
      price: parsed.price,
      amount: parsed.amount || (parsed.quantity * parsed.price),
      description: parsed.description,
      fundId,
      fundExists: exists
    })
  }

  // Sort by date
  transactions.sort((a, b) => a.date.localeCompare(b.date))

  const matched = transactions.filter(t => t.fundExists).length
  const unmatched = transactions.filter(t => t.fundId && !t.fundExists).length

  const preview: ImportPreview = {
    transactions,
    summary: {
      total: transactions.length,
      matched,
      unmatched,
      bySymbol
    }
  }

  res.json(preview)
})

// ============================================================================
// Apply Endpoint
// ============================================================================

/**
 * POST /import/robinhood/apply
 * Apply confirmed transactions to existing funds.
 */
importRouter.post('/robinhood/apply', async (req, res, next) => {
  const { transactions, skipUnmatched = true } = req.body as {
    transactions?: ParsedTransaction[]
    skipUnmatched?: boolean
  }

  if (!transactions || !Array.isArray(transactions)) {
    return next(badRequest('transactions array is required'))
  }

  // Load existing funds to verify
  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const fundMap = new Map(funds.map(f => [f.id, f]))

  const result: ImportResult = {
    applied: 0,
    skipped: 0,
    errors: []
  }

  for (const tx of transactions) {
    // Skip transactions without fund mapping
    if (!tx.fundId) {
      result.skipped++
      continue
    }

    // Check if fund exists
    const fund = fundMap.get(tx.fundId)
    if (!fund) {
      if (skipUnmatched) {
        result.skipped++
        continue
      }
      result.errors.push(`Fund not found: ${tx.fundId}`)
      continue
    }

    // Convert to FundEntry
    const entry: FundEntry = {
      date: tx.date,
      value: 0, // Will need to be updated with current market value
      notes: `Imported from Robinhood: ${tx.description}`
    }

    // Set action-specific fields
    if (tx.action === 'BUY' || tx.action === 'SELL') {
      entry.action = tx.action
      entry.amount = tx.amount
      entry.shares = tx.quantity
      entry.price = tx.price
    } else if (tx.action === 'DIVIDEND') {
      entry.dividend = tx.amount
    } else if (tx.action === 'INTEREST') {
      entry.cash_interest = tx.amount
    } else if (tx.action === 'DEPOSIT') {
      entry.action = 'DEPOSIT'
      entry.amount = tx.amount
    } else if (tx.action === 'WITHDRAW') {
      entry.action = 'WITHDRAW'
      entry.amount = tx.amount
    }

    // Check for duplicate (same date, action, amount)
    const isDuplicate = fund.entries.some(e =>
      e.date === entry.date &&
      e.action === entry.action &&
      e.amount === entry.amount
    )

    if (isDuplicate) {
      result.skipped++
      continue
    }

    // Append entry
    const filePath = join(FUNDS_DIR, `${tx.fundId}.tsv`)
    const appendResult = await appendEntry(filePath, entry).catch((err: Error) => {
      result.errors.push(`Failed to add entry to ${tx.fundId}: ${err.message}`)
      return null
    })

    if (appendResult !== null) {
      result.applied++
    }
  }

  res.json({
    success: result.errors.length === 0,
    result
  })
})

// ============================================================================
// Browser Scraping (CDP Connection)
// ============================================================================

// Use a dedicated port and profile to avoid conflicts with other browser automation
const DEFAULT_CDP_URL = 'http://localhost:9232'
const BROWSER_USER_DATA_DIR = join(process.cwd(), '.browser')

/**
 * Connect to an existing Chrome browser via CDP.
 */
const connectToBrowser = async (cdpUrl: string = DEFAULT_CDP_URL): Promise<Browser> => {
  if (connectedBrowser?.isConnected()) {
    return connectedBrowser
  }

  connectedBrowser = await chromium.connectOverCDP(cdpUrl)
  return connectedBrowser
}

/**
 * Find an existing Robinhood page in the browser.
 * Returns null if no Robinhood page found - user needs to open and log in manually.
 */
const findRobinhoodPage = async (browser: Browser): Promise<Page | null> => {
  const contexts = browser.contexts()
  console.log(`[Import] Found ${contexts.length} browser contexts`)

  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i]!
    const pages = context.pages()
    console.log(`[Import] Context ${i}: ${pages.length} pages`)
    for (const page of pages) {
      const pageUrl = page.url()
      if (pageUrl.includes('robinhood.com') && !pageUrl.includes('/login')) {
        console.log(`[Import] Found existing Robinhood page: ${pageUrl}`)
        return page
      }
    }
  }

  return null
}

/**
 * Create a new page in the browser context.
 */
const createNewPage = async (browser: Browser): Promise<Page> => {
  const contexts = browser.contexts()

  // Use the same context as an existing non-extension page
  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i]!
    const pages = context.pages()
    for (const existingPage of pages) {
      const pageUrl = existingPage.url()
      if (!pageUrl.startsWith('chrome-extension://') && !pageUrl.startsWith('blob:') && pageUrl !== 'about:blank') {
        console.log(`[Import] Creating new page in context ${i}`)
        return context.newPage()
      }
    }
  }

  // Fallback to first context
  const context = contexts[0]
  if (!context) {
    throw new Error('No browser context found')
  }
  return context.newPage()
}

/**
 * Scrape a single transaction from an activity item element.
 * Expands it if needed and extracts all data.
 */
const scrapeActivityItem = async (
  page: Page,
  itemSelector: string,
  index: number
): Promise<ScrapedTransaction | null> => {
  const items = await page.$$(itemSelector)
  const item = items[index]
  if (!item) return null

  // Get header content
  const headerEl = await item.$('[data-testid="rh-ExpandableItem-buttonContent"]')
  if (!headerEl) return null

  // Extract title from h3
  const titleEl = await headerEl.$('h3')
  const title = await titleEl?.textContent() ?? ''
  if (!title) return null

  // Extract date from span (usually the second one in the header)
  const dateSpans = await headerEl.$$('.css-16mmcnu span, header span')
  let dateText = ''
  for (const span of dateSpans) {
    const text = await span.textContent() ?? ''
    // Look for date pattern
    if (/[A-Z][a-z]{2}\s+\d{1,2}/.test(text)) {
      dateText = text
      break
    }
  }

  // Extract amount - look for the amount in the header
  const amountEls = await headerEl.$$('h3 span, .css-5a1gnn h3')
  let amountText = ''
  for (const el of amountEls) {
    const text = await el.textContent() ?? ''
    if (text.includes('$')) {
      amountText = text
      break
    }
  }

  // Also look for shares info in the header (e.g., "1.009998 shares at $99.01")
  let headerSharesText = ''
  const headerText = await headerEl.textContent() ?? ''
  const sharesMatch = headerText.match(/[\d.]+\s+shares?\s+at\s+\$[\d,.]+/)
  if (sharesMatch) {
    headerSharesText = sharesMatch[0]
  }

  // Check if expanded by looking for the content div
  const contentEl = await item.$('[data-testid="rh-ExpandableItem-content"]')
  const isHidden = await contentEl?.evaluate(el => {
    const parent = el.closest('[aria-hidden]')
    return parent?.getAttribute('aria-hidden') === 'true'
  }) ?? true

  // Click to expand if not already expanded
  if (isHidden) {
    const button = await item.$('[data-testid="rh-ExpandableItem-button"]')
    if (button) {
      // Use force:true to bypass intercepting elements (sticky nav, overlays)
      await button.click({ force: true }).catch(() => {
        // If click fails, try scrolling the element into view first
        return button.scrollIntoViewIfNeeded().then(() => button.click({ force: true }))
      })
      await page.waitForTimeout(300) // Wait for expansion animation
    }
  }

  // Extract details from expanded content
  const details: Record<string, string> = {}
  const detailsEl = await item.$('[data-testid="rh-ExpandableItem-content"]')
  if (detailsEl) {
    // Get all cell-label elements (key-value pairs)
    const cells = await detailsEl.$$('[data-testid="cell-label"]')
    for (const cell of cells) {
      const spans = await cell.$$('span div')
      if (spans.length >= 2) {
        const key = await spans[0]?.textContent() ?? ''
        const valueEl = spans[spans.length - 1]
        // Check for link in value (for Symbol)
        const link = await valueEl?.$('a')
        let value = ''
        if (link) {
          value = await link.textContent() ?? ''
        } else {
          value = await valueEl?.textContent() ?? ''
        }
        if (key && value) {
          details[key.trim()] = value.trim()
        }
      }
    }
  }

  // Parse the data
  const type = determineTransactionType(title)
  const date = parseRobinhoodDate(dateText)
  const amount = parseAmount(amountText)
  const symbol = extractSymbol(title, details)

  // Get shares and price
  let shares: number | undefined
  let pricePerShare: number | undefined

  // Try from details first
  if (details['Number of Shares']) {
    shares = parseFloat(details['Number of Shares'].replace(/,/g, '')) || undefined
  }
  if (details['Amount per Share']) {
    pricePerShare = parseFloat(details['Amount per Share'].replace(/[$,]/g, '')) || undefined
  }

  // Or from Filled Quantity
  if (details['Filled Quantity'] && !shares) {
    const parsed = parseSharesAndPrice(details['Filled Quantity'])
    shares = parsed.shares || undefined
    pricePerShare = parsed.price || undefined
  }

  // Or from header text
  if (headerSharesText && !shares) {
    const parsed = parseSharesAndPrice(headerSharesText)
    shares = parsed.shares || undefined
    pricePerShare = parsed.price || undefined
  }

  // Create a more unique ID using title hash to handle same-date, same-amount transactions
  const titleHash = title.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0).toString(36)
  const id = `${date}-${type}-${amount.toFixed(2)}-${symbol || titleHash}`

  const result: ScrapedTransaction = {
    id,
    date,
    type,
    title,
    amount,
    details,
    rawText: headerText  // Store full text for later analysis
  }

  // Only add optional properties if they have values
  if (symbol) result.symbol = symbol
  if (shares) result.shares = shares
  if (pricePerShare) result.pricePerShare = pricePerShare

  // Store rawHtml for 'other' type transactions for debugging
  if (type === 'other') {
    const html = await item.innerHTML().catch(() => '')
    if (html) result.rawHtml = html
  }

  return result
}

/**
 * Scrape transaction history from a Robinhood page with progress updates.
 * Expands each item to get full details.
 */
const scrapeRobinhoodHistoryWithProgress = async (
  page: Page,
  archive: ScrapeArchive,
  onProgress: (current: number, total: number, tx: ScrapedTransaction | null) => void,
  maxScrolls = 500  // Increased for 7+ years of history
): Promise<{ newCount: number; totalScraped: number }> => {
  // Wait for activity items to load
  await page.waitForSelector('[data-testid="activity-item"], [data-testid="UnifiedTransferActivityItem"]', {
    timeout: 15000
  }).catch(() => null)

  await page.waitForTimeout(2000)

  let totalScraped = 0
  let newCount = 0
  let previousItemCount = 0
  let noNewItemsCount = 0

  const itemSelector = '[data-testid="activity-item"], [data-testid="UnifiedTransferActivityItem"]'

  // Process items and scroll loop
  for (let scroll = 0; scroll < maxScrolls; scroll++) {
    const items = await page.$$(itemSelector)
    const currentItemCount = items.length

    // Process new items
    for (let i = previousItemCount; i < currentItemCount; i++) {
      const tx = await scrapeActivityItem(page, itemSelector, i)
      if (tx) {
        totalScraped++
        const isNew = addToArchive(archive, tx)
        if (isNew) {
          newCount++
          // Save incrementally every 10 new transactions
          if (newCount % 10 === 0) {
            await saveArchive(archive)
          }
        }
        onProgress(totalScraped, currentItemCount, tx)
      }
    }

    previousItemCount = currentItemCount

    // Scroll to load more - try multiple scroll strategies
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await page.waitForTimeout(2000)  // Increased wait time

    // Try scrolling specific container if main scroll doesn't work
    await page.evaluate(() => {
      const scrollableContainers = document.querySelectorAll('[data-testid="activity-feed"], .ReactVirtualized__Grid, [class*="scroll"]')
      scrollableContainers.forEach(container => {
        if (container.scrollHeight > container.clientHeight) {
          container.scrollTop = container.scrollHeight
        }
      })
    })
    await page.waitForTimeout(500)

    // Check if we got new items
    const newItems = await page.$$(itemSelector)
    if (newItems.length === currentItemCount) {
      noNewItemsCount++
      // More patient - wait for 5 consecutive scrolls with no new items
      if (noNewItemsCount >= 5) {
        // Try one more aggressive scroll before giving up
        await page.evaluate(() => {
          window.scrollBy(0, 5000)
        })
        await page.waitForTimeout(3000)
        const finalCheck = await page.$$(itemSelector)
        if (finalCheck.length === currentItemCount) {
          // Really at the end
          break
        }
      }
    } else {
      noNewItemsCount = 0
    }

    // Safety limit - increased for 7+ years of history (estimate ~10 transactions/week = 3640)
    if (totalScraped > 10000) {
      break
    }
  }

  // Final save
  await saveArchive(archive)

  return { newCount, totalScraped }
}

/**
 * Get the Chrome executable path based on platform.
 */
const getChromePath = (): string => {
  const os = platform()
  if (os === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  } else if (os === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  } else {
    // Linux - try common paths
    return 'google-chrome'
  }
}

/**
 * GET /import/browser/status
 * Check if browser is connected via CDP.
 */
importRouter.get('/browser/status', async (_req, res) => {
  const connected = connectedBrowser?.isConnected() ?? false
  const launched = launchedChromeProcess !== null && !launchedChromeProcess.killed
  res.json({
    connected,
    launched,
    cdpUrl: DEFAULT_CDP_URL,
    instructions: connected
      ? 'Browser connected. Ready to scrape.'
      : launched
        ? 'Chrome launched. Please log into Robinhood, then click Connect.'
        : 'Click Launch Browser to start Chrome with remote debugging.'
  })
})

// Platform-specific login URLs
const PLATFORM_LOGIN_URLS: Record<string, string> = {
  robinhood: 'https://robinhood.com/login',
  m1: 'https://dashboard.m1.com',
  'm1-cash': 'https://dashboard.m1.com',
  _default: 'about:blank'
}

const getPlatformLoginUrl = (platform?: string): string => {
  if (!platform) return PLATFORM_LOGIN_URLS._default!
  const normalized = platform.toLowerCase()
  return PLATFORM_LOGIN_URLS[normalized] ?? PLATFORM_LOGIN_URLS._default!
}

const getPlatformName = (platform?: string): string => {
  if (!platform) return 'the website'
  const normalized = platform.toLowerCase().replace(/-cash$/, '')
  const names: Record<string, string> = {
    robinhood: 'Robinhood',
    m1: 'M1 Finance'
  }
  return names[normalized] ?? platform
}

/**
 * POST /import/browser/launch
 * Launch Chrome with remote debugging enabled.
 * Body: { platform?: string } - Platform to navigate to (robinhood, m1, etc.)
 */
importRouter.post('/browser/launch', async (req, res, next) => {
  const { platform } = req.body as { platform?: string }
  const loginUrl = getPlatformLoginUrl(platform)
  const platformName = getPlatformName(platform)

  // Check if browser is already launched or connected
  if (connectedBrowser?.isConnected()) {
    return res.json({
      success: true,
      message: 'Browser already connected',
      alreadyRunning: true
    })
  }

  if (launchedChromeProcess && !launchedChromeProcess.killed) {
    return res.json({
      success: true,
      message: 'Chrome already running',
      alreadyRunning: true
    })
  }

  const chromePath = getChromePath()

  // Launch Chrome with remote debugging on dedicated port with persistent profile
  const args = [
    '--remote-debugging-port=9232',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${BROWSER_USER_DATA_DIR}`,
    loginUrl
  ]

  launchedChromeProcess = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore'
  })

  launchedChromeProcess.unref()

  // Give Chrome a moment to start
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Check if process is still running
  if (launchedChromeProcess.killed) {
    launchedChromeProcess = null
    return next(badRequest('Failed to launch Chrome. Make sure Chrome is installed.'))
  }

  res.json({
    success: true,
    message: `Chrome launched. Please log into ${platformName}.`,
    alreadyRunning: false
  })
})

/**
 * POST /import/browser/kill
 * Kill the launched Chrome browser.
 */
importRouter.post('/browser/kill', async (_req, res) => {
  // Disconnect from browser first
  if (connectedBrowser?.isConnected()) {
    await connectedBrowser.close().catch(() => {})
    connectedBrowser = null
  }

  // Kill the Chrome process
  if (launchedChromeProcess && !launchedChromeProcess.killed) {
    launchedChromeProcess.kill('SIGTERM')
    launchedChromeProcess = null
  }

  res.json({
    success: true,
    message: 'Browser closed'
  })
})

/**
 * POST /import/browser/connect
 * Connect to browser via CDP.
 */
importRouter.post('/browser/connect', async (req, res, next) => {
  const { cdpUrl = DEFAULT_CDP_URL } = req.body as { cdpUrl?: string }

  const browser = await connectToBrowser(cdpUrl).catch((err: Error) => {
    return next(badRequest(`Failed to connect to browser: ${err.message}. Start Chrome with: chrome --remote-debugging-port=9232`))
  })

  if (!browser) return

  res.json({
    success: true,
    message: 'Connected to browser',
    pages: (await browser.contexts()[0]?.pages())?.length ?? 0
  })
})

/**
 * GET /import/archive/:platform
 * Get the existing scrape archive for a platform with full summary.
 */
importRouter.get('/archive/:platform', async (req, res) => {
  const { platform } = req.params
  const { full } = req.query as { full?: string }
  const archive = await loadArchive(platform)

  // Build comprehensive summary
  const byType: Record<string, number> = {}
  const bySymbol: Record<string, { count: number; types: string[]; totalAmount: number }> = {}
  const byYear: Record<string, number> = {}
  let totalAmount = 0
  let unknownCount = 0
  let oldestDate = ''
  let newestDate = ''

  for (const tx of archive.transactions) {
    // By type
    byType[tx.type] = (byType[tx.type] ?? 0) + 1
    if (tx.type === 'other') unknownCount++

    // By symbol
    if (tx.symbol) {
      if (!bySymbol[tx.symbol]) {
        bySymbol[tx.symbol] = { count: 0, types: [], totalAmount: 0 }
      }
      bySymbol[tx.symbol]!.count++
      if (!bySymbol[tx.symbol]!.types.includes(tx.type)) {
        bySymbol[tx.symbol]!.types.push(tx.type)
      }
      bySymbol[tx.symbol]!.totalAmount += tx.amount
    }

    // By year
    const year = tx.date.slice(0, 4)
    byYear[year] = (byYear[year] ?? 0) + 1

    // Total amount
    totalAmount += tx.amount

    // Date range
    if (!oldestDate || tx.date < oldestDate) oldestDate = tx.date
    if (!newestDate || tx.date > newestDate) newestDate = tx.date
  }

  // Load existing funds to show which symbols are tracked
  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])

  // Add fundId to bySymbol
  const bySymbolWithFunds: Record<string, {
    count: number
    types: string[]
    totalAmount: number
    fundId: string
    fundExists: boolean
    ticker?: string
  }> = {}

  for (const [symbol, data] of Object.entries(bySymbol)) {
    const fundId = buildFundId(platform, symbol)
    const fund = funds.find(f => f.id === fundId)
    bySymbolWithFunds[symbol] = {
      ...data,
      fundId,
      fundExists: !!fund
    }
    if (fund?.ticker) {
      bySymbolWithFunds[symbol]!.ticker = fund.ticker
    }
  }

  res.json({
    platform: archive.platform,
    createdAt: archive.createdAt,
    updatedAt: archive.updatedAt,
    transactionCount: archive.transactions.length,
    summary: {
      totalAmount,
      unknownCount,
      dateRange: { oldest: oldestDate, newest: newestDate },
      byType,
      bySymbol: bySymbolWithFunds,
      byYear
    },
    // Return all transactions if full=true, otherwise first 50
    transactions: full === 'true' ? archive.transactions : archive.transactions.slice(0, 50)
  })
})

/**
 * POST /import/archive/:platform/reclassify
 * Re-classify existing transactions using the updated type detection.
 * This is useful when type detection is improved after initial scrape.
 */
importRouter.post('/archive/:platform/reclassify', async (req, res) => {
  const { platform } = req.params
  const archive = await loadArchive(platform)

  let reclassified = 0
  const changes: Array<{ id: string; oldType: string; newType: string; title: string }> = []

  for (const tx of archive.transactions) {
    const newType = determineTransactionType(tx.title)
    if (newType !== tx.type && newType !== 'other') {
      changes.push({
        id: tx.id,
        oldType: tx.type,
        newType,
        title: tx.title
      })
      tx.type = newType
      reclassified++
    }
  }

  if (reclassified > 0) {
    await saveArchive(archive)
  }

  res.json({
    platform,
    total: archive.transactions.length,
    reclassified,
    changes: changes.slice(0, 50)  // Show first 50 changes
  })
})

/**
 * GET /import/robinhood/scrape-stream
 * SSE endpoint for scraping with real-time progress updates.
 */
importRouter.get('/robinhood/scrape-stream', async (req, res) => {
  const { url, platform = 'robinhood' } = req.query as { url?: string; platform?: string }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  if (!url) {
    sendEvent('error', { message: 'url is required' })
    res.end()
    return
  }

  // Validate URL
  const isValidUrl = url.includes('robinhood.com') && (
    url.includes('history') || url.includes('/account/')
  )
  if (!isValidUrl) {
    sendEvent('error', { message: 'URL must be a Robinhood history page' })
    res.end()
    return
  }

  // Connect to browser
  const browser = await connectToBrowser().catch((err: Error) => {
    sendEvent('error', { message: `Failed to connect: ${err.message}` })
    return null
  })

  if (!browser) {
    res.end()
    return
  }

  sendEvent('status', { message: 'Looking for Robinhood page...', phase: 'navigating' })

  // First, try to find an existing Robinhood page
  let page = await findRobinhoodPage(browser)
  let pageCreated = false

  if (page) {
    console.log(`[Import] Using existing Robinhood page: ${page.url()}`)
    sendEvent('status', { message: 'Found logged-in Robinhood page', phase: 'navigating' })
  } else {
    // No existing page - create new one and tell user to log in
    console.log('[Import] No Robinhood page found, creating new one')
    sendEvent('status', { message: 'Opening Robinhood...', phase: 'navigating' })

    page = await createNewPage(browser).catch((err: Error) => {
      sendEvent('error', { message: err.message })
      return null
    }) as Page | null

    if (!page) {
      res.end()
      return
    }

    pageCreated = true

    // Navigate to Robinhood
    const navResult = await page.goto('https://robinhood.com', { waitUntil: 'networkidle', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      sendEvent('error', { message: `Navigation failed: ${navResult.message}` })
      await page.close().catch(() => {})
      res.end()
      return
    }

    await page.waitForTimeout(2000)

    // Check if redirected to login
    if (page.url().includes('/login')) {
      console.log('[Import] Redirected to login - user needs to log in manually')
      sendEvent('error', {
        message: 'Please log in to Robinhood in your browser first, then navigate to the history page and try again.'
      })
      // Don't close the page - let user log in
      res.end()
      return
    }
  }

  // Navigate to history if needed
  if (!page.url().includes('history')) {
    sendEvent('status', { message: 'Opening history page...', phase: 'navigating' })
    const navResult = await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      sendEvent('error', { message: `Navigation failed: ${navResult.message}` })
      if (pageCreated) await page.close().catch(() => {})
      res.end()
      return
    }
    await page.waitForTimeout(2000)
  }

  // Verify we're on the history page and logged in
  const loginForm = await page.$('input[name="username"], input[type="email"], [data-testid="login"]')
  if (loginForm || page.url().includes('/login')) {
    console.log(`[Import] Login form detected. Current URL: ${page.url()}`)
    sendEvent('error', {
      message: 'Please log in to Robinhood in the browser tab that just opened, then try again.'
    })
    // Don't close - let user log in
    res.end()
    return
  }

  sendEvent('status', { message: 'Loading archive...', phase: 'loading' })

  // Load existing archive
  const archive = await loadArchive(platform)
  const existingCount = archive.transactions.length

  sendEvent('status', {
    message: existingCount > 0
      ? `Found ${existingCount} existing transactions. Scraping for new data...`
      : 'Starting fresh scrape...',
    phase: 'scraping',
    existingCount
  })

  // Scrape with progress updates
  const result = await scrapeRobinhoodHistoryWithProgress(
    page,
    archive,
    (current, total, tx) => {
      sendEvent('progress', {
        current,
        total,
        newCount: archive.transactions.length - existingCount,
        lastTransaction: tx ? {
          date: tx.date,
          type: tx.type,
          symbol: tx.symbol,
          amount: tx.amount,
          title: tx.title.substring(0, 50)
        } : null
      })
    }
  ).catch((err: Error) => {
    sendEvent('error', { message: `Scraping error: ${err.message}` })
    return null
  })

  // Only close the page if we created it
  if (pageCreated) await page.close().catch(() => {})

  if (result) {
    sendEvent('complete', {
      totalScraped: result.totalScraped,
      newCount: result.newCount,
      archiveTotal: archive.transactions.length,
      message: result.newCount > 0
        ? `Scraped ${result.totalScraped} transactions, ${result.newCount} new`
        : `Scraped ${result.totalScraped} transactions, all already in archive`
    })
  }

  res.end()
})

/**
 * POST /import/robinhood/scrape
 * Scrape transaction history from a Robinhood URL.
 * Returns immediately with scraped data (non-streaming version for backward compatibility).
 */
importRouter.post('/robinhood/scrape', async (req, res, next) => {
  const { url, platform = 'robinhood', cdpUrl = DEFAULT_CDP_URL } = req.body as {
    url?: string
    platform?: string
    cdpUrl?: string
  }

  if (!url) {
    return next(badRequest('url is required'))
  }

  // Validate URL is a Robinhood history or account page
  const isValidUrl = url.includes('robinhood.com') && (
    url.includes('history') || url.includes('/account/')
  )
  if (!isValidUrl) {
    return next(validationError('URL must be a Robinhood history page'))
  }

  // Connect to browser
  let browser: Browser
  const connectResult = await connectToBrowser(cdpUrl).catch((err: Error) => err)
  if (connectResult instanceof Error) {
    return next(badRequest(`Failed to connect to browser: ${connectResult.message}`))
  }
  browser = connectResult

  // First, try to find an existing Robinhood page
  let page: Page | null = await findRobinhoodPage(browser)
  let pageCreated = false

  if (!page) {
    // No existing page - create new one
    const newPageResult = await createNewPage(browser).catch((err: Error) => err)
    if (newPageResult instanceof Error) {
      return next(badRequest(newPageResult.message))
    }
    page = newPageResult
    pageCreated = true
  }

  // Navigate to the URL if needed
  if (!page.url().includes('history')) {
    const navResult = await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      if (pageCreated) await page.close().catch(() => {})
      return next(badRequest(`Navigation failed: ${navResult.message}`))
    }
    await page.waitForTimeout(2000)
  }

  // Check login
  const loginForm = await page.$('input[name="username"], input[type="email"], [data-testid="login"]')
  if (loginForm || page.url().includes('/login')) {
    return next(badRequest('Please log in to Robinhood in your browser first, then navigate to the history page and try again.'))
  }

  // Load existing archive
  const archive = await loadArchive(platform)
  const existingCount = archive.transactions.length

  // Scrape with progress (no-op callback for non-streaming)
  const result = await scrapeRobinhoodHistoryWithProgress(
    page,
    archive,
    () => {} // No progress callback for non-streaming
  ).catch((err: Error) => {
    return { error: err.message }
  })

  // Only close the page if we created it
  if (pageCreated) await page.close().catch(() => {})

  if ('error' in result) {
    return next(badRequest(`Scraping failed: ${result.error}`))
  }

  // Convert scraped transactions to preview format
  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])

  const transactions: ParsedTransaction[] = archive.transactions.map(tx => {
    const fundId = tx.symbol ? buildFundId(platform, tx.symbol) : null
    const exists = fundId ? fundExists(fundId, funds) : false

    const actionMap: Record<ScrapedTransaction['type'], ParsedTransaction['action']> = {
      'buy': 'BUY',
      'sell': 'SELL',
      'dividend': 'DIVIDEND',
      'interest': 'INTEREST',
      'deposit': 'DEPOSIT',
      'withdrawal': 'WITHDRAW',
      'stock_lending': 'STOCK_LENDING',
      'fee': 'FEE',
      'transfer': 'TRANSFER',
      'split': 'SPLIT',
      'merger': 'MERGER',
      'option': 'OPTION',
      'crypto': 'CRYPTO',
      'reinvest': 'REINVEST',
      'adjustment': 'ADJUSTMENT',
      'other': 'OTHER'
    }

    return {
      date: tx.date,
      action: actionMap[tx.type] ?? 'OTHER',
      symbol: tx.symbol ?? '',
      quantity: tx.shares ?? 0,
      price: tx.pricePerShare ?? 0,
      amount: tx.amount,
      description: tx.title,
      fundId,
      fundExists: exists,
      rawDetails: tx.details  // Preserve all raw details for later processing
    }
  })

  // Build summary
  const bySymbol: Record<string, { count: number; fundId: string | null; fundExists: boolean }> = {}
  for (const tx of transactions) {
    if (tx.symbol) {
      if (!bySymbol[tx.symbol]) {
        bySymbol[tx.symbol] = { count: 0, fundId: tx.fundId, fundExists: tx.fundExists }
      }
      bySymbol[tx.symbol]!.count++
    }
  }

  const matched = transactions.filter(t => t.fundExists).length
  const unmatched = transactions.filter(t => t.fundId && !t.fundExists).length

  res.json({
    transactions,
    summary: {
      total: transactions.length,
      matched,
      unmatched,
      bySymbol,
      newCount: result.newCount,
      existingCount,
      archiveUpdated: new Date().toISOString()
    }
  })
})

/**
 * POST /import/browser/disconnect
 * Disconnect from browser.
 */
importRouter.post('/browser/disconnect', async (_req, res) => {
  if (connectedBrowser) {
    await connectedBrowser.close().catch(() => {})
    connectedBrowser = null
  }
  res.json({ success: true, message: 'Disconnected from browser' })
})

// ============================================================================
// Crypto Statement PDF Parsing
// ============================================================================

/**
 * Parse a Robinhood crypto statement PDF and extract transactions.
 */
const parseCryptoStatementPDF = async (pdfBuffer: Buffer, filename: string): Promise<CryptoStatementData> => {
  const parser = new PDFParse({ data: pdfBuffer })
  const result = await parser.getText()
  const text = result.text
  await parser.destroy()

  // Extract period dates
  const periodStartMatch = text.match(/PERIOD START\s+(\d{4}-\d{2}-\d{2})/)
  const periodEndMatch = text.match(/PERIOD END\s+(\d{4}-\d{2}-\d{2})/)
  const openingMatch = text.match(/OPENING BALANCE\s+\$?([\d,.]+)/)
  const closingMatch = text.match(/CLOSING BALANCE\s+\$?([\d,.]+)/)

  const periodStart = periodStartMatch?.[1] ?? ''
  const periodEnd = periodEndMatch?.[1] ?? ''
  const openingBalance = parseFloat(openingMatch?.[1]?.replace(/,/g, '') ?? '0')
  const closingBalance = parseFloat(closingMatch?.[1]?.replace(/,/g, '') ?? '0')

  // Extract holdings from the holdings table
  const holdings: CryptoHolding[] = []
  // Pattern for holdings: Name, Quantity, Symbol, Market Value, % of Portfolio
  // E.g., "Bitcoin 1.64494099 BTC $31910.36 45.98%"
  const holdingsPattern = /([A-Za-z][A-Za-z\s]*?)\s+([\d.]+)\s+([A-Z]{2,10})\s+\$([\d,.]+)\s+([\d.]+)%/g
  let holdingMatch
  while ((holdingMatch = holdingsPattern.exec(text)) !== null) {
    const [, name, qty, symbol, value, pct] = holdingMatch
    if (!name || !qty || !symbol || !value || !pct) continue
    // Skip if it looks like a transaction row or header text
    if (name.includes('Crypto') || name.includes('2022') || name.includes('2023') || name.includes('PORTFOLIO')) continue
    // Clean up name by removing any newline artifacts
    const cleanName = name.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    holdings.push({
      name: cleanName,
      symbol,
      quantity: parseFloat(qty),
      marketValue: parseFloat(value.replace(/,/g, '')),
      portfolioPercent: parseFloat(pct)
    })
  }

  // Extract transactions from ACCOUNT ACTIVITY section
  const transactions: CryptoTransaction[] = []

  // Pattern for transactions:
  // DATE, TRANSACTION TYPE, DEBIT (for sales), CREDIT (for purchases), PRICE, VALUE
  // Buy: "2022-09-01 Crypto purchase -- 0.00497181 BTC $20110.73992718 $99.99"
  // Sell: "2022-09-02 Crypto sale 2222.22 ADA -- $0.45603963 $1013.42"

  // Split text into lines and look for transaction patterns
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i]
    if (!currentLine) continue
    const line = currentLine.trim()

    // Look for date pattern at start of line
    const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue

    // Try to parse as a transaction line
    // Purchase: date + "Crypto purchase" + "--" + quantity + symbol + price + value
    // Sale: date + "Crypto sale" + quantity + symbol + "--" + price + value

    // Join with next line if it appears to continue (some PDFs split lines)
    let fullLine = line
    const nextLine = lines[i + 1]
    if (nextLine && !nextLine.match(/^\d{4}-\d{2}-\d{2}/)) {
      fullLine += ' ' + nextLine.trim()
    }

    // Purchase pattern: date Crypto Purchase -- QUANTITY SYMBOL $PRICE $VALUE [--]
    // Case-insensitive, handles tabs and optional fee column
    const purchaseMatch = fullLine.match(/(\d{4}-\d{2}-\d{2})[\s\t]+Crypto [Pp]urchase[\s\t]+--[\s\t]+([\d.]+)[\s\t]+([A-Z]{2,10})[\s\t]+\$([\d,.]+)[\s\t]+\$([\d,.]+)/i)
    if (purchaseMatch) {
      const [, pDate, pQty, pSymbol, pPrice, pValue] = purchaseMatch
      if (pDate && pQty && pSymbol && pPrice && pValue) {
        transactions.push({
          date: pDate,
          type: 'buy',
          quantity: parseFloat(pQty),
          symbol: pSymbol,
          price: parseFloat(pPrice.replace(/,/g, '')),
          value: parseFloat(pValue.replace(/,/g, '')),
          rawText: fullLine
        })
        continue
      }
    }

    // Sale pattern: date Crypto Sale QUANTITY SYMBOL -- $PRICE $VALUE [--]
    // Case-insensitive, handles tabs and optional fee column
    const saleMatch = fullLine.match(/(\d{4}-\d{2}-\d{2})[\s\t]+Crypto [Ss]ale[\s\t]+([\d.]+)[\s\t]+([A-Z]{2,10})[\s\t]+--[\s\t]+\$([\d,.]+)[\s\t]+\$([\d,.]+)/i)
    if (saleMatch) {
      const [, sDate, sQty, sSymbol, sPrice, sValue] = saleMatch
      if (sDate && sQty && sSymbol && sPrice && sValue) {
        transactions.push({
          date: sDate,
          type: 'sell',
          quantity: parseFloat(sQty),
          symbol: sSymbol,
          price: parseFloat(sPrice.replace(/,/g, '')),
          value: parseFloat(sValue.replace(/,/g, '')),
          rawText: fullLine
        })
        continue
      }
    }

    // Transfer/deposit/withdrawal patterns
    const transferMatch = fullLine.match(/(\d{4}-\d{2}-\d{2})\s+(Crypto transfer|Deposit|Withdrawal)\s+([\d.]+)\s+([A-Z]{2,10})\s+/)
    if (transferMatch) {
      const [, tDate, , tQty, tSymbol] = transferMatch
      if (tDate && tQty && tSymbol) {
        transactions.push({
          date: tDate,
          type: 'transfer',
          quantity: parseFloat(tQty),
          symbol: tSymbol,
          price: 0,
          value: 0,
          rawText: fullLine
        })
        continue
      }
    }

    // Staking/interest patterns
    const stakingMatch = fullLine.match(/(\d{4}-\d{2}-\d{2})\s+(Staking|Interest|Reward)\s+([\d.]+)\s+([A-Z]{2,10})\s+/)
    if (stakingMatch) {
      const [, stDate, stType, stQty, stSymbol] = stakingMatch
      if (stDate && stType && stQty && stSymbol) {
        transactions.push({
          date: stDate,
          type: stType.toLowerCase().includes('staking') ? 'staking' : 'interest',
          quantity: parseFloat(stQty),
          symbol: stSymbol,
          price: 0,
          value: 0,
          rawText: fullLine
        })
      }
    }
  }

  // Sort transactions by date
  transactions.sort((a, b) => a.date.localeCompare(b.date))

  return {
    filename,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    holdings,
    transactions
  }
}

/**
 * GET /import/crypto/statements
 * Scrape the Robinhood crypto statements page to get list of available PDFs.
 */
importRouter.get('/crypto/statements', async (_req, res, next) => {
  const browser = await connectToBrowser().catch((err: Error) => {
    return next(badRequest(`Failed to connect to browser: ${err.message}`))
  })
  if (!browser) return

  // Find Robinhood page
  const page = await findRobinhoodPage(browser)
  if (!page) {
    return next(badRequest('No Robinhood page found. Please log in first.'))
  }

  // Navigate to crypto statements page
  const statementsUrl = 'https://robinhood.com/account/reports-statements/crypto'
  if (!page.url().includes('reports-statements/crypto')) {
    const navResult = await page.goto(statementsUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      return next(badRequest(`Navigation failed: ${navResult.message}`))
    }
    await page.waitForTimeout(2000)
  }

  // Check if we need to click "View More" to load all statements
  let hasMore = true
  while (hasMore) {
    const viewMoreBtn = await page.$('a:has-text("View More")')
    if (viewMoreBtn) {
      await viewMoreBtn.click({ force: true })
      await page.waitForTimeout(1000)
    } else {
      hasMore = false
    }
  }

  // Get list of existing downloaded files
  await mkdir(CRYPTO_STATEMENTS_DIR, { recursive: true })
  const existingFiles: string[] = await readdir(CRYPTO_STATEMENTS_DIR).catch(() => [] as string[])

  // Extract statement links
  const statements: CryptoStatementInfo[] = await page.evaluate(() => {
    const links = document.querySelectorAll('a[download*="Robinhood Crypto Account Statement"]')
    return Array.from(links).map(link => {
      const downloadAttr = link.getAttribute('download') ?? ''
      // Extract month/year from download attribute like "November 2025 – Robinhood Crypto Account Statement"
      const monthYearMatch = downloadAttr.match(/^([A-Za-z]+\s+\d{4})/)
      return {
        filename: downloadAttr.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-') + '.pdf',
        monthYear: monthYearMatch?.[1] ?? downloadAttr,
        downloadUrl: link.getAttribute('href') ?? '',
        downloaded: false
      }
    })
  })

  // Mark which ones are already downloaded
  for (const stmt of statements) {
    stmt.downloaded = existingFiles.includes(stmt.filename)
  }

  res.json({
    count: statements.length,
    statements,
    downloadDir: CRYPTO_STATEMENTS_DIR
  })
})

/**
 * POST /import/crypto/download-statements
 * Download crypto statement PDFs from Robinhood.
 * Uses SSE to stream progress.
 */
importRouter.get('/crypto/download-stream', async (req, res) => {
  const { all } = req.query as { all?: string }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Connect to browser
  const browser = await connectToBrowser().catch((err: Error) => {
    sendEvent('error', { message: `Failed to connect: ${err.message}` })
    return null
  })

  if (!browser) {
    res.end()
    return
  }

  // Find Robinhood page
  const page = await findRobinhoodPage(browser)
  if (!page) {
    sendEvent('error', { message: 'No Robinhood page found. Please log in first.' })
    res.end()
    return
  }

  sendEvent('status', { message: 'Navigating to statements page...', phase: 'navigating' })

  // Navigate to crypto statements page
  const statementsUrl = 'https://robinhood.com/account/reports-statements/crypto'
  if (!page.url().includes('reports-statements/crypto')) {
    const navResult = await page.goto(statementsUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      sendEvent('error', { message: `Navigation failed: ${navResult.message}` })
      res.end()
      return
    }
    await page.waitForTimeout(2000)
  }

  sendEvent('status', { message: 'Loading all statements...', phase: 'loading' })

  // Click "View More" to load all statements
  let hasMore = true
  let loadCount = 0
  while (hasMore && loadCount < 50) {
    const viewMoreBtn = await page.$('a:has-text("View More")')
    if (viewMoreBtn) {
      await viewMoreBtn.click({ force: true })
      await page.waitForTimeout(1000)
      loadCount++
      sendEvent('status', { message: `Loading statements... (${loadCount} clicks)`, phase: 'loading' })
    } else {
      hasMore = false
    }
  }

  // Get list of existing downloaded files
  await mkdir(CRYPTO_STATEMENTS_DIR, { recursive: true })
  const existingFiles: string[] = await readdir(CRYPTO_STATEMENTS_DIR).catch(() => [] as string[])

  // Get all statement download links
  const statementLinks = await page.$$('a[download*="Robinhood Crypto Account Statement"]')
  const total = statementLinks.length

  sendEvent('status', { message: `Found ${total} statements. Starting downloads...`, phase: 'downloading', total })

  let downloaded = 0
  let skipped = 0

  for (let i = 0; i < statementLinks.length; i++) {
    const link = statementLinks[i]
    if (!link) continue
    const downloadAttr = await link.getAttribute('download') ?? ''
    const filename = downloadAttr.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-') + '.pdf'

    // Skip if already downloaded (unless all=true)
    if (all !== 'true' && existingFiles.includes(filename)) {
      skipped++
      sendEvent('progress', {
        current: i + 1,
        total,
        downloaded,
        skipped,
        filename,
        status: 'skipped'
      })
      continue
    }

    // Click to download - Robinhood uses dynamic URLs so we need to intercept
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
    await link.click({ force: true })
    const download = await downloadPromise

    if (download) {
      const filePath = join(CRYPTO_STATEMENTS_DIR, filename)
      await download.saveAs(filePath)
      downloaded++
      sendEvent('progress', {
        current: i + 1,
        total,
        downloaded,
        skipped,
        filename,
        status: 'downloaded'
      })
    } else {
      sendEvent('progress', {
        current: i + 1,
        total,
        downloaded,
        skipped,
        filename,
        status: 'failed'
      })
    }

    // Small delay between downloads
    await page.waitForTimeout(500)
  }

  sendEvent('complete', {
    total,
    downloaded,
    skipped,
    message: `Downloaded ${downloaded} statements (${skipped} skipped)`
  })

  res.end()
})

/**
 * GET /import/crypto/local-statements
 * List locally stored crypto statement PDFs.
 */
importRouter.get('/crypto/local-statements', async (_req, res) => {
  await mkdir(CRYPTO_STATEMENTS_DIR, { recursive: true })
  const files = await readdir(CRYPTO_STATEMENTS_DIR).catch(() => [])

  const statements = files
    .filter(f => f.endsWith('.pdf'))
    .map(filename => {
      // Extract month/year from filename like "November-2025-Robinhood-Crypto-Account-Statement.pdf"
      const monthYearMatch = filename.match(/^([A-Za-z]+-\d{4})/)
      return {
        filename,
        monthYear: monthYearMatch?.[1]?.replace('-', ' ') ?? filename,
        path: join(CRYPTO_STATEMENTS_DIR, filename)
      }
    })
    .sort((a, b) => b.monthYear.localeCompare(a.monthYear))

  res.json({
    count: statements.length,
    statements,
    directory: CRYPTO_STATEMENTS_DIR
  })
})

/**
 * POST /import/crypto/parse
 * Parse a crypto statement PDF and return extracted transactions.
 */
importRouter.post('/crypto/parse', async (req, res, next) => {
  const { filename } = req.body as { filename?: string }

  if (!filename) {
    return next(badRequest('filename is required'))
  }

  const filePath = join(CRYPTO_STATEMENTS_DIR, filename)
  const pdfBuffer = await readFile(filePath).catch(() => null)

  if (!pdfBuffer) {
    return next(badRequest(`File not found: ${filename}`))
  }

  const result = await parseCryptoStatementPDF(pdfBuffer, filename).catch((err: Error) => {
    return next(badRequest(`Failed to parse PDF: ${err.message}`))
  })

  if (!result) return

  res.json(result)
})

/**
 * POST /import/crypto/parse-all
 * Parse all local crypto statement PDFs and return combined transactions.
 */
importRouter.post('/crypto/parse-all', async (_req, res) => {
  await mkdir(CRYPTO_STATEMENTS_DIR, { recursive: true })
  const files = await readdir(CRYPTO_STATEMENTS_DIR).catch(() => [])
  const pdfFiles = files.filter(f => f.endsWith('.pdf'))

  const allTransactions: CryptoTransaction[] = []
  const allHoldings: Map<string, CryptoHolding> = new Map()
  const parsedStatements: CryptoStatementData[] = []
  const errors: string[] = []

  for (const filename of pdfFiles) {
    const filePath = join(CRYPTO_STATEMENTS_DIR, filename)
    const pdfBuffer = await readFile(filePath).catch(() => null)

    if (!pdfBuffer) {
      errors.push(`Failed to read: ${filename}`)
      continue
    }

    const result = await parseCryptoStatementPDF(pdfBuffer, filename).catch((err: Error) => {
      errors.push(`Failed to parse ${filename}: ${err.message}`)
      return null
    })

    if (result) {
      parsedStatements.push(result)
      allTransactions.push(...result.transactions)
      // Keep latest holdings
      for (const holding of result.holdings) {
        allHoldings.set(holding.symbol, holding)
      }
    }
  }

  // Sort transactions by date
  allTransactions.sort((a, b) => a.date.localeCompare(b.date))

  // Build summary by symbol
  const bySymbol: Record<string, {
    buys: number
    sells: number
    totalBought: number
    totalSold: number
    totalSpent: number
    totalReceived: number
  }> = {}

  for (const tx of allTransactions) {
    let stats = bySymbol[tx.symbol]
    if (!stats) {
      stats = {
        buys: 0,
        sells: 0,
        totalBought: 0,
        totalSold: 0,
        totalSpent: 0,
        totalReceived: 0
      }
      bySymbol[tx.symbol] = stats
    }
    if (tx.type === 'buy') {
      stats.buys++
      stats.totalBought += tx.quantity
      stats.totalSpent += tx.value
    } else if (tx.type === 'sell') {
      stats.sells++
      stats.totalSold += tx.quantity
      stats.totalReceived += tx.value
    }
  }

  res.json({
    statementCount: parsedStatements.length,
    transactionCount: allTransactions.length,
    holdings: Array.from(allHoldings.values()),
    transactions: allTransactions,
    bySymbol,
    errors: errors.length > 0 ? errors : undefined
  })
})

/**
 * POST /import/crypto/import-to-fund
 * Import parsed crypto transactions into a specific fund.
 * Body: {
 *   fundId: string,
 *   symbol: string,
 *   mode: 'append' | 'replace',
 *   consolidate: boolean,  // Group same-day same-type transactions
 *   startDate?: string     // Filter transactions from this date onwards
 * }
 */
importRouter.post('/crypto/import-to-fund', async (req, res, next) => {
  const { fundId, symbol, mode = 'append', consolidate = false, startDate } = req.body as {
    fundId: string
    symbol: string
    mode?: 'append' | 'replace'
    consolidate?: boolean
    startDate?: string
  }

  if (!fundId) return next(badRequest('fundId is required'))
  if (!symbol) return next(badRequest('symbol is required'))

  // Read all PDF statements and parse
  const pdfFiles = await readdir(CRYPTO_STATEMENTS_DIR).catch(() => [] as string[])
    .then((files: string[]) => files.filter(f => f.endsWith('.pdf')))

  if (pdfFiles.length === 0) {
    return next(badRequest('No crypto statement PDFs found'))
  }

  // Parse all statements
  const allTransactions: CryptoTransaction[] = []
  const errors: string[] = []

  for (const filename of pdfFiles) {
    const filePath = join(CRYPTO_STATEMENTS_DIR, filename)
    const pdfBuffer = await readFile(filePath).catch(() => null)

    if (!pdfBuffer) {
      errors.push(`Failed to read: ${filename}`)
      continue
    }

    const result = await parseCryptoStatementPDF(pdfBuffer, filename).catch((err: Error) => {
      errors.push(`Failed to parse ${filename}: ${err.message}`)
      return null
    })

    if (result) {
      allTransactions.push(...result.transactions)
    }
  }

  // Filter by symbol and optionally by start date
  let symbolTransactions = allTransactions.filter(tx => tx.symbol === symbol.toUpperCase())
  if (startDate) {
    symbolTransactions = symbolTransactions.filter(tx => tx.date >= startDate)
  }

  if (symbolTransactions.length === 0) {
    return next(badRequest(`No transactions found for symbol: ${symbol}${startDate ? ` from ${startDate}` : ''}`))
  }

  // Sort by date
  symbolTransactions.sort((a, b) => a.date.localeCompare(b.date))

  // Consolidate if requested: group by date + type, process BUYs before SELLs
  interface ConsolidatedTx {
    date: string
    type: 'buy' | 'sell'
    totalShares: number
    totalAmount: number
    count: number
  }

  let processedTransactions: ConsolidatedTx[] = []

  if (consolidate) {
    // Group by date + type
    const groups = new Map<string, ConsolidatedTx>()

    for (const tx of symbolTransactions) {
      if (tx.type !== 'buy' && tx.type !== 'sell') continue

      const key = `${tx.date}|${tx.type}`
      const existing = groups.get(key)

      if (existing) {
        existing.totalShares += tx.quantity
        existing.totalAmount += tx.value
        existing.count++
      } else {
        groups.set(key, {
          date: tx.date,
          type: tx.type,
          totalShares: tx.quantity,
          totalAmount: tx.value,
          count: 1
        })
      }
    }

    // Convert to array and sort: by date, then BUYs before SELLs
    processedTransactions = Array.from(groups.values()).sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date)
      if (dateCompare !== 0) return dateCompare
      // BUYs before SELLs on same day
      if (a.type === 'buy' && b.type === 'sell') return -1
      if (a.type === 'sell' && b.type === 'buy') return 1
      return 0
    })
  } else {
    // No consolidation - convert to same format
    processedTransactions = symbolTransactions
      .filter(tx => tx.type === 'buy' || tx.type === 'sell')
      .map(tx => ({
        date: tx.date,
        type: tx.type as 'buy' | 'sell',
        totalShares: tx.quantity,
        totalAmount: tx.value,
        count: 1
      }))
  }

  // Read target fund
  const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [] as FundData[])
  const fund = allFunds.find(f => f.id === fundId)

  if (!fund) {
    return next(badRequest(`Fund not found: ${fundId}`))
  }

  // Track cumulative shares
  let cumShares = mode === 'replace' ? 0 : (fund.entries.reduce((sum, e) => {
    if (e.action === 'BUY' && e.shares) return sum + e.shares
    if (e.action === 'SELL' && e.shares) return sum - e.shares
    return sum
  }, 0))

  // Convert to fund entries
  const entries: FundEntry[] = []
  let imported = 0
  let consolidated = 0
  let skippedSells = 0

  // Track sub-entries per date for labeling (a, b, c...)
  const dateCounters = new Map<string, number>()

  for (const tx of processedTransactions) {
    const action = tx.type === 'buy' ? 'BUY' : 'SELL'
    const avgPrice = tx.totalAmount / tx.totalShares

    // Update cumulative shares
    if (action === 'BUY') {
      cumShares += tx.totalShares
    } else {
      // Skip sells that would make cumShares negative (selling pre-existing holdings)
      if (cumShares < tx.totalShares) {
        skippedSells++
        continue  // Skip this sell - not enough shares accumulated
      }
      cumShares -= tx.totalShares
    }

    // Generate sub-identifier for multiple entries on same date
    const dateCount = dateCounters.get(tx.date) ?? 0
    dateCounters.set(tx.date, dateCount + 1)
    const subId = dateCount > 0 ? String.fromCharCode(97 + dateCount) : '' // '', 'b', 'c', 'd'...

    const notesText = tx.count > 1
      ? `${tx.count} ${tx.type}s consolidated${subId ? ` [${tx.date}-${subId}]` : ''}`
      : subId ? `[${tx.date}-${subId}]` : null

    const entry: FundEntry = {
      date: tx.date,
      value: Math.max(0, cumShares * avgPrice),  // Equity can't be negative
      action,
      amount: tx.totalAmount,
      shares: tx.totalShares,
      price: avgPrice,
      ...(notesText && { notes: notesText })
    }

    entries.push(entry)
    imported++
    if (tx.count > 1) consolidated += tx.count - 1
  }

  // Apply entries
  const fundPath = join(FUNDS_DIR, `${fundId}.tsv`)

  if (mode === 'replace') {
    const { writeFund } = await import('@escapemint/storage')
    fund.entries = entries
    await writeFund(fundPath, fund).catch((err: Error) => next(badRequest(err.message)))
  } else {
    for (const entry of entries) {
      await appendEntry(fundPath, entry).catch((err: Error) => {
        errors.push(`Failed to append entry: ${err.message}`)
      })
    }
  }

  res.json({
    success: true,
    fundId,
    symbol,
    mode,
    consolidate,
    startDate: startDate ?? null,
    imported,
    consolidated,
    skippedSells,
    originalCount: symbolTransactions.length,
    errors: errors.length > 0 ? errors : undefined
  })
})

// ============================================================================
// M1 Finance Cash Account Scraping
// ============================================================================

/**
 * M1 Cash transaction types based on their UI.
 * Primary focus is on interest payments from the savings/cash account.
 */
type M1CashTransactionType = 'interest' | 'deposit' | 'withdrawal' | 'transfer' | 'other'

/**
 * Determine M1 Cash transaction type from description and category.
 */
const determineM1TransactionType = (description: string, category: string): M1CashTransactionType => {
  const descLower = description.toLowerCase()
  const catLower = category.toLowerCase()

  // Interest payments - the primary goal of this importer
  if (descLower.includes('interest application') || catLower.includes('interest payment')) {
    return 'interest'
  }

  // Deposits from external banks
  if (descLower.includes('transfer from linked bank') || descLower.includes('ach credit')) {
    return 'deposit'
  }

  // Withdrawals
  if (descLower.includes('transfer to linked bank') || descLower.includes('ach debit') || descLower.includes('withdrawal')) {
    return 'withdrawal'
  }

  // Internal M1 transfers (between Invest and Save)
  if (descLower.includes('transfer to m1 invest') || descLower.includes('transfer from m1 invest') || catLower.includes('m1 transfer')) {
    return 'transfer'
  }

  return 'other'
}

/**
 * Parse M1 date format (e.g., "Dec 31, 2025" or "Pending") to YYYY-MM-DD
 */
const parseM1Date = (dateText: string): string => {
  if (!dateText || dateText.toLowerCase() === 'pending') {
    return new Date().toISOString().split('T')[0]!
  }

  // Remove any extra whitespace
  const cleaned = dateText.trim()

  // Parse "Dec 31, 2025" format
  const match = cleaned.match(/([A-Z][a-z]{2})\s+(\d{1,2}),?\s*(\d{4})/)
  if (match) {
    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    }
    const month = months[match[1]!] ?? '01'
    const day = match[2]!.padStart(2, '0')
    const year = match[3]!
    return `${year}-${month}-${day}`
  }

  // Fallback to current date
  return new Date().toISOString().split('T')[0]!
}

/**
 * Parse M1 amount format (e.g., "+$18.45" or "-$20,000.00")
 */
const parseM1Amount = (amountText: string): number => {
  const cleaned = amountText.replace(/[$,]/g, '').trim()
  const value = parseFloat(cleaned) || 0
  return value
}

/**
 * Find an existing M1 Finance savings page in the browser.
 */
const findM1SavingsPage = async (browser: Browser): Promise<Page | null> => {
  const contexts = browser.contexts()
  console.log(`[M1 Import] Found ${contexts.length} browser contexts`)

  for (let i = 0; i < contexts.length; i++) {
    const context = contexts[i]!
    const pages = context.pages()
    console.log(`[M1 Import] Context ${i}: ${pages.length} pages`)
    for (const page of pages) {
      const pageUrl = page.url()
      if (pageUrl.includes('m1.com') && !pageUrl.includes('/login')) {
        console.log(`[M1 Import] Found existing M1 page: ${pageUrl}`)
        return page
      }
    }
  }

  return null
}

/**
 * Scrape M1 Cash transactions from the current page.
 * Handles the table structure with date headers and transaction rows.
 */
const scrapeM1CashTransactionsFromPage = async (
  page: Page
): Promise<ScrapedTransaction[]> => {
  const transactions: ScrapedTransaction[] = []

  // Wait for table to load
  await page.waitForSelector('table tbody', { timeout: 10000 }).catch(() => null)
  await page.waitForTimeout(1000)

  // Get all rows from the table
  const rows = await page.$$('table tbody tr')
  let currentDate = ''

  for (const row of rows) {
    // Check if this is a date header row (has a th with colspan)
    const dateHeader = await row.$('th[colspan]')
    if (dateHeader) {
      const headerText = await dateHeader.textContent() ?? ''
      // Skip "Pending" section
      if (headerText.toLowerCase() !== 'pending') {
        currentDate = parseM1Date(headerText)
      }
      continue
    }

    // This is a transaction row - get the cells
    const cells = await row.$$('td')
    if (cells.length < 3) continue

    // Extract description from first cell
    const descCell = cells[0]
    const description = await descCell?.$eval('p', el => el.textContent?.trim() ?? '').catch(() => '')
    if (!description) continue

    // Extract category from second cell
    const catCell = cells[1]
    const category = await catCell?.$eval('p', el => el.textContent?.trim() ?? '').catch(() => '')

    // Extract amount from third cell
    const amountCell = cells[2]
    const amountText = await amountCell?.$eval('p', el => el.textContent?.trim() ?? '').catch(() => '')
    const amount = parseM1Amount(amountText ?? '')

    // Determine transaction type
    const type = determineM1TransactionType(description, category ?? '')

    // Create unique ID
    const titleHash = description.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0).toString(36)
    const id = `${currentDate}-${type}-${amount.toFixed(2)}-${titleHash}`

    const tx: ScrapedTransaction = {
      id,
      date: currentDate,
      type: type as ScrapedTransaction['type'],
      title: description,
      amount: Math.abs(amount),
      details: {
        category: category ?? '',
        originalAmount: amountText ?? ''
      },
      rawText: `${description} | ${category} | ${amountText}`
    }

    transactions.push(tx)
  }

  return transactions
}

/**
 * Scrape M1 Cash history with pagination and progress updates.
 * Uses Next button to load more pages.
 */
const scrapeM1CashHistoryWithProgress = async (
  page: Page,
  archive: ScrapeArchive,
  onProgress: (current: number, total: number, tx: ScrapedTransaction | null) => void,
  maxPages = 50
): Promise<{ newCount: number; totalScraped: number }> => {
  let totalScraped = 0
  let newCount = 0
  let pageNum = 0

  // Process pages
  while (pageNum < maxPages) {
    pageNum++

    // Scrape current page
    const pageTxns = await scrapeM1CashTransactionsFromPage(page)

    for (const tx of pageTxns) {
      totalScraped++
      const isNew = addToArchive(archive, tx)
      if (isNew) {
        newCount++
        // Save incrementally every 10 new transactions
        if (newCount % 10 === 0) {
          await saveArchive(archive)
        }
      }
      onProgress(totalScraped, totalScraped, tx)
    }

    // Check for Next button and click it
    const nextButton = await page.$('button:has-text("Next"):not([disabled])')
    if (!nextButton) {
      console.log('[M1 Import] No more pages (Next button disabled or not found)')
      break
    }

    // Click Next and wait for page to update
    await nextButton.click()
    await page.waitForTimeout(2000)
  }

  // Final save
  await saveArchive(archive)

  return { newCount, totalScraped }
}

/**
 * GET /import/m1-cash/scrape-stream
 * SSE endpoint for scraping M1 Cash transactions with real-time progress.
 */
importRouter.get('/m1-cash/scrape-stream', async (req, res) => {
  const { url, platform = 'm1-cash' } = req.query as { url?: string; platform?: string }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const targetUrl = url ?? 'https://dashboard.m1.com/d/save/savings/transactions'

  // Validate URL
  if (!targetUrl.includes('m1.com')) {
    sendEvent('error', { message: 'URL must be an M1 Finance page' })
    res.end()
    return
  }

  // Connect to browser
  const browser = await connectToBrowser().catch((err: Error) => {
    sendEvent('error', { message: `Failed to connect: ${err.message}` })
    return null
  })

  if (!browser) {
    res.end()
    return
  }

  sendEvent('status', { message: 'Looking for M1 Finance page...', phase: 'navigating' })

  // Try to find an existing M1 page
  let page = await findM1SavingsPage(browser)
  let pageCreated = false

  if (page) {
    console.log(`[M1 Import] Using existing M1 page: ${page.url()}`)
    sendEvent('status', { message: 'Found logged-in M1 page', phase: 'navigating' })
  } else {
    // No existing page - create new one
    console.log('[M1 Import] No M1 page found, creating new one')
    sendEvent('status', { message: 'Opening M1 Finance...', phase: 'navigating' })

    page = await createNewPage(browser).catch((err: Error) => {
      sendEvent('error', { message: err.message })
      return null
    }) as Page | null

    if (!page) {
      res.end()
      return
    }

    pageCreated = true

    // Navigate to M1
    const navResult = await page.goto('https://dashboard.m1.com', { waitUntil: 'networkidle', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      sendEvent('error', { message: `Navigation failed: ${navResult.message}` })
      await page.close().catch(() => {})
      res.end()
      return
    }

    await page.waitForTimeout(2000)

    // Check if redirected to login
    if (page.url().includes('/login') || page.url().includes('/signin')) {
      console.log('[M1 Import] Redirected to login - user needs to log in manually')
      sendEvent('error', {
        message: 'Please log in to M1 Finance in your browser first, then navigate to the savings transactions page and try again.'
      })
      res.end()
      return
    }
  }

  // Navigate to savings transactions if needed
  if (!page.url().includes('/save/') && !page.url().includes('savings')) {
    sendEvent('status', { message: 'Opening savings transactions page...', phase: 'navigating' })
    const navResult = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      sendEvent('error', { message: `Navigation failed: ${navResult.message}` })
      if (pageCreated) await page.close().catch(() => {})
      res.end()
      return
    }
    await page.waitForTimeout(2000)
  }

  // Check for login
  const loginForm = await page.$('input[type="email"], input[type="password"], [data-testid="login"]')
  if (loginForm || page.url().includes('/login') || page.url().includes('/signin')) {
    console.log(`[M1 Import] Login form detected. Current URL: ${page.url()}`)
    sendEvent('error', {
      message: 'Please log in to M1 Finance in the browser tab that just opened, then try again.'
    })
    res.end()
    return
  }

  sendEvent('status', { message: 'Loading archive...', phase: 'loading' })

  // Load existing archive
  const archive = await loadArchive(platform)
  const existingCount = archive.transactions.length

  sendEvent('status', {
    message: existingCount > 0
      ? `Found ${existingCount} existing transactions. Scraping for new data...`
      : 'Starting fresh scrape...',
    phase: 'scraping',
    existingCount
  })

  // Scrape with progress updates
  const result = await scrapeM1CashHistoryWithProgress(
    page,
    archive,
    (current, total, tx) => {
      sendEvent('progress', {
        current,
        total,
        newCount: archive.transactions.length - existingCount,
        lastTransaction: tx ? {
          date: tx.date,
          type: tx.type,
          symbol: undefined,
          amount: tx.amount,
          title: tx.title.substring(0, 50)
        } : null
      })
    }
  ).catch((err: Error) => {
    sendEvent('error', { message: `Scraping error: ${err.message}` })
    return null
  })

  // Only close the page if we created it
  if (pageCreated) await page.close().catch(() => {})

  if (result) {
    sendEvent('complete', {
      totalScraped: result.totalScraped,
      newCount: result.newCount,
      archiveTotal: archive.transactions.length,
      message: result.newCount > 0
        ? `Scraped ${result.totalScraped} transactions, ${result.newCount} new`
        : `Scraped ${result.totalScraped} transactions, all already in archive`
    })
  }

  res.end()
})
