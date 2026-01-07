import { fetchJson, postJson, API_BASE } from './utils'
import type { ApiResult } from './utils'

export interface ParsedTransaction {
  date: string
  action: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' | 'DIVIDEND' | 'INTEREST' | 'STOCK_LENDING' | 'FEE' | 'TRANSFER' | 'SPLIT' | 'MERGER' | 'OPTION' | 'CRYPTO' | 'REINVEST' | 'ADJUSTMENT' | 'OTHER'
  symbol: string
  quantity: number
  price: number
  amount: number
  description: string
  fundId: string | null
  fundExists: boolean
  rawDetails?: Record<string, string>
}

export interface ImportPreview {
  transactions: ParsedTransaction[]
  summary: {
    total: number
    matched: number
    unmatched: number
    bySymbol: Record<string, { count: number; fundId: string | null; fundExists: boolean }>
    symbol?: string
    note?: string
    newCount?: number
    existingCount?: number
    archiveUpdated?: string
  }
}

// SSE event types for streaming scrape
export interface ScrapeStatusEvent {
  message: string
  phase: 'navigating' | 'loading' | 'scraping'
  existingCount?: number
}

export interface ScrapeProgressEvent {
  current: number
  total: number
  newCount: number
  lastTransaction: {
    date: string
    type: string
    symbol?: string
    amount: number
    title: string
  } | null
}

export interface ScrapeCompleteEvent {
  totalScraped: number
  newCount: number
  archiveTotal: number
  message: string
}

export interface ScrapeErrorEvent {
  message: string
}

export type ScrapeEvent =
  | { type: 'status'; data: ScrapeStatusEvent }
  | { type: 'progress'; data: ScrapeProgressEvent }
  | { type: 'complete'; data: ScrapeCompleteEvent }
  | { type: 'error'; data: ScrapeErrorEvent }

export interface ScrapeArchive {
  platform: string
  createdAt: string
  updatedAt: string
  transactionCount: number
  summary?: {
    totalAmount: number
    unknownCount: number
    dateRange: { oldest: string; newest: string }
    byType: Record<string, number>
    bySymbol: Record<string, {
      count: number
      types: string[]
      totalAmount: number
      fundId: string
      fundExists: boolean
      ticker?: string
    }>
    byYear: Record<string, number>
  }
  transactions: Array<{
    id: string
    date: string
    type: string
    title: string
    amount: number
    symbol?: string
    shares?: number
    pricePerShare?: number
    details?: Record<string, string>
    rawText?: string
  }>
}

export interface ImportResult {
  applied: number
  skipped: number
  errors: string[]
}

export interface BrowserStatus {
  connected: boolean
  launched?: boolean
  cdpUrl?: string
  instructions?: string
  message?: string
  pageCount?: number
  pages?: Array<{ url: string; title: string }>
  platform?: string | null
  pageFound?: boolean
  loggedIn?: boolean
  loginUrl?: string
}

/**
 * Preview Robinhood CSV import without applying changes.
 * Returns parsed transactions with fund mappings.
 *
 * @param includeCashImpact - When true, generates CASH entries for all cash-affecting
 *   transactions (BUY→WITHDRAW, SELL→DEPOSIT, DIVIDEND→DEPOSIT, etc.)
 */
export async function previewRobinhoodImport(
  csvContent: string,
  platform = 'robinhood',
  includeCashImpact = false
): Promise<ApiResult<ImportPreview>> {
  return postJson<ImportPreview>(
    `${API_BASE}/import/robinhood/preview`,
    { csvContent, platform, includeCashImpact },
    'Failed to parse CSV'
  )
}

/**
 * Apply imported transactions to existing funds.
 */
export async function applyRobinhoodImport(
  transactions: ParsedTransaction[],
  skipUnmatched = true,
  clearBeforeImport = false
): Promise<ApiResult<ImportResult>> {
  const result = await postJson<{ result: ImportResult }>(
    `${API_BASE}/import/robinhood/apply`,
    { transactions, skipUnmatched, clearBeforeImport },
    'Failed to apply import'
  )
  if (result.data) return { data: result.data.result }
  return { error: result.error ?? 'Failed to apply import' }
}

