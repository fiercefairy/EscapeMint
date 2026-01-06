/**
 * Derivatives API Router
 *
 * Provides endpoints for:
 * - Managing Coinbase API credentials (stored in macOS Keychain)
 * - Fetching positions, fills, and funding payments
 * - Syncing data to fund entries
 *
 * IMPORTANT: All Coinbase operations are READ-ONLY.
 * No trade execution is supported.
 */

import { Router, type Request, type Response, type Router as RouterType } from 'express'
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  listApiKeys,
  testKeychainAccess,
  verifyApiKey
} from '../utils/keychain.js'
import {
  fetchPositions,
  fetchPortfolioSummary,
  fetchFills,
  fetchFundingPayments,
  fetchCurrentPrice,
  testCredentials,
  calculatePositionMetrics
} from '../utils/coinbase-api.js'

export const derivativesRouter: RouterType = Router()

// ============================================
// API Key Management Endpoints
// ============================================

/**
 * GET /api/v1/derivatives/api-keys
 * List all stored API key names (not the actual secrets).
 */
derivativesRouter.get('/api-keys', async (_req: Request, res: Response) => {
  const keychainOk = await testKeychainAccess()
  if (!keychainOk) {
    res.status(503).json({
      error: 'Keychain is locked or inaccessible',
      hint: 'Unlock your macOS keychain'
    })
    return
  }

  const keys = await listApiKeys()
  res.json({ keys })
})

/**
 * POST /api/v1/derivatives/api-keys
 * Store new API credentials in Keychain.
 *
 * Body: { name: string, apiKey: string, apiSecret: string }
 */
derivativesRouter.post('/api-keys', async (req: Request, res: Response) => {
  const { name, apiKey, apiSecret } = req.body

  if (!name || !apiKey || !apiSecret) {
    res.status(400).json({ error: 'Missing required fields: name, apiKey, apiSecret' })
    return
  }

  // Test credentials before storing
  const testResult = await testCredentials(apiKey, apiSecret)
  if (!testResult.valid) {
    res.status(400).json({
      error: 'Invalid credentials',
      detail: testResult.error
    })
    return
  }

  await storeApiKey(name, apiKey, apiSecret)
  res.json({ success: true, message: `API key "${name}" stored successfully` })
})

/**
 * DELETE /api/v1/derivatives/api-keys/:name
 * Remove API credentials from Keychain.
 */
derivativesRouter.delete('/api-keys/:name', async (req: Request, res: Response) => {
  const name = req.params['name']
  if (!name) {
    res.status(400).json({ error: 'Missing name parameter' })
    return
  }

  await deleteApiKey(name)
  res.json({ success: true, message: `API key "${name}" deleted` })
})

/**
 * POST /api/v1/derivatives/api-keys/:name/test
 * Test stored API credentials.
 */
derivativesRouter.post('/api-keys/:name/test', async (req: Request, res: Response) => {
  const name = req.params['name']
  if (!name) {
    res.status(400).json({ error: 'Missing name parameter' })
    return
  }

  const creds = await getApiKey(name)
  if (!creds) {
    res.status(404).json({ error: `API key "${name}" not found` })
    return
  }

  const testResult = await testCredentials(creds.apiKey, creds.apiSecret)
  res.json(testResult)
})

// ============================================
// Position & Portfolio Endpoints
// ============================================

/**
 * GET /api/v1/derivatives/positions
 * Fetch current positions from Coinbase.
 *
 * Query: { keyName: string }
 */
derivativesRouter.get('/positions', async (req: Request, res: Response) => {
  const keyName = req.query['keyName'] as string

  if (!keyName) {
    res.status(400).json({ error: 'Missing required query param: keyName' })
    return
  }

  const creds = await getApiKey(keyName)
  if (!creds) {
    res.status(404).json({ error: `API key "${keyName}" not found` })
    return
  }

  const positions = await fetchPositions(creds.apiKey, creds.apiSecret)

  // Add calculated metrics to each position
  const enrichedPositions = positions.map(pos => ({
    ...pos,
    metrics: calculatePositionMetrics(pos, pos.productId.includes('BIP') ? 0.01 : 1.0)
  }))

  res.json({ positions: enrichedPositions })
})

/**
 * GET /api/v1/derivatives/portfolio
 * Fetch portfolio summary (margin, equity, etc.) from Coinbase.
 *
 * Query: { keyName: string }
 */
derivativesRouter.get('/portfolio', async (req: Request, res: Response) => {
  const keyName = req.query['keyName'] as string

  if (!keyName) {
    res.status(400).json({ error: 'Missing required query param: keyName' })
    return
  }

  const creds = await getApiKey(keyName)
  if (!creds) {
    res.status(404).json({ error: `API key "${keyName}" not found` })
    return
  }

  const summary = await fetchPortfolioSummary(creds.apiKey, creds.apiSecret)
  res.json(summary)
})

// ============================================
// Trade History Endpoints
// ============================================

/**
 * GET /api/v1/derivatives/fills/:productId
 * Fetch historical fills (trades) for a product.
 *
 * Query: { keyName: string, since?: string }
 */
derivativesRouter.get('/fills/:productId', async (req: Request, res: Response) => {
  const productId = req.params['productId']
  const keyName = req.query['keyName'] as string | undefined
  const since = req.query['since'] as string | undefined

  if (!productId) {
    res.status(400).json({ error: 'Missing productId parameter' })
    return
  }

  if (!keyName) {
    res.status(400).json({ error: 'Missing required query param: keyName' })
    return
  }

  const creds = await getApiKey(keyName)
  if (!creds) {
    res.status(404).json({ error: `API key "${keyName}" not found` })
    return
  }

  const fills = await fetchFills(creds.apiKey, creds.apiSecret, productId, since)

  res.json({
    productId,
    fillCount: fills.length,
    fills
  })
})

