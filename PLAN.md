# EscapeMint - GitHub Repository Plan

A local-first, open-source capital allocation engine for rules-based fund management.

---

## 1. High-Level Product Spec

### User Stories (v1)

1. **Portfolio Setup**: As a user, I can create a portfolio with multiple sub-funds (Robinhood, Coinbase, M1, etc.)
2. **Sub-Fund Configuration**: As a user, I can configure each sub-fund with target APY, action amount, period, and start date
3. **Snapshot Entry**: As a user, I can enter equity snapshots (date, value) for any sub-fund at any time
4. **Action Recommendations**: As a user, I see buy/sell/hold recommendations based on deviation from expected growth
5. **Action Tracking**: As a user, I can record my actual action (which may differ from recommendation) with a reason
6. **Cash Flow Tracking**: As a user, I can log deposits, withdrawals, dividends, and fees separately from equity snapshots
7. **Audit Trail**: As a user, I can view complete history of snapshots, recommendations, and actions
8. **Export/Import**: As a user, I can export all data and import it on another machine

### Non-Goals (v1)

- No live market data or price feeds
- No automated trade execution
- No Coinbase derivatives logic
- No M1 margin borrowing logic
- No multi-user or authentication
- No cloud sync or remote storage

### Roadmap

| Version | Focus |
|---------|-------|
| v1.0 | Core engine, TSV storage, basic UI, single portfolio |
| v1.1 | Charts, improved audit trail, tolerance bands |
| v2.0 | Strategy plugins, per-holding allocation, advanced analytics |
| v0.3 | Platform dashboards, CSV import (Robinhood), platform-level configs, APY history tracking |
| v0.4 | ✅ Platform-level cash tracking, Cash sub-funds, auto-create cash funds, cash isolation, TWFS-based aggregate contributions |

### Recently Completed: M1 Finance Cash Account Importer

**Status: COMPLETE**

Implemented M1 Finance savings account transaction scraping for interest payment tracking:

- **M1 Cash scraping**: Scrapes transaction history from `dashboard.m1.com/d/save/savings/transactions`
- **Interest detection**: Identifies "Interest application" / "Interest payment" transactions
- **Pagination support**: Automatically navigates through all pages using Next button
- **Transaction types**: Supports INTEREST, DEPOSIT, WITHDRAWAL, TRANSFER
- **Incremental archive**: Saves to `./data/scrape-archives/m1-cash.json`
- **UI integration**: New "M1 Cash Interest" import method in the Import Wizard

Key endpoint:
- `GET /api/v1/import/m1-cash/scrape-stream?url=...` - SSE endpoint for live scraping

### Previously Completed: Browser Scraping with Real-Time Progress

**Status: COMPLETE**

Implemented robust Robinhood transaction scraping with real-time progress tracking:

- **Proper HTML parsing**: Scraper correctly handles Robinhood's activity item structure
- **Click to expand**: Automatically expands each transaction to get ticker symbols and details
- **Incremental archive**: Saves transactions to `./data/scrape-archives/{platform}.json` as they're scraped
- **Real-time SSE progress**: Uses Server-Sent Events for live progress updates in the UI
- **Resume capability**: Archive is persistent, so future scrapes only add new transactions
- **Transaction types**: Supports BUY, SELL, DIVIDEND, INTEREST, DEPOSIT, WITHDRAWAL

Key endpoints:
- `GET /api/v1/import/robinhood/scrape-stream?url=...` - SSE endpoint for live scraping
- `GET /api/v1/import/archive/:platform` - Get existing scrape archive

### Previously Completed: Platform-Level Cash Tracking (Enhanced)

**Status: COMPLETE (v0.4)**

Enhanced platform-level cash management where each platform automatically has a dedicated cash sub-fund:

