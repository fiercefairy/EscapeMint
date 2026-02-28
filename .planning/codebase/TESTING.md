# Testing Patterns

**Analysis Date:** 2026-02-28

## Test Framework

**Runner:**
- Vitest for unit/integration tests (packages/engine, packages/storage, packages/server, packages/web)
- Playwright for E2E tests (e2e/ directory)

**Assertion Library:**
- Vitest uses expect() from Vitest
- Playwright uses expect() from @playwright/test

**Run Commands:**
```bash
npm run test                    # Run engine + storage unit tests
npm run test:engine            # Engine package only
npm run test:storage           # Storage package only
npm run test:e2e               # Playwright E2E tests (headless, single worker)
npm run test:e2e:headed        # E2E with visible browser
npm run test:e2e:ui            # E2E with Playwright UI
npm run test:coverage          # Run coverage for all packages
npm run test:coverage:engine   # Engine coverage only
npm run test:coverage:storage  # Storage coverage only
npm run lint                   # ESLint check
npm run typecheck              # TypeScript check
```

## Test File Organization

**Location:**
- Unit/integration tests co-located with code: `packages/*/test/` directory
- E2E tests centralized: `e2e/*.spec.ts`

**Naming:**
- Unit tests: `{module}.test.ts` (e.g., `expected-equity.test.ts`, `fund-store.test.ts`)
- E2E tests: `{feature}.spec.ts` (e.g., `cash-funds.spec.ts`, `derivatives-funds.spec.ts`)

**Structure:**
```
packages/engine/
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── expected-equity.ts
│   └── recommendation.ts
└── test/
    ├── expected-equity.test.ts
    ├── recommendation.test.ts
    ├── aggregate.test.ts
    └── invariants.test.ts

packages/storage/
├── src/
│   └── fund-store.ts
└── test/
    └── fund-store.test.ts

e2e/
├── cash-funds.spec.ts
├── derivatives-funds.spec.ts
├── high-priority-features.spec.ts
├── integrity-tests.spec.ts
├── test-utils.ts
├── test-fixtures.ts
├── global-setup.ts
└── global-teardown.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect } from 'vitest'
import { computeFundState } from '../src/expected-equity.js'
import type { SubFundConfig, FundState } from '../src/types.js'

// Setup: shared test data or configuration
const baseConfig: SubFundConfig = {
  fund_size_usd: 10000,
  target_apy: 0.30,
  interval_days: 7,
  input_min_usd: 100,
  input_mid_usd: 200,
  input_max_usd: 300,
  max_at_pct: -0.25,
  min_profit_usd: 100,
  cash_apy: 0.044,
  margin_apr: 0.0725,
  margin_access_usd: 0,
  accumulate: false,
  start_date: '2024-01-01',
}

// Test suite
describe('computeFundState', () => {
  // Individual test case
  it('returns expected fund state with no trades', () => {
    const result = computeFundState(baseConfig, [], '2024-01-01')
    expect(result.cash_available_usd).toBe(10000)
    expect(result.actual_value_usd).toBe(0)
  })

  it('compounds multiple trades correctly', () => {
    const trades = [
      { date: '2024-01-01', amount_usd: 1000, type: 'buy' }
    ]
    const result = computeFundState(baseConfig, trades, '2025-01-01')
    expect(result.expected_target_usd).toBeCloseTo(1301, 0)
  })
})
```

**Patterns:**
- Test suite per exported function: One `describe()` block per public function
- Base config objects as constants for reuse across tests
- Helper functions for generating test data: `makeState()`, `generateCashFundConfig()`
- Partial overrides for variation: `makeState({ cash_available_usd: 5000 })`
- Descriptive test names: `it('compounds multiple trades correctly')` over `it('works')`
- Setup done with const assignments, teardown with cleanup in E2E fixtures

## Mocking

**Framework:** Vitest built-in mocks (vi module)

**Patterns:**