/**
 * Apply M1 cash transactions (interest, deposit, withdrawal) to the m1-cash fund.
 */
export async function applyM1CashImport(
  transactions: ParsedTransaction[],
  skipDuplicates = true
): Promise<ApiResult<ImportResult>> {
  const result = await postJson<{ result: ImportResult }>(
    `${API_BASE}/import/m1-cash/apply`,
    { transactions, skipDuplicates },
    'Failed to apply import'
  )
  if (result.data) return { data: result.data.result }
  return { error: result.error ?? 'Failed to apply import' }
}

/**
 * Read file contents as text.
 */
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

// ============================================================================
// Browser Scraping API
// ============================================================================

/**
 * Check browser connection status.
 * @param platform Optional platform to check login status for (m1, robinhood)
 */
export async function getBrowserStatus(platform?: string): Promise<ApiResult<BrowserStatus>> {
  const url = platform
    ? `${API_BASE}/import/browser/status?platform=${encodeURIComponent(platform)}`
    : `${API_BASE}/import/browser/status`
  return fetchJson<BrowserStatus>(url, undefined, 'Failed to check browser status')
}

/**
 * Navigate browser to a URL and check login status.
 */
export async function navigateBrowser(url: string, platform?: string): Promise<ApiResult<{ success: boolean; currentUrl: string; isLoggedIn: boolean }>> {
  return postJson<{ success: boolean; currentUrl: string; isLoggedIn: boolean }>(
    `${API_BASE}/import/browser/navigate`,
    { url, platform },
    'Failed to navigate'
  )
}

/**
 * Launch Chrome browser with remote debugging.
 * @param platform Optional platform to navigate to (robinhood, m1, etc.)
 */
export async function launchBrowser(platform?: string): Promise<ApiResult<{ success: boolean; message: string; alreadyRunning: boolean }>> {
  return postJson<{ success: boolean; message: string; alreadyRunning: boolean }>(
    `${API_BASE}/import/browser/launch`,
    { platform },
    'Failed to launch browser'
  )
}

/**
 * Kill the launched Chrome browser.
 */
export async function killBrowser(): Promise<ApiResult<{ success: boolean; message: string }>> {
  return postJson<{ success: boolean; message: string }>(
    `${API_BASE}/import/browser/kill`,
    {},
    'Failed to kill browser'
  )
}

/**
 * Connect to browser via CDP.
 */
export async function connectBrowser(cdpUrl?: string): Promise<ApiResult<{ success: boolean; message: string; pages: number }>> {
  return postJson<{ success: boolean; message: string; pages: number }>(
    `${API_BASE}/import/browser/connect`,
    { cdpUrl },
    'Failed to connect to browser'
  )
}

/**
 * Scrape transaction history from a Robinhood URL.
 */
export async function scrapeRobinhoodHistory(
  url: string,
  platform = 'robinhood'
): Promise<ApiResult<ImportPreview>> {
  return postJson<ImportPreview>(
    `${API_BASE}/import/robinhood/scrape`,
    { url, platform },
    'Failed to scrape page'
  )
}

/**
 * Disconnect from browser.
 */
export async function disconnectBrowser(): Promise<ApiResult<{ success: boolean; message: string }>> {
  return postJson<{ success: boolean; message: string }>(
    `${API_BASE}/import/browser/disconnect`,
    {},
    'Failed to disconnect'
  )
}

/**
 * Get existing scrape archive for a platform.
 * @param full - If true, returns all transactions. Otherwise returns first 50.
 */
export async function getScrapeArchive(platform = 'robinhood', full = false): Promise<ApiResult<ScrapeArchive>> {
  return fetchJson<ScrapeArchive>(
    `${API_BASE}/import/archive/${platform}${full ? '?full=true' : ''}`,
    undefined,
    'Failed to fetch archive'
  )
}

/**
 * Re-classify existing archive transactions using updated type detection.
 */
export async function reclassifyArchive(platform = 'robinhood'): Promise<ApiResult<{
  platform: string
  total: number
  reclassified: number
  changes: Array<{ id: string; oldType: string; newType: string; title: string }>
}>> {
  return postJson<{
    platform: string
    total: number
    reclassified: number
    changes: Array<{ id: string; oldType: string; newType: string; title: string }>
  }>(
    `${API_BASE}/import/archive/${platform}/reclassify`,
    {},
    'Failed to reclassify'
  )
}