- **Auto-create cash funds**: When a new trading fund is created, a `{platform}-cash` fund is automatically created if one doesn't exist
- **FundType**: `'trading' | 'cash'` type to distinguish fund types
- **Cash isolation**: Trading funds have `manage_cash=false` and cannot have DEPOSIT/WITHDRAW actions - all cash operations go through the platform cash fund
- **Simplified Cash UI**: Cash funds show only DEPOSIT/WITHDRAW, interest, margin - no trading
- **Cash fund TWFS**: Cash funds participate in aggregate metrics using time-weighted fund size calculated from DEPOSIT/WITHDRAW entries
- **Full APY participation**: Cash funds contribute to realized and liquid APY calculations based on size/time weighting
- **Dashboard improvements**: Cash funds pinned to top of each platform group, aggregate panel shows cash balance card
- **Historical migration**: Enable-cash-tracking endpoint preserves all historical cash entries with original dates

---

## 2. System Architecture

```
+---------------------------------------------------------------------+
|                         Browser (React)                              |
|  +-----------+ +-----------+ +-----------+ +----------+             |
|  | Dashboard | |   Fund    | |  Entry    | |  Audit   |             |
|  |   Screen  | |  Config   | |   Form    | |  Trail   |             |
|  +-----------+ +-----------+ +-----------+ +----------+             |
+---------------------------+-----------------------------------------+
                            | HTTP (localhost:3301)
+---------------------------+-----------------------------------------+
|                     Node/Express Backend                             |
|  +--------------------------------------------------------------+   |
|  |                   REST API (Funds Router)                     |   |
|  +-----------------------------+--------------------------------+   |
|                                |                                     |
|  +------------+  +-------------+-------+                            |
|  |Calculation |  |   Fund Store       |                            |
|  |  Engine    |  |   (TSV I/O)        |                            |
|  |(pure funcs)|  |                    |                            |
|  +------------+  +-------------+-------+                            |
+--------------------------------+------------------------------------+
                                 |
+--------------------------------+------------------------------------+
|                    ./data/funds/ (TSV Files)                        |
|  robinhood-tqqq.tsv | coinbase-btc.tsv | m1-vti.tsv | ...          |
+---------------------------------------------------------------------+
```

---

## 3. Data Model (Separated TSV + JSON)

### Overview
Each fund has two files:
- **TSV file**: Time-series entries (pure data)
- **JSON file**: Configuration (fund settings, UI preferences)

### Directory Structure
```
data/
└── funds/
    ├── robinhood-tqqq.tsv   # Data entries
    ├── robinhood-tqqq.json  # Config
    ├── coinbase-btc.tsv
    ├── coinbase-btc.json
    └── ...
```

### TSV File Format (Data Only)

**Line 1 - Column Headers**:
```
date	value	action	amount	dividend	expense	cash_interest	fund_size	margin_borrowed	notes
```

**Line 2+ - Time Series Entries**:
```
2024-01-01	100	BUY	100						Initial DCA
2024-01-08	205	BUY	100						Week 1 - TQQQ up
2024-01-15	295	DEPOSIT	500						Added funds
```

### JSON Config File Format
```json
{
  "fund_size_usd": 10000,
  "target_apy": 0.30,
  "interval_days": 7,
  "input_min_usd": 100,
  "input_mid_usd": 150,
  "input_max_usd": 200,
  "max_at_pct": -0.25,
  "min_profit_usd": 100,
  "cash_apy": 0.044,
  "margin_apr": 0.0725,
  "margin_access_usd": 0,
  "accumulate": true,
  "start_date": "2024-01-01",
  "chart_bounds": { ... },
  "entries_column_order": ["date", "equity", "cash", ...],
  "entries_visible_columns": ["date", "equity", "action", ...]
}
```

### Config Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `fund_size` | Total capital allocated | `10000` |
| `target_apy` | Target annual return | `0.30` (30%) |
| `interval_days` | Trading interval | `7` (weekly) |
| `input_min` | DCA when on-target | `100` |
| `input_mid` | DCA when below target | `150` |
| `input_max` | DCA when significant loss | `200` |
| `max_at_pct` | Threshold for max DCA | `-0.25` (-25%) |
| `min_profit` | Profit threshold to sell | `100` |
| `cash_apy` | Interest on idle cash | `0.044` (4.4%) |
| `margin_apr` | Margin interest rate | `0.0725` (7.25%) |
| `accumulate` | Reinvest or liquidate | `true` |
| `start_date` | Tracking start date | `2024-01-01` |

### Entry Columns

