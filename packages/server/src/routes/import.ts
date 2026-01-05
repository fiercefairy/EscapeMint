import { Router } from 'express'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { platform } from 'node:os'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { chromium, type Browser, type Page } from 'playwright'
import { readAllFunds, appendEntry, type FundEntry, type FundData } from '@escapemint/storage'
import { badRequest, validationError } from '../middleware/error-handler.js'
import { PDFParse } from 'pdf-parse'

export const importRouter: ReturnType<typeof Router> = Router()

const DATA_DIR = process.env['DATA_DIR'] ?? './data'
const FUNDS_DIR = join(DATA_DIR, 'funds')
const SCRAPE_ARCHIVE_DIR = join(DATA_DIR, 'scrape-archives')
const STATEMENTS_DIR = join(DATA_DIR, 'statements')
const CRYPTO_STATEMENTS_DIR = join(STATEMENTS_DIR, 'robinhood')
const M1_STATEMENTS_DIR = join(STATEMENTS_DIR, 'm1')

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
// Crypto Statement Filename Helpers
// ============================================================================

const MONTH_TO_NUM: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12'
}

/**
 * Convert "November 2025" or "November-2025" to "Crypto-Statement-2025-11.pdf"
 */
const monthYearToStatementFilename = (monthYear: string): string => {
  const cleaned = monthYear.replace(/[-–—]/g, ' ').trim()
  const match = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!match || !match[1] || !match[2]) return `Crypto-Statement-unknown.pdf`
  const month = match[1]
  const year = match[2]
  const mm = MONTH_TO_NUM[month.toLowerCase()] ?? '00'
  return `Crypto-Statement-${year}-${mm}.pdf`
}

/**
 * Parse both old format "November-2025-Robinhood-..." and new format "Crypto-Statement-2025-11.pdf"
 * Returns display month/year like "November 2025"
 */
