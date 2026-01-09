/**
 * Derivatives API client for frontend.
 * Provides functions for API key management, position data, and funding/rewards.
 */

import { fetchJson, postJson, deleteResource } from './utils'
import type { ApiResult } from './utils'

export type { ApiResult }

// ============================================================================
// Types
// ============================================================================

export interface ApiKeyInfo {
  name: string
}

export interface ApiKeyTestResult {
  valid: boolean
  error?: string
}

export interface PositionMetrics {
  contracts: number
  btcSize: number
  entryPrice: number
  unrealizedPnl: number
  notionalValue: number
}

export interface Position {
  productId: string
  side: 'LONG' | 'SHORT'
  numberOfContracts: string
  entryVwap: string
  unrealizedPnl: string
  aggregatedPnl: string
  metrics: PositionMetrics
}

export interface PortfolioSummary {
  marginAvailable: number
  marginUsed: number
  maintenanceMargin: number
  totalEquity: number
}

export interface Fill {
  tradeId: string
  orderId: string
  productId: string
  side: 'BUY' | 'SELL'
  size: string
  price: string
  commission: string
  tradeTime: string
  sequenceTimestamp: string
  liquidityIndicator: 'MAKER' | 'TAKER'
}

export interface FundingPayment {
  time: string
  amount: string
  rate: string
  productId: string
}

export interface FundingResponse {
  productId: string
  paymentCount: number
  totalProfit: number
  totalLoss: number
  netFunding: number
  payments: FundingPayment[]
}

// Archive types (from import endpoints)
export interface CoinbaseFundingEntry {
  id: string
  date: string
  amount: number
  rate?: string
  productId?: string
}

export interface CoinbaseRewardEntry {
  id: string
  date: string
  amount: number
  type: 'usdc_interest' | 'staking' | 'other'
  description?: string
}

export interface CoinbaseArchive {
  platform: 'coinbase-btcd'
  createdAt: string
  updatedAt: string
  summary: {
    fundingPaymentCount: number
    rewardCount: number
    totalFundingProfit: number
    totalFundingLoss: number
    netFunding: number
    totalRewards: number
  }
  fundingPayments: CoinbaseFundingEntry[]
  rewards: CoinbaseRewardEntry[]
}

// ============================================================================
// API Key Management
// ============================================================================

/**
 * List all stored API key names.
 */
export async function listApiKeys(): Promise<ApiResult<{ keys: ApiKeyInfo[] }>> {
  return fetchJson<{ keys: ApiKeyInfo[] }>('/api/v1/derivatives/api-keys', undefined, 'Failed to list API keys')
}

/**
 * Store a new API key in the Keychain.
 */
export async function storeApiKey(
  name: string,
  apiKey: string,
  apiSecret: string
): Promise<ApiResult<{ success: boolean; message: string }>> {
  return postJson<{ success: boolean; message: string }>(
    '/api/v1/derivatives/api-keys',
    { name, apiKey, apiSecret },
    'Failed to store API key'
  )
}

/**
 * Delete an API key from the Keychain.
 */
export async function deleteApiKey(name: string): Promise<ApiResult<{ success: boolean; message: string }>> {
  return deleteResource<{ success: boolean; message: string }>(
    `/api/v1/derivatives/api-keys/${encodeURIComponent(name)}`,
    'Failed to delete API key'
  )
}

/**
 * Test stored API credentials.
 */
export async function testApiKey(name: string): Promise<ApiResult<ApiKeyTestResult>> {
  return postJson<ApiKeyTestResult>(
    `/api/v1/derivatives/api-keys/${encodeURIComponent(name)}/test`,
    {},
    'Failed to test API key'
  )
}

// ============================================================================
// Position & Portfolio Data
// ============================================================================

/**
 * Fetch current positions from Coinbase.
 */
export async function fetchPositions(keyName: string): Promise<ApiResult<{ positions: Position[] }>> {
  return fetchJson<{ positions: Position[] }>(
    `/api/v1/derivatives/positions?keyName=${encodeURIComponent(keyName)}`,
    undefined,
    'Failed to fetch positions'
  )
}

/**
 * Fetch portfolio summary (margin, equity, etc.).
 */
export async function fetchPortfolio(keyName: string): Promise<ApiResult<PortfolioSummary>> {
  return fetchJson<PortfolioSummary>(
    `/api/v1/derivatives/portfolio?keyName=${encodeURIComponent(keyName)}`,
    undefined,
    'Failed to fetch portfolio'
  )
}

// ============================================================================
// Trade History & Funding
// ============================================================================

/**
 * Fetch historical fills (trades) for a product.
 */
export async function fetchFills(
  keyName: string,
  productId: string,
  since?: string
): Promise<ApiResult<{ productId: string; fillCount: number; fills: Fill[] }>> {
  let url = `/api/v1/derivatives/fills/${encodeURIComponent(productId)}?keyName=${encodeURIComponent(keyName)}`
  if (since) {
    url += `&since=${encodeURIComponent(since)}`
  }
  return fetchJson<{ productId: string; fillCount: number; fills: Fill[] }>(url, undefined, 'Failed to fetch fills')
}