| Column | Description |
|--------|-------------|
| `date` | Entry date (YYYY-MM-DD) |
| `value` | Current equity value |
| `action` | `BUY`, `SELL`, `DEPOSIT`, or `WITHDRAW` |
| `amount` | Trade/transfer amount |
| `dividend` | Dividend received |
| `expense` | Fee/expense paid |
| `cash_interest` | Interest earned on idle cash |
| `fund_size` | Fund size (manual override) |
| `margin_borrowed` | Margin amount borrowed |
| `notes` | Optional notes |

### Action Types

| Action | Effect |
|--------|--------|
| `BUY` | Purchase equity, decreases cash |
| `SELL` | Sell equity, increases cash |
| `DEPOSIT` | Add funds to the account, increases fund_size |
| `WITHDRAW` | Remove funds from account, decreases fund_size |

### Dynamic Fund Size Calculation
Fund size is calculated automatically unless manually overridden:
```
fund_size = initial_fund_size + deposits - withdrawals + dividends + cash_interest - expenses
```

---

## 4. Calculation Engine

### Core Concepts

**Start Input (Total Invested)**: Sum of all buy trades minus sell trades
```
StartInput = Σ(BuyAmount) - Σ(SellAmount)
```

**Expected Target Value**: Based on compounding from each investment
```
ExpectedGain = Σ(Trade_i * ((1 + TargetAPY)^(DaysElapsed_i / 365) - 1))
ExpectedTarget = StartInput + ExpectedGain
```

**Actual Gain**: Current market value vs total invested
```
GainUSD = ActualValue - StartInput
GainPct = (ActualValue / StartInput) - 1
```

**Target Difference**: How far above/below expected
```
TargetDiff = ActualValue - ExpectedTarget
```

### Decision Logic (from spreadsheet)

**Determining Action Amount (Limit):**
```
If GainUSD < 0:                       // Lost money this period
    If GainPct < MaxAtPct:            // Loss exceeds threshold (e.g., -25%)
        Limit = InputMax              // Buy max amount
    Else:
        Limit = InputMid              // Buy mid amount
Else:                                 // Made money or break-even
    Limit = InputMin                  // Buy min amount
```

**Determining Action Type:**
```
If TargetDiff > MinProfit:            // Above target by profit threshold
    If Accumulate:
        Action = SELL, Amount = Limit // Sell the limit amount
    Else:
        Action = SELL, Amount = All   // Sell everything
Else If CashAvailable < Limit:
    If MarginAvailable > 0:
        Action = BUY, Amount = min(Limit, MarginAvailable)
    Else:
        Action = BUY, Amount = CashAvailable  // Buy what we can
Else:
    Action = BUY, Amount = Limit      // Normal DCA buy
```

### Cash Tracking

**Cash Available**: Fund size minus invested, plus deposits/withdrawals
```
CashAvailable = FundSize - StartInput + Σ(Deposits) - Σ(Withdrawals)
```

**Cash Interest**: Interest earned on idle cash between periods
```
CashInterest = CashAvailable * ((1 + CashAPY)^(DaysElapsed/365) - 1)
```

### Realized Gains

**Realized Gain** accumulates:
- Cash interest earned
- Dividends received
- Expenses paid (negative)
- Profits from sells (when selling above cost basis)

---

## 5. API Endpoints