E2E API mocking via test utilities in `e2e/test-utils.ts`:
```typescript
// Create helper functions that call real API endpoints
export async function createFundViaAPI(
  page: Page,
  platform: string,
  ticker: string,
  config: FundConfig
): Promise<FundData> {
  const response = await page.request.post(`${API_BASE}/funds`, {
    data: { platform, ticker, config }
  })
  return response.json()
}

// Usage in tests
const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
```

Unit tests avoid mocking when possible:
- Pure functions tested directly without mocks: `computeFundState(config, trades, date)`
- File I/O in storage tests uses real TSV files (not mocked)
- HTTP calls in API routes use `.catch(next)` pattern for error propagation

**What to Mock:**
- E2E: Only mock external services if not available (Coinbase API scraping is optional)
- Integration tests: Avoid mocks for storage layer (use real files with cleanup)
- Unit tests: No mocks for pure calculations (engine package)

**What NOT to Mock:**
- File I/O in storage tests—test real TSV persistence
- Pure calculation functions—test directly
- Error handling paths—test by throwing real errors

## Fixtures and Factories

**Test Data:**

In `packages/engine/test/`:
```typescript
// Config factory with defaults
const baseConfig: SubFundConfig = {
  fund_size_usd: 10000,
  target_apy: 0.30,
  interval_days: 7,
  input_min_usd: 100,
  // ... rest of defaults
}

// State factory
function makeState(overrides: Partial<FundState> = {}): FundState {
  return {
    cash_available_usd: 5000,
    expected_target_usd: 1000,
    actual_value_usd: 1000,
    start_input_usd: 1000,
    gain_usd: 0,
    gain_pct: 0,
    target_diff_usd: 0,
    cash_interest_usd: 0,
    realized_gains_usd: 0,
    ...overrides
  }
}
```

In `e2e/test-fixtures.ts`:
```typescript
// Platform and ticker constants for test isolation
export const TEST_PLATFORM = 'test'
export const TEST_TICKERS = {
  CASH_FUNDS: {
    BASIC: 'cash-basic',
    WITH_DEPOSITS: 'cash-deposits'
  },
  DERIVATIVES: {
    BASIC: 'deriv-basic'
  }
}
```

In `e2e/`:
```typescript
// Config generator
function generateCashFundConfig(overrides: Partial<FundConfig> = {}): FundConfig {
  return {
    status: 'active',
    fund_type: 'cash',
    fund_size_usd: 10000,
    target_apy: 0,
    interval_days: 1,
    input_min_usd: 0,
    input_mid_usd: 0,
    input_max_usd: 0,
    max_at_pct: 0,
    min_profit_usd: 0,
    cash_apy: 0.044,
    margin_apr: 0,
    margin_access_usd: 0,
    accumulate: true,
    manage_cash: true,
    margin_enabled: false,
    dividend_reinvest: true,
    interest_reinvest: true,
    expense_from_fund: true,
    ...overrides
  }
}
```

**Location:**
- `packages/engine/test/`: Share `baseConfig` const and `makeState()` helper within test files
- `e2e/test-utils.ts`: Shared API helpers and TypeScript interfaces matching server responses
- `e2e/test-fixtures.ts`: Platform/ticker constants and test data

## Coverage

**Requirements:** None enforced (coverage tracking is optional)

**View Coverage:**
```bash
npm run test:coverage              # Full coverage report
npm run test:coverage:engine       # Engine coverage only
```

Coverage output:
- Format: text, HTML, LCOV, JSON summary
- Reports directory: `{package}/coverage/`
- Excludes: `*.d.ts` and `*.test.ts` files from coverage calculation

## Test Types

**Unit Tests:**

Location: `packages/*/test/`
Scope: Single exported function
Approach:
- Test pure functions directly
- Pass test data via parameters (no mocks)
- Use factory functions for complex fixtures
- Test edge cases: empty inputs, boundary conditions, error paths
- Example: `packages/engine/test/expected-equity.test.ts`

