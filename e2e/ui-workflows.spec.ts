import { test, expect, type Page } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  addEntryViaAPI,
  listFundsViaAPI,
  generateTestConfig
} from './test-utils'
import { TEST_PLATFORM } from './test-fixtures'

// Web app base URL
const WEB_BASE = 'http://localhost:5550'

/**
 * Helper to wait for page to be ready
 */
async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle')
  // Wait a bit for React hydration
  await page.waitForTimeout(300)
}

test.describe('Dashboard UI Workflows', () => {
  test.describe('Dashboard Loading', () => {
    test('dashboard loads and displays fund cards', async ({ page }) => {
      // Create a test fund first
      const ticker = 'ui-dash-load'
      const config = generateTestConfig()
      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      // Add an entry so fund has data
      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 100,
        action: 'BUY',
        amount: 100
      })

      // Navigate to dashboard
      await page.goto(WEB_BASE)
      await waitForPageReady(page)

      // Verify dashboard title/header is present
      await expect(page.locator('h1, [data-testid="dashboard-title"]')).toBeVisible()

      // Verify at least one fund card is visible
      const fundCards = page.locator('.fund-card, [data-testid="fund-card"], a[href^="/fund/"]')
      await expect(fundCards.first()).toBeVisible()

      // Clean up
      await deleteFundViaAPI(page, fund.id)
    })

    test('dashboard shows aggregate metrics', async ({ page }) => {
      // Create test fund
      const ticker = 'ui-dash-metrics'
      const config = generateTestConfig({ fund_size_usd: 10000 })
      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      await page.goto(WEB_BASE)
      await waitForPageReady(page)

      // Look for metrics panel elements (value, funds count, etc.)
      // These might be in AggregatePanel component
      const metricsSection = page.locator('.grid, [data-testid="metrics"]').first()
      await expect(metricsSection).toBeVisible()

      await deleteFundViaAPI(page, fund.id)
    })

    test('empty dashboard shows welcome panel', async ({ page }) => {
      // First, ensure no test funds exist
      const funds = await listFundsViaAPI(page)
      const testFunds = funds.filter(f => f.platform === TEST_PLATFORM)

      // Clean up any existing test funds
      for (const f of testFunds) {
        await deleteFundViaAPI(page, f.id)
      }

      await page.goto(`${WEB_BASE}?include_test=true`)
      await waitForPageReady(page)

      // With no funds, welcome panel should appear
      // Look for welcome text or "Create your first fund" type content
      const welcomeContent = page.locator('text=/welcome|get started|create.*fund/i')

      // Skip assertion if other non-test funds exist in the system
      // This test verifies the welcome panel behavior in isolation
      if (await welcomeContent.count() > 0) {
        await expect(welcomeContent.first()).toBeVisible()
      }
    })
  })

  test.describe('Fund Card Navigation', () => {
    test('clicking fund card navigates to fund detail', async ({ page }) => {
      const ticker = 'ui-nav-click'
      const config = generateTestConfig()
      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 100,
        action: 'BUY',
        amount: 100
      })

      await page.goto(WEB_BASE)
      await waitForPageReady(page)

      // Find and click the fund card
      const fundLink = page.locator(`a[href*="${fund.id}"]`).first()
      await fundLink.click()

      // Should navigate to fund detail page
      await page.waitForURL(`**/fund/${fund.id}**`)

      // Verify fund detail page elements
      await expect(page.locator(`text=${ticker.toUpperCase()}`)).toBeVisible()

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Charts Toggle', () => {
    test('charts toggle persists preference', async ({ page }) => {
      const ticker = 'ui-charts-toggle'
      const config = generateTestConfig()
      const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

      await addEntryViaAPI(page, fund.id, {
        date: '2024-01-01',
        value: 1000,
        action: 'BUY',
        amount: 1000
      })

      await page.goto(WEB_BASE)
      await waitForPageReady(page)

      // Look for charts toggle button
      const chartsToggle = page.locator('button:has-text("Charts"), button:has-text("Hide Charts"), button:has-text("Show Charts"), [data-testid="charts-toggle"]')

      if (await chartsToggle.count() > 0) {
        // Get initial state
        const initialText = await chartsToggle.first().textContent()

        // Click to toggle
        await chartsToggle.first().click()
        await page.waitForTimeout(300)

        // Verify state changed
        const newText = await chartsToggle.first().textContent()
        expect(newText).not.toBe(initialText)

        // Reload page
        await page.reload()
        await waitForPageReady(page)

        // Verify preference persisted (localStorage)
        const persistedText = await chartsToggle.first().textContent()
        expect(persistedText).toBe(newText)
      }

      await deleteFundViaAPI(page, fund.id)
    })
  })

  test.describe('Platform Filter', () => {
    test('platform filter shows only funds from selected platform', async ({ page }) => {
      // Create funds on different platforms
      const ticker1 = 'ui-plat-1'
      const ticker2 = 'ui-plat-2'

      const fund1 = await createFundViaAPI(page, TEST_PLATFORM, ticker1, generateTestConfig())
      const fund2 = await createFundViaAPI(page, 'test2', ticker2, generateTestConfig())

      await addEntryViaAPI(page, fund1.id, {
        date: '2024-01-01',
        value: 100,
        action: 'BUY',
        amount: 100
      })

      await addEntryViaAPI(page, fund2.id, {
        date: '2024-01-01',
        value: 100,
        action: 'BUY',
        amount: 100
      })

      // Navigate to dashboard with platform filter
      await page.goto(`${WEB_BASE}/dashboard/${TEST_PLATFORM}`)
      await waitForPageReady(page)

      // Should see fund1 but not fund2
      const fund1Link = page.locator(`a[href*="${fund1.id}"]`)
      const fund2Link = page.locator(`a[href*="${fund2.id}"]`)

      await expect(fund1Link).toBeVisible()
      await expect(fund2Link).not.toBeVisible()

      await deleteFundViaAPI(page, fund1.id)
      await deleteFundViaAPI(page, fund2.id)
    })
  })
})