Base URL: `http://localhost:3301/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /funds | List all funds with summary |
| POST | /funds | Create a new fund |
| GET | /funds/:id | Get fund with all entries |
| PUT | /funds/:id | Update fund config |
| DELETE | /funds/:id | Delete a fund |
| GET | /funds/:id/state | Get computed state and recommendation |
| POST | /funds/:id/entries | Add an entry (snapshot + action) |
| POST | /compute/recommendation | Dry-run computation |
| GET | /api/health | Health check |
| GET | /platforms/:id/metrics | Get aggregate metrics for a platform |
| GET | /platforms/:id/apy-history | Get APY history for a platform |
| POST | /platforms/:id/apy-history | Add APY history entry |
| PUT | /platforms/:id/apy-history/:date | Update APY history entry |
| DELETE | /platforms/:id/apy-history/:date | Delete APY history entry |
| POST | /import/robinhood/preview | Preview Robinhood CSV import |
| POST | /import/robinhood/apply | Apply imported transactions to funds |
| POST | /import/robinhood/scrape | Scrape transaction history from Robinhood URL (with infinite scroll) |
| GET | /import/robinhood/scrape-stream | SSE endpoint for Robinhood scraping with live progress |
| GET | /import/m1-cash/scrape-stream | SSE endpoint for M1 Cash scraping with live progress |
| GET | /import/archive/:platform | Get existing scrape archive for platform |
| GET | /import/browser/status | Check browser CDP connection status |
| POST | /import/browser/launch | Launch Chrome with remote debugging enabled |
| POST | /import/browser/connect | Connect to browser via CDP |
| POST | /import/browser/kill | Kill launched Chrome browser |
| POST | /import/browser/disconnect | Disconnect from browser |

---

## 6. Milestones

- [x] M0: Project setup (monorepo, TypeScript, ESLint, PM2)
- [x] M1: Engine + Storage layer (fund-store, calculations)
- [x] M2: API routes (funds CRUD, state, entries, export/import)
- [x] M3: React UI (dashboard, fund view, entry form, audit trail, settings)
- [x] M4: Polish + Build fixes
- [x] M5: Storage refactor (separate TSV/JSON), DEPOSIT/WITHDRAW actions, column reordering
- [x] M6: Platform features (platform dashboard, Robinhood CSV import, browser scraping, platform-level metrics)

---

## 7. Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, TypeScript
- **Storage**: TSV files (data) + JSON files (config) with atomic writes
- **Testing**: Vitest
- **CI**: GitHub Actions

---

## 8. AUDIT & TESTING PLAN

### 8.1 Documentation Plan (with Visuals)

#### 8.1.1 User Documentation
- [ ] **Getting Started Guide** - Installation, setup, first fund creation
- [ ] **Configuration Reference** - Complete documentation of all config options with examples
- [ ] **Calculation Explainer** - Visual flowcharts showing how recommendations are made
- [ ] **UI Walkthrough** - Annotated screenshots of each screen

#### 8.1.2 Technical Documentation
- [ ] **Architecture Diagram** - SVG diagram of system components
- [ ] **Data Flow Diagram** - How data moves through the system
- [ ] **API Reference** - OpenAPI/Swagger spec generation
- [ ] **Calculation Formulas** - LaTeX-rendered math formulas in docs

#### 8.1.3 Visual Assets to Create
```
docs/
├── diagrams/
│   ├── architecture.svg          # System architecture
│   ├── data-flow.svg             # Request/response flow
│   ├── recommendation-logic.svg  # Decision tree flowchart
│   ├── compound-interest.svg     # Expected target calculation
│   └── dca-tiers.svg             # Min/mid/max tier logic
├── screenshots/
│   ├── dashboard.png             # Dashboard overview
│   ├── fund-detail.png           # Fund detail page
│   ├── add-entry.png             # Entry form modal
│   ├── config-panel.png          # Configuration panel
│   └── charts.png                # Chart examples
└── examples/
    ├── basic-fund.json           # Example config
    └── sample-entries.tsv        # Example entries
