# EscapeMint - Development Plan

A local-first, open-source capital allocation engine for rules-based fund management.

---

## Documentation

See the [docs/](./docs/) folder for detailed documentation:

- **[Philosophy](./docs/philosophy.md)** - Why this system exists (start here)
- [Investment Strategy](./docs/investment-strategy.md) - DCA methodology
- [Ticker Choices](./docs/ticker-choices.md) - Why we prefer volatile assets like TQQQ
- [Fund Management](./docs/fund-management.md) - Position and cash tracking
- [Configuration Guide](./docs/configuration.md) - All config options
- [Data Format](./docs/data-format.md) - TSV file structure
- [System Architecture](./docs/architecture.md) - Package structure and data flow
- [Derivatives](./docs/derivatives.md) - Perpetual futures data model

---

## Next Up

### Target Equity Price Display
Show the current target equity price on fund dashboards (the price above which you should sell).

**Implementation:**
- [ ] Calculate target sell price from expected_target / shares
- [ ] Display on fund detail page header
- [ ] Add to entry form as reference

### Configurable Entry Form Fields
Allow per-fund configuration of which entry fields are shown and their order. Some accounts track price/size, others don't.

**Implementation:**
- [ ] Add `entry_fields` config to fund JSON (array of field names + order)
- [ ] Create field configuration UI in fund settings
- [ ] Update entry form to respect field visibility/ordering
- [ ] Preserve backwards compatibility (default shows all fields)

### Price/Size Charts
When tracking price/size, show additional charts on the fund dashboard.

**Implementation:**
- [ ] Add price history chart (price over time)
- [ ] Add share accumulation chart (total shares over time)
- [ ] Add cost basis vs current price comparison
- [ ] Only show charts when fund has price/size data

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
| v0.17+ | Target price display, configurable forms | In Progress |
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