const parseStatementFilename = (filename: string): string => {
  // New format: Crypto-Statement-YYYY-MM.pdf
  const newMatch = filename.match(/^Crypto-Statement-(\d{4})-(\d{2})\.pdf$/)
  if (newMatch) {
    const [, year, mm] = newMatch
    const monthName = Object.entries(MONTH_TO_NUM).find(([, num]) => num === mm)?.[0]
    if (monthName) {
      return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`
    }
  }
  // Old format: Month-Year-Robinhood-...
  const oldMatch = filename.match(/^([A-Za-z]+)-(\d{4})/)
  if (oldMatch) {
    return `${oldMatch[1]} ${oldMatch[2]}`
  }
  return filename
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
 *
 * Options:
 * - includeCashImpact: When true, generates CASH entries for all cash-affecting
 *   transactions (BUY→WITHDRAW, SELL→DEPOSIT, DIVIDEND→DEPOSIT, etc.)
 */
importRouter.post('/robinhood/preview', async (req, res, next) => {
  const { csvContent, platform = 'robinhood', includeCashImpact = false } = req.body as {
    csvContent?: string
    platform?: string
    includeCashImpact?: boolean
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
  const cashFundId = `${platform.toLowerCase().replace(/-cash$/, '')}-cash`
  const cashFundExists = fundExists(cashFundId, funds)

  // Parse and map transactions
  const transactions: ParsedTransaction[] = []
  const bySymbol: Record<string, { count: number; fundId: string | null; fundExists: boolean }> = {}

  for (const row of rows) {
    const parsed = parseRobinhoodRow(row)
    const action = mapTransCode(parsed.transCode, parsed.description, parsed.amount)

    // Determine fund ID for trades, dividends, options, etc.
    let fundId: string | null = null
    let exists = false
    let effectiveSymbol = parsed.symbol

    // Actions that should be associated with a symbol/fund
    const symbolActions: ParsedTransaction['action'][] = [
      'BUY', 'SELL', 'DIVIDEND', 'OPTION', 'STOCK_LENDING', 'SPLIT', 'MERGER', 'REINVEST', 'CRYPTO'
    ]

    // Cash transactions (no symbol) should be routed to the cash fund
    const cashActions: ParsedTransaction['action'][] = ['DEPOSIT', 'WITHDRAW', 'INTEREST']
    const isCashTransaction = !parsed.symbol && cashActions.includes(action)

    // Actions that affect cash balance (for includeCashImpact mode)
    const cashImpactActions: ParsedTransaction['action'][] = [
      'BUY', 'SELL', 'DIVIDEND', 'STOCK_LENDING', 'FEE'
    ]

    if (isCashTransaction) {
      // Route to platform's cash fund (e.g., robinhood-cash)
      fundId = cashFundId
      exists = cashFundExists
      effectiveSymbol = 'CASH'

      // Track by CASH symbol
      if (!bySymbol['CASH']) {
        bySymbol['CASH'] = { count: 0, fundId, fundExists: exists }
      }
      bySymbol['CASH']!.count++

      transactions.push({
        date: parsed.activityDate,
        action,
        symbol: effectiveSymbol,
        quantity: parsed.quantity,
        price: parsed.price,
        amount: parsed.amount || (parsed.quantity * parsed.price),
        description: parsed.description,
        fundId,
        fundExists: exists
      })
    } else if (parsed.symbol && symbolActions.includes(action)) {
      fundId = buildFundId(platform, parsed.symbol)
      exists = fundExists(fundId, funds)

      // Track by symbol
      if (!bySymbol[parsed.symbol]) {
        bySymbol[parsed.symbol] = { count: 0, fundId, fundExists: exists }
      }
      bySymbol[parsed.symbol]!.count++

      transactions.push({
        date: parsed.activityDate,
        action,
        symbol: effectiveSymbol,
        quantity: parsed.quantity,
        price: parsed.price,
        amount: parsed.amount || (parsed.quantity * parsed.price),
        description: parsed.description,
        fundId,
        fundExists: exists
      })

      // If includeCashImpact, also create a CASH entry for cash-affecting transactions
      if (includeCashImpact && cashImpactActions.includes(action) && parsed.amount > 0) {
        // Convert action to cash impact: BUY→WITHDRAW, SELL/DIVIDEND/STOCK_LENDING→DEPOSIT
        let cashAction: ParsedTransaction['action']
        let cashDescription: string

        if (action === 'BUY') {
          cashAction = 'WITHDRAW'
          cashDescription = `Trade: Buy ${parsed.symbol} (${parsed.quantity} @ $${parsed.price.toFixed(2)})`
        } else if (action === 'SELL') {
          cashAction = 'DEPOSIT'
          cashDescription = `Trade: Sell ${parsed.symbol} (${parsed.quantity} @ $${parsed.price.toFixed(2)})`
        } else if (action === 'DIVIDEND') {
          cashAction = 'DEPOSIT'
          cashDescription = `Dividend: ${parsed.symbol}`
        } else if (action === 'STOCK_LENDING') {
          cashAction = 'DEPOSIT'
          cashDescription = `Stock Lending: ${parsed.symbol}`
        } else if (action === 'FEE') {
          cashAction = 'WITHDRAW'
          cashDescription = `Fee: ${parsed.symbol} - ${parsed.description}`
        } else {
          continue // Skip other actions
        }

        // Track as CASH
        if (!bySymbol['CASH']) {
          bySymbol['CASH'] = { count: 0, fundId: cashFundId, fundExists: cashFundExists }
        }
        bySymbol['CASH']!.count++

        transactions.push({
          date: parsed.activityDate,
          action: cashAction,
          symbol: 'CASH',
          quantity: 0,
          price: 0,
          amount: parsed.amount,
          description: cashDescription,
          fundId: cashFundId,
          fundExists: cashFundExists
        })
      }
    }
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
  const { transactions, skipUnmatched = true, clearBeforeImport = false } = req.body as {
    transactions?: ParsedTransaction[]
    skipUnmatched?: boolean
    clearBeforeImport?: boolean
  }

  if (!transactions || !Array.isArray(transactions)) {
    return next(badRequest('transactions array is required'))
  }

  // Load existing funds to verify
  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const fundMap = new Map(funds.map(f => [f.id, f]))

  // If clearBeforeImport, clear all entries from target funds first
  if (clearBeforeImport) {
    const targetFundIds = new Set(transactions.map(tx => tx.fundId).filter(Boolean))
    for (const fundId of targetFundIds) {
      const fund = fundMap.get(fundId!)
      if (fund) {
        // Write empty entries to clear the fund
        const filePath = join(FUNDS_DIR, `${fundId}.tsv`)
        // Re-read fund to get config, then write with empty entries
        const existingFund = funds.find(f => f.id === fundId)
        if (existingFund) {
          // Import writeFund from storage
          const { writeFund } = await import('@escapemint/storage')
          await writeFund(filePath, { ...existingFund, entries: [] })
          // Update the map with cleared entries
          fundMap.set(fundId!, { ...existingFund, entries: [] })
        }
      }
    }
  }

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
      value: 0, // Will be updated for cash funds
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
      entry.amount = Math.abs(tx.amount) // Ensure positive for withdraw
    }

    // Check for duplicate based on transaction type
    let isDuplicate = false
    if (tx.action === 'INTEREST') {
      // For interest, check date and cash_interest amount
      isDuplicate = fund.entries.some(e =>
        e.date === entry.date &&
        e.cash_interest === entry.cash_interest
      )
    } else {
      // For other actions, check date, action, and amount
      isDuplicate = fund.entries.some(e =>
        e.date === entry.date &&
        e.action === entry.action &&
        e.amount === entry.amount
      )
    }

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

  // Post-process: Update running balances for cash funds
  if (result.applied > 0) {
    const cashFundIds = new Set(
      transactions
        .filter(tx => tx.fundId?.endsWith('-cash'))
        .map(tx => tx.fundId!)
    )

    for (const cashFundId of cashFundIds) {
      const filePath = join(FUNDS_DIR, `${cashFundId}.tsv`)
      // Re-read the fund to get all entries including newly added ones
      const { readFund, writeFund } = await import('@escapemint/storage')
      const updatedFund = await readFund(filePath).catch(() => null)

      if (updatedFund && updatedFund.entries.length > 0) {
        // Sort entries by date
        updatedFund.entries.sort((a, b) => a.date.localeCompare(b.date))

        // Calculate running balance and update value/fund_size fields
        let runningBalance = 0
        for (const entry of updatedFund.entries) {
          if (entry.action === 'DEPOSIT' && entry.amount) {
            runningBalance += entry.amount
          } else if (entry.action === 'WITHDRAW' && entry.amount) {
            runningBalance -= entry.amount
          }
          if (entry.cash_interest) {
            runningBalance += entry.cash_interest
          }
          if (entry.expense) {
            runningBalance -= entry.expense
          }

          // Set value, cash, and fund_size to the running balance
          entry.value = Math.round(runningBalance * 100) / 100
          entry.cash = entry.value
          entry.fund_size = entry.value
        }

        // Write back the updated fund
        await writeFund(filePath, updatedFund)
      }
    }
  }

  res.json({
    success: result.errors.length === 0,
    result
  })
})

// ============================================================================
// M1 Cash Import Apply
// ============================================================================

/**
 * POST /import/m1-cash/apply
 * Apply M1 cash transactions (interest, deposit, withdrawal) to the m1-cash fund.
 * Transfers are stored separately for later reconciliation with trading funds.
 */
importRouter.post('/m1-cash/apply', async (req, res, next) => {
  const { transactions, skipDuplicates = true } = req.body as {
    transactions?: ParsedTransaction[]
    skipDuplicates?: boolean
  }

  if (!transactions || !Array.isArray(transactions)) {
    return next(badRequest('transactions array is required'))
  }

  // Load the m1-cash fund
  const funds = await readAllFunds(FUNDS_DIR).catch(() => [])
  const cashFund = funds.find(f => f.id === 'm1-cash')

  if (!cashFund) {
    return next(badRequest('m1-cash fund not found. Please create it first.'))
  }

  const result: ImportResult = {
    applied: 0,
    skipped: 0,
    errors: []
  }

  const filePath = join(FUNDS_DIR, 'm1-cash.tsv')

  for (const tx of transactions) {
    // Only process cash-related transactions
    const cashActions = ['INTEREST', 'DEPOSIT', 'WITHDRAW']
    if (!cashActions.includes(tx.action)) {
      // Skip non-cash transactions (like transfers) for now
      result.skipped++
      continue
    }

    // Create the fund entry based on transaction type
    const entry: FundEntry = {
      date: tx.date,
      value: 0,  // Will be recalculated by the UI from entries
      notes: `Imported from M1 Finance: ${tx.description}`
    }

    if (tx.action === 'INTEREST') {
      // Interest goes into cash_interest field
      entry.cash_interest = tx.amount
    } else if (tx.action === 'DEPOSIT') {
      entry.action = 'DEPOSIT'
      entry.amount = tx.amount
    } else if (tx.action === 'WITHDRAW') {
      entry.action = 'WITHDRAW'
      entry.amount = tx.amount
    }

    // Check for duplicates
    if (skipDuplicates) {
      const isDuplicate = cashFund.entries.some(e => {
        // Match by date and type
        if (e.date !== entry.date) return false
        if (tx.action === 'INTEREST') {
          return e.cash_interest === entry.cash_interest
        }
        return e.action === entry.action && e.amount === entry.amount
      })

      if (isDuplicate) {
        result.skipped++
        continue
      }
    }

    // Append entry
    const appendResult = await appendEntry(filePath, entry).catch((err: Error) => {
      result.errors.push(`Failed to add ${tx.action} entry: ${err.message}`)
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
const CDP_PORT = process.env['CDP_PORT'] ?? '5549'
const DEFAULT_CDP_URL = `http://localhost:${CDP_PORT}`
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
    `--remote-debugging-port=${CDP_PORT}`,
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
    return next(badRequest(`Failed to connect to browser: ${err.message}. Start Chrome with: chrome --remote-debugging-port=${CDP_PORT}`))
  })

  if (!browser) return

  res.json({
    success: true,
    message: 'Connected to browser',
    pages: (await browser.contexts()[0]?.pages())?.length ?? 0
  })
})

