# EscapeMint - Development Plan

A local-first, open-source capital allocation engine for rules-based fund management.

---

## Documentation

See the [docs/](./docs/) folder for detailed documentation:

- **[Philosophy](./docs/philosophy.md)** - Why this system exists (start here)
- [Investment Strategy](./docs/investment-strategy.md) - DCA methodology
- Ticker Choices (documentation coming soon) - Why we prefer volatile assets like TQQQ
- [Fund Management](./docs/fund-management.md) - Position and cash tracking
- [Configuration Guide](./docs/configuration.md) - All config options
- [Data Format](./docs/data-format.md) - TSV file structure
- [System Architecture](./docs/architecture.md) - Package structure and data flow
- [Derivatives](./docs/derivatives.md) - Perpetual futures data model

---

## Recently Completed

### Four Pillars Fund Categories (v0.27.0)
Portfolio categorization system with 4 investment philosophy pillars: Liquidity, Yield, Store of Value, Volatility. Margin is tracked separately as borrowing capacity.

**Features:**
- [x] New `FundCategory` type with 4 categories and configuration
- [x] Category selector in Create/Edit fund modals
- [x] Horizontal bar chart on dashboard showing portfolio allocation by category
- [x] Margin capacity indicator (available vs borrowed) shown separately
- [x] Category badge on fund cards
- [x] Auto-assign categories: cash→liquidity, derivatives→volatility, btc→sov, strc→yield
- [x] Philosophy docs updated with "The Four Pillars of Portfolio Construction" section

**Files Modified:**
- `packages/engine/src/types.ts` - Added FundCategory type
- `packages/engine/src/fund-type-config.ts` - Added FUND_CATEGORY_CONFIG
- `packages/web/src/components/CategoryBarChart.tsx` - New horizontal bar chart with margin overlay
- `packages/web/src/components/PortfolioCharts.tsx` - Integrated category bar chart
- `packages/web/src/pages/Dashboard.tsx` - Category allocation computation
- `packages/web/src/components/CreateFundModal.tsx` - Category selector with auto-assign
- `packages/web/src/components/EditFundPanel.tsx` - Category selector
- `packages/web/src/components/FundCard.tsx` - Category badge display
- `docs/philosophy.md` - Added four pillars documentation

### Onboarding Wizard (v0.22)
Interactive 12-step introduction wizard explaining the fund strategy with animated D3 chart visualizations.

**Features:**
- [x] Auto-shows for first-time visitors, skippable
- [x] "Learn How It Works" button in backtest header for returning visitors
- [x] 12 educational steps covering DCA strategy, volatility benefits, accumulate/harvest modes
- [x] Animated D3 charts: market growth, volatility comparison, buy/sell zones, leverage comparison, mode comparison
- [x] Prominent disclaimer ("Not investment advice, do your own research")
- [x] Shareable step URLs via HashRouter (`/intro/5`)
- [x] LocalStorage persistence for completion state

**Files Added:**
- `pages/src/components/intro/` - IntroWizard, IntroStep, StepNavigation, ProgressIndicator, Disclaimer
- `pages/src/components/intro/charts/` - 5 D3 animated chart components
- `pages/src/data/intro-content.ts` - Step content data
- `pages/src/BacktestApp.tsx` - Extracted from App.tsx

---

## Next Up

### Configurable Entry Form Fields (High Value)
Allow per-fund configuration of which entry fields are shown and their order. This also enables "quick entry" - configure a fund to show only date + value, and the Take Action form becomes minimal.

**Implementation:**
- [ ] Add `entry_fields` config to fund JSON (array of field names + order)
- [ ] Create field configuration UI in fund settings
- [ ] Update AddEntryModal to respect field visibility/ordering
- [ ] Preserve backwards compatibility (default shows all fields)
- [ ] Pre-fill date with today, value with latest value

### Chart Date Range Selector
Filter charts to specific time periods (1M, 3M, 6M, YTD, 1Y, All).

**Implementation:**
- [ ] Add date range buttons above charts
- [ ] Filter chart data to selected range
- [ ] Persist selection per fund in config
- [ ] Apply to all charts on the page

### Price/Size Charts
When tracking price/size, show additional charts on the fund dashboard.

**Implementation:**
- [ ] Add price history chart (price over time)
- [ ] Add share accumulation chart (total shares over time)
- [ ] Add cost basis vs current price comparison
- [ ] Only show charts when fund has price/size data

### Action Due Prompts (High Value) - DONE
Prompt users to take action on funds when the configured interval threshold is reached. When opening the app, show a wizard/indicator highlighting funds that need attention today.

**Behavior:**
- If a fund's `interval_days` is 7 and the last entry was 7+ days ago → prompt to act
- If `interval_days` is 1 and there's no entry for today → prompt to act
- Indicator should appear on dashboard and/or nav until action is taken
- Clicking the indicator opens Take Action form for that fund

**Implementation:**
- [x] Add API endpoint to get "actionable" funds (where days since last entry >= interval_days)
- [x] Add dashboard banner/widget showing funds due for action today
- [x] Add nav indicator (badge/dot) when any funds need attention
- [x] Sort actionable funds by priority (most overdue first)
- [x] Dismiss indicator once entry is added for that fund (session-based dismiss)
- [ ] Consider optional browser notifications for funds past due