/**
 * Scrape Robinhood history with real-time progress via SSE.
 * Returns an EventSource that emits ScrapeEvent objects.
 */
export function scrapeRobinhoodHistoryStream(
  url: string,
  platform = 'robinhood',
  callbacks: {
    onStatus?: (data: ScrapeStatusEvent) => void
    onProgress?: (data: ScrapeProgressEvent) => void
    onComplete?: (data: ScrapeCompleteEvent) => void
    onError?: (data: ScrapeErrorEvent) => void
  }
): { close: () => void } {
  const encodedUrl = encodeURIComponent(url)
  const eventSource = new EventSource(
    `${API_BASE}/import/robinhood/scrape-stream?url=${encodedUrl}&platform=${platform}`
  )

  eventSource.addEventListener('status', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ScrapeStatusEvent
    callbacks.onStatus?.(data)
  })

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ScrapeProgressEvent
    callbacks.onProgress?.(data)
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ScrapeCompleteEvent
    callbacks.onComplete?.(data)
    eventSource.close()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    if (e.data) {
      const data = JSON.parse(e.data) as ScrapeErrorEvent
      callbacks.onError?.(data)
    } else {
      callbacks.onError?.({ message: 'Connection lost' })
    }
    eventSource.close()
  })

  // Handle connection errors
  eventSource.onerror = () => {
    callbacks.onError?.({ message: 'Connection error' })
    eventSource.close()
  }

  return {
    close: () => eventSource.close()
  }
}

/**
 * Scrape M1 Cash history with real-time progress via SSE.
 * Returns an EventSource that emits ScrapeEvent objects.
 */
export function scrapeM1CashHistoryStream(
  url: string = 'https://dashboard.m1.com/d/save/savings/transactions',
  platform = 'm1-cash',
  callbacks: {
    onStatus?: (data: ScrapeStatusEvent) => void
    onProgress?: (data: ScrapeProgressEvent) => void
    onComplete?: (data: ScrapeCompleteEvent) => void
    onError?: (data: ScrapeErrorEvent) => void
  }
): { close: () => void } {
  const encodedUrl = encodeURIComponent(url)
  const eventSource = new EventSource(
    `${API_BASE}/import/m1-cash/scrape-stream?url=${encodedUrl}&platform=${platform}`
  )

  eventSource.addEventListener('status', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ScrapeStatusEvent
    callbacks.onStatus?.(data)
  })

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ScrapeProgressEvent
    callbacks.onProgress?.(data)
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as ScrapeCompleteEvent
    callbacks.onComplete?.(data)
    eventSource.close()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    if (e.data) {
      const data = JSON.parse(e.data) as ScrapeErrorEvent
      callbacks.onError?.(data)
    } else {
      callbacks.onError?.({ message: 'Connection lost' })
    }
    eventSource.close()
  })

  // Handle connection errors
  eventSource.onerror = () => {
    callbacks.onError?.({ message: 'Connection error' })
    eventSource.close()
  }

  return {
    close: () => eventSource.close()
  }
}

// ============================================================================
// Crypto Statement PDF API
// ============================================================================

export interface CryptoTransaction {
  date: string  // YYYY-MM-DD
  type: 'buy' | 'sell' | 'transfer' | 'interest' | 'staking' | 'other'
  symbol: string  // BTC, ETH, etc.
  quantity: number
  price: number  // Price per unit in USD
  value: number  // Total USD value
  rawText?: string  // Original text for debugging
}

export interface CryptoHolding {
  name: string
  symbol: string
  quantity: number
  marketValue: number
  portfolioPercent: number
}

export interface CryptoStatementData {
  filename: string
  periodStart: string
  periodEnd: string
  openingBalance: number
  closingBalance: number
  holdings: CryptoHolding[]
  transactions: CryptoTransaction[]
}

export interface CryptoStatementInfo {
  filename: string
  monthYear: string
  downloadUrl?: string
  downloaded: boolean
  path?: string
}