/**
 * GET /import/browser/status
 * Check if CDP browser is running and get login status for platforms.
 */
importRouter.get('/browser/status', async (req, res) => {
  const { platform } = req.query as { platform?: string }

  // Check if browser is running by trying to connect
  const browser = await connectToBrowser().catch(() => null)

  if (!browser) {
    res.json({
      connected: false,
      message: 'Browser not running. Start with: pm2 start escapemint-browser'
    })
    return
  }

  // Browser is connected, check for platform-specific login status
  const contexts = browser.contexts()
  const pages: Array<{ url: string; title: string }> = []

  for (const context of contexts) {
    for (const page of context.pages()) {
      pages.push({ url: page.url(), title: await page.title().catch(() => '') })
    }
  }

  // Check login status for specific platform
  let loggedIn = false
  let loginUrl = ''
  let pageFound = false

  if (platform === 'm1') {
    const m1Page = pages.find(p => p.url.includes('m1.com'))
    pageFound = !!m1Page
    loggedIn = !!m1Page && m1Page.url.includes('dashboard.m1.com') && !m1Page.url.includes('/login')
    loginUrl = 'https://dashboard.m1.com'
  } else if (platform === 'robinhood') {
    const rhPage = pages.find(p => p.url.includes('robinhood.com'))
    pageFound = !!rhPage
    loggedIn = !!rhPage && !rhPage.url.includes('/login')
    loginUrl = 'https://robinhood.com'
  }

  res.json({
    connected: true,
    pageCount: pages.length,
    pages,
    platform: platform ?? null,
    pageFound,
    loggedIn,
    loginUrl
  })
})

/**
 * POST /import/browser/navigate
 * Navigate to a URL in the browser and wait for login if needed.
 */