Functions tested:
- `computeExpectedTarget()` with various trade combinations
- `computeCashAvailable()` with different cash flows
- `entriesToTrades()` conversion functions
- `recommendeation()` decision logic

**Integration Tests:**

Location: `packages/storage/test/`, `packages/server/test/`
Scope: Module interactions (file I/O, database queries)
Approach:
- Storage tests use real TSV files with cleanup
- Server tests may use real API routes
- Test data isolation via unique fund IDs
- Example: `packages/storage/test/fund-store.test.ts` reads/writes real TSV files

**E2E Tests:**

Framework: Playwright
Location: `e2e/`
Scope: Full user workflows
Approach:
- Launch real browsers and servers (configured in `playwright.config.ts`)
- Single worker (`workers: 1`) to prevent data conflicts
- Sequential test execution (`fullyParallel: false`)
- Test platform `'test'` for isolation from production data
- Data cleanup via API: `deleteFundViaAPI()` after each test
- Timeout: 15s locally, 30s in CI (generous for CI)

Configuration:
```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,  // Run tests sequentially
  workers: 1,             // Single worker to avoid data conflicts
  timeout: process.env.CI ? 30000 : 15000,
  expect: {
    timeout: process.env.CI ? 10000 : 5000,
  },
})
```

Coverage includes:
- Fund creation/deletion
- Entry addition and modification
- Calculations and recommendations
- Cash/derivatives fund features
- Platform management
- Data import/export
- Integrity checks

E2E test files:
- `e2e/cash-funds.spec.ts` - Cash fund workflows
- `e2e/derivatives-funds.spec.ts` - Perpetuals trading, margin, liquidation
- `e2e/high-priority-features.spec.ts` - Core features
- `e2e/integrity-tests.spec.ts` - Data consistency and calculation correctness
- `e2e/fund-configurations.spec.ts` - Config management
- `e2e/platform-management.spec.ts` - Platform CRUD
- `e2e/import-export.spec.ts` - Data import/export workflows

## Common Patterns

**Async Testing:**

Unit tests with async functions:
```typescript
it('async function', async () => {
  const result = await someAsyncFunction()
  expect(result).toBe(expected)
})
```

E2E async patterns:
```typescript
test('create and verify fund', async ({ page }) => {
  const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
  expect(fund.id).toBe(`${TEST_PLATFORM}-${ticker}`)

  const state = await getFundStateViaAPI(page, fund.id)
  expect(state.cash_available_usd).toBe(config.fund_size_usd)
})
```

**Error Testing:**

Testing error cases:
```typescript
it('returns 0 if sells exceed buys', () => {
  const trades: Trade[] = [
    { date: '2024-01-01', amount_usd: 100, type: 'buy' },
    { date: '2024-01-08', amount_usd: 500, type: 'sell' }
  ]
  const result = computeStartInput(trades, '2024-01-15')
  expect(result).toBe(0)  // No negative values
})
```

API error testing via expect:
```typescript
it('returns 404 for missing fund', async ({ page }) => {
  const response = await page.request.get(`${API_BASE}/funds/nonexistent`)
  expect(response.status()).toBe(404)
  const data = await response.json()
  expect(data.error.code).toBe('NOT_FOUND')
})
```

**Snapshot Testing:**

Not used in this codebase. Values tested with `.toBeCloseTo()` for floating-point precision.

**Data Cleanup:**

E2E tests clean up after themselves:
```typescript
test('create fund', async ({ page }) => {
  const fund = await createFundViaAPI(page, TEST_PLATFORM, ticker, config)
  expect(fund.id).toBeDefined()

  // Always cleanup
  await deleteFundViaAPI(page, fund.id)
})
```

Global cleanup in `e2e/global-teardown.ts` for fallback cleanup.

---

*Testing analysis: 2026-02-28*