export interface CryptoStatementsResponse {
  count: number
  statements: CryptoStatementInfo[]
  downloadDir?: string
  directory?: string
}

export interface CryptoParseAllResponse {
  statementCount: number
  transactionCount: number
  holdings: CryptoHolding[]
  transactions: CryptoTransaction[]
  bySymbol: Record<string, {
    buys: number
    sells: number
    totalBought: number
    totalSold: number
    totalSpent: number
    totalReceived: number
  }>
  errors?: string[]
}

/**
 * Get list of available crypto statements from Robinhood.
 * Requires browser to be connected.
 */
export async function getCryptoStatements(): Promise<ApiResult<CryptoStatementsResponse>> {
  return fetchJson<CryptoStatementsResponse>(
    `${API_BASE}/import/crypto/statements`,
    undefined,
    'Failed to get crypto statements'
  )
}

/**
 * Get list of locally downloaded crypto statement PDFs.
 */
export async function getLocalCryptoStatements(): Promise<ApiResult<CryptoStatementsResponse>> {
  return fetchJson<CryptoStatementsResponse>(
    `${API_BASE}/import/crypto/local-statements`,
    undefined,
    'Failed to get local statements'
  )
}

/**
 * Parse a single crypto statement PDF.
 */
export async function parseCryptoStatement(filename: string): Promise<ApiResult<CryptoStatementData>> {
  return postJson<CryptoStatementData>(
    `${API_BASE}/import/crypto/parse`,
    { filename },
    'Failed to parse PDF'
  )
}

/**
 * Parse all local crypto statement PDFs and return combined results.
 */
export async function parseAllCryptoStatements(): Promise<ApiResult<CryptoParseAllResponse>> {
  return postJson<CryptoParseAllResponse>(
    `${API_BASE}/import/crypto/parse-all`,
    {},
    'Failed to parse PDFs'
  )
}

/**
 * Download crypto statements from Robinhood with real-time progress via SSE.
 */
export function downloadCryptoStatementsStream(
  downloadAll = false,
  callbacks: {
    onStatus?: (data: { message: string; phase: string; total?: number }) => void
    onProgress?: (data: { current: number; total: number; downloaded: number; skipped: number; filename: string; status: string }) => void
    onComplete?: (data: { total: number; downloaded: number; skipped: number; message: string }) => void
    onError?: (data: { message: string }) => void
  }
): { close: () => void } {
  const eventSource = new EventSource(
    `${API_BASE}/import/crypto/download-stream?all=${downloadAll}`
  )

  eventSource.addEventListener('status', (e: MessageEvent) => {
    const data = JSON.parse(e.data)
    callbacks.onStatus?.(data)
  })

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    const data = JSON.parse(e.data)
    callbacks.onProgress?.(data)
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data)
    callbacks.onComplete?.(data)
    eventSource.close()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    if (e.data) {
      const data = JSON.parse(e.data)
      callbacks.onError?.(data)
    } else {
      callbacks.onError?.({ message: 'Connection lost' })
    }
    eventSource.close()
  })

  eventSource.onerror = () => {
    callbacks.onError?.({ message: 'Connection error' })
    eventSource.close()
  }

  return {
    close: () => eventSource.close()
  }
}

// ============================================================================
// M1 Statement PDF API
// ============================================================================

export interface M1StatementTransaction {
  date: string
  description: string
  amount: number
  type: 'interest' | 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'other'
}