importRouter.post('/browser/navigate', async (req, res) => {
  const { url, platform } = req.body as { url: string; platform?: string }

  const browser = await connectToBrowser().catch(() => null)
  if (!browser) {
    res.status(400).json({ error: 'Browser not running' })
    return
  }

  // Find or create a page for this platform
  let page = null
  const contexts = browser.contexts()

  for (const context of contexts) {
    for (const p of context.pages()) {
      const pageUrl = p.url()
      if (platform === 'm1' && pageUrl.includes('m1.com')) {
        page = p
        break
      } else if (platform === 'robinhood' && pageUrl.includes('robinhood.com')) {
        page = p
        break
      }
    }
    if (page) break
  }

  // If no existing page, create one
  if (!page && contexts.length > 0) {
    page = await contexts[0]!.newPage()
  }

  if (!page) {
    res.status(400).json({ error: 'Could not create page' })
    return
  }

  // Navigate to URL
  await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => null)
  await page.waitForTimeout(2000)

  const currentUrl = page.url()
  const isLoggedIn = platform === 'm1'
    ? currentUrl.includes('dashboard.m1.com') && !currentUrl.includes('/login')
    : !currentUrl.includes('/login')

  res.json({
    success: true,
    currentUrl,
    isLoggedIn
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

  // Track cash transactions separately (deposit, withdrawal, interest without symbol)
  const cashTypes = ['deposit', 'withdrawal', 'interest']

  for (const tx of archive.transactions) {
    // By type
    byType[tx.type] = (byType[tx.type] ?? 0) + 1
    if (tx.type === 'other') unknownCount++

    // By symbol - or CASH for cash transactions without symbol
    const effectiveSymbol = tx.symbol || (cashTypes.includes(tx.type) ? 'CASH' : null)
    if (effectiveSymbol) {
      if (!bySymbol[effectiveSymbol]) {
        bySymbol[effectiveSymbol] = { count: 0, types: [], totalAmount: 0 }
      }
      bySymbol[effectiveSymbol]!.count++
      if (!bySymbol[effectiveSymbol]!.types.includes(tx.type)) {
        bySymbol[effectiveSymbol]!.types.push(tx.type)
      }
      bySymbol[effectiveSymbol]!.totalAmount += tx.amount
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

  // For m1-cash platform, add special handling to show that cash transactions
  // can be imported to the m1-cash fund (they don't have symbols)
  let cashFundExists = false
  let cashTransactionCount = 0
  if (platform === 'm1-cash') {
    cashFundExists = funds.some(f => f.id === 'm1-cash')
    // Count cash-related transactions (interest, deposit, withdrawal)
    cashTransactionCount = archive.transactions.filter(tx =>
      ['interest', 'deposit', 'withdrawal'].includes(tx.type)
    ).length
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
      byYear,
      // M1 cash-specific: indicate cash fund exists and count of importable transactions
      ...(platform === 'm1-cash' && {
        cashFundId: 'm1-cash',
        cashFundExists,
        cashTransactionCount
      })
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
    // For cash transactions (interest, deposit, withdrawal) without a symbol,
    // route to the platform's cash fund (e.g., robinhood-cash, m1-cash)
    const isCashTransaction = !tx.symbol && ['interest', 'deposit', 'withdrawal'].includes(tx.type)
    const cashFundId = `${platform.toLowerCase().replace(/-cash$/, '')}-cash`

    const fundId = isCashTransaction
      ? cashFundId
      : (tx.symbol ? buildFundId(platform, tx.symbol) : null)
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
      symbol: tx.symbol || (isCashTransaction ? 'CASH' : ''),
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
  const statementsRaw = await page.evaluate(() => {
    const links = document.querySelectorAll('a[download*="Robinhood Crypto Account Statement"]')
    return Array.from(links).map(link => {
      const downloadAttr = link.getAttribute('download') ?? ''
      // Extract month/year from download attribute like "November 2025 – Robinhood Crypto Account Statement"
      const monthYearMatch = downloadAttr.match(/^([A-Za-z]+\s+\d{4})/)
      return {
        monthYear: monthYearMatch?.[1] ?? downloadAttr,
        downloadUrl: link.getAttribute('href') ?? ''
      }
    })
  })

  // Convert to CryptoStatementInfo with new filename format
  const statements: CryptoStatementInfo[] = statementsRaw.map(s => ({
    filename: monthYearToStatementFilename(s.monthYear),
    monthYear: s.monthYear,
    downloadUrl: s.downloadUrl,
    downloaded: false
  }))

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
    // Extract month/year like "November 2025" from "November 2025 – Robinhood Crypto Account Statement"
    const monthYearMatch = downloadAttr.match(/^([A-Za-z]+\s+\d{4})/)
    const monthYear = monthYearMatch?.[1] ?? downloadAttr
    const filename = monthYearToStatementFilename(monthYear)

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
    .map(filename => ({
      filename,
      monthYear: parseStatementFilename(filename),
      path: join(CRYPTO_STATEMENTS_DIR, filename)
    }))
    .sort((a, b) => {
      // Sort by filename for chronological order (Crypto-Statement-YYYY-MM.pdf sorts correctly)
      return b.filename.localeCompare(a.filename)
    })

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

// ============================================================================
// M1 Finance PDF Statement Import
// ============================================================================

/**
 * M1 statement transaction from PDF parsing
 */
interface M1StatementTransaction {
  date: string  // YYYY-MM-DD
  description: string
  amount: number  // Positive for credits, negative for debits
  type: 'interest' | 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'other'
}

/**
 * Parsed M1 statement data
 */
interface M1StatementData {
  filename: string
  accountType: 'earn' | 'invest' | 'crypto' | 'unknown'
  periodStart: string
  periodEnd: string
  beginningBalance: number
  endingBalance: number
  totalDeposits: number
  totalWithdrawals: number
  totalInterest: number
  transactions: M1StatementTransaction[]
}

/**
 * M1 statement info for listing
 */
interface M1StatementInfo {
  filename: string
  accountType: string
  monthYear: string
  downloaded: boolean
  path?: string
}

/**
 * Determine M1 transaction type from PDF description
 */
const determineM1StatementTransactionType = (description: string): M1StatementTransaction['type'] => {
  const descLower = description.toLowerCase()

  if (descLower.includes('interest application') || descLower.includes('interest payment')) {
    return 'interest'
  }
  if (descLower.includes('transfer from linked bank') || descLower.includes('ach credit') || descLower.includes('deposit')) {
    return 'deposit'
  }
  if (descLower.includes('transfer to linked bank') || descLower.includes('ach debit')) {
    return 'withdrawal'
  }
  if (descLower.includes('transfer to m1') || descLower.includes('transfer from m1') || descLower.includes('instant transfer')) {
    return 'transfer'
  }
  if (descLower.includes('membership') || descLower.includes('fee')) {
    return 'fee'
  }
  return 'other'
}

/**
 * Parse M1 Earn/Save PDF statement
 */
const parseM1StatementPDF = async (pdfBuffer: Buffer, filename: string): Promise<M1StatementData> => {
  const parser = new PDFParse({ data: pdfBuffer })
  const result = await parser.getText()
  const text = result.text
  await parser.destroy()

  // Determine account type from filename or content
  let accountType: M1StatementData['accountType'] = 'unknown'
  const filenameLower = filename.toLowerCase()
  if (filenameLower.includes('earn') || filenameLower.includes('save')) {
    accountType = 'earn'
  } else if (filenameLower.includes('invest') || filenameLower.includes('brokerage')) {
    accountType = 'invest'
  } else if (filenameLower.includes('crypto')) {
    accountType = 'crypto'
  } else if (text.toLowerCase().includes('m1 save') || text.toLowerCase().includes('m1 earn')) {
    accountType = 'earn'
  } else if (text.toLowerCase().includes('brokerage')) {
    accountType = 'invest'
  }

  // Extract summary section values
  // M1 format: "Beginning Balance as of DATE \t$0.00" or "Ending Balance as of DATE $X"
  const beginningMatch = text.match(/beginning\s+balance(?:\s+as\s+of\s+\S+)?\s*[\t:]*\s*\$?([\d,.]+)/i)
  const endingMatch = text.match(/ending\s+balance(?:\s+as\s+of\s+\S+)?\s*[\t:]*\s*\$?([\d,.]+)/i)
  const depositsMatch = text.match(/deposits\s+(?:and\s+other\s+credits\s+)?\s*[\t:]*\s*\$?([\d,.]+)/i)
  const withdrawalsMatch = text.match(/withdrawals\s+(?:and\s+other\s+debits\s+)?\s*[\t:]*\s*\$?([\d,.]+)/i)
  const interestMatch = text.match(/(?:total\s+)?interest(?:\s+earned)?\s*[\t:]*\s*\$?([\d,.]+)/i)

  const beginningBalance = parseFloat(beginningMatch?.[1]?.replace(/,/g, '') ?? '0')
  const endingBalance = parseFloat(endingMatch?.[1]?.replace(/,/g, '') ?? '0')
  const totalDeposits = parseFloat(depositsMatch?.[1]?.replace(/,/g, '') ?? '0')
  const totalWithdrawals = parseFloat(withdrawalsMatch?.[1]?.replace(/,/g, '') ?? '0')
  const totalInterest = parseFloat(interestMatch?.[1]?.replace(/,/g, '') ?? '0')

  // Extract period dates from filename or content
  // Filename pattern: "M1 Save Account Statement-2025-09.pdf"
  const filenameMonthMatch = filename.match(/(\d{4})-(\d{2})\.pdf$/i)
  let periodStart = ''
  let periodEnd = ''

  if (filenameMonthMatch) {
    const year = filenameMonthMatch[1]!
    const month = filenameMonthMatch[2]!
    periodStart = `${year}-${month}-01`
    // Calculate last day of month
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    periodEnd = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`
  } else {
    // Try to extract from content
    const periodMatch = text.match(/(\w+\s+\d{1,2},?\s+\d{4})\s*(?:to|through|-)\s*(\w+\s+\d{1,2},?\s+\d{4})/i)
    if (periodMatch) {
      periodStart = parseM1Date(periodMatch[1]!)
      periodEnd = parseM1Date(periodMatch[2]!)
    }
  }

  // Parse transactions from Activity section
  const transactions: M1StatementTransaction[] = []

  // Split text into lines and look for transaction patterns
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i]
    if (!currentLine) continue
    const line = currentLine.trim()

    // Look for date pattern at start of line (YYYY-MM-DD)
    const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) continue

    const date = dateMatch[1]!

    // Try to extract description and amount from same line or next line
    // Pattern: DATE DESCRIPTION AMOUNT
    // Amount may be negative (e.g., -$500.00) or positive ($500.00)

    let fullLine = line
    const nextLine = lines[i + 1]
    if (nextLine && !nextLine.match(/^\d{4}-\d{2}-\d{2}/)) {
      fullLine += ' ' + nextLine.trim()
    }

    // Extract amount (look for $X,XXX.XX pattern, optionally with minus)
    const amountMatch = fullLine.match(/(-?\$?[\d,]+\.\d{2})/)
    if (!amountMatch) continue

    const amountStr = amountMatch[1]!
    const amount = parseFloat(amountStr.replace(/[$,]/g, ''))

    // Extract description (everything between date and amount)
    const description = fullLine
      .replace(date, '')
      .replace(amountStr, '')
      .trim()
      .replace(/\s+/g, ' ')

    if (description) {
      transactions.push({
        date,
        description,
        amount,
        type: determineM1StatementTransactionType(description)
      })
    }
  }

  // Sort transactions by date
  transactions.sort((a, b) => a.date.localeCompare(b.date))

  return {
    filename,
    accountType,
    periodStart,
    periodEnd,
    beginningBalance,
    endingBalance,
    totalDeposits,
    totalWithdrawals,
    totalInterest,
    transactions
  }
}

/**
 * Find M1 Finance page in browser
 */
const findM1StatementsPage = async (browser: Browser): Promise<Page | null> => {
  const contexts = browser.contexts()

  for (const context of contexts) {
    const pages = context.pages()
    for (const page of pages) {
      const url = page.url()
      if (url.includes('dashboard.m1.com') || url.includes('m1.com')) {
        return page
      }
    }
  }

  return null
}

/**
 * GET /import/m1-statements/debug-text
 * Debug endpoint to see raw PDF text content.
 */
importRouter.get('/m1-statements/debug-text', async (req, res, next) => {
  const { filename } = req.query as { filename?: string }
  if (!filename) {
    return next(badRequest('filename is required'))
  }

  const filePath = join(M1_STATEMENTS_DIR, filename)
  const pdfBuffer = await readFile(filePath).catch(() => null)

  if (!pdfBuffer) {
    return next(badRequest(`File not found: ${filename}`))
  }

  const parser = new PDFParse({ data: pdfBuffer })
  const result = await parser.getText()
  await parser.destroy()

  // Check what we can match (M1 format: "Beginning Balance as of DATE \t$0.00")
  const text = result.text
  const beginningMatch = text.match(/beginning\s+balance(?:\s+as\s+of\s+\S+)?\s*[\t:]*\s*\$?([\d,.]+)/i)
  const endingMatch = text.match(/ending\s+balance(?:\s+as\s+of\s+\S+)?\s*[\t:]*\s*\$?([\d,.]+)/i)

  res.json({
    filename,
    textLength: text.length,
    firstChars: text.slice(0, 2000),
    beginningMatch: beginningMatch ? beginningMatch[0] : null,
    endingMatch: endingMatch ? endingMatch[0] : null
  })
})

/**
 * GET /import/m1-statements/list
 * Scrape the M1 statements page to get list of available PDFs.
 */
importRouter.get('/m1-statements/list', async (_req, res, next) => {
  const browser = await connectToBrowser().catch((err: Error) => {
    return next(badRequest(`Failed to connect to browser: ${err.message}`))
  })
  if (!browser) return

  const page = await findM1StatementsPage(browser)
  if (!page) {
    return next(badRequest('No M1 Finance page found. Please log in first.'))
  }

  // Navigate to statements page
  const statementsUrl = 'https://dashboard.m1.com/d/settings/documents/statements'
  if (!page.url().includes('documents/statements')) {
    const navResult = await page.goto(statementsUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      return next(badRequest(`Failed to navigate to statements: ${navResult.message}`))
    }
  }

  // Wait for statements to load
  await page.waitForTimeout(2000)

  // Get list of existing downloaded files
  await mkdir(M1_STATEMENTS_DIR, { recursive: true })
  const existingFiles: string[] = await readdir(M1_STATEMENTS_DIR).catch(() => [] as string[])

  // Extract statement info from the page
  // M1 has a year dropdown and then lists statements for that year
  const statements: M1StatementInfo[] = await page.evaluate(() => {
    const results: M1StatementInfo[] = []

    // Look for download links or statement rows
    const links = document.querySelectorAll('a[href*="statement"], a[download*="Statement"]')
    links.forEach(link => {
      const download = link.getAttribute('download') ?? ''
      const text = link.textContent?.trim() ?? ''

      // Try to extract account type and date from the link or text
      let accountType = 'unknown'
      if (download.toLowerCase().includes('save') || download.toLowerCase().includes('earn')) {
        accountType = 'earn'
      } else if (download.toLowerCase().includes('invest') || download.toLowerCase().includes('brokerage')) {
        accountType = 'invest'
      } else if (download.toLowerCase().includes('crypto')) {
        accountType = 'crypto'
      }

      // Extract month/year from download name or text
      const dateMatch = download.match(/(\d{4})-(\d{2})/) ?? text.match(/(\w+)\s+(\d{4})/)
      const monthYear = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : text

      results.push({
        filename: download || `${text.replace(/\s+/g, '-')}.pdf`,
        accountType,
        monthYear,
        downloaded: false
      })
    })

    return results
  })

  // Mark which are already downloaded
  statements.forEach(s => {
    s.downloaded = existingFiles.some(f => f.toLowerCase() === s.filename.toLowerCase())
    if (s.downloaded) {
      s.path = join(M1_STATEMENTS_DIR, s.filename)
    }
  })

  res.json({
    count: statements.length,
    statements,
    downloadDir: M1_STATEMENTS_DIR
  })
})

/**
 * GET /import/m1-statements/download-stream
 * Download M1 statement PDFs with SSE progress.
 */
importRouter.get('/m1-statements/download-stream', async (req, res) => {
  console.log('[M1 Statements] Download stream started')
  const { all, year, accountType } = req.query as { all?: string; year?: string; accountType?: string }
  console.log(`[M1 Statements] Params: all=${all}, year=${year}, accountType=${accountType}`)

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const sendEvent = (event: string, data: unknown) => {
    console.log(`[M1 Statements] Event: ${event}`, JSON.stringify(data))
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  console.log('[M1 Statements] Connecting to browser...')
  const browser = await connectToBrowser().catch((err: Error) => {
    console.log(`[M1 Statements] Browser connection failed: ${err.message}`)
    sendEvent('error', { message: `Failed to connect to browser: ${err.message}` })
    res.end()
    return null
  })
  if (!browser) return
  console.log('[M1 Statements] Browser connected')

  console.log('[M1 Statements] Finding M1 page...')
  const page = await findM1StatementsPage(browser)
  if (!page) {
    console.log('[M1 Statements] No M1 page found')
    sendEvent('error', { message: 'No M1 Finance page found. Please log in first.' })
    res.end()
    return
  }
  console.log(`[M1 Statements] Found M1 page: ${page.url()}`)

  sendEvent('status', { message: 'Navigating to statements page...', phase: 'navigating' })

  // Navigate to statements page
  const statementsUrl = 'https://dashboard.m1.com/d/settings/documents/statements'
  console.log(`[M1 Statements] Current URL: ${page.url()}`)

  if (!page.url().includes('documents/statements')) {
    console.log(`[M1 Statements] Navigating to ${statementsUrl}`)
    // Use 'load' instead of 'networkidle' to avoid timeout issues
    const navResult = await page.goto(statementsUrl, { waitUntil: 'load', timeout: 30000 }).catch((err: Error) => err)
    if (navResult instanceof Error) {
      console.log(`[M1 Statements] Navigation failed: ${navResult.message}`)
      sendEvent('error', { message: `Failed to navigate: ${navResult.message}` })
      res.end()
      return
    }
    console.log(`[M1 Statements] Navigation successful`)
  } else {
    console.log(`[M1 Statements] Already on statements page`)
  }

  // Wait for page content to load
  await page.waitForTimeout(3000)
  console.log(`[M1 Statements] Page loaded, current URL: ${page.url()}`)

  // Get list of existing downloaded files
  await mkdir(M1_STATEMENTS_DIR, { recursive: true })
  let existingFiles: string[] = await readdir(M1_STATEMENTS_DIR).catch(() => [] as string[])

  let totalDownloaded = 0
  let totalSkipped = 0
  let totalProcessed = 0

  // Helper to select a year using React Select dropdown
  const selectYear = async (targetYear: string): Promise<boolean> => {
    console.log(`[M1 Statements] Attempting to select year ${targetYear}`)

    // React Select dropdown - click on the control area to open
    // The control div has classes like "css-*-control"
    const dropdownSelectors = [
      'div[class*="-control"]',  // React Select control
      'input#year',              // Hidden input
      'label[for="year"]',       // Label
    ]

    let dropdownOpened = false

    for (const selector of dropdownSelectors) {
      const element = await page.$(selector).catch(() => null)
      if (element) {
        await element.click()
        await page.waitForTimeout(800)
        dropdownOpened = true
        console.log(`[M1 Statements] Clicked dropdown using selector: ${selector}`)
        break
      }
    }

    if (!dropdownOpened) {
      // Try clicking the span showing current year
      const currentYearSpan = await page.$('span:has-text("202")').catch(() => null)
      if (currentYearSpan) {
        await currentYearSpan.click()
        await page.waitForTimeout(800)
        dropdownOpened = true
        console.log(`[M1 Statements] Clicked year span`)
      }
    }

    // Wait for dropdown menu to appear
    await page.waitForTimeout(500)

    // Find and click the target year option
    // React Select options have classes like "css-*-option"
    const optionSelectors = [
      `div[class*="-option"]:has-text("${targetYear}")`,
      `div[class*="option"]:has-text("${targetYear}")`,
      `[role="option"]:has-text("${targetYear}")`,
    ]

    for (const selector of optionSelectors) {
      const option = await page.$(selector).catch(() => null)
      if (option) {
        await option.click()
        await page.waitForTimeout(1500) // Wait for table to update
        console.log(`[M1 Statements] Selected year ${targetYear} using selector: ${selector}`)
        return true
      }
    }

    // Fallback: Use keyboard navigation
    // Clear any existing input first, then type the year to filter options
    console.log(`[M1 Statements] Trying keyboard input for year ${targetYear}`)
    // Select all and clear any existing text (Meta for macOS, Control for others)
    await page.keyboard.press('Meta+a')
    await page.waitForTimeout(100)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(100)
    await page.keyboard.type(targetYear)
    await page.waitForTimeout(500)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    // Check if year changed by looking at the displayed value
    const displayedYear = await page.evaluate(() => {
      const yearSpan = document.querySelector('div[class*="-control"] span')
      return yearSpan?.textContent?.trim() ?? ''
    })

    console.log(`[M1 Statements] Displayed year after selection: ${displayedYear}`)
    return displayedYear === targetYear
  }

  // Get available years from dropdown
  const getAvailableYears = async (): Promise<string[]> => {
    console.log(`[M1 Statements] Getting available years from dropdown`)

    // Click to open dropdown
    const dropdownSelectors = [
      'div[class*="-control"]',
      'input#year',
      'label[for="year"]',
    ]

    for (const selector of dropdownSelectors) {
      const element = await page.$(selector).catch(() => null)
      if (element) {
        await element.click()
        await page.waitForTimeout(800)
        console.log(`[M1 Statements] Opened dropdown using: ${selector}`)
        break
      }
    }

    // Wait for menu to appear
    await page.waitForTimeout(500)

    // Get all year options from the dropdown menu
    const years = await page.evaluate(() => {
      const yearList: string[] = []
      // React Select options
      const options = document.querySelectorAll('div[class*="-option"], div[class*="option"], [role="option"]')
      options.forEach(opt => {
        const text = opt.textContent?.trim()
        if (text && /^\d{4}$/.test(text)) {
          yearList.push(text)
        }
      })
      return yearList
    })

    console.log(`[M1 Statements] Found years in dropdown: ${years.join(', ')}`)

    // Close dropdown by pressing Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    return years
  }

  // Get years to process
  sendEvent('status', { message: 'Finding available years...', phase: 'scanning' })
  let yearsToProcess = await getAvailableYears()

  // If no years found from dropdown, try generating a range
  if (yearsToProcess.length === 0) {
    const currentYear = new Date().getFullYear()
    yearsToProcess = Array.from({ length: 10 }, (_, i) => String(currentYear - i))
    sendEvent('status', { message: `Using default year range: ${currentYear} to ${currentYear - 9}`, phase: 'scanning' })
  } else {
    sendEvent('status', { message: `Found ${yearsToProcess.length} years to scan`, phase: 'scanning' })
  }

  // Sort years descending (newest first)
  yearsToProcess.sort((a, b) => parseInt(b) - parseInt(a))

  // If specific year requested, only process that year
  if (year) {
    yearsToProcess = yearsToProcess.filter(y => y === year)
    if (yearsToProcess.length === 0) {
      yearsToProcess = [year]
    }
  }

  // Process each year
  for (const currentYear of yearsToProcess) {
    sendEvent('status', { message: `Processing year ${currentYear}...`, phase: 'downloading', year: currentYear })

    // Select the year
    const selected = await selectYear(currentYear)
    if (!selected) {
      sendEvent('status', { message: `Could not select year ${currentYear}, skipping...`, phase: 'downloading' })
      continue
    }

    await page.waitForTimeout(1000)

    // Click "Load more" button repeatedly until all statements are loaded
    let loadMoreClicks = 0
    const maxLoadMoreClicks = 20 // Safety limit
    while (loadMoreClicks < maxLoadMoreClicks) {
      const loadMoreBtn = await page.$('button:has(span:text("Load more")), button:has-text("Load more")').catch(() => null)
      if (!loadMoreBtn) {
        break
      }
      console.log(`[M1 Statements] Clicking "Load more" button (click ${loadMoreClicks + 1})`)
      await loadMoreBtn.click()
      await page.waitForTimeout(1500) // Wait for more statements to load
      loadMoreClicks++
    }
    if (loadMoreClicks > 0) {
      console.log(`[M1 Statements] Clicked "Load more" ${loadMoreClicks} times for year ${currentYear}`)
      sendEvent('status', { message: `Loaded all statements for ${currentYear} (${loadMoreClicks} pages)`, phase: 'downloading', year: currentYear })
    }

    // Check if there are any statements (look for "No documents" message)
    const noDocsMessage = await page.$('td:has-text("No documents")').catch(() => null)
    if (noDocsMessage) {
      sendEvent('status', { message: `No statements for ${currentYear}`, phase: 'downloading', year: currentYear })
      continue
    }

    // Find all table rows with statements
    const tableRows = await page.$$('tbody tr').catch(() => [])
    console.log(`[M1 Statements] Found ${tableRows.length} table rows for ${currentYear}`)

    // Collect all PDF URLs first by intercepting requests
    const pdfUrls: Array<{ url: string; filename: string; rowText: string }> = []

    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i]!
      const rowText = await row.textContent().catch(() => '') ?? ''
      console.log(`[M1 Statements] Row ${i + 1} text: "${rowText.substring(0, 100)}"`)

      // Skip rows that say "No documents"
      if (rowText.includes('No documents')) {
        console.log(`[M1 Statements] Skipping row ${i + 1} - No documents`)
        continue
      }

      // Filter by account type if specified
      if (accountType) {
        const rowLower = rowText.toLowerCase()
        const typeMatches =
          (accountType === 'earn' && (rowLower.includes('earn') || rowLower.includes('save') || rowLower.includes('hysa'))) ||
          (accountType === 'invest' && (rowLower.includes('invest') || rowLower.includes('individual') || rowLower.includes('brokerage'))) ||
          (accountType === 'crypto' && rowLower.includes('crypto'))
        if (!typeMatches) {
          console.log(`[M1 Statements] Skipping row ${i + 1} - doesn't match accountType ${accountType}`)
          totalSkipped++
          continue
        }
      }

      // Generate filename from row content
      const monthMatch = rowText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)
      const accountMatch = rowText.match(/(Save|Earn|Invest|Crypto|Individual|Brokerage)/i)
      // Convert month name to number (01-12)
      const monthNames: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      }
      const month = monthMatch?.[1] ? (monthNames[monthMatch[1].toLowerCase()] ?? `row${i + 1}`) : `row${i + 1}`
      const account = accountMatch ? accountMatch[1] : 'Statement'
      const filename = `M1-${account}-${currentYear}-${month}.pdf`

      // Check if already downloaded
      if (all !== 'true' && existingFiles.some(f => f.toLowerCase().includes(filename.toLowerCase().replace('.pdf', '')))) {
        console.log(`[M1 Statements] Skipping row ${i + 1} - already downloaded: ${filename}`)
        totalSkipped++
        totalProcessed++
        sendEvent('progress', {
          current: totalProcessed,
          total: totalProcessed + tableRows.length - i,
          downloaded: totalDownloaded,
          skipped: totalSkipped,
          filename,
          status: 'skipped',
          year: currentYear
        })
        continue
      }

      // Try to find button or link in this row
      const clickable = await row.$('button, a').catch(() => null)
      if (!clickable) {
        console.log(`[M1 Statements] No clickable element in row ${i + 1}`)
        continue
      }

      // Get href if it's a link
      const href = await clickable.getAttribute('href').catch(() => null)
      console.log(`[M1 Statements] Row ${i + 1} href: ${href}`)

      // Accept any valid URL - M1 uses external document providers like apexclearing.com
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        // Direct link - we can fetch it
        pdfUrls.push({ url: href, filename, rowText })
        console.log(`[M1 Statements] Found direct URL: ${href.substring(0, 80)}...`)
      } else if (href && href.startsWith('/')) {
        // Relative URL
        const fullUrl = `https://dashboard.m1.com${href}`
        pdfUrls.push({ url: fullUrl, filename, rowText })
        console.log(`[M1 Statements] Found relative URL: ${fullUrl}`)
      } else {
        // Need to click and intercept the new tab/request
        console.log(`[M1 Statements] Clicking row ${i + 1} to get PDF URL...`)

        // Set up request interception to capture PDF URL
        let capturedPdfUrl: string | null = null
        const requestHandler = (request: { url: () => string }) => {
          const url = request.url()
          if (url.includes('.pdf') || url.includes('/documents/') || url.includes('/statement')) {
            capturedPdfUrl = url
            console.log(`[M1 Statements] Captured PDF request: ${url}`)
          }
        }
        page.on('request', requestHandler)

        // Listen for new page (popup)
        const context = page.context()
        const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null)

        await clickable.click()
        await page.waitForTimeout(2000)

        // Check if we got a popup
        const popup = await popupPromise
        if (popup) {
          const popupUrl = popup.url()
          console.log(`[M1 Statements] Popup opened: ${popupUrl}`)

          // Wait for it to load
          await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
          const finalUrl = popup.url()
          console.log(`[M1 Statements] Popup final URL: ${finalUrl}`)

          if (finalUrl && finalUrl !== 'about:blank') {
            pdfUrls.push({ url: finalUrl, filename, rowText })
          }

          // Close the popup
          await popup.close().catch(() => {})
        } else if (capturedPdfUrl) {
          pdfUrls.push({ url: capturedPdfUrl, filename, rowText })
        }

        page.off('request', requestHandler)
      }
    }

    console.log(`[M1 Statements] Collected ${pdfUrls.length} PDF URLs for ${currentYear}`)
    sendEvent('status', { message: `Found ${pdfUrls.length} statements for ${currentYear}`, phase: 'downloading' })

    // Now download all the PDFs
    for (const { url, filename } of pdfUrls) {
      console.log(`[M1 Statements] Downloading: ${url} -> ${filename}`)

      const filePath = join(M1_STATEMENTS_DIR, filename)

      // Use fetch with the page's cookies
      const cookies = await page.context().cookies()
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')

      const response = await fetch(url, {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }).catch(err => {
        console.log(`[M1 Statements] Fetch error: ${err}`)
        return null
      })

      if (response && response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        await writeFile(filePath, buffer)
        console.log(`[M1 Statements] Saved: ${filePath} (${buffer.length} bytes)`)
        totalDownloaded++
        existingFiles.push(filename)
        sendEvent('progress', {
          current: totalProcessed + 1,
          total: totalProcessed + pdfUrls.length,
          downloaded: totalDownloaded,
          skipped: totalSkipped,
          filename,
          status: 'downloaded',
          year: currentYear
        })
      } else {
        console.log(`[M1 Statements] Failed to download: ${url} - ${response?.status}`)
        totalSkipped++
      }

      totalProcessed++
      await page.waitForTimeout(500)
    }
  }

  sendEvent('complete', {
    total: totalProcessed,
    downloaded: totalDownloaded,
    skipped: totalSkipped,
    message: `Downloaded ${totalDownloaded} statements across ${yearsToProcess.length} years, skipped ${totalSkipped}`
  })

  res.end()
})