```

---

### 8.2 Mathematical Validation Plan

#### 8.2.1 Core Calculation Audit

| Function | Formula | Status | Issues Found |
|----------|---------|--------|--------------|
| `computeStartInput` | `Σ(buys) - Σ(sells)` | ✅ Validated | None |
| `computeExpectedTarget` | `StartInput + Σ(Trade_i × ((1+APY)^(days/365) - 1))` | ✅ Fixed | SELL didn't reduce gain (fixed) |
| `computeCashAvailable` | `FundSize - StartInput + Deposits - Withdrawals + Dividends - Expenses` | ✅ Enhanced | Added config-aware behavior |
| `computeCashInterest` | Period-by-period compound interest | ✅ Validated | None |
| `computeRealizedGains` | `Interest + Dividends - Expenses (config-aware)` | ✅ Enhanced | Added config-aware behavior |
| `computeFundState` | Aggregate state computation | ✅ Validated | Updated for new params |
| `computeClosedFundMetrics` | APY/return calculation for closed funds | ✅ Fixed | Wrong denominator (fixed) |
| `computeLimit` | Tiered DCA amount selection | ✅ Validated | Threshold uses < not <= |
| `computeRecommendation` | Buy/Sell decision logic | ✅ Validated | None |

#### 8.2.2 Edge Cases to Validate

1. **Zero values**: What happens when start_input=0, actual_value=0, cash=0?
2. **Negative values**: Are negative values ever possible/allowed?
3. **Date ordering**: What if trades are entered out of order?
4. **Future dates**: How are future-dated entries handled?
5. **Precision**: Are there floating-point rounding issues?
6. **Leap years**: Is 365 vs 366 handled correctly?
7. **Same-day trades**: Multiple trades on same date?
8. **Full liquidation**: When sells reduce start_input to 0?

#### 8.2.3 Interest Calculation Validation

| Scenario | Expected | Current Behavior | Status |
|----------|----------|------------------|--------|
| Daily compounding on idle cash | `P × (1 + r/365)^days - 1` | Period compound | Verify |
| Monthly interest payout | Only credited on month boundary | Implemented | Verify |
| Interest on $0 cash | $0 interest | Need to verify | Test |
| Interest after full liquidation | Should accrue on full fund_size | Need to verify | Test |

---

### 8.3 Configuration Behavior Validation

#### 8.3.1 All Configuration Options Matrix

| Config Option | Default | Behavior When True | Behavior When False | Test Coverage |
|--------------|---------|-------------------|---------------------|---------------|
| `accumulate` | `true` | Sell only limit amount | Sell entire position | ✅ Full (config-behaviors.test.ts) |
| `manage_cash` | `true` | Track cash pool | Cash always 0, fund_size = invested | None |
| `auto_apply_cash_apy` | `false` | Auto-calc interest on entry | Manual interest entry | None |
| `margin_enabled` | `false` | Show margin fields | Hide margin fields | None |
| `dividend_reinvest` | `true` | Dividends add to cash/fund_size | Dividends count as realized gains | ✅ Full (expected-equity.test.ts) |
| `interest_reinvest` | `true` | Interest adds to cash/fund_size | Interest counts as realized gains | ✅ Full (expected-equity.test.ts) |
| `expense_from_fund` | `true` | Expenses reduce cash/fund_size | Expenses don't affect fund | ✅ Full (expected-equity.test.ts) |

#### 8.3.2 Numerical Config Boundaries

| Config | Valid Range | Edge Cases to Test |
|--------|-------------|-------------------|
| `fund_size_usd` | 0+ | 0 (closed), very large |
| `target_apy` | 0.0 - 10.0? | 0%, 100%, 500% |
| `interval_days` | 1+ | 1 (daily), 365 (yearly) |
| `input_min/mid/max` | 0+ | All same value, max < min |
| `max_at_pct` | -1.0 - 0.0 | 0%, -100% |
| `min_profit_usd` | 0+ | 0 (always sell if above target) |
| `cash_apy` | 0.0+ | 0%, 10%, platform-specific |
| `margin_apr` | 0.0+ | When margin used vs not |

#### 8.3.3 Status Transitions

| From Status | To Status | Trigger | Behavior |
|-------------|-----------|---------|----------|
| `active` | `closed` | Manual + fund_size=0 | Compute closed metrics |
| `closed` | `active` | Manual + fund_size>0 | Resume tracking |

---

### 8.4 Feature Recommendations

#### 8.4.1 New Charts to Add

| Chart | Description | Value |
|-------|-------------|-------|
| **Drawdown Chart** | Maximum peak-to-trough decline over time | Risk visibility |
| **Rolling Returns** | 7/30/90/365-day rolling returns | Performance trends |
| **Allocation Pie** | Current allocation by ticker/platform | Portfolio balance |
| **Cash Utilization** | Cash vs invested over time | Capital efficiency |
| **DCA Efficiency** | Actual avg cost vs buy-at-peak | DCA benefit proof |
| **Recommendation History** | Track recommended vs actual actions | Discipline tracking |
| **Correlation Matrix** | Cross-asset correlation heatmap | Diversification |

#### 8.4.2 New Data Columns to Track

| Column | Type | Description | Value |
|--------|------|-------------|-------|
| `recommended_action` | string | What engine recommended | Audit trail |
| `recommended_amount` | number | Recommended trade size | Audit trail |
| `shares` | number | Share count (optional) | Position tracking |
| `price` | number | Per-share price | Cost basis calc |
| `high_since_last` | number | Highest value since last entry | Volatility |
| `low_since_last` | number | Lowest value since last entry | Volatility |
| `time_in_market_days` | number | Computed days since first buy | Duration |

#### 8.4.3 New Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rebalance_threshold_pct` | number | null | Auto-suggest rebalance when drift exceeds X% |
| `stop_loss_pct` | number | null | Alert/recommend sell if loss exceeds X% |
| `take_profit_pct` | number | null | Auto-suggest profit-taking above X% |
| `max_position_pct` | number | null | Cap single position at X% of portfolio |
| `dca_pause_on_loss` | boolean | false | Pause DCA when losing significantly |
| `trailing_stop_pct` | number | null | Trailing stop-loss percentage |
| `tax_lot_method` | string | "FIFO" | FIFO, LIFO, specific lot selection |