export interface M1StatementData {
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

export interface M1StatementInfo {
  filename: string
  accountType: string
  monthYear: string
  downloaded: boolean
  path?: string
}

export interface M1StatementsListResponse {
  count: number
  statements: M1StatementInfo[]
  downloadDir?: string
  directory?: string
}

export interface M1StatementsParseAllResponse {
  statementCount: number
  transactionCount: number
  transactions: M1StatementTransaction[]
  byType: Record<string, { count: number; total: number }>
  dateRange: { oldest: string; newest: string } | null
  errors?: string[]
}

/**
 * Get list of M1 statements from browser page.
 * Requires browser to be connected and logged into M1.
 */
export async function getM1StatementsList(): Promise<ApiResult<M1StatementsListResponse>> {
  return fetchJson<M1StatementsListResponse>(
    `${API_BASE}/import/m1-statements/list`,
    undefined,
    'Failed to get M1 statements'
  )
}

/**
 * Get list of locally downloaded M1 statement PDFs.
 */
export async function getLocalM1Statements(): Promise<ApiResult<M1StatementsListResponse>> {
  return fetchJson<M1StatementsListResponse>(
    `${API_BASE}/import/m1-statements/local`,
    undefined,
    'Failed to get local statements'
  )
}

/**
 * Parse a single M1 statement PDF.
 */
export async function parseM1Statement(filename: string): Promise<ApiResult<M1StatementData>> {
  return postJson<M1StatementData>(
    `${API_BASE}/import/m1-statements/parse`,
    { filename },
    'Failed to parse PDF'
  )
}

/**
 * Parse all local M1 statement PDFs.
 */
export async function parseAllM1Statements(accountType?: string): Promise<ApiResult<M1StatementsParseAllResponse>> {
  return postJson<M1StatementsParseAllResponse>(
    `${API_BASE}/import/m1-statements/parse-all`,
    { accountType },
    'Failed to parse PDFs'
  )
}

/**
 * Apply parsed M1 statement transactions to m1-cash fund.
 */
export async function applyM1StatementTransactions(
  transactions: M1StatementTransaction[],
  skipDuplicates = true
): Promise<ApiResult<ImportResult>> {
  const result = await postJson<{ result: ImportResult }>(
    `${API_BASE}/import/m1-statements/apply`,
    { transactions, skipDuplicates },
    'Failed to apply import'
  )
  if (result.data) return { data: result.data.result }
  return { error: result.error ?? 'Failed to apply import' }
}

/**
 * Download M1 statements with real-time progress via SSE.
 */
export function downloadM1StatementsStream(
  options: { all?: boolean; year?: string; accountType?: string } = {},
  callbacks: {
    onStatus?: (data: { message: string; phase: string; total?: number }) => void
    onProgress?: (data: { current: number; total: number; downloaded: number; skipped: number; filename: string; status: string }) => void
    onComplete?: (data: { total: number; downloaded: number; skipped: number; message: string }) => void
    onError?: (data: { message: string }) => void
  }
): { close: () => void } {
  const params = new URLSearchParams()
  if (options.all) params.set('all', 'true')
  if (options.year) params.set('year', options.year)
  if (options.accountType) params.set('accountType', options.accountType)

  const eventSource = new EventSource(
    `${API_BASE}/import/m1-statements/download-stream?${params.toString()}`
  )

  eventSource.addEventListener('status', (e: MessageEvent) => {
    const data = JSON.parse(e.data)
    callbacks.onStatus?.(data)
  })

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    const data = JSON.parse(e.data)
    callbacks.onProgress?.(data)
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data)
    callbacks.onComplete?.(data)
    eventSource.close()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    if (e.data) {
      const data = JSON.parse(e.data)
      callbacks.onError?.(data)
    } else {
      callbacks.onError?.({ message: 'Connection lost' })
    }
    eventSource.close()
  })

  eventSource.onerror = () => {
    callbacks.onError?.({ message: 'Connection error' })
    eventSource.close()
  }

  return {
    close: () => eventSource.close()
  }
}

// ============================================================================
// Coinbase Transactions Scraping API
// ============================================================================

export type CoinbaseTransactionType =
  | 'FUNDING_LOSS' | 'FUNDING_PROFIT'
  | 'BUY' | 'SELL'
  | 'USDC_INTEREST' | 'REBATE'
  | 'STAKING' | 'CARD' | 'DEPOSIT' | 'WITHDRAWAL' | 'OTHER'

export interface CoinbaseScrapedTransaction {
  id: string
  date: string
  type: CoinbaseTransactionType
  title: string
  amount: number
  secondaryAmount?: string
  contracts?: number
  price?: number
  symbol?: string
  isPerpRelated: boolean
}