/**
 * GET /import/m1-statements/local
 * List locally stored M1 statement PDFs.
 */
importRouter.get('/m1-statements/local', async (_req, res) => {
  await mkdir(M1_STATEMENTS_DIR, { recursive: true })
  const files = await readdir(M1_STATEMENTS_DIR).catch(() => [])

  const statements = files
    .filter(f => f.endsWith('.pdf'))
    .map(filename => {
      // Parse account type from filename
      const fnLower = filename.toLowerCase()
      let accountType = 'unknown'
      if (fnLower.includes('earn') || fnLower.includes('save')) {
        accountType = 'earn'
      } else if (fnLower.includes('invest')) {
        accountType = 'invest'
      } else if (fnLower.includes('crypto')) {
        accountType = 'crypto'
      }

      // Parse month/year from filename
      const dateMatch = filename.match(/(\d{4})-(\d{2})/)
      const monthYear = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : filename

      return {
        filename,
        accountType,
        monthYear,
        downloaded: true,
        path: join(M1_STATEMENTS_DIR, filename)
      }
    })
    .sort((a, b) => b.monthYear.localeCompare(a.monthYear))

  res.json({
    count: statements.length,
    statements,
    directory: M1_STATEMENTS_DIR
  })
})

/**
 * POST /import/m1-statements/parse
 * Parse a single M1 statement PDF.
 */
