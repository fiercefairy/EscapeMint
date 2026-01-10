# EscapeMint - Development Plan

A local-first, open-source capital allocation engine for rules-based fund management.

---

## Documentation

See the [docs/](./docs/) folder for detailed documentation:

- [Investment Strategy](./docs/investment-strategy.md) - DCA methodology
- [Fund Management](./docs/fund-management.md) - Position and cash tracking
- [Configuration Guide](./docs/configuration.md) - All config options
- [Data Format](./docs/data-format.md) - TSV file structure
- [System Architecture](./docs/architecture.md) - Package structure and data flow
- [Derivatives](./docs/derivatives.md) - Perpetual futures data model

---

## Product Overview

### User Stories (v1)

1. **Portfolio Setup**: Create a portfolio with multiple sub-funds (Robinhood, Coinbase, M1, etc.)
2. **Sub-Fund Configuration**: Configure each sub-fund with target APY, action amount, period, and start date
3. **Snapshot Entry**: Enter equity snapshots (date, value) for any sub-fund at any time
4. **Action Recommendations**: See buy/sell/hold recommendations based on deviation from expected growth
5. **Action Tracking**: Record actual actions (which may differ from recommendation) with a reason
6. **Cash Flow Tracking**: Log deposits, withdrawals, dividends, and fees separately from equity snapshots
7. **Audit Trail**: View complete history of snapshots, recommendations, and actions
8. **Export/Import**: Export all data and import it on another machine

### Non-Goals (v1)

- No live market data or price feeds
- No automated trade execution
- No M1 margin borrowing logic
- No multi-user or authentication
- No cloud sync or remote storage

### Roadmap

| Version | Focus | Status |
|---------|-------|--------|
| v0.1-0.4 | Core engine, storage, UI, platform features | Complete |
| v0.5 | DRY/YAGNI cleanup, shared cash funds, M1 import | Complete |
| v0.6 | Coinbase derivatives integration | Complete |
| v1.0 | Stable release, documentation | Planned |
| v1.1 | Tolerance bands, advanced analytics | Planned |
| v2.0 | Strategy plugins, per-holding allocation | Planned |

---

## Remaining Work

### Documentation (v1.0)
- [ ] Getting Started Guide
- [ ] Configuration Reference with examples
- [ ] Calculation Explainer with flowcharts
- [ ] Architecture diagrams (SVG)
- [ ] API Reference (OpenAPI/Swagger)

### Testing Gaps
- [ ] Server route unit tests (`packages/server/test/routes/`)
- [ ] Aggregate calculation tests (`packages/engine/test/aggregate.test.ts`)
- [ ] Input validation tests
- [ ] Visual regression tests for charts

### Code Quality
- [x] Create `Modal.tsx` wrapper component
- [x] Consolidate format functions in `utils/format.ts` (added `formatCurrencyCompact`, `formatPercentSimple`)
- [x] Remove unused `ScrapeEvent` type from `packages/web/src/api/import.ts`

### Known Issues to Investigate
- Full liquidation detection logic in `funds.ts:557-558` may be fragile
- Cashflows not stored - line 384 passes empty array (verify DEPOSIT/WITHDRAW handling)

### Derivatives Import
- [ ] Update scraper to mark USD/USDC deposits as perp-related
- [ ] Update apply endpoint to use correct action types
- [ ] Store contracts/price properly on trade entries

### Test Data Generation System (Complete)

Replace static sample data with dynamic test data generation using real historical prices.

**Test Funds:**
- `coinbasetest-cash` - Cash fund for Coinbase platform
- `coinbasetest-btc` - Bitcoin fund using BTCUSD prices
- `robinhoodtest-cash` - Cash fund for Robinhood platform
- `robinhoodtest-tqqq` - TQQQ 3x Nasdaq ETF fund
- `robinhoodtest-spxl` - SPXL 3x S&P 500 ETF fund

**DCA Strategy:**
- Starting capital: $10,000 in each asset fund
- Weekly investment: $100 every Wednesday (avoids Monday holidays)
- Duration: 5 years of historical data

**Implementation:**
- [x] Fetch and store 5 years of weekly price data (BTCUSD, TQQQ, SPXL)
- [x] Create test data generator utility
- [x] Add API endpoint `POST /api/v1/test-data/generate`
- [x] Add UI button to load test data (Settings page)
- [x] Remove `data.example/` directory (no longer needed - using test data generator)

### Future Features (v1.1+)
- Tax Lot Tracking (FIFO/LIFO/specific lot)
- Benchmark Comparison (vs SPY, BTC)
- Goal Setting (target dates/amounts)
- Multiple Portfolios
- Dark Mode
- Mobile Responsive layout

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, TypeScript
- **Storage**: TSV files (data) + JSON files (config) with atomic writes
- **Testing**: Vitest (unit), Playwright (E2E)
- **CI**: GitHub Actions

---

## Test Coverage Summary

| Package | Tests | Status |
|---------|-------|--------|
| Engine | 135 tests | Passing |
| Storage | 9 tests | Passing |
| E2E | 49 tests | Passing |

### E2E Test Files
- `fund-configurations.spec.ts` - 18 tests for all config combinations
- `yearly-simulation.spec.ts` - 9 tests for year-long DCA simulations
- `integrity-tests.spec.ts` - 22 tests for historical edits and data integrity
