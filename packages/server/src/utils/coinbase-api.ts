/**
 * Coinbase Advanced Trade API client.
 * Provides JWT-authenticated access to READ-ONLY endpoints for perpetual futures.
 *
 * IMPORTANT: This client is intentionally READ-ONLY.
 * No trade execution, order placement, or position modification is supported.
 */

import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import type {
  CoinbasePosition,
  CoinbaseFill,
  CoinbaseFundingPayment
} from '@escapemint/engine'

const BASE_URL = 'https://api.coinbase.com'
const DEFAULT_LIMIT = 250  // Max per request for fills

/**
 * Prepare private key for JWT signing.
 * Handles both PEM format and raw base64/hex keys.
 */
const preparePrivateKey = (rawKey: string): string => {
  // If already in PEM format, use as-is
  if (rawKey.includes('-----BEGIN')) {
    return rawKey
  }
  // New Coinbase format uses raw key directly
  return rawKey
}

/**
 * Generate JWT token for Coinbase Advanced Trade API authentication.
 *
 * @param apiKey - Coinbase API key
 * @param apiSecret - Coinbase API secret (PEM or base64 format)
 * @param requestMethod - HTTP method (GET, POST, etc.)
 * @param requestPath - API endpoint path
 * @returns JWT token string
 */
export const generateJWT = (
  apiKey: string,
  apiSecret: string,
  requestMethod: string,
  requestPath: string
): string => {
  // Validate HTTP method to prevent injection
  // Note: POST/PUT/DELETE/PATCH are included because Coinbase uses POST for
  // some read-only queries (e.g., portfolio balance snapshots). This client
  // only calls documented read-only endpoints regardless of HTTP method.
  const allowedMethods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
  const method = requestMethod.toUpperCase()
  if (!allowedMethods.has(method)) {
    throw new Error(`Unsupported HTTP method for JWT signing: ${requestMethod}`)
  }

  // Ensure path starts with /
  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`
  const uri = `${method} api.coinbase.com${path}`

  const pemKey = preparePrivateKey(apiSecret)

  // Sign with ES256 algorithm
  // Note: jsonwebtoken types don't include 'nonce' in JwtHeader, but Coinbase requires it
  // We work around this by type assertion
  const signOptions = {
    algorithm: 'ES256' as const,
    header: {
      kid: apiKey,
      nonce: randomBytes(16).toString('hex'),
    } as jwt.JwtHeader & { nonce: string },
  }

  return jwt.sign(
    {
      iss: 'cdp',
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes
      sub: apiKey,
      uri,
    },
    pemKey,
    signOptions
  )
}

/**
 * Get authentication headers for Coinbase API requests.
 * Generates a fresh JWT for each request.
 */
const getAuthHeaders = (
  apiKey: string,
  apiSecret: string,
  requestMethod: string,
  requestPath: string
): Record<string, string> => ({
  'Authorization': `Bearer ${generateJWT(apiKey, apiSecret, requestMethod, requestPath)}`,
  'Content-Type': 'application/json',
})

/**
 * Make an authenticated GET request to Coinbase API.
 */
const coinbaseGet = async <T>(
  apiKey: string,
  apiSecret: string,
  requestPath: string,
  params?: Record<string, string>
): Promise<T> => {
  const queryString = params
    ? '?' + new URLSearchParams(params).toString()
    : ''

  const headers = getAuthHeaders(apiKey, apiSecret, 'GET', requestPath)

  const response = await fetch(`${BASE_URL}${requestPath}${queryString}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Coinbase API error ${response.status}: ${errorBody}`)
  }

  return response.json() as Promise<T>
}

// ============================================
// READ-ONLY API Endpoints
// ============================================

/**
 * Fetch perpetual futures positions.
 * Returns all open positions for the authenticated account.
 */
export const fetchPositions = async (
  apiKey: string,
  apiSecret: string
): Promise<CoinbasePosition[]> => {
  interface PositionsResponse {
    positions: Array<{
      product_id: string
      side: 'LONG' | 'SHORT'
      number_of_contracts: string
      entry_vwap: string
      unrealized_pnl: string
      aggregated_pnl: string
    }>
  }

  const response = await coinbaseGet<PositionsResponse>(
    apiKey,
    apiSecret,
    '/api/v3/brokerage/intx/positions'
  )

  return (response.positions || []).map(pos => ({
    productId: pos.product_id,
    side: pos.side,
    numberOfContracts: pos.number_of_contracts,
    entryVwap: pos.entry_vwap,
    unrealizedPnl: pos.unrealized_pnl,
    aggregatedPnl: pos.aggregated_pnl,
  }))
}

/**
 * Fetch perpetual futures portfolio summary.
 * Returns aggregate margin and balance information.
 */
export const fetchPortfolioSummary = async (
  apiKey: string,
  apiSecret: string
): Promise<{
  marginAvailable: number
  marginUsed: number
  maintenanceMargin: number
  totalEquity: number
}> => {
  interface PortfolioResponse {
    portfolio: {
      margin_available: string
      margin_used: string
      maintenance_margin: string
      total_equity: string
    }
  }

  const response = await coinbaseGet<PortfolioResponse>(
    apiKey,
    apiSecret,
    '/api/v3/brokerage/intx/portfolio'
  )

  const p = response.portfolio
  return {
    marginAvailable: parseFloat(p.margin_available || '0'),
    marginUsed: parseFloat(p.margin_used || '0'),
    maintenanceMargin: parseFloat(p.maintenance_margin || '0'),
    totalEquity: parseFloat(p.total_equity || '0'),
  }
}

/**
 * Fetch historical fills (trades) with pagination.
 *
 * @param apiKey - Coinbase API key
 * @param apiSecret - Coinbase API secret
 * @param productId - Product ID (e.g., 'BIP-20DEC30-CDE')
 * @param startSequenceTimestamp - Optional: Only fetch fills after this timestamp
 * @returns Array of normalized fill objects
 */
export const fetchFills = async (
  apiKey: string,
  apiSecret: string,
  productId: string,
  startSequenceTimestamp?: string
): Promise<CoinbaseFill[]> => {
  interface FillsResponse {
    fills: Array<{
      trade_id: string
      order_id: string
      product_id: string
      side: 'BUY' | 'SELL'
      size: string
      price: string
      commission: string
      trade_time: string
      sequence_timestamp: string
      liquidity_indicator: 'MAKER' | 'TAKER'
    }>
    cursor?: string
  }

  const allFills: CoinbaseFill[] = []
  let cursor: string | undefined

  const fetchPage = async (pageCursor?: string): Promise<FillsResponse> => {
    const params: Record<string, string> = {
      product_id: productId,
      limit: DEFAULT_LIMIT.toString(),
    }

    if (pageCursor) {
      params.cursor = pageCursor
    }

    if (startSequenceTimestamp) {
      params.start_sequence_timestamp = startSequenceTimestamp
    }

    return coinbaseGet<FillsResponse>(
      apiKey,
      apiSecret,
      '/api/v3/brokerage/orders/historical/fills',
      params
    )
  }

  // Fetch first page
  const firstPage = await fetchPage()
  const normalizedFills = normalizeFills(firstPage.fills)
  allFills.push(...normalizedFills)
  cursor = firstPage.cursor

  // Continue fetching while there are more pages
  while (cursor) {
    const page = await fetchPage(cursor)
    allFills.push(...normalizeFills(page.fills))
    cursor = page.cursor
  }

  return allFills
}

/**
 * Normalize raw fill data from API.
 */
const normalizeFills = (fills: Array<{
  trade_id: string
  order_id: string
  product_id: string
  side: 'BUY' | 'SELL'
  size: string
  price: string
  commission: string
  trade_time: string
  sequence_timestamp: string
  liquidity_indicator: 'MAKER' | 'TAKER'
}>): CoinbaseFill[] => {
  return fills.map(fill => ({
    tradeId: fill.trade_id,
    orderId: fill.order_id,
    productId: fill.product_id,
    side: fill.side,
    size: fill.size,
    price: fill.price,
    commission: fill.commission,
    tradeTime: fill.trade_time,
    sequenceTimestamp: fill.sequence_timestamp,
    liquidityIndicator: fill.liquidity_indicator,
  }))
}

/**
 * Fetch funding payments for perpetual futures.
 *
 * @param apiKey - Coinbase API key
 * @param apiSecret - Coinbase API secret
 * @param productId - Product ID
 * @returns Array of funding payment objects
 */
export const fetchFundingPayments = async (
  apiKey: string,
  apiSecret: string,
  productId: string
): Promise<CoinbaseFundingPayment[]> => {
  interface FundingResponse {
    funding_payments: Array<{
      time: string
      amount: string
      rate: string
      product_id: string
    }>
  }

  const response = await coinbaseGet<FundingResponse>(
    apiKey,
    apiSecret,
    '/api/v3/brokerage/cfm/funding',
    { product_id: productId }
  )

  return (response.funding_payments || []).map(payment => ({
    time: payment.time,
    amount: payment.amount,
    rate: payment.rate,
    productId: payment.product_id,
  }))
}

/**
 * Fetch current BTC price from Coinbase.
 */
export const fetchCurrentPrice = async (
  apiKey: string,
  apiSecret: string,
  productId: string
): Promise<number> => {
  interface ProductResponse {
    price: string
    price_percentage_change_24h: string
    volume_24h: string
  }

  const response = await coinbaseGet<ProductResponse>(
    apiKey,
    apiSecret,
    `/api/v3/brokerage/products/${productId}`
  )

  return parseFloat(response.price)
}

/**
 * Test API credentials by making a simple request.
 * Returns true if credentials are valid and have proper permissions.
 */
export const testCredentials = async (
  apiKey: string,
  apiSecret: string
): Promise<{ valid: boolean; error?: string }> => {
  try {
    await fetchPortfolioSummary(apiKey, apiSecret)
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Calculate contract metrics from position data.
 */
export const calculatePositionMetrics = (
  position: CoinbasePosition,
  contractMultiplier: number = 0.01
): {
  contracts: number
  btcSize: number
  entryPrice: number
  unrealizedPnl: number
  notionalValue: number
} => {
  const contracts = parseFloat(position.numberOfContracts)
  const btcSize = contracts * contractMultiplier
  const entryPrice = parseFloat(position.entryVwap)
  const unrealizedPnl = parseFloat(position.unrealizedPnl)
  const notionalValue = btcSize * entryPrice

  return {
    contracts,
    btcSize,
    entryPrice,
    unrealizedPnl,
    notionalValue,
  }
}