importRouter.post('/m1-statements/parse', async (req, res, next) => {
  const { filename } = req.body as { filename?: string }

  if (!filename) {
    return next(badRequest('filename is required'))
  }

  const filePath = join(M1_STATEMENTS_DIR, filename)
  const pdfBuffer = await readFile(filePath).catch(() => null)

  if (!pdfBuffer) {
    return next(badRequest(`File not found: ${filename}`))
  }

  const result = await parseM1StatementPDF(pdfBuffer, filename).catch((err: Error) => {
    return next(badRequest(`Failed to parse PDF: ${err.message}`))
  })

  if (!result) return

  res.json(result)
})

/**
 * POST /import/m1-statements/parse-all
 * Parse all local M1 statement PDFs and return combined transactions.
 */
importRouter.post('/m1-statements/parse-all', async (req, res) => {
  const { accountType } = req.body as { accountType?: string }

  await mkdir(M1_STATEMENTS_DIR, { recursive: true })
  const files = await readdir(M1_STATEMENTS_DIR).catch(() => [])
  let pdfFiles = files.filter(f => f.endsWith('.pdf'))

  // Filter by account type if specified
  if (accountType) {
    pdfFiles = pdfFiles.filter(f => {
      const fnLower = f.toLowerCase()
      return (accountType === 'earn' && (fnLower.includes('earn') || fnLower.includes('save'))) ||
             (accountType === 'invest' && fnLower.includes('invest')) ||
             (accountType === 'crypto' && fnLower.includes('crypto'))
    })
  }

  const allTransactions: M1StatementTransaction[] = []
  const statements: M1StatementData[] = []
  const errors: string[] = []

  for (const filename of pdfFiles) {
    const filePath = join(M1_STATEMENTS_DIR, filename)
    const pdfBuffer = await readFile(filePath).catch(() => null)

    if (!pdfBuffer) {
      errors.push(`Failed to read ${filename}`)
      continue
    }

    const result = await parseM1StatementPDF(pdfBuffer, filename).catch((err: Error) => {
      errors.push(`Failed to parse ${filename}: ${err.message}`)
      return null
    })

    if (result) {
      statements.push(result)
      allTransactions.push(...result.transactions)
    }
  }

  // Sort all transactions by date
  allTransactions.sort((a, b) => a.date.localeCompare(b.date))

  // Aggregate by type
  const byType: Record<string, { count: number; total: number }> = {}
  for (const tx of allTransactions) {
    if (!byType[tx.type]) {
      byType[tx.type] = { count: 0, total: 0 }
    }
    byType[tx.type]!.count++
    byType[tx.type]!.total += tx.amount
  }

  // Sort statements by period start for continuity checking
  statements.sort((a, b) => a.periodStart.localeCompare(b.periodStart))

  res.json({
    statementCount: statements.length,
    transactionCount: allTransactions.length,
    transactions: allTransactions,
    statements: statements.map(s => ({
      filename: s.filename,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      beginningBalance: s.beginningBalance,
      endingBalance: s.endingBalance,
      totalDeposits: s.totalDeposits,
      totalWithdrawals: s.totalWithdrawals,
      totalInterest: s.totalInterest,
      transactionCount: s.transactions.length
    })),
    byType,
    dateRange: allTransactions.length > 0 ? {
      oldest: allTransactions[0]!.date,
      newest: allTransactions[allTransactions.length - 1]!.date
    } : null,
    errors: errors.length > 0 ? errors : undefined
  })
})