// ============================================
// Funding & Rewards Endpoints
// ============================================

/**
 * GET /api/v1/derivatives/funding/:productId
 * Fetch funding payments for a product.
 *
 * Query: { keyName: string }
 */
derivativesRouter.get('/funding/:productId', async (req: Request, res: Response) => {
  const productId = req.params['productId']
  const keyName = req.query['keyName'] as string | undefined

  if (!productId) {
    res.status(400).json({ error: 'Missing productId parameter' })
    return
  }

  if (!keyName) {
    res.status(400).json({ error: 'Missing required query param: keyName' })
    return
  }

  const creds = await getApiKey(keyName)
  if (!creds) {
    res.status(404).json({ error: `API key "${keyName}" not found` })
    return
  }

  const fundingPayments = await fetchFundingPayments(creds.apiKey, creds.apiSecret, productId)

  // Calculate totals
  let totalProfit = 0
  let totalLoss = 0

  for (const payment of fundingPayments) {
    const amount = parseFloat(payment.amount)
    if (amount >= 0) {
      totalProfit += amount
    } else {
      totalLoss += Math.abs(amount)
    }
  }

  res.json({
    productId,
    paymentCount: fundingPayments.length,
    totalProfit,
    totalLoss,
    netFunding: totalProfit - totalLoss,
    payments: fundingPayments
  })
})

// ============================================
// Price Endpoints
// ============================================

/**
 * GET /api/v1/derivatives/price/:productId
 * Fetch current price for a product.
 *
 * Query: { keyName: string }
 */
derivativesRouter.get('/price/:productId', async (req: Request, res: Response) => {
  const productId = req.params['productId']
  const keyName = req.query['keyName'] as string | undefined

  if (!productId) {
    res.status(400).json({ error: 'Missing productId parameter' })
    return
  }

  if (!keyName) {
    res.status(400).json({ error: 'Missing required query param: keyName' })
    return
  }

  const creds = await getApiKey(keyName)
  if (!creds) {
    res.status(404).json({ error: `API key "${keyName}" not found` })
    return
  }

  const price = await fetchCurrentPrice(creds.apiKey, creds.apiSecret, productId)
  res.json({ productId, price })
})

// ============================================
// Sync Endpoints
// ============================================

/**
 * POST /api/v1/derivatives/sync/:fundId
 * Sync Coinbase data to a derivatives fund's entries.
 *
 * This fetches fills and funding from API and merges with existing entries.
 *
 * Body: { keyName: string }
 */
derivativesRouter.post('/sync/:fundId', async (req: Request, res: Response) => {
  const fundId = req.params['fundId']
  const keyName = req.body['keyName'] as string | undefined

  if (!fundId) {
    res.status(400).json({ error: 'Missing fundId parameter' })
    return
  }

  if (!keyName) {
    res.status(400).json({ error: 'Missing required field: keyName' })
    return
  }

  // Verify API key exists
  const keyValid = await verifyApiKey(keyName)
  if (!keyValid) {
    res.status(404).json({ error: `API key "${keyName}" not found or invalid` })
    return
  }

  // TODO: Implement sync logic
  // 1. Read fund config to get productId
  // 2. Fetch fills and funding from API
  // 3. Process into entries using derivatives-calculations
  // 4. Merge with existing entries
  // 5. Write back to fund

  res.json({
    message: 'Sync not yet implemented',
    fundId,
    keyName
  })
})

// ============================================
// Manual Entry Endpoints
// ============================================

/**
 * POST /api/v1/derivatives/:fundId/funding
 * Add a manual funding entry (for funding not captured by API).
 *
 * Body: { date: string, amount: number, notes?: string }
 */
derivativesRouter.post('/:fundId/funding', async (req: Request, res: Response) => {
  const fundId = req.params['fundId']
  const { date, amount, notes } = req.body as { date?: string; amount?: number; notes?: string }

  if (!fundId) {
    res.status(400).json({ error: 'Missing fundId parameter' })
    return
  }

  if (!date || amount === undefined) {
    res.status(400).json({ error: 'Missing required fields: date, amount' })
    return
  }

  // TODO: Implement manual funding entry
  // 1. Read fund
  // 2. Add funding entry (funding_profit or funding_loss based on sign)
  // 3. Write back

  res.json({
    message: 'Manual funding entry not yet implemented',
    fundId,
    date,
    amount,
    notes
  })
})

/**
 * POST /api/v1/derivatives/:fundId/rewards
 * Add a manual reward entry (USDC interest, etc.).
 *
 * Body: { date: string, amount: number, type: string, notes?: string }
 */
derivativesRouter.post('/:fundId/rewards', async (req: Request, res: Response) => {
  const fundId = req.params['fundId']
  const { date, amount, type, notes } = req.body as { date?: string; amount?: number; type?: string; notes?: string }

  if (!fundId) {
    res.status(400).json({ error: 'Missing fundId parameter' })
    return
  }

  if (!date || amount === undefined || !type) {
    res.status(400).json({ error: 'Missing required fields: date, amount, type' })
    return
  }

  // TODO: Implement manual reward entry

  res.json({
    message: 'Manual reward entry not yet implemented',
    fundId,
    date,
    amount,
    type,
    notes
  })
})
