import type { ApiResult } from './funds'

const API_BASE = '/api/v1'

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
  launched: boolean
  cdpUrl: string
  instructions: string
}

/**
 * Preview Robinhood CSV import without applying changes.
 * Returns parsed transactions with fund mappings.
 */
export async function previewRobinhoodImport(
  csvContent: string,
  platform = 'robinhood'
): Promise<ApiResult<ImportPreview>> {
  const response = await fetch(`${API_BASE}/import/robinhood/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csvContent, platform })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to parse CSV' } }))
    return { error: error.error?.message ?? 'Failed to parse CSV' }
  }

  const data = await response.json()
  return { data }
}

/**
 * Apply imported transactions to existing funds.
 */
export async function applyRobinhoodImport(
  transactions: ParsedTransaction[],
  skipUnmatched = true
): Promise<ApiResult<ImportResult>> {
  const response = await fetch(`${API_BASE}/import/robinhood/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions, skipUnmatched })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to apply import' } }))
    return { error: error.error?.message ?? 'Failed to apply import' }
  }

  const data = await response.json()
  return { data: data.result }
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
 */
export async function getBrowserStatus(): Promise<ApiResult<BrowserStatus>> {
  const response = await fetch(`${API_BASE}/import/browser/status`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to check browser status' } }))
    return { error: error.error?.message ?? 'Failed to check browser status' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Launch Chrome browser with remote debugging.
 * @param platform Optional platform to navigate to (robinhood, m1, etc.)
 */
export async function launchBrowser(platform?: string): Promise<ApiResult<{ success: boolean; message: string; alreadyRunning: boolean }>> {
  const response = await fetch(`${API_BASE}/import/browser/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to launch browser' } }))
    return { error: error.error?.message ?? 'Failed to launch browser' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Kill the launched Chrome browser.
 */
export async function killBrowser(): Promise<ApiResult<{ success: boolean; message: string }>> {
  const response = await fetch(`${API_BASE}/import/browser/kill`, {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to kill browser' } }))
    return { error: error.error?.message ?? 'Failed to kill browser' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Connect to browser via CDP.
 */
export async function connectBrowser(cdpUrl?: string): Promise<ApiResult<{ success: boolean; message: string; pages: number }>> {
  const response = await fetch(`${API_BASE}/import/browser/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cdpUrl })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to connect to browser' } }))
    return { error: error.error?.message ?? 'Failed to connect to browser' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Scrape transaction history from a Robinhood URL.
 */
export async function scrapeRobinhoodHistory(
  url: string,
  platform = 'robinhood'
): Promise<ApiResult<ImportPreview>> {
  const response = await fetch(`${API_BASE}/import/robinhood/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, platform })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to scrape page' } }))
    return { error: error.error?.message ?? 'Failed to scrape page' }
  }

  const data = await response.json()
  return { data }
}

/**
 * Disconnect from browser.
 */
export async function disconnectBrowser(): Promise<ApiResult<{ success: boolean; message: string }>> {
  const response = await fetch(`${API_BASE}/import/browser/disconnect`, {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to disconnect' } }))
    return { error: error.error?.message ?? 'Failed to disconnect' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Get existing scrape archive for a platform.
 * @param full - If true, returns all transactions. Otherwise returns first 50.
 */
export async function getScrapeArchive(platform = 'robinhood', full = false): Promise<ApiResult<ScrapeArchive>> {
  const response = await fetch(`${API_BASE}/import/archive/${platform}${full ? '?full=true' : ''}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch archive' } }))
    return { error: error.error?.message ?? 'Failed to fetch archive' }
  }
  const data = await response.json()
  return { data }
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
  const response = await fetch(`${API_BASE}/import/archive/${platform}/reclassify`, {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to reclassify' } }))
    return { error: error.error?.message ?? 'Failed to reclassify' }
  }
  const data = await response.json()
  return { data }
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
  const response = await fetch(`${API_BASE}/import/crypto/statements`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to get crypto statements' } }))
    return { error: error.error?.message ?? 'Failed to get crypto statements' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Get list of locally downloaded crypto statement PDFs.
 */
export async function getLocalCryptoStatements(): Promise<ApiResult<CryptoStatementsResponse>> {
  const response = await fetch(`${API_BASE}/import/crypto/local-statements`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to get local statements' } }))
    return { error: error.error?.message ?? 'Failed to get local statements' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Parse a single crypto statement PDF.
 */
export async function parseCryptoStatement(filename: string): Promise<ApiResult<CryptoStatementData>> {
  const response = await fetch(`${API_BASE}/import/crypto/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to parse PDF' } }))
    return { error: error.error?.message ?? 'Failed to parse PDF' }
  }
  const data = await response.json()
  return { data }
}

/**
 * Parse all local crypto statement PDFs and return combined results.
 */
export async function parseAllCryptoStatements(): Promise<ApiResult<CryptoParseAllResponse>> {
  const response = await fetch(`${API_BASE}/import/crypto/parse-all`, {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to parse PDFs' } }))
    return { error: error.error?.message ?? 'Failed to parse PDFs' }
  }
  const data = await response.json()
  return { data }
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