---

## Brainstormed Ideas

### UX Improvements
- **Keyboard shortcuts** - j/k navigation, Enter to open, Esc to close
- **Comparison mode** - Compare multiple funds side by side
- **Performance attribution** - Break down gains by source (dividends, price, interest)
- **Export to CSV** - Export fund data for tax reporting or analysis
- **Notifications** - Browser notifications when funds hit sell target

### Data/Tracking
- **Split handling** - Handle stock splits properly (adjust historical prices/shares)
- **Dividend tracking** - Track dividend yield and dividend growth rate
- **Currency support** - Track non-USD funds with exchange rate conversion
- **Multi-account aggregation** - Same ticker across different platforms as single view

### Technical
- **PWA/Offline mode** - Service worker for offline access
- **Data backup** - Export/import all data as single archive
- **API webhooks** - POST to URL when action recommended

---

## Documentation Backlog

### Ticker Choices Documentation
Document why we prefer volatile assets like TQQQ over stable ones like VTI.

**Implementation:**
- [ ] Create `docs/ticker-choices.md`
- [ ] Explain volatility benefits for DCA strategy
- [ ] Compare TQQQ vs VTI performance scenarios
- [ ] Add recommended ticker list with rationale

---

## Roadmap

| Version | Focus | Status |
|---------|-------|--------|
| v0.1-0.6 | Core engine, storage, UI, derivatives | Complete |
| v0.17-0.19 | Chart improvements, target display, UX polish | Complete |
| v0.20+ | Dashboard summary, quick entry, date ranges | In Progress |
| v1.0 | Stable release, full documentation | Planned |
| v1.1 | Tolerance bands, advanced analytics | Planned |
| v2.0 | Strategy plugins, per-holding allocation | Planned |

---

## Remaining Work

### Documentation
- [x] Philosophy Guide (`docs/philosophy.md`)
- [x] Visual diagrams (SVG) - Fund lifecycle, DCA tiers, Accumulate vs Harvest
- [ ] Ticker Choices Guide (`docs/ticker-choices.md`)
- [ ] Getting Started Guide
- [ ] API Reference (OpenAPI/Swagger)

### Testing Gaps
- [ ] Server route unit tests (`packages/server/test/routes/`)
- [ ] Aggregate calculation tests (`packages/engine/test/aggregate.test.ts`)
- [ ] Visual regression tests for charts

### Known Issues
- Full liquidation detection logic in `funds.ts:557-558` may be fragile
- Cashflows not stored - line 384 passes empty array (verify DEPOSIT/WITHDRAW handling)

### Derivatives Import
- [ ] Update scraper to mark USD/USDC deposits as perp-related
- [ ] Update apply endpoint to use correct action types
- [ ] Store contracts/price properly on trade entries

### Parameterized Test Data (Planned)
- [ ] Add parameter inputs to Test/Demo Data settings section
- [ ] Integrate m1test generation into "Load Test Data" button
- [ ] Add preset configurations (Conservative, Moderate, Aggressive)

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

```
Overall: 85% (97/114 features)
Critical: 100% (23/23)
High: 93% (42/45)
Medium: 82% (31/38)
```

Run `npm run test:coverage-report` to generate the HTML report.

### E2E Test Files

| File | Tests | Coverage Area |
|------|-------|---------------|
| `fund-configurations.spec.ts` | 18 | All fund config flag combinations |
| `yearly-simulation.spec.ts` | 9 | Year-long DCA market simulations |
| `integrity-tests.spec.ts` | 22 | Historical edits and data integrity |
| `derivatives-funds.spec.ts` | 20+ | Derivatives fund CRUD, entries, calculations |
| `ui-workflows.spec.ts` | 25+ | Dashboard, fund detail, entry CRUD, navigation |
| `platform-management.spec.ts` | 15+ | Platform CRUD, cash tracking |
| `import-export.spec.ts` | 12+ | Export/import with merge/replace modes |
| `cash-funds.spec.ts` | 15+ | Cash fund lifecycle, interest, expenses |

### Unit Tests

| Package | Tests | Status |
|---------|-------|--------|
| Engine | 135 | Passing |
| Storage | 9 | Passing |

---

## Completed Work (Archive)

<details>
<summary>v0.1-0.6 Completed Features</summary>

### Test Data Generation System
- [x] Fetch and store 5 years of weekly price data (BTCUSD, TQQQ, SPXL)
- [x] Create test data generator utility
- [x] Add API endpoint `POST /api/v1/test-data/generate`
- [x] Add UI button to load test data (Settings page)

### M1 Test Platform with Margin
- [x] Create pie-weekly.json blended price history
- [x] Create generate-m1test.cjs generation script
- [x] Add margin integrity warnings to UI (orange highlighting)

### Code Quality
- [x] Create `Modal.tsx` wrapper component
- [x] Consolidate format functions in `utils/format.ts`
- [x] Remove unused `ScrapeEvent` type
- [x] Performance optimizations (React.memo, code splitting, bundle optimization)

### E2E Test Coverage
- [x] Feature coverage tracking system (`e2e/coverage-matrix.ts`)
- [x] Derivatives fund E2E tests
- [x] UI workflow E2E tests
- [x] Platform management tests
- [x] Import/export tests
- [x] Cash fund tests

</details>
