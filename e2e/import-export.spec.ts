import { test, expect, type Page } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  addEntryViaAPI,
  listFundsViaAPI,
  generateTestConfig,
  API_BASE
} from './test-utils'
import { TEST_PLATFORM } from './test-fixtures'

const WEB_BASE = 'http://localhost:5550'

async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
}

test.describe('Export Functionality', () => {
  test('can export all funds via API', async ({ page }) => {
    // Create some test funds
    const fund1 = await createFundViaAPI(page, TEST_PLATFORM, 'exp1', generateTestConfig())
    const fund2 = await createFundViaAPI(page, TEST_PLATFORM, 'exp2', generateTestConfig())

    // Add entries
    await addEntryViaAPI(page, fund1.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    await addEntryViaAPI(page, fund2.id, {
      date: '2024-01-01',
      value: 500,
      action: 'BUY',
      amount: 500
    })

    // Export all data
    const response = await page.request.get(`${API_BASE}/export?include_test=true`)
    expect(response.ok()).toBeTruthy()

    const exportData = await response.json()

    // Verify export structure
    expect(exportData).toHaveProperty('version')
    expect(exportData).toHaveProperty('exported_at')
    expect(exportData).toHaveProperty('funds')
    expect(Array.isArray(exportData.funds)).toBe(true)

    // Should include our test funds
    const fundIds = exportData.funds.map((f: { id: string }) => f.id)
    expect(fundIds).toContain(fund1.id)
    expect(fundIds).toContain(fund2.id)

    // Clean up
    await deleteFundViaAPI(page, fund1.id)
    await deleteFundViaAPI(page, fund2.id)
  })

  test('export includes fund configurations', async ({ page }) => {
    const config = generateTestConfig({
      fund_size_usd: 25000,
      target_apy: 0.30,
      accumulate: true,
      manage_cash: true
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'expconfig', config)

    const response = await page.request.get(`${API_BASE}/export?include_test=true`)
    const exportData = await response.json()

    const exportedFund = exportData.funds.find((f: { id: string }) => f.id === fund.id)
    expect(exportedFund).toBeTruthy()
    expect(exportedFund.config.fund_size_usd).toBe(25000)
    expect(exportedFund.config.target_apy).toBeCloseTo(0.30, 2)

    await deleteFundViaAPI(page, fund.id)
  })

  test('export includes entries', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'expentries', generateTestConfig())

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-08',
      value: 1100,
      action: 'HOLD',
      amount: 0
    })

    const response = await page.request.get(`${API_BASE}/export?include_test=true`)
    const exportData = await response.json()

    const exportedFund = exportData.funds.find((f: { id: string }) => f.id === fund.id)
    expect(exportedFund.entries.length).toBe(2)

    await deleteFundViaAPI(page, fund.id)
  })

  test('export metadata is accurate', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'expmeta', generateTestConfig())

    const response = await page.request.get(`${API_BASE}/export?include_test=true`)
    const exportData = await response.json()

    // Check metadata
    expect(exportData.version).toBeDefined()
    expect(exportData.exported_at).toBeDefined()
    expect(typeof exportData.exported_at).toBe('string')

    // Timestamp should be a valid ISO date string and not in the future
    const exportTime = new Date(exportData.exported_at)
    expect(Number.isNaN(exportTime.getTime())).toBe(false)
    expect(exportTime.getTime()).toBeLessThanOrEqual(Date.now())

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Import Functionality', () => {
  test('can import funds in merge mode', async ({ page }) => {
    // Create existing fund
    const existingFund = await createFundViaAPI(page, TEST_PLATFORM, 'impexist', generateTestConfig())

    await addEntryViaAPI(page, existingFund.id, {
      date: '2024-01-01',
      value: 500,
      action: 'BUY',
      amount: 500
    })

    // Prepare import data with new fund
    const importData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      funds: [
        {
          id: `${TEST_PLATFORM}-impnew`,
          platform: TEST_PLATFORM,
          ticker: 'impnew',
          config: generateTestConfig({ fund_size_usd: 5000 }),
          entries: [
            { date: '2024-01-01', value: 1000, action: 'BUY', amount: 1000 }
          ]
        }
      ]
    }

    // Import in merge mode
    const response = await page.request.post(`${API_BASE}/export/import`, {
      data: { funds: importData.funds, mode: 'merge' }
    })

    expect(response.ok()).toBeTruthy()

    // Verify both funds exist
    const funds = await listFundsViaAPI(page)
    const testFunds = funds.filter((f: { platform: string }) => f.platform === TEST_PLATFORM)

    const existingFound = testFunds.some((f: { id: string }) => f.id === existingFund.id)
    const newFound = testFunds.some((f: { ticker: string }) => f.ticker === 'impnew')

    expect(existingFound).toBe(true)
    expect(newFound).toBe(true)

    // Clean up
    await deleteFundViaAPI(page, existingFund.id)
    const newFund = testFunds.find((f: { ticker: string }) => f.ticker === 'impnew')
    if (newFund) {
      await deleteFundViaAPI(page, newFund.id)
    }
  })

  test('can import funds in replace mode', async ({ page }) => {
    // Create fund that should be replaced
    const toReplace = await createFundViaAPI(page, TEST_PLATFORM, 'impreplace', generateTestConfig())

    // Prepare import data
    const importData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      funds: [
        {
          id: `${TEST_PLATFORM}-impreplace`,
          platform: TEST_PLATFORM,
          ticker: 'impreplace',
          config: generateTestConfig({ fund_size_usd: 99999 }), // Different config
          entries: [
            { date: '2024-02-01', value: 2000, action: 'BUY', amount: 2000 }
          ]
        }
      ]
    }

    // Import in replace mode
    const response = await page.request.post(`${API_BASE}/export/import`, {
      data: { funds: importData.funds, mode: 'replace' }
    })

    expect(response.ok()).toBeTruthy()

    // The fund should have new config
    const fundResponse = await page.request.get(`${API_BASE}/funds/${toReplace.id}`)
    const fund = await fundResponse.json()

    expect(fund.config.fund_size_usd).toBe(99999)

    await deleteFundViaAPI(page, toReplace.id)
  })

  test('import handles invalid JSON gracefully', async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/export/import`, {
      data: { data: 'not valid json', mode: 'merge' }
    })

    // Should fail gracefully
    expect(response.ok()).toBeFalsy()
  })

  test('import validates data structure', async ({ page }) => {
    // Missing required fields
    const invalidData = {
      funds: [
        {
          // Missing id, platform, ticker
          config: {},
          entries: []
        }
      ]
    }

    const response = await page.request.post(`${API_BASE}/export/import`, {
      data: { ...invalidData, mode: 'merge' }
    })

    // Should fail validation with appropriate error
    expect(response.ok()).toBeFalsy()

    // Verify error response indicates validation failure
    const errorBody = await response.json()
    expect(errorBody.error || errorBody.message).toBeDefined()
  })
})

test.describe('Export/Import Round Trip', () => {
  test('export then import preserves data integrity', async ({ page }) => {
    // Create fund with complex data
    const config = generateTestConfig({
      fund_size_usd: 15000,
      target_apy: 0.28,
      accumulate: true,
      manage_cash: true,
      dividend_reinvest: true
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'roundtrip', config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-08',
      value: 1050,
      action: 'HOLD',
      amount: 0,
      dividend: 10
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-15',
      value: 1100,
      action: 'SELL',
      amount: 100
    })

    // Export
    const exportResponse = await page.request.get(`${API_BASE}/export?include_test=true`)
    const exportData = await exportResponse.json()

    // Delete the fund
    await deleteFundViaAPI(page, fund.id)

    // Verify it's gone
    let fundList = await listFundsViaAPI(page)
    expect(fundList.some((f: { id: string }) => f.id === fund.id)).toBe(false)

    // Import
    const importResponse = await page.request.post(`${API_BASE}/export/import`, {
      data: { funds: exportData.funds, mode: 'merge' }
    })
    expect(importResponse.ok()).toBeTruthy()

    // Verify fund is back
    fundList = await listFundsViaAPI(page)
    const restoredFund = fundList.find((f: { id: string }) => f.id === fund.id)
    expect(restoredFund).toBeTruthy()

    // Verify config preserved
    expect(restoredFund.config.fund_size_usd).toBe(15000)
    expect(restoredFund.config.accumulate).toBe(true)

    // Clean up
    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Export/Import UI', () => {
  test('export button downloads file', async ({ page }) => {
    // Create test fund
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'uiexport', generateTestConfig())

    await page.goto(`${WEB_BASE}/settings`)
    await waitForPageReady(page)

    // Look for export button
    const exportButton = page.locator('button:has-text("Export"), a:has-text("Export"), [data-testid="export"]')

    // Export button must be present for this test to be meaningful
    await expect(exportButton.first()).toBeVisible()

    // Set up download listener and trigger export
    const downloadPromise = page.waitForEvent('download')
    await exportButton.first().click()
    const download = await downloadPromise

    // Verify the downloaded file name
    expect(download.suggestedFilename()).toContain('.json')

    await deleteFundViaAPI(page, fund.id)
  })

  test('import button exists in UI', async ({ page }) => {
    await page.goto(`${WEB_BASE}/settings`)
    await waitForPageReady(page)

    // Verify import section exists with merge/replace options and file selection button
    const importSection = page.locator('text=Import Data').locator('..')
    await expect(importSection).toBeVisible()

    // Verify mode selection radios exist
    const mergeRadio = importSection.locator('input[value="merge"]')
    const replaceRadio = importSection.locator('input[value="replace"]')
    await expect(mergeRadio).toBeVisible()
    await expect(replaceRadio).toBeVisible()

    // Verify file selection button exists
    const selectFileButton = importSection.locator('button:has-text("Select File")')
    await expect(selectFileButton).toBeVisible()
  })
})
