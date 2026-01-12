import { chromium, type FullConfig } from '@playwright/test'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { PORTS } = require('../ecosystem.config.cjs')

const API_BASE = `http://localhost:${PORTS.API}/api/v1`

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
  console.log('Cleaning up test data before test run...')

  // Get all funds and delete test funds
  const fundsResponse = await page.request.get(`${API_BASE}/funds?include_test=true`)
  if (fundsResponse.ok()) {
    const allFunds: Array<{ id: string; platform: string }> = await fundsResponse.json()

    // Delete all funds that use any test platform (test, test2, test-*, etc.)
    let deletedFundsCount = 0
    for (const fund of allFunds) {
      if (fund.platform.startsWith('test')) {
        const deleteResponse = await page.request.delete(`${API_BASE}/funds/${fund.id}`)
        if (deleteResponse.ok()) {
          deletedFundsCount++
          console.log(`  Deleted test fund: ${fund.id}`)
        }
      }
    }

    if (deletedFundsCount > 0) {
      console.log(`Cleaned up ${deletedFundsCount} test fund(s)`)
    } else {
      console.log('No test funds to clean up')
    }
  } else {
    console.log('Could not fetch funds - server may not be running yet')
  }

  // Get all platforms and delete test platforms
  const platformsResponse = await page.request.get(`${API_BASE}/platforms`)
  if (platformsResponse.ok()) {
    const allPlatforms: Array<{ id: string }> = await platformsResponse.json()

    // Delete all platforms that start with 'test'
    let deletedPlatformsCount = 0
    for (const platform of allPlatforms) {
      if (platform.id.startsWith('test')) {
        const deleteResponse = await page.request.delete(`${API_BASE}/platforms/${platform.id}`)
        if (deleteResponse.ok()) {
          deletedPlatformsCount++
          console.log(`  Deleted test platform: ${platform.id}`)
        }
      }
    }

    if (deletedPlatformsCount > 0) {
      console.log(`Cleaned up ${deletedPlatformsCount} test platform(s)`)
    }
  }

  await browser.close()
}

export default globalSetup