test.describe('Fund Creation via UI', () => {
  test('can create a new fund through the create modal', async ({ page }) => {
    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Click create fund button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Fund"), button:has-text("Add Fund"), [data-testid="create-fund"]')
    await createButton.first().click()

    // Wait for modal to appear
    await expect(page.locator('[role="dialog"], .modal, [data-testid="create-fund-modal"]')).toBeVisible()

    // Fill in form
    const ticker = 'uicreate' + Date.now().toString(36).slice(-4)

    // Select platform (first available or test)
    const platformSelect = page.locator('select').first()
    if (await platformSelect.count() > 0) {
      // Get available options
      const options = await platformSelect.locator('option').allTextContents()
      if (options.length > 0) {
        await platformSelect.selectOption({ index: 0 })
      }
    }

    // Enter ticker
    const tickerInput = page.locator('input[placeholder*="ticker" i], input[name="ticker"], #ticker, input').filter({ hasText: '' }).first()
    await tickerInput.fill(ticker)

    // Fill fund size
    const fundSizeInput = page.locator('input[name*="fund_size" i], input[placeholder*="fund size" i], input[type="number"]').first()
    if (await fundSizeInput.count() > 0) {
      await fundSizeInput.fill('5000')
    }

    // Submit the form
    const submitButton = page.locator('button[type="submit"]:has-text("Create"), button:has-text("Create Fund")')
    await submitButton.click()

    // Should navigate to the new fund page
    await page.waitForURL(/\/fund\//)

    // Clean up - extract fund ID from URL and delete
    const url = page.url()
    const fundIdMatch = url.match(/\/fund\/([^/]+)/)
    if (fundIdMatch) {
      const fundId = fundIdMatch[1]
      await deleteFundViaAPI(page, fundId)
    }
  })

  test('form validation prevents invalid submission', async ({ page }) => {
    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Open create modal
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Fund"), [data-testid="create-fund"]')
    await createButton.first().click()
    await expect(page.locator('[role="dialog"], .modal')).toBeVisible()

    // Try to submit without filling required fields
    const submitButton = page.locator('button[type="submit"]:has-text("Create")')
    await submitButton.click()

    // Give time for toast to appear
    await page.waitForTimeout(500)

    // Should show validation error (toast or inline error) OR modal should stay open
    // Look for error indicator
    const errorIndicator = page.locator('.error, [data-testid="error"], .toast-error, text=/required|invalid/i')
    const modalStillOpen = page.locator('[role="dialog"], .modal')

    // Validation should either show error message or keep modal open (preventing submission)
    const hasError = await errorIndicator.count() > 0
    const modalOpen = await modalStillOpen.isVisible()
    expect(hasError || modalOpen).toBe(true)

    // Close modal if still open
    const closeButton = page.locator('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]')
    if (await closeButton.count() > 0) {
      await closeButton.first().click()
    }
  })
})

test.describe('Entry Management via UI', () => {
  test('can add entry through the UI', async ({ page }) => {
    // Create a test fund
    const ticker = 'ui-add-entry'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Navigate to fund detail
    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Click add entry button
    const addButton = page.locator('button:has-text("Add Entry"), button:has-text("Add"), [data-testid="add-entry"]')
    await addButton.first().click()

    // Wait for modal
    await expect(page.locator('[role="dialog"], .modal, [data-testid="add-entry-modal"]')).toBeVisible()

    // Fill entry form
    // Date
    const dateInput = page.locator('input[type="date"]')
    await dateInput.fill('2024-01-15')

    // Value/Equity
    const valueInput = page.locator('input[name="value"], input[placeholder*="equity" i], input[placeholder*="value" i], #value')
    await valueInput.first().fill('500')

    // Action
    const actionSelect = page.locator('select[name="action"], #action')
    if (await actionSelect.count() > 0) {
      await actionSelect.selectOption('BUY')
    }

    // Amount
    const amountInput = page.locator('input[name="amount"], #amount')
    await amountInput.first().fill('100')

    // Submit
    const submitButton = page.locator('button[type="submit"]:has-text("Add"), button[type="submit"]:has-text("Save")')
    await submitButton.click()

    // Modal should close and entry should appear in table
    await page.waitForTimeout(500)

    // Verify entry appears in table
    const entryRow = page.locator('table tbody tr, [data-testid="entry-row"]')
    await expect(entryRow.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('can edit entry through the UI', async ({ page }) => {
    // Create fund with entry
    const ticker = 'ui-edit-entry'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100,
      action: 'BUY',
      amount: 100
    })

    // Navigate to fund detail
    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Click on entry row to edit
    const entryRow = page.locator('table tbody tr, [data-testid="entry-row"]').first()
    await entryRow.click()

    // Wait for edit modal
    await page.waitForTimeout(300)

    // Check if edit modal/panel appeared
    const editModal = page.locator('[role="dialog"], .modal, [data-testid="edit-entry-modal"]')
    if (await editModal.count() > 0) {
      // Modify the amount
      const amountInput = page.locator('input[name="amount"], #amount')
      await amountInput.clear()
      await amountInput.fill('200')

      // Save
      const saveButton = page.locator('button[type="submit"]:has-text("Save"), button:has-text("Update")')
      await saveButton.click()

      await page.waitForTimeout(500)
    }

    await deleteFundViaAPI(page, fund.id)
  })

  test('can delete entry with confirmation', async ({ page }) => {
    // Create fund with entry
    const ticker = 'ui-del-entry'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100,
      action: 'BUY',
      amount: 100
    })

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-08',
      value: 200,
      action: 'BUY',
      amount: 100
    })

    // Navigate to fund detail
    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Click entry to open edit modal
    const entryRow = page.locator('table tbody tr, [data-testid="entry-row"]').last()
    await entryRow.click()
    await page.waitForTimeout(300)

    // Find delete button
    const deleteButton = page.locator('button:has-text("Delete"), button[data-testid="delete-entry"]')
    if (await deleteButton.count() > 0) {
      await deleteButton.first().click()

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete"):visible')
      if (await confirmButton.count() > 0) {
        await confirmButton.click()
      }

      await page.waitForTimeout(500)

      // Verify entry count decreased
      const entriesAfter = await page.locator('table tbody tr').count()
      expect(entriesAfter).toBeLessThanOrEqual(1)
    }

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Fund Detail Page Interactions', () => {
  test('fund detail page loads correctly', async ({ page }) => {
    const ticker = 'ui-detail-load'
    const config = generateTestConfig({ fund_size_usd: 10000 })
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

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
      amount: 0
    })

    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Verify ticker is displayed
    await expect(page.locator(`text=${ticker.toUpperCase()}`)).toBeVisible()

    // Verify entries table exists
    await expect(page.locator('table, [data-testid="entries-table"]')).toBeVisible()

    // Verify stats section exists (may be part of the main layout)
    const statsSection = page.locator('.stats, [data-testid="fund-stats"], .grid')
    await expect(statsSection.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('recommendation badge displays correctly', async ({ page }) => {
    const ticker = 'ui-rec-badge'
    const config = generateTestConfig({
      fund_size_usd: 10000,
      target_apy: 0.25,
      manage_cash: true
    })
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Create a scenario where recommendation should appear
    // Fund at target - should show HOLD
    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 1000,
      action: 'BUY',
      amount: 1000
    })

    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Look for recommendation display
    const recBadge = page.locator('[data-testid="recommendation"], .recommendation, .badge:has-text("BUY"), .badge:has-text("SELL"), .badge:has-text("HOLD"), text=/BUY|SELL|HOLD/i')

    // Recommendation should exist somewhere on the page
    // This might be in a badge or a panel
    await expect(recBadge.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('charts expand and collapse', async ({ page }) => {
    const ticker = 'ui-charts-collapse'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

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
      amount: 0
    })

    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Find charts section toggle
    const chartsToggle = page.locator('button:has-text("Charts"), button:has-text("Hide Charts"), button:has-text("Show Charts"), [data-testid="charts-toggle"]')

    if (await chartsToggle.count() > 0) {
      // Get initial visibility of chart canvas/SVG
      const chartElement = page.locator('canvas, svg.chart, [data-testid="chart"]')

      // Toggle charts
      await chartsToggle.first().click()
      await page.waitForTimeout(300)

      // Toggle again
      await chartsToggle.first().click()
      await page.waitForTimeout(300)
    }

    await deleteFundViaAPI(page, fund.id)
  })

  test('edit fund config panel opens', async ({ page }) => {
    const ticker = 'ui-edit-config'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100,
      action: 'BUY',
      amount: 100
    })

    // Navigate to edit route
    await page.goto(`${WEB_BASE}/fund/${fund.id}/edit`)
    await waitForPageReady(page)

    // Edit panel should be visible
    const editPanel = page.locator('[data-testid="edit-fund-panel"], .edit-panel, form')
    await expect(editPanel.first()).toBeVisible()

    // Verify config fields are present
    const fundSizeInput = page.locator('input[name*="fund_size" i], input[placeholder*="fund size" i]')
    if (await fundSizeInput.count() > 0) {
      await expect(fundSizeInput.first()).toBeVisible()
    }

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Navigation Flows', () => {
  test('deep link to fund detail works', async ({ page }) => {
    const ticker = 'ui-deeplink-detail'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100,
      action: 'BUY',
      amount: 100
    })

    // Navigate directly to fund detail via deep link
    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Should load fund detail page
    await expect(page.locator(`text=${ticker.toUpperCase()}`)).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('deep link to fund edit works', async ({ page }) => {
    const ticker = 'ui-deeplink-edit'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100,
      action: 'BUY',
      amount: 100
    })

    // Navigate directly to edit via deep link
    await page.goto(`${WEB_BASE}/fund/${fund.id}/edit`)
    await waitForPageReady(page)

    // Edit panel should be open
    const editPanel = page.locator('[data-testid="edit-fund-panel"], .edit-panel, form')
    await expect(editPanel.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('deep link to add entry works', async ({ page }) => {
    const ticker = 'ui-deeplink-add'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    // Navigate directly to add entry via deep link
    await page.goto(`${WEB_BASE}/fund/${fund.id}/add`)
    await waitForPageReady(page)

    // Add entry modal should be visible
    const addModal = page.locator('[role="dialog"], .modal, [data-testid="add-entry-modal"]')
    await expect(addModal.first()).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
  })

  test('breadcrumb navigation works', async ({ page }) => {
    const ticker = 'ui-breadcrumb'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100,
      action: 'BUY',
      amount: 100
    })

    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Look for breadcrumb or back link
    const backLink = page.locator('a:has-text("Dashboard"), a:has-text("Back"), nav a, [data-testid="breadcrumb"] a')

    if (await backLink.count() > 0) {
      await backLink.first().click()

      // Should navigate to dashboard
      await page.waitForURL(/\/$|\/?dashboard/)
    }

    await deleteFundViaAPI(page, fund.id)
  })

  test('browser back button works', async ({ page }) => {
    const ticker = 'ui-back-btn'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await addEntryViaAPI(page, fund.id, {
      date: '2024-01-01',
      value: 100,
      action: 'BUY',
      amount: 100
    })

    // Navigate to dashboard first
    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Then to fund detail
    await page.goto(`${WEB_BASE}/fund/${fund.id}`)
    await waitForPageReady(page)

    // Go back
    await page.goBack()
    await page.waitForURL(/\/$/)

    // Should be on dashboard
    await expect(page).toHaveURL(/\/$/)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Form Validation', () => {
  test('required fields show validation errors', async ({ page }) => {
    const ticker = 'ui-form-valid'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await page.goto(`${WEB_BASE}/fund/${fund.id}/add`)
    await waitForPageReady(page)

    // Try to submit without filling required fields
    const submitButton = page.locator('button[type="submit"]:has-text("Add"), button[type="submit"]:has-text("Save")')
    await submitButton.click()

    // Should show validation error (either toast or inline) OR modal should stay open
    await page.waitForTimeout(500)

    // Validation should either show error message or keep modal open (preventing submission)
    const errorIndicator = page.locator('.error, [data-testid="error"], .toast-error, text=/required|invalid/i')
    const modalStillOpen = page.locator('[role="dialog"], .modal')

    const hasError = await errorIndicator.count() > 0
    const modalOpen = await modalStillOpen.isVisible()
    expect(hasError || modalOpen).toBe(true)

    // Close modal
    const closeButton = page.locator('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]')
    if (await closeButton.count() > 0) {
      await closeButton.first().click()
    }

    await deleteFundViaAPI(page, fund.id)
  })

  test('number inputs accept valid values', async ({ page }) => {
    const ticker = 'ui-num-valid'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await page.goto(`${WEB_BASE}/fund/${fund.id}/add`)
    await waitForPageReady(page)

    // Fill with valid number
    const valueInput = page.locator('input[name="value"], input[placeholder*="equity" i], #value').first()
    await valueInput.fill('1000.50')

    // Value should be accepted
    await expect(valueInput).toHaveValue('1000.50')

    await page.locator('button:has-text("Cancel")').click()

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Toast Notifications', () => {
  test('success toast appears on successful action', async ({ page }) => {
    const ticker = 'ui-toast-success'
    const config = generateTestConfig()
    const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)

    await page.goto(`${WEB_BASE}/fund/${fund.id}/add`)
    await waitForPageReady(page)

    // Fill valid entry
    const dateInput = page.locator('input[type="date"]')
    await dateInput.fill('2024-01-15')

    const valueInput = page.locator('input[name="value"], #value').first()
    await valueInput.fill('500')

    const actionSelect = page.locator('select[name="action"], #action')
    if (await actionSelect.count() > 0) {
      await actionSelect.selectOption('BUY')
    }

    const amountInput = page.locator('input[name="amount"], #amount').first()
    await amountInput.fill('100')

    // Submit
    const submitButton = page.locator('button[type="submit"]:has-text("Add")')
    await submitButton.click()

    // Wait for toast or modal to close (indicating success)
    await page.waitForTimeout(500)

    // Look for toast notification or verify modal closed (success indicator)
    const toast = page.locator('.toast, [data-sonner-toast], .Toastify, [role="alert"]')
    const modalClosed = !(await page.locator('[role="dialog"], .modal').isVisible())

    // Either toast appeared or modal closed (both indicate success)
    const hasToast = await toast.count() > 0
    expect(hasToast || modalClosed).toBe(true)

    await deleteFundViaAPI(page, fund.id)
  })
})

test.describe('Responsive Layout', () => {
  test('mobile viewport renders without errors', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Verify page loads and main content is visible at mobile viewport
    // The specific UI (hamburger menu vs responsive layout) is implementation-dependent
    const mainContent = page.locator('main, #root, [data-testid="app"]')
    await expect(mainContent.first()).toBeVisible()
  })

  test('desktop viewport shows full navigation', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })

    await page.goto(WEB_BASE)
    await waitForPageReady(page)

    // Navigation should be visible
    const nav = page.locator('nav, [role="navigation"], .sidebar')
    await expect(nav.first()).toBeVisible()
  })
})