#### 8.4.4 New Features to Implement

| Feature | Priority | Description |
|---------|----------|-------------|
| **Tax Lot Tracking** | High | Track cost basis per share for tax reporting |
| **Multiple Portfolios** | Medium | Separate portfolios for different strategies |
| **Benchmark Comparison** | Medium | Compare returns to SPY, BTC, etc. |
| **Goal Setting** | Medium | Target dates/amounts for withdrawal |
| **Notifications** | Low | Email/webhook on action recommendations |
| **Mobile Responsive** | Low | Better mobile layout |
| **Dark Mode** | Low | Theme toggle |
| **CSV Import** | Medium | Import from brokerage statements |

---

### 8.5 Testing Strategy

#### 8.5.1 Current Test Coverage

| Package | Test File | Test Count | Coverage |
|---------|-----------|------------|----------|
| engine | expected-equity.test.ts | ~15 | Core calcs |
| engine | recommendation.test.ts | ~12 | Recommendations |
| engine | config-behaviors.test.ts | 31 | Config flags |
| engine | invariants.test.ts | 28 | Mathematical properties |
| storage | fund-store.test.ts | ~10 | TSV/JSON I/O |
| e2e | fund-configurations.spec.ts | 18 | All config modes |
| e2e | yearly-simulation.spec.ts | 9 | Year-long DCA simulations |
| e2e | integrity-tests.spec.ts | 22 | Historical edits & integrity |

**E2E Test Categories:**
- **Fund Configurations**: manage_cash, accumulate, margin, dividends, interest, expenses, DCA tiers, closed funds
- **Yearly Simulations**: Bull market, bear market, volatile market, crash & recovery, dividends & interest, full lifecycle
- **Integrity Tests**: Historical edits, entry deletion, date consistency, fund_size propagation, edge cases

#### 8.5.2 Tests to Add - Engine Package

```typescript
// expected-equity.test.ts additions
describe('computeExpectedTarget edge cases', () => {
  - 'handles leap year correctly (366 days)'
  - 'handles 0% target APY'
  - 'handles 100%+ target APY'
  - 'handles trades on same day'
  - 'handles negative days between dates'
  - 'handles very old trades (10+ years)'
})

describe('computeCashInterest', () => {
  - 'calculates interest on full fund_size when no trades'
  - 'calculates interest correctly with multiple events'
  - 'handles 0% cash APY'
  - 'handles very high cash APY'
  - 'handles month boundary crossing correctly'
  - 'handles partial month interest'
})

describe('computeRealizedGains', () => {
  - 'sums dividends correctly'
  - 'subtracts expenses correctly'
  - 'includes cash interest'
  - 'handles no events (returns 0)'
})

describe('computeFundState', () => {
  - 'returns zeroed state for closed fund'
  - 'handles fund with only buys'
  - 'handles fund with only sells'
  - 'handles complete cycle (buy, grow, sell)'
})

describe('computeClosedFundMetrics', () => {
  - 'calculates APY correctly for short periods'
  - 'calculates APY correctly for long periods'
  - 'handles edge case of 0 invested'
  - 'handles negative net gain'
})
```

#### 8.5.3 Tests to Add - Config Behaviors

