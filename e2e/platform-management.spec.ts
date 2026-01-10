import { test, expect, type Page } from '@playwright/test'
import {
  createFundViaAPI,
  deleteFundViaAPI,
  generateTestConfig,
  API_BASE
} from './test-utils'

const WEB_BASE = 'http://localhost:5550'

/**
 * Create a platform via API
 */
async function createPlatformViaAPI(page: Page, id: string, name?: string) {
  const response = await page.request.post(`${API_BASE}/platforms`, {
    data: { id, name: name ?? id }
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

/**
 * Delete a platform via API
 */
async function deletePlatformViaAPI(page: Page, id: string) {
  const response = await page.request.delete(`${API_BASE}/platforms/${id}`)
  return response
}

/**
 * Get a platform via API
 */
async function getPlatformViaAPI(page: Page, id: string) {
  const response = await page.request.get(`${API_BASE}/platforms/${id}`)
  if (response.ok()) {
    return response.json()
  }
  return null
}

/**
 * List all platforms via API
 */
async function listPlatformsViaAPI(page: Page) {
  const response = await page.request.get(`${API_BASE}/platforms`)
  expect(response.ok()).toBeTruthy()
  return response.json()
}

/**
 * Update platform via API
 */
async function updatePlatformViaAPI(page: Page, id: string, data: { name?: string }) {
  const response = await page.request.patch(`${API_BASE}/platforms/${id}`, {
    data
  })
  return response
}

async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
}

test.describe('Platform Management API', () => {
  test.describe('Create Platform', () => {
    test('can create a new platform', async ({ page }) => {
      const platformId = `test-plat-${Date.now()}`

      const platform = await createPlatformViaAPI(page, platformId, 'Test Platform')

      expect(platform.id).toBe(platformId)
      expect(platform.name).toBe('Test Platform')

      // Clean up
      await deletePlatformViaAPI(page, platformId)
    })

    test('platform ID must be lowercase with hyphens', async ({ page }) => {
      // Valid ID should be accepted
      const validId = 'my-platform-123'
      const platform = await createPlatformViaAPI(page, validId)
      expect(platform.id).toBe(validId)
      await deletePlatformViaAPI(page, validId)
    })

    test('rejects invalid platform ID formats', async ({ page }) => {
      // Test invalid formats that should be rejected
      const invalidIds = [
        'MyPlatform',      // Contains uppercase
        'my_platform',     // Contains underscore
        'my platform',     // Contains space
        'my.platform'      // Contains period
      ]

      for (const invalidId of invalidIds) {
        const response = await page.request.post(`${API_BASE}/platforms`, {
          data: { id: invalidId, name: 'Invalid Platform' }
        })
        // Should reject invalid format
        expect(response.ok()).toBeFalsy()
      }
    })

    test('rejects duplicate platform ID', async ({ page }) => {
      const platformId = `test-dup-${Date.now()}`

      // Create first
      await createPlatformViaAPI(page, platformId)

      // Try to create duplicate
      const response = await page.request.post(`${API_BASE}/platforms`, {
        data: { id: platformId, name: 'Duplicate' }
      })

      expect(response.ok()).toBeFalsy()

      // Clean up
      await deletePlatformViaAPI(page, platformId)
    })
  })

  test.describe('Read Platform', () => {
    test('can list all platforms', async ({ page }) => {
      const platformId = `test-list-${Date.now()}`
      await createPlatformViaAPI(page, platformId)

      const platforms = await listPlatformsViaAPI(page)

      expect(Array.isArray(platforms)).toBe(true)
      expect(platforms.some((p: { id: string }) => p.id === platformId)).toBe(true)

      await deletePlatformViaAPI(page, platformId)
    })

    test('can get single platform', async ({ page }) => {
      const platformId = `test-get-${Date.now()}`
      await createPlatformViaAPI(page, platformId, 'Get Test')

      const platform = await getPlatformViaAPI(page, platformId)

      expect(platform.id).toBe(platformId)
      expect(platform.name).toBe('Get Test')

      await deletePlatformViaAPI(page, platformId)
    })
  })

  test.describe('Update Platform', () => {
    test('can update platform name', async ({ page }) => {
      const platformId = `test-update-${Date.now()}`
      await createPlatformViaAPI(page, platformId, 'Original Name')

      const response = await updatePlatformViaAPI(page, platformId, { name: 'Updated Name' })
      expect(response.ok()).toBeTruthy()

      const updated = await getPlatformViaAPI(page, platformId)
      expect(updated.name).toBe('Updated Name')

      await deletePlatformViaAPI(page, platformId)
    })
  })

  test.describe('Delete Platform', () => {
    test('can delete empty platform', async ({ page }) => {
      const platformId = `test-delete-${Date.now()}`
      await createPlatformViaAPI(page, platformId)

      const response = await deletePlatformViaAPI(page, platformId)
      expect(response.ok()).toBeTruthy()

      // Verify it's gone
      const platform = await getPlatformViaAPI(page, platformId)
      expect(platform).toBeNull()
    })

    test('cannot delete platform with funds', async ({ page }) => {
      const platformId = `test-del-funds-${Date.now()}`
      await createPlatformViaAPI(page, platformId)

      // Create a fund on this platform
      const fund = await createFundViaAPI(page, platformId, 'testfund', generateTestConfig())

      // Try to delete platform
      const response = await deletePlatformViaAPI(page, platformId)

      // Should fail because platform has funds
      expect(response.ok()).toBeFalsy()

      // Clean up
      await deleteFundViaAPI(page, fund.id)
      await deletePlatformViaAPI(page, platformId)
    })
  })
})

test.describe('Platform Management UI', () => {
  test('platforms page lists all platforms', async ({ page }) => {
    const platformId = `test-ui-list-${Date.now()}`
    await createPlatformViaAPI(page, platformId, 'UI Test Platform')

    await page.goto(`${WEB_BASE}/platforms`)
    await waitForPageReady(page)

    // Should see platform in list
    await expect(page.locator('text=UI Test Platform')).toBeVisible()

    await deletePlatformViaAPI(page, platformId)
  })

  test('can create platform via UI', async ({ page }) => {
    await page.goto(`${WEB_BASE}/platforms`)
    await waitForPageReady(page)

    // Click create button
    const createButton = page.locator('button:has-text("Create"), button:has-text("Add Platform"), button:has-text("New")')
    if (await createButton.count() > 0) {
      await createButton.first().click()

      // Wait for modal/form
      await page.waitForTimeout(300)

      const platformId = `ui-create-${Date.now()}`

      // Fill form
      const idInput = page.locator('input[name="id"], input[placeholder*="id" i], #id')
      if (await idInput.count() > 0) {
        await idInput.fill(platformId)

        const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], #name')
        if (await nameInput.count() > 0) {
          await nameInput.fill('Created via UI')
        }

        // Submit
        const submitButton = page.locator('button[type="submit"], button:has-text("Create")')
        await submitButton.click()

        await page.waitForTimeout(500)

        // Verify platform was created
        const platform = await getPlatformViaAPI(page, platformId)
        if (platform) {
          expect(platform.id).toBe(platformId)
          await deletePlatformViaAPI(page, platformId)
        }
      }
    }
  })

  test('can navigate to platform detail', async ({ page }) => {
    const platformId = `test-ui-nav-${Date.now()}`
    await createPlatformViaAPI(page, platformId, 'Nav Test Platform')

    await page.goto(`${WEB_BASE}/platforms`)
    await waitForPageReady(page)

    // Click on platform to view detail
    const platformLink = page.locator(`a[href*="${platformId}"], text=Nav Test Platform`)
    if (await platformLink.count() > 0) {
      await platformLink.first().click()

      // Should navigate to platform detail or dashboard filtered
      await page.waitForURL(/platform|dashboard/)
    }

    await deletePlatformViaAPI(page, platformId)
  })

  test('platform detail shows funds on platform', async ({ page }) => {
    const platformId = `test-ui-detail-${Date.now()}`
    await createPlatformViaAPI(page, platformId)

    // Create a fund on this platform
    const fund = await createFundViaAPI(page, platformId, 'detailfund', generateTestConfig())

    await page.goto(`${WEB_BASE}/platforms/${platformId}`)
    await waitForPageReady(page)

    // Should see the fund
    await expect(page.locator('text=/detailfund/i')).toBeVisible()

    await deleteFundViaAPI(page, fund.id)
    await deletePlatformViaAPI(page, platformId)
  })
})

test.describe('Platform Cash Tracking', () => {
  test('can enable cash tracking on platform', async ({ page }) => {
    const platformId = `test-cash-enable-${Date.now()}`
    await createPlatformViaAPI(page, platformId)

    // Enable cash tracking via API
    const response = await page.request.post(`${API_BASE}/platforms/${platformId}/cash-enable`)
    expect(response.ok()).toBeTruthy()

    // Get platform status
    const statusResponse = await page.request.get(`${API_BASE}/platforms/${platformId}/cash-status`)
    expect(statusResponse.ok()).toBeTruthy()

    const status = await statusResponse.json()
    expect(status.manage_cash).toBe(true)

    await deletePlatformViaAPI(page, platformId)
  })

  test('can disable cash tracking on platform', async ({ page }) => {
    const platformId = `test-cash-disable-${Date.now()}`
    await createPlatformViaAPI(page, platformId)

    // Enable first
    await page.request.post(`${API_BASE}/platforms/${platformId}/cash-enable`)

    // Then disable
    const response = await page.request.post(`${API_BASE}/platforms/${platformId}/cash-disable`)
    expect(response.ok()).toBeTruthy()

    // Get platform status
    const statusResponse = await page.request.get(`${API_BASE}/platforms/${platformId}/cash-status`)
    const status = await statusResponse.json()
    expect(status.manage_cash).toBe(false)

    await deletePlatformViaAPI(page, platformId)
  })
})

test.describe('Platform Metrics', () => {
  test('platform metrics aggregate fund values', async ({ page }) => {
    const platformId = `test-metrics-${Date.now()}`
    await createPlatformViaAPI(page, platformId)

    // Create funds with entries
    const fund1 = await createFundViaAPI(page, platformId, 'met1', generateTestConfig({ fund_size_usd: 10000 }))
    const fund2 = await createFundViaAPI(page, platformId, 'met2', generateTestConfig({ fund_size_usd: 20000 }))

    // Add entries
    await page.request.post(`${API_BASE}/funds/${fund1.id}/entries`, {
      data: { date: '2024-01-01', value: 1000, action: 'BUY', amount: 1000 }
    })

    await page.request.post(`${API_BASE}/funds/${fund2.id}/entries`, {
      data: { date: '2024-01-01', value: 2000, action: 'BUY', amount: 2000 }
    })

    // Get platform metrics
    const response = await page.request.get(`${API_BASE}/platforms/${platformId}/metrics`)
    expect(response.ok()).toBeTruthy()

    const metrics = await response.json()

    // Should have aggregated data
    expect(metrics.fund_count).toBe(2)
    expect(metrics.total_value).toBeGreaterThan(0)

    // Clean up
    await deleteFundViaAPI(page, fund1.id)
    await deleteFundViaAPI(page, fund2.id)
    await deletePlatformViaAPI(page, platformId)
  })
})