/**
 * Fetch funding payments for a product.
 */
export async function fetchFunding(
  keyName: string,
  productId: string
): Promise<ApiResult<FundingResponse>> {
  return fetchJson<FundingResponse>(
    `/api/v1/derivatives/funding/${encodeURIComponent(productId)}?keyName=${encodeURIComponent(keyName)}`,
    undefined,
    'Failed to fetch funding payments'
  )
}

/**
 * Fetch current price for a product.
 */
export async function fetchPrice(
  keyName: string,
  productId: string
): Promise<ApiResult<{ productId: string; price: number }>> {
  return fetchJson<{ productId: string; price: number }>(
    `/api/v1/derivatives/price/${encodeURIComponent(productId)}?keyName=${encodeURIComponent(keyName)}`,
    undefined,
    'Failed to fetch price'
  )
}

// ============================================================================
// Funding & Rewards Archive (from import endpoints)
// ============================================================================

/**
 * Get the Coinbase derivatives archive with summary.
 */
export async function fetchCoinbaseArchive(): Promise<ApiResult<CoinbaseArchive>> {
  return fetchJson<CoinbaseArchive>('/api/v1/import/coinbase-btcd/archive', undefined, 'Failed to fetch archive')
}

/**
 * Add a manual funding entry.
 */
export async function addManualFunding(
  date: string,
  amount: number,
  productId?: string
): Promise<ApiResult<{ success: boolean; message: string; entry: CoinbaseFundingEntry }>> {
  return postJson<{ success: boolean; message: string; entry: CoinbaseFundingEntry }>(
    '/api/v1/import/coinbase-btcd/funding/manual',
    { date, amount, productId },
    'Failed to add funding entry'
  )
}

/**
 * Add a manual reward entry.
 */
export async function addManualReward(
  date: string,
  amount: number,
  type?: 'usdc_interest' | 'staking' | 'other',
  description?: string
): Promise<ApiResult<{ success: boolean; message: string; entry: CoinbaseRewardEntry }>> {
  return postJson<{ success: boolean; message: string; entry: CoinbaseRewardEntry }>(
    '/api/v1/import/coinbase-btcd/rewards/manual',
    { date, amount, type, description },
    'Failed to add reward entry'
  )
}

/**
 * Import funding entries in bulk.
 */
export async function importBulkFunding(
  entries: Record<string, number>,
  productId?: string
): Promise<ApiResult<{ success: boolean; message: string; added: number; skipped: number; total: number }>> {
  return postJson<{ success: boolean; message: string; added: number; skipped: number; total: number }>(
    '/api/v1/import/coinbase-btcd/funding/bulk',
    { entries, productId },
    'Failed to import funding entries'
  )
}

/**
 * Import reward entries in bulk.
 */
export async function importBulkRewards(
  entries: Record<string, number>,
  type?: 'usdc_interest' | 'staking' | 'other'
): Promise<ApiResult<{ success: boolean; message: string; added: number; skipped: number; total: number }>> {
  return postJson<{ success: boolean; message: string; added: number; skipped: number; total: number }>(
    '/api/v1/import/coinbase-btcd/rewards/bulk',
    { entries, type },
    'Failed to import reward entries'
  )
}

/**
 * Delete a funding entry.
 */
export async function deleteFundingEntry(
  date: string,
  amount: number
): Promise<ApiResult<{ success: boolean; message: string; remaining: number }>> {
  return deleteResource<{ success: boolean; message: string; remaining: number }>(
    `/api/v1/import/coinbase-btcd/funding/${encodeURIComponent(date)}?amount=${amount}`,
    'Failed to delete funding entry'
  )
}

/**
 * Delete a reward entry.
 */
export async function deleteRewardEntry(
  date: string,
  amount: number,
  type?: string
): Promise<ApiResult<{ success: boolean; message: string; remaining: number }>> {
  const typeParam = type ? `&type=${encodeURIComponent(type)}` : ''
  return deleteResource<{ success: boolean; message: string; remaining: number }>(
    `/api/v1/import/coinbase-btcd/rewards/${encodeURIComponent(date)}?amount=${amount}${typeParam}`,
    'Failed to delete reward entry'
  )
}

// ============================================================================
// Browser Status
// ============================================================================

/**
 * Check if Coinbase is open and logged in the browser.
 */
export async function checkCoinbaseBrowserStatus(): Promise<ApiResult<{
  browserConnected: boolean
  coinbaseFound: boolean
  loggedIn: boolean
  currentUrl?: string
  message: string
}>> {
  return fetchJson<{
    browserConnected: boolean
    coinbaseFound: boolean
    loggedIn: boolean
    currentUrl?: string
    message: string
  }>('/api/v1/import/browser/status/coinbase', undefined, 'Failed to check browser status')
}