```typescript
// config-behaviors.test.ts (NEW FILE)
describe('accumulate mode', () => {
  - 'true: sells only limit amount when above target'
  - 'false: liquidates entire position when above target'
})

describe('manage_cash mode', () => {
  - 'true: maintains cash pool, calculates available cash'
  - 'false: cash is always 0, fund_size equals invested'
})

describe('dividend_reinvest mode', () => {
  - 'true: dividends increase fund_size'
  - 'false: dividends extracted, fund_size unchanged'
})

describe('interest_reinvest mode', () => {
  - 'true: interest increases fund_size'
  - 'false: interest extracted, fund_size unchanged'
})

describe('expense_from_fund mode', () => {
  - 'true: expenses reduce fund_size'
  - 'false: expenses do not affect fund_size'
})

describe('auto_apply_cash_apy mode', () => {
  - 'true: interest auto-calculated on entry save'
  - 'false: interest must be manually entered'
})
```

#### 8.5.4 Tests to Add - Integration/API

```typescript
// api.test.ts (NEW FILE)
describe('POST /funds', () => {
  - 'creates fund with minimal config'
  - 'creates fund with all config options'
  - 'rejects duplicate fund id'
  - 'rejects missing required fields'
})

describe('PUT /funds/:id', () => {
  - 'updates config fields'
  - 'renames fund when platform/ticker changes'
  - 'rejects rename to existing fund'
})

describe('POST /funds/:id/entries', () => {
  - 'appends entry to fund'
  - 'auto-calculates cash interest when enabled'
  - 'propagates fund_size for deposits/withdrawals'
  - 'computes correct state after entry'
})

describe('GET /funds/:id/state', () => {
  - 'returns null state for empty fund'
  - 'returns computed state and recommendation'
  - 'returns closed metrics for fund_size=0'
})
```

#### 8.5.5 Test Data Isolation ✅ IMPLEMENTED

All E2E tests use the "test" platform to isolate test data from real funds:

- **API Filtering**: All list/aggregate/history endpoints support `?include_test=true` query param
- **Dashboard Toggle**: "Test Data" button in dashboard header to view test funds only
- **Default Behavior**: Test funds are hidden by default (include_test=false)
- **Test Cleanup**: Tests create and delete their own funds on the "test" platform

This allows:
- Running tests without affecting real fund data
- Verifying dashboard aggregate calculations using test data only
- Keeping test funds separate from production data

#### 8.5.6 E2E Tests with Playwright ✅ IMPLEMENTED

**Run with:** `npm run test:e2e` (headless) or `npm run test:e2e:headed` (visible browser)

```
e2e/
├── test-utils.ts              # API helpers, types, assertions
├── fund-configurations.spec.ts # 18 tests - all config combinations
├── yearly-simulation.spec.ts   # 9 tests - year-long scenarios
└── integrity-tests.spec.ts     # 22 tests - data integrity checks
```

**Fund Configurations Tests:**
- Cash management (manage_cash=true/false)
- Accumulate mode (partial vs full liquidation)
- Margin access and tracking
- Dividend and interest reinvestment options
- Expense handling (expense_from_fund)
- DCA tier selection (min/mid/max based on performance)
- Closed fund handling

**Yearly Simulation Tests:**
- 52-week DCA in bull market conditions
- Bear market with increasing DCA amounts
- Volatile market with buy/sell switches
- Crash and recovery scenario
- Dividends and interest accumulation
- Full fund lifecycle (create → grow → liquidate → restart)
- Mathematical invariants verification

**Integrity Tests:**
- Historical entry editing with recalculation
- Entry deletion effects
- Date consistency after edits
- Fund size propagation
- Edge cases (zero values, small amounts, large amounts)
- Share/price tracking
- Notes preservation

#### 8.5.6 Property-Based Tests

```typescript
// property.test.ts (NEW FILE)
describe('Mathematical Properties', () => {
  - 'start_input is always >= 0'
  - 'cash_available is always >= 0'
  - 'gain_pct = (actual / start_input) - 1 when start_input > 0'
  - 'expected_target >= start_input when APY >= 0'
  - 'sum of buys - sells = start_input for any trade sequence'
  - 'cash + invested = fund_size (when manage_cash=true)'
})
```

