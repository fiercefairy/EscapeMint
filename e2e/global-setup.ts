import { chromium, type FullConfig } from '@playwright/test'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { PORTS } = require('../ecosystem.config.cjs')

const API_BASE = `http://localhost:${PORTS.API}/api/v1`

// Single test platform used for all test funds
const TEST_PLATFORM = 'test'

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  console.log('Enabling test data mode...')

  // Set localStorage to enable test funds mode
  await page.goto(`http://localhost:${PORTS.WEB}`)
  await page.evaluate(() => {
    localStorage.setItem('escapemint-settings', JSON.stringify({
      advancedTools: false,
      testFundsMode: true
    }))
  })

  console.log('Test data mode enabled')
  console.log('Cleaning up test funds before test run...')

  // Get all funds
  const response = await page.request.get(`${API_BASE}/funds?include_test=true`)
  if (!response.ok()) {
    console.log('Could not fetch funds - server may not be running yet')
    await browser.close()
    return
  }

  const allFunds = await response.json()

  // Delete all funds that use any test platform (test, test2, etc.)
  let deletedCount = 0
  for (const fund of allFunds) {
    if (fund.platform.startsWith('test')) {
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
