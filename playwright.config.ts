import { defineConfig, devices } from '@playwright/test'

// Import ports from ecosystem config (single source of truth)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PORTS } = require('./ecosystem.config.cjs')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests sequentially for data integrity
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid data conflicts
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  use: {
    baseURL: `http://localhost:${PORTS.WEB}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: `http://localhost:${PORTS.API}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npm run dev:web',
      url: `http://localhost:${PORTS.WEB}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
})