---

### 8.6 Implementation Phases

#### Phase 1: Foundation ✅ COMPLETE
- [x] Set up comprehensive test infrastructure (Vitest config, coverage reporting)
- [x] Add missing unit tests for all engine functions (136 tests total)
- [x] Add config behavior tests (31 tests in config-behaviors.test.ts)
- [x] Add invariant/property-based tests (28 tests in invariants.test.ts)
- [x] Achieve 90%+ coverage on engine package

#### Phase 2: Validation ✅ COMPLETE
- [x] Audit engine calculations for mathematical correctness
- [x] Fix SELL handling bug in `computeExpectedTarget` (proportional gain reduction)
- [x] Fix APY denominator bug in `computeClosedFundMetrics` (use totalInvested)
- [x] Implement missing config options: `dividend_reinvest`, `interest_reinvest`, `expense_from_fund`
- [x] Add regression tests for all fixed issues

#### Phase 3: API & Integration
- [ ] Add API endpoint tests
- [ ] Add storage layer tests for edge cases
- [ ] Test error handling paths

#### Phase 4: E2E & UI ✅ COMPLETE
- [x] Set up Playwright for E2E tests (49 tests across 3 files)
- [x] Create fund lifecycle tests (fund-configurations.spec.ts)
- [x] Create config behavior E2E tests (manage_cash, accumulate, margin, dividends, interest, expenses, DCA tiers)
- [x] Create yearly simulation tests (yearly-simulation.spec.ts) - bull/bear/volatile/crash scenarios
- [x] Create integrity tests (integrity-tests.spec.ts) - historical edits, deletions, propagation
- [ ] Add visual regression tests for charts

#### Phase 5: Documentation
- [ ] Generate architecture diagrams (SVG)
- [ ] Create calculation flowcharts
- [ ] Write user documentation
- [ ] Generate API documentation (OpenAPI)
- [ ] Add inline code documentation

---

### 8.7 Known Issues to Investigate

1. ~~**Cash interest calculation** - The `computeCashInterest` in expected-equity.ts may have issues with event ordering and period boundaries~~ ✅ VERIFIED - Working correctly
2. ~~**Closed fund metrics APY** - Using `finalEquityValue` as denominator may be incorrect~~ ✅ FIXED - Now uses `totalInvested` as denominator
3. **Full liquidation detection** - Logic in funds.ts line 557-558 seems fragile - STILL TO REVIEW
4. **Cashflows not stored** - Line 384 passes empty array for cashflows - are DEPOSIT/WITHDRAW handled correctly? - STILL TO REVIEW
5. ~~**DPI calculations** - In history endpoint, DPI math may not account for all scenarios~~ ✅ VERIFIED - No double-counting bug found

#### Bugs Fixed (2024-12-31):

1. **SELL handling in `computeExpectedTarget`** - Previously, selling did not reduce expected gain. Now proportionally reduces expected gain based on fraction of position sold.
   - File: `packages/engine/src/expected-equity.ts:60-68`
   - Tests: 10 comprehensive tests in `expected-equity.test.ts`

2. **APY denominator in `computeClosedFundMetrics`** - Previously used `finalEquityValue` which gave wrong ROI. Now uses `totalInvested`.
   - File: `packages/engine/src/expected-equity.ts:285-287`
   - Tests: Updated in `expected-equity.test.ts`

3. **Missing config option implementations** - `dividend_reinvest`, `interest_reinvest`, `expense_from_fund` were defined in types but not implemented.
   - Files: `packages/engine/src/expected-equity.ts` (computeCashAvailable, computeRealizedGains)
   - Tests: 19 new tests covering all config behaviors

---

### 8.8 Success Criteria

- [x] All engine functions have >90% test coverage (136 tests across 4 files)
- [x] All config options have explicit behavior tests (dividend_reinvest, interest_reinvest, expense_from_fund, accumulate)
- [x] Mathematical formulas validated and corrected (SELL handling, APY denominator)
- [x] E2E tests cover full fund lifecycle (49 Playwright tests)
- [ ] Documentation includes visual diagrams
- [x] No known mathematical bugs remain (2 bugs fixed)
