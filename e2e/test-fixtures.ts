/**
 * Static test fund fixtures
 *
 * These define predictable fund names used in E2E tests.
 * All test funds use the "test" platform to isolate from real data.
 */

// Single test platform for all test funds - won't conflict with real data
export const TEST_PLATFORM = 'test'

// Static test fund tickers organized by test category
export const TEST_TICKERS = {
  // Fund Configurations tests
  CASH_MANAGEMENT: {
    WITH_CASH: 'foo',
    WITHOUT_CASH: 'bar',
    DEPOSITS: 'deposits'
  },
  ACCUMULATE: {
    ACCUMULATE_TRUE: 'acc-true',
    ACCUMULATE_FALSE: 'acc-false'
  },
  MARGIN: {
    WITH_MARGIN: 'margin-yes',
    WITHOUT_MARGIN: 'margin-no'
  },
  DIVIDENDS: {
    REINVEST_TRUE: 'div-reinvest',
    REINVEST_FALSE: 'div-extract',
    INTEREST_REINVEST: 'int-reinvest',
    INTEREST_EXTRACT: 'int-extract'
  },
  EXPENSES: {
    FROM_FUND: 'exp-fund',
    EXTERNAL: 'exp-ext'
  },
  DCA_TIERS: {
    PROFITABLE: 'dca-profit',
    MILD_LOSS: 'dca-mild',
    SIGNIFICANT_LOSS: 'dca-sig'
  },
  CLOSED: {
    ZERO_SIZE: 'closed-zero',
    FINAL_METRICS: 'closed-final'
  },

  // Yearly Simulation tests
  SIMULATION: {
    BULL_MARKET: 'sim-bull',
    BEAR_MARKET: 'sim-bear',
    VOLATILE: 'sim-volatile',
    CRASH_RECOVERY: 'sim-crash',
    DIVIDENDS_INTEREST: 'sim-div-int',
    LIFECYCLE: 'sim-lifecycle',
    INVARIANT_CASH: 'sim-inv-cash',
    INVARIANT_GAIN: 'sim-inv-gain',
    INVARIANT_POSITIVE: 'sim-inv-pos'
  },

  // Integrity Tests
  INTEGRITY: {
    EDIT_BUY: 'int-edit-buy',
    EDIT_DEPOSIT: 'int-edit-dep',
    EDIT_VALUE: 'int-edit-val',
    CHANGE_ACTION: 'int-chg-act',
    DELETE_MIDDLE: 'int-del-mid',
    DELETE_FIRST: 'int-del-first',
    DELETE_LAST: 'int-del-last',
    DATE_ORDER: 'int-date-ord',
    DATE_EDIT: 'int-date-edit',
    DIVIDEND_EDIT: 'int-div-edit',
    EXPENSE_EDIT: 'int-exp-edit',
    FUND_SIZE_PROP: 'int-fs-prop',
    FUND_SIZE_NET: 'int-fs-net',
    ZERO_VALUE: 'int-zero',
    SMALL_AMOUNTS: 'int-small',
    LARGE_AMOUNTS: 'int-large',
    NEGATIVE_VALUES: 'int-neg',
    FULL_LIQUIDATION: 'int-liq',
    SHARES_ACCUM: 'int-shares',
    SHARES_EDIT: 'int-shares-edit',
    NOTES: 'int-notes',
    DEPOSIT_NOTES: 'int-dep-notes'
  },

  // Derivatives test tickers (for perp futures)
  DERIVATIVES: {
    BTC_PERP: 'btc-perp-fake',
    ETH_PERP: 'eth-perp-fake',
    // Additional derivatives test tickers
    DEPOSIT_TEST: 'deriv-deposit-test',
    WITHDRAW_TEST: 'deriv-withdraw-test',
    FUNDING_TEST: 'deriv-funding-test',
    INTEREST_TEST: 'deriv-interest-test',
    FEE_TEST: 'deriv-fee-test',
    REBATE_TEST: 'deriv-rebate-test',
    BUY_TEST: 'deriv-buy-test',
    SELL_TEST: 'deriv-sell-test',
    FIFO_TEST: 'deriv-fifo-test',
    ACCUM_TEST: 'deriv-accum-test',
    MARGIN_TRACK: 'deriv-margin-track',
    CASH_CONSTRAINT: 'deriv-cash-constraint',
    UNREALIZED_PNL: 'deriv-unrealized-pnl',
    REALIZED_PNL: 'deriv-realized-pnl',
    FUNDING_PNL: 'deriv-funding-pnl',
    LIFECYCLE: 'deriv-lifecycle',
    VOLATILE: 'deriv-volatile',
    ZERO_POS: 'deriv-zero-pos',
    SMALL_AMT: 'deriv-small-amt',
    LARGE_POS: 'deriv-large-pos'
  },

  // UI Workflow test tickers
  UI_WORKFLOWS: {
    DASHBOARD: 'ui-dashboard',
    CREATE_FUND: 'ui-create',
    ENTRY_CRUD: 'ui-entry',
    NAVIGATION: 'ui-nav'
  },

  // Platform management test tickers
  PLATFORMS: {
    CREATE: 'plat-create',
    EDIT: 'plat-edit',
    DELETE: 'plat-delete'
  },

  // Import/Export test tickers
  IMPORT_EXPORT: {
    EXPORT_TEST: 'ie-export',
    IMPORT_MERGE: 'ie-merge',
    IMPORT_REPLACE: 'ie-replace'
  },

  // Cash fund test tickers
  CASH_FUNDS: {
    BASIC: 'cash-basic',
    INTEREST: 'cash-interest',
    TWAB: 'cash-twab'
  },

  // High-priority feature tests
  HIGH_PRIORITY: {
    REOPEN_TEST: 'reopen-test',
    REOPEN_RETAIN: 'reopen-retain',
    BACKUP_TEST: 'backup-test',
    DCA_INVALID_1: 'dca-invalid-1',
    DCA_INVALID_2: 'dca-invalid-2',
    DCA_VALID: 'dca-valid',
    DATE_VAL_1: 'date-val-1',
    DATE_VAL_2: 'date-val-2',
    DATE_VAL_3: 'date-val-3'
  }
} as const

/**
 * Helper to generate a full fund ID from platform and ticker
 */
export function getFundId(platform: string, ticker: string): string {
  return `${platform}-${ticker.toLowerCase()}`
}

/**
 * Get the test platform pattern for cleanup
 */
export function getTestPlatformPattern(): string {
  return `${TEST_PLATFORM}-`
}