export interface CoinbaseTransactionArchive {
  platform: 'coinbase-transactions'
  createdAt: string
  updatedAt: string
  summary: {
    totalTransactions: number
    perpRelatedCount: number
    nonPerpCount: number
    fundingProfit: number
    fundingLoss: number
    netFunding: number
    usdcInterest: number
    rebates: number
    perpTradeCount: number
  }
  transactions: CoinbaseScrapedTransaction[]
}

export interface CoinbaseScrapeStatusEvent {
  message: string
  phase: 'connecting' | 'navigating' | 'loading' | 'scraping'
  existingCount?: number
  stopDate?: string
  cleared?: number  // Number of entries cleared (when clearFundEntries is used)
}

export interface CoinbaseScrapeProgressEvent {
  current: number
  total: number
  newCount: number
  entriesApplied?: number
  lastTransaction: {
    date: string
    type: CoinbaseTransactionType
    symbol?: string
    amount: number
    title: string
    isPerpRelated: boolean
  } | null
}

export interface CoinbaseScrapeCompleteEvent {
  totalScraped: number
  newCount: number
  archiveTotal: number
  perpRelatedCount: number
  stoppedAtDate: boolean
  entriesApplied?: number  // Number of entries applied after batch processing
  message: string
}

/**
 * Get Coinbase transactions scrape archive with summary.
 */
export async function getCoinbaseTransactionsArchive(): Promise<ApiResult<CoinbaseTransactionArchive>> {
  return fetchJson<CoinbaseTransactionArchive>(
    `${API_BASE}/import/coinbase/transactions/archive`,
    undefined,
    'Failed to get Coinbase transactions archive'
  )
}

/**
 * Clear the Coinbase transactions archive.
 */
export async function clearCoinbaseTransactionsArchive(): Promise<ApiResult<{ success: boolean; message: string }>> {
  const response = await fetch(`${API_BASE}/import/coinbase/transactions/archive`, {
    method: 'DELETE',
    credentials: 'include'
  })
  if (!response.ok) {
    return { error: 'Failed to clear Coinbase transactions archive' }
  }
  return { data: await response.json() }
}

/**
 * Scrape Coinbase transactions page with real-time progress via SSE.
 * After scraping completes, all transactions are batch-applied to the fund.
 *
 * @param options.stopDate - ISO date to stop scraping at
 * @param options.fundId - Fund ID to apply transactions to after scraping
 * @param options.clearFundEntries - If true, clear fund entries immediately before scraping
 */
export function scrapeCoinbaseTransactionsStream(
  options: {
    stopDate?: string | undefined
    fundId?: string | undefined
    clearFundEntries?: boolean | undefined
  } = {},
  callbacks: {
    onStatus?: (data: CoinbaseScrapeStatusEvent) => void
    onProgress?: (data: CoinbaseScrapeProgressEvent) => void
    onComplete?: (data: CoinbaseScrapeCompleteEvent) => void
    onError?: (data: ScrapeErrorEvent) => void
    onApplied?: (data: { entriesApplied: number; lastDate: string }) => void
  }
): { close: () => void } {
  const params = new URLSearchParams()
  if (options.stopDate) params.set('stopDate', options.stopDate)
  if (options.fundId) params.set('fundId', options.fundId)
  if (options.clearFundEntries) params.set('clearFundEntries', 'true')

  const eventSource = new EventSource(
    `${API_BASE}/import/coinbase/transactions/scrape-stream?${params.toString()}`
  )

  eventSource.addEventListener('status', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as CoinbaseScrapeStatusEvent
    callbacks.onStatus?.(data)
  })

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as CoinbaseScrapeProgressEvent
    callbacks.onProgress?.(data)
  })

  eventSource.addEventListener('applied', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as { entriesApplied: number; lastDate: string }
    callbacks.onApplied?.(data)
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as CoinbaseScrapeCompleteEvent
    callbacks.onComplete?.(data)
    eventSource.close()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    if (e.data) {
      const data = JSON.parse(e.data) as ScrapeErrorEvent
      callbacks.onError?.(data)
    } else {
      callbacks.onError?.({ message: 'Connection lost' })
    }
    eventSource.close()
  })

  eventSource.onerror = () => {
    callbacks.onError?.({ message: 'Connection error' })
    eventSource.close()
  }

  return {
    close: () => eventSource.close()
  }
}
