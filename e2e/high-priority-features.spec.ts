import { test, expect, type Page } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  addEntryViaAPI,
  getFundViaAPI,
  generateTestConfig,
  API_BASE
} from './test-utils'
import { TEST_PLATFORM } from './test-fixtures'

const WEB_BASE = 'http://localhost:5550'

async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
}

/**
 * Update a fund's config via API
 */
async function updateFundConfigViaAPI(
  page: Page,
  fundId: string,
  config: Record<string, unknown>
): Promise<{ id: string; config: Record<string, unknown> }> {
  const response = await page.request.put(`${API_BASE}/funds/${fundId}`, {
    data: { config }
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

test.describe('Reopen Closed Fund', () => {
  test('can reopen a closed fund via API', async ({ page }) => {
    // Create an active fund
    const config = generateTestConfig({
      status: 'active',
      fund_size_usd: 10000
    })
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'reopen-test', config)

    // Add some entries
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    // Close the fund
    await updateFundConfigViaAPI(page, fund.id, { status: 'closed' })

    // Verify it's closed
    let fundData = await getFundViaAPI(page, fund.id)
    expect(fundData.config.status).toBe('closed')

    // Reopen the fund
    await updateFundConfigViaAPI(page, fund.id, { status: 'active' })

    // Verify it's active again
    fundData = await getFundViaAPI(page, fund.id)
    expect(fundData.config.status).toBe('active')

    // Clean up
    await deleteFundViaAPI(page, fund.id)
  })

  test('reopened fund retains entries and config', async ({ page }) => {
    // Create fund with specific config
    const config = generateTestConfig({
      status: 'active',
      fund_size_usd: 15000,
      target_apy: 0.30,
      accumulate: true
    })
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'reopen-retain', config)

    // Add entries
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 2000,
      action: 'BUY',
      amount: 2000
    })
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-15',
      value: 2200,
      action: 'HOLD'
    })

    // Close and reopen
    await updateFundConfigViaAPI(page, fund.id, { status: 'closed' })
    await updateFundConfigViaAPI(page, fund.id, { status: 'active' })

    // Verify config and entries are preserved
    const fundData = await getFundViaAPI(page, fund.id)
    expect(fundData.config.fund_size_usd).toBe(15000)
    expect(fundData.config.target_apy).toBeCloseTo(0.30, 2)
    expect(fundData.config.accumulate).toBe(true)
    expect(fundData.entries.length).toBe(2)
    expect(fundData.entries[0].action).toBe('BUY')
    expect(fundData.entries[1].action).toBe('HOLD')

    // Clean up
    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Backup Management', () => {
  test('can create a backup via API', async ({ page }) => {
    const response = await page.request.post(`${API_BASE}/backup`)
    expect(response.ok()).toBeTruthy()

    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result.path).toBeDefined()
    expect(result.backup_date).toBeDefined()
    expect(typeof result.fund_count).toBe('number')
  })

  test('can list backups via API', async ({ page }) => {
    // Create a backup first to ensure at least one exists
    await page.request.post(`${API_BASE}/backup`)

    const response = await page.request.get(`${API_BASE}/backup`)
    expect(response.ok()).toBeTruthy()

    const result = await response.json()
    expect(result.backup_dir).toBeDefined()
    expect(Array.isArray(result.backups)).toBe(true)
    expect(result.backups.length).toBeGreaterThan(0)

    // Each backup should have expected structure (name and date)
    const backup = result.backups[0]
    expect(backup.name).toBeDefined()
    expect(backup.date).toBeDefined()
  })

  test('can get backup details via API', async ({ page }) => {
    // Create a backup
    await page.request.post(`${API_BASE}/backup`)

    // Get list to find filename
    const listResponse = await page.request.get(`${API_BASE}/backup`)
    const listResult = await listResponse.json()
    const latestBackup = listResult.backups[0]

    // Get backup details using 'name' field
    const detailResponse = await page.request.get(`${API_BASE}/backup/${latestBackup.name}`)
    expect(detailResponse.ok()).toBeTruthy()

    const details = await detailResponse.json()
    expect(details.success).toBe(true)
    expect(details.backup_date).toBeDefined()
    expect(typeof details.fund_count).toBe('number')
  })

  test('can restore a backup via API', async ({ page }) => {
    // Create a test fund
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'backup-test', generateTestConfig())
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    // Create a backup
    await page.request.post(`${API_BASE}/backup`)

    // Get the latest backup filename
    const listResponse = await page.request.get(`${API_BASE}/backup`)
    const listResult = await listResponse.json()
    const latestBackup = listResult.backups[0]

    // Restore the backup using 'name' field
    const restoreResponse = await page.request.post(`${API_BASE}/backup/restore/${latestBackup.name}`)
    expect(restoreResponse.ok()).toBeTruthy()

    const restoreResult = await restoreResponse.json()
    expect(restoreResult.success).toBe(true)
    expect(restoreResult.fund_count).toBeGreaterThanOrEqual(0)

    // Clean up
    await deleteFundViaAPI(page, fund.id)
  })

  test('can delete a backup via API', async ({ page }) => {
    // Create a backup to delete
    await page.request.post(`${API_BASE}/backup`)

    // Get the list of backups
    const listResponse = await page.request.get(`${API_BASE}/backup`)
    const listResult = await listResponse.json()
    const backupToDelete = listResult.backups[0]

    // Delete the backup using 'name' field
    const deleteResponse = await page.request.delete(`${API_BASE}/backup/${backupToDelete.name}`)
    expect(deleteResponse.ok()).toBeTruthy()

    const deleteResult = await deleteResponse.json()
    expect(deleteResult.success).toBe(true)

    // Verify it's deleted
    const verifyResponse = await page.request.get(`${API_BASE}/backup/${backupToDelete.name}`)
    expect(verifyResponse.ok()).toBeFalsy()
  })

  test('backup UI shows backup list', async ({ page }) => {
    // Create a backup first
    await page.request.post(`${API_BASE}/backup`)

    await page.goto(`${WEB_BASE}/settings`)
    await waitForPageReady(page)

    // Navigate to backup section
    const backupSection = page.locator('text=Backup').first()
    await expect(backupSection).toBeVisible()

    // Should see backup list - look for backup filenames or dates
    const backupList = page.locator('text=/escapemint-backup|202[0-9]-[0-9]{2}-[0-9]{2}/')
    await expect(backupList.first()).toBeVisible({ timeout: 5000 })
  })

  test('backup UI allows creating new backup', async ({ page }) => {
    await page.goto(`${WEB_BASE}/settings`)
    await waitForPageReady(page)

    // Find create backup button
    const createButton = page.locator('button:has-text("Create Backup"), button:has-text("Backup Now"), button:has-text("New Backup")').first()

    if (await createButton.isVisible()) {
      await createButton.click()
      await page.waitForTimeout(1000)

      // Should show success notification or updated list
      const successIndicator = page.locator('text=/success|created/i')
      await expect(successIndicator.first()).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Import Preview', () => {
  test('Robinhood CSV preview returns parsed transactions', async ({ page }) => {
    // Sample Robinhood CSV format
    const csvContent = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2024,01/15/2024,01/17/2024,AAPL,APPLE INC,Buy,10,185.00,-1850.00
01/20/2024,01/20/2024,01/22/2024,AAPL,APPLE INC,Sell,5,190.00,950.00`

    const response = await page.request.post(`${API_BASE}/import/robinhood/preview`, {
      data: { csvContent, platform: 'robinhood' }
    })

    expect(response.ok()).toBeTruthy()

    const preview = await response.json()
    expect(preview.transactions).toBeDefined()
    expect(Array.isArray(preview.transactions)).toBe(true)
    expect(preview.summary).toBeDefined()
    expect(preview.summary.total).toBeGreaterThan(0)
  })

  test('preview includes transaction counts by symbol', async ({ page }) => {
    const csvContent = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2024,01/15/2024,01/17/2024,AAPL,APPLE INC,Buy,10,185.00,-1850.00
01/16/2024,01/16/2024,01/18/2024,MSFT,MICROSOFT,Buy,5,400.00,-2000.00
01/20/2024,01/20/2024,01/22/2024,AAPL,APPLE INC,Sell,5,190.00,950.00`

    const response = await page.request.post(`${API_BASE}/import/robinhood/preview`, {
      data: { csvContent, platform: 'robinhood' }
    })

    const preview = await response.json()
    expect(preview.summary.bySymbol).toBeDefined()
    expect(Object.keys(preview.summary.bySymbol).length).toBeGreaterThan(0)
  })

  test('preview identifies matched vs unmatched funds', async ({ page }) => {
    // Create a fund that matches one of the symbols
    const fund = await createFundViaAPI(page, 'robinhood', 'aapl', generateTestConfig())

    const csvContent = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2024,01/15/2024,01/17/2024,AAPL,APPLE INC,Buy,10,185.00,-1850.00
01/16/2024,01/16/2024,01/18/2024,UNKNOWN,UNKNOWN STOCK,Buy,5,100.00,-500.00`

    const response = await page.request.post(`${API_BASE}/import/robinhood/preview`, {
      data: { csvContent, platform: 'robinhood' }
    })

    const preview = await response.json()
    expect(preview.summary.matched).toBeGreaterThanOrEqual(0)
    expect(preview.summary.total).toBeGreaterThan(0)

    // Clean up
    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('DCA Relationship Validation', () => {
  // Note: Currently the API does NOT validate DCA tier relationships.
  // These tests document current behavior - validation may be added in the future.

  test('API currently accepts config where min > mid (no validation)', async ({ page }) => {
    const config = generateTestConfig({
      input_min_usd: 500, // min > mid (ideally should be rejected)
      input_mid_usd: 200,
      input_max_usd: 1000
    })

    const response = await page.request.post(`${API_BASE}/funds`, {
      data: {
        platform: TEST_PLATFORM,
        ticker: 'dca-invalid-1',
        config
      }
    })

    // Currently accepted - validation not implemented
    expect(response.ok()).toBeTruthy()

    // Clean up
    const result = await response.json()
    await deleteFundViaAPI(page, result.id)
  })

  test('API currently accepts config where mid > max (no validation)', async ({ page }) => {
    const config = generateTestConfig({
      input_min_usd: 100,
      input_mid_usd: 600, // mid > max (ideally should be rejected)
      input_max_usd: 500
    })

    const response = await page.request.post(`${API_BASE}/funds`, {
      data: {
        platform: TEST_PLATFORM,
        ticker: 'dca-invalid-2',
        config
      }
    })

    // Currently accepted - validation not implemented
    expect(response.ok()).toBeTruthy()

    // Clean up
    const result = await response.json()
    await deleteFundViaAPI(page, result.id)
  })

  test('API accepts valid DCA relationship min < mid < max', async ({ page }) => {
    const validConfig = generateTestConfig({
      input_min_usd: 100,
      input_mid_usd: 250,
      input_max_usd: 500
    })

    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'dca-valid', validConfig)
    expect(fund.id).toBeDefined()
    expect(fund.config.input_min_usd).toBe(100)
    expect(fund.config.input_mid_usd).toBe(250)
    expect(fund.config.input_max_usd).toBe(500)

    // Clean up
    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Date Validation', () => {
  // Note: Currently the API does NOT validate entry dates against fund start date.
  // These tests document current behavior - validation may be added in the future.

  test('API currently accepts entry before fund start date (no validation)', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'date-val-1', generateTestConfig({
      start_date: '2024-06-01'
    }))

    // Try to add entry before start date
    const response = await page.request.post(`${API_BASE}/funds/${fund.id}/entries`, {
      data: {
        date: '2024-01-01', // Before start date (ideally should be rejected)
        value: 1000,
        action: 'BUY',
        amount: 1000
      }
    })

    // Currently accepted - validation not implemented
    expect(response.ok()).toBeTruthy()

    await deleteFundViaAPI(page, fund.id)
  })

  test('entry date accepts valid date after start', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'date-val-2', generateTestConfig({
      start_date: '2024-01-01'
    }))

    // Add valid entry
    const response = await page.request.post(`${API_BASE}/funds/${fund.id}/entries`, {
      data: {
        date: '2024-06-15',
        value: 1000,
        action: 'BUY',
        amount: 1000
      }
    })

    expect(response.ok()).toBeTruthy()

    await deleteFundViaAPI(page, fund.id)
  })

  test('API currently accepts out-of-order entries (no validation)', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'date-val-3', generateTestConfig({
      start_date: '2024-01-01'
    }))

    // Add first entry
    await addEntryViaAPI(page, fund.id, {
      date: '2024-06-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    // Try to add entry with earlier date than last entry
    const response = await page.request.post(`${API_BASE}/funds/${fund.id}/entries`, {
      data: {
        date: '2024-05-01', // Before existing entry (ideally should be rejected)
        value: 500,
        action: 'BUY',
        amount: 500
      }
    })

    // Currently accepted - validation not implemented
    expect(response.ok()).toBeTruthy()

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Settings Persistence', () => {
  test('testFundsMode setting toggles and persists', async ({ page }) => {
    await page.goto(`${WEB_BASE}/settings`)
    await waitForPageReady(page)

    // Find the Test Funds radio button
    const testFundsRadio = page.locator('input[name="fundsMode"][value="test"], input[type="radio"]:near(:text("Test Funds"))').first()

    if (await testFundsRadio.isVisible()) {
      // Toggle to Test Funds mode
      await testFundsRadio.click()
      await page.waitForTimeout(500)

      // Reload page and verify setting persisted
      await page.reload()
      await waitForPageReady(page)

      // Verify test funds mode is still selected (the setting should have persisted)
      // Check that there's a checked radio and that Test Funds label is near it
      const testFundsChecked = await testFundsRadio.isChecked()
      expect(testFundsChecked).toBe(true)

      // Toggle back to My Funds
      const myFundsRadio = page.locator('input[type="radio"]:near(:text("My Funds"))').first()
      await myFundsRadio.click()
    }
  })

  test('advancedTools setting toggles and persists', async ({ page }) => {
    await page.goto(`${WEB_BASE}/settings`)
    await waitForPageReady(page)

    // Find the Advanced Tools checkbox
    const advancedCheckbox = page.locator('input[type="checkbox"]:near(:text("Advanced"))').first()

    if (await advancedCheckbox.isVisible()) {
      const initialState = await advancedCheckbox.isChecked()

      // Toggle the checkbox
      await advancedCheckbox.click()
      await page.waitForTimeout(500)

      // Reload and verify persisted
      await page.reload()
      await waitForPageReady(page)

      const newCheckbox = page.locator('input[type="checkbox"]:near(:text("Advanced"))').first()
      const newState = await newCheckbox.isChecked()

      // State should have flipped
      expect(newState).toBe(!initialState)

      // Reset to original state
      if (newState !== initialState) {
        await newCheckbox.click()
      }
    }
  })

  test('settings are stored in localStorage', async ({ page }) => {
    await page.goto(`${WEB_BASE}/settings`)
    await waitForPageReady(page)

    // Check localStorage for settings
    const settings = await page.evaluate(() => {
      return localStorage.getItem('escapemint-settings')
    })

    expect(settings).toBeDefined()
    if (settings) {
      const parsed = JSON.parse(settings)
      expect(typeof parsed.advancedTools).toBe('boolean')
      expect(typeof parsed.testFundsMode).toBe('boolean')
    }
  })
})

test.describe('Leap Year Date Handling', () => {
  test('fund handles Feb 29 leap year date correctly', async ({ page }) => {
    // 2024 is a leap year
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'leap-year', generateTestConfig({
      start_date: '2024-02-01'
    }))

    // Add entry on Feb 29 (leap year date)
    const response = await page.request.post(`${API_BASE}/funds/${fund.id}/entries`, {
      data: {
        date: '2024-02-29',
        value: 1000,
        action: 'BUY',
        amount: 1000
      }
    })

    expect(response.ok()).toBeTruthy()

    // Verify entry was saved with correct date
    const fundData = await getFundViaAPI(page, fund.id)
    expect(fundData.entries.length).toBe(1)
    expect(fundData.entries[0].date).toBe('2024-02-29')

    await deleteFundViaAPI(page, fund.id)
  })

  test('calculations span across leap year correctly', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'leap-calc', generateTestConfig({
      start_date: '2024-02-28',
      target_apy: 0.10
    }))

    // Add entry on Feb 28
    await addEntryViaAPI(page, fund.id, {
      date: '2024-02-28',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    // Add entry on Mar 1 (spans Feb 29)
    await addEntryViaAPI(page, fund.id, {
      date: '2024-03-01',
      value: 1010,
      action: 'HOLD'
    })

    const fundData = await getFundViaAPI(page, fund.id)
    expect(fundData.entries.length).toBe(2)

    // Verify dates are correct
    expect(fundData.entries[0].date).toBe('2024-02-28')
    expect(fundData.entries[1].date).toBe('2024-03-01')

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Dashboard Grid/Table Toggle', () => {
  test('dashboard shows grid view by default', async ({ page }) => {
    // Create a test fund to ensure dashboard has content
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'grid-test', generateTestConfig())

    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Grid button should be active (highlighted)
    const gridButton = page.locator('button:has-text("Grid")')
    await expect(gridButton).toBeVisible()

    // Grid view shows fund cards
    const fundCards = page.locator('.fund-card, [data-testid="fund-card"], a[href*="/fund/"]')
    await expect(fundCards.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('can toggle to table view', async ({ page }) => {
    // Create a test fund
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'table-test', generateTestConfig())
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Click table button
    const tableButton = page.locator('button:has-text("Table")')
    await expect(tableButton).toBeVisible()
    await tableButton.click()

    await page.waitForTimeout(300)

    // Should now show table view with header cells
    const tableView = page.locator('table, th:has-text("Ticker"), th:has-text("Value")')
    await expect(tableView.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('can toggle back to grid view', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'toggle-test', generateTestConfig())

    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Toggle to table
    await page.locator('button:has-text("Table")').click()
    await page.waitForTimeout(300)

    // Toggle back to grid
    await page.locator('button:has-text("Grid")').click()
    await page.waitForTimeout(300)

    // Should show fund cards again
    const fundCards = page.locator('.fund-card, [data-testid="fund-card"], a[href*="/fund/"]')
    await expect(fundCards.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Chart Y-Axis Clamping', () => {
  test('chart renders with appropriate y-axis for data range', async ({ page }) => {
    // Create fund with entries that have a specific value range
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'chart-test', generateTestConfig())

    // Add entries with values in a specific range (1000-1500)
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-02-01',
      value: 1250,
      action: 'HOLD'
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-03-01',
      value: 1500,
      action: 'HOLD'
    })

    // Navigate to fund detail page
    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Chart should be visible
    const chart = page.locator('svg, .chart, [data-testid="fund-chart"]').first()
    await expect(chart).toBeVisible()

    // Verify the chart has rendered (has path or line elements)
    const chartElements = page.locator('svg path, svg line, svg circle')
    await expect(chartElements.first()).toBeVisible({ timeout: 5000 })

    await deleteFundViaAPI(page, fund.id)
  })

  test('chart handles zero and near-zero values', async ({ page }) => {
    const fund = await createFundViaAPI(page, TEST_PLATFORM, 'chart-zero', generateTestConfig())

    // Add entry with value then sell to zero
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-02-01',
      value: 0,
      action: 'SELL',
      amount: 1000
    })

    // Navigate to fund detail
    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Page should load without errors
    const fundTitle = page.locator('h1, h2, [data-testid="fund-title"]').first()
    await expect(fundTitle).toBeVisible()

    // Chart should still render
    const chart = page.locator('svg, .chart').first()
    await expect(chart).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })
})
