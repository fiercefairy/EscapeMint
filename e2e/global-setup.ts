import { chromium, type FullConfig } from '@playwright/test'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { PORTS } = require('../ecosystem.config.cjs')

const API_BASE = `http://localhost:${PORTS.API}/api/v1`

// Test platforms to clean up - these are fake platforms used in tests
const TEST_PLATFORMS = ['test', 'robinhood-test', 'coinbase-test', 'fidelity-test']

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  console.log('Cleaning up test funds before test run...')

  // Get all funds
  const response = await page.request.get(`${API_BASE}/funds?include_test=true`)
  if (!response.ok()) {
    console.log('Could not fetch funds - server may not be running yet')
    await browser.close()
    return
  }

  const allFunds = await response.json()

  // Delete all funds that match test platforms
  let deletedCount = 0
  for (const fund of allFunds) {
    if (TEST_PLATFORMS.includes(fund.platform)) {
      const deleteResponse = await page.request.delete(`${API_BASE}/funds/${fund.id}`)
      if (deleteResponse.ok()) {
        deletedCount++
        console.log(`  Deleted test fund: ${fund.id}`)
      }
    }
  }

  if (deletedCount > 0) {
    console.log(`Cleaned up ${deletedCount} test fund(s)`)
  } else {
    console.log('No test funds to clean up')
  }

  await browser.close()
}

export default globalSetup
