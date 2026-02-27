# EscapeMint - Development Plan

Current development tasks and remaining work. For long-term vision and milestones, see [GOALS.md](./GOALS.md).

---

## Documentation

See the [docs/](./docs/) folder for detailed documentation:

- **[Philosophy](./docs/philosophy.md)** - Why this system exists (start here)
- [Investment Strategy](./docs/investment-strategy.md) - DCA methodology
- [Fund Management](./docs/fund-management.md) - Position and cash tracking
- [Configuration Guide](./docs/configuration.md) - All config options
- [Data Format](./docs/data-format.md) - TSV file structure
- [System Architecture](./docs/architecture.md) - Package structure and data flow
- [Derivatives](./docs/derivatives.md) - Perpetual futures data model
- [Project Goals](./GOALS.md) - Mission, milestones, and non-goals

### Documentation Backlog

- [ ] Ticker Choices Guide (`docs/ticker-choices.md`) - Why volatile assets like TQQQ work better for DCA than VTI
- [ ] Getting Started Guide
- [ ] API Reference (OpenAPI/Swagger)

---

## Next Up

### Configurable Entry Form Fields (High Value)
Allow per-fund configuration of which entry fields are shown and their order. Enables "quick entry" - configure a fund to show only date + value for a minimal Take Action form.

- [ ] Add `entry_fields` config to fund JSON (array of field names + order)
- [ ] Create field configuration UI in fund settings
- [ ] Update AddEntryModal to respect field visibility/ordering
- [ ] Preserve backwards compatibility (default shows all fields)
- [ ] Pre-fill date with today, value with latest value

### Chart Date Range Selector
Filter charts to specific time periods (1M, 3M, 6M, YTD, 1Y, All).

- [ ] Add date range buttons above charts
- [ ] Filter chart data to selected range
- [ ] Persist selection per fund in config
- [ ] Apply to all charts on the page

### Price/Size Charts
When tracking price/size, show additional charts on the fund dashboard.

- [ ] Add price history chart (price over time)
- [ ] Add share accumulation chart (total shares over time)
- [ ] Add cost basis vs current price comparison
- [ ] Only show charts when fund has price/size data

---

## Remaining Work

### Known Issues
- Full liquidation detection logic in `funds.ts` may be fragile
- Cashflows not stored - fund route passes empty array (verify DEPOSIT/WITHDRAW handling)

### Testing Gaps
- [ ] Server route unit tests (`packages/server/test/routes/`)
- [ ] Aggregate calculation tests (`packages/engine/test/aggregate.test.ts`)
- [ ] Visual regression tests for charts

### Derivatives Import
- [ ] Update scraper to mark USD/USDC deposits as perp-related
- [ ] Update apply endpoint to use correct action types
- [ ] Store contracts/price properly on trade entries

### Parameterized Test Data
- [ ] Add parameter inputs to Test/Demo Data settings section
- [ ] Integrate m1test generation into "Load Test Data" button
- [ ] Add preset configurations (Conservative, Moderate, Aggressive)

---

## Test Coverage

Run `npm run test:coverage-report` to generate the HTML report, viewable in the app's Settings page.

| Suite | Files | Coverage |
|-------|-------|----------|
| E2E | 8 spec files, 130+ tests | Fund configs, simulations, integrity, derivatives, UI, platforms, import/export, cash |
| Engine | 135 unit tests | Passing |
| Storage | 9 unit tests | Passing |

---

## Next Actions

1. **Configurable entry form fields** - Highest-value UX improvement; reduces friction for the most common action (adding entries)
2. **Chart date range selector** - Second most requested feature; enables focused analysis of recent performance
3. **Fix known issues** - Audit liquidation detection logic and DEPOSIT/WITHDRAW cashflow handling before they cause data bugs
4. **Server route unit tests** - Largest testing gap; API routes have zero unit test coverage
5. **Ticker Choices documentation** - Referenced in README and philosophy docs but doesn't exist yet

---

## Completed Work (Archive)

<details>
<summary>v0.20+ Features</summary>

### TWAP Denominator for Trading Fund APY
Replaced snapshot-based denominator with Time-Weighted Average Position (TWAP) for trading fund APY. Multi-cycle funds now reflect actual average capital deployed.

### Remove start_date from Config + Active Days APY Tracking
Removed redundant `start_date` from fund config (derived from first entry). APY calculated using active days (time with capital deployed) rather than calendar days.

### Four Pillars Fund Categories (v0.27.0)
Portfolio categorization with 4 pillars: Liquidity, Yield, Store of Value, Volatility. Margin tracked separately. See [Philosophy docs](./docs/philosophy.md#the-four-pillars-of-portfolio-construction).

### Onboarding Wizard (v0.22)
Interactive 12-step intro wizard with animated D3 charts in the backtest app (`pages/`). Auto-shows for first-time visitors, shareable step URLs.

### Action Due Prompts
Dashboard banner and nav indicator showing funds past their configured action interval. Actionable funds sorted by priority (most overdue first), dismissible per session.

</details>

<details>
<summary>v0.1-0.6 Features</summary>

### Test Data Generation System
- Fetch and store 5 years of weekly price data (BTCUSD, TQQQ, SPXL)
- Test data generator utility with API endpoint and Settings UI button

### M1 Test Platform with Margin
- Blended price history (`pie-weekly.json`), margin integrity warnings in UI

### Code Quality
- Modal wrapper component, consolidated format utils, performance optimizations (React.memo, code splitting)

### E2E Test Coverage
- Feature coverage tracking system (`e2e/coverage-matrix.ts`)
- Full E2E suites: derivatives, UI workflows, platforms, import/export, cash funds

</details>