/**
 * POST /import/m1-statements/apply
 * Apply parsed M1 statement transactions to the m1-cash fund.
 */
importRouter.post('/m1-statements/apply', async (req, res, next) => {
  const { transactions } = req.body as {
    transactions: M1StatementTransaction[]
  }

  if (!transactions || !Array.isArray(transactions)) {
    return next(badRequest('transactions array is required'))
  }

  // Read m1-cash fund
  const allFunds = await readAllFunds(FUNDS_DIR).catch(() => [] as FundData[])
  const fund = allFunds.find(f => f.id === 'm1-cash')

  if (!fund) {
    return next(badRequest('m1-cash fund not found. Please create it first.'))
  }

  // Group transactions by date and consolidate
  const byDate = new Map<string, {
    deposits: number
    withdrawals: number
    interest: number
    fees: number
    notes: string[]
  }>()

  for (const tx of transactions) {
    let day = byDate.get(tx.date)
    if (!day) {
      day = { deposits: 0, withdrawals: 0, interest: 0, fees: 0, notes: [] }
      byDate.set(tx.date, day)
    }

    if (tx.type === 'interest') {
      day.interest += tx.amount
    } else if (tx.type === 'deposit') {
      day.deposits += tx.amount
    } else if (tx.type === 'withdrawal') {
      day.withdrawals += Math.abs(tx.amount)
    } else if (tx.type === 'fee') {
      day.fees += Math.abs(tx.amount)
    } else if (tx.type === 'transfer') {
      if (tx.amount > 0) {
        day.deposits += tx.amount
      } else {
        day.withdrawals += Math.abs(tx.amount)
      }
    }
    day.notes.push(tx.description)
  }

  // Sort dates chronologically
  const sortedDates = Array.from(byDate.keys()).sort()

  let applied = 0
  const errors: string[] = []
  let runningBalance = 0

  for (const date of sortedDates) {
    const day = byDate.get(date)!
    const netFlow = day.deposits - day.withdrawals + day.interest - day.fees

    // value = equity at START of day (before transaction)
    // cash = equity at END of day (after transaction)
    const startBalance = runningBalance
    runningBalance += netFlow
    const endBalance = runningBalance

    // Create single consolidated entry for this day
    const entry: FundEntry = {
      date,
      value: startBalance,   // Equity Start (before action)
      cash: endBalance,      // Equity End (after action)
      notes: day.notes.join('; ')
    }

    // Set action based on primary activity
    if (day.deposits > 0 && day.withdrawals === 0) {
      entry.action = 'DEPOSIT'
      entry.amount = day.deposits
    } else if (day.withdrawals > 0 && day.deposits === 0) {
      entry.action = 'WITHDRAW'
      entry.amount = day.withdrawals
    } else if (day.deposits > day.withdrawals) {
      // Net deposit
      entry.action = 'DEPOSIT'
      entry.amount = day.deposits - day.withdrawals
    } else if (day.withdrawals > day.deposits) {
      // Net withdrawal
      entry.action = 'WITHDRAW'
      entry.amount = day.withdrawals - day.deposits
    } else {
      // Only interest/fees or balanced deposits/withdrawals
      entry.action = 'HOLD'
    }

    // Always include interest and fees if present
    if (day.interest > 0) {
      entry.cash_interest = day.interest
    }
    if (day.fees > 0) {
      entry.expense = day.fees
    }

    // Append entry
    const fundPath = join(FUNDS_DIR, 'm1-cash.tsv')
    const appendResult = await appendEntry(fundPath, entry).catch((err: Error) => {
      errors.push(`Failed to add entry for ${date}: ${err.message}`)
      return false
    })

    if (appendResult !== false) {
      applied++
    }
  }

  res.json({
    result: {
      applied,
      skipped: 0,
      originalTransactions: transactions.length,
      consolidatedEntries: applied,
      errors
    }
  })
})
