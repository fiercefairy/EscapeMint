# Roadmap: EscapeMint — UX Enhancements Milestone

## Overview

This milestone addresses pre-existing code debt first (liquidation detection divergence, cashflow contract gaps, missing server test coverage), then delivers three UX enhancements (chart date range selector, price/size charts, configurable entry form fields) in dependency order. Phases are ordered so each builds on a stable foundation — bugs fixed before charts depend on their output, date range pipeline established before price charts consume it, form changes last because they touch the widest file surface.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Stabilize** - Fix liquidation detection divergence, cashflow normalization bug, and remove unused Recharts dependency
- [ ] **Phase 2: Server Test Coverage** - Add unit tests for all server routes and aggregate calculation functions
- [ ] **Phase 3: Chart Date Range** - Add 1M/3M/6M/YTD/1Y/All date range selector persisted per-fund in config
- [ ] **Phase 4: Price/Size Charts** - Add price history, share accumulation, and cost basis charts gated on data presence
- [ ] **Phase 5: Configurable Entry Form** - Add per-fund field visibility and ordering to entry form with quick-entry mode

## Phase Details

### Phase 1: Stabilize
**Goal**: The codebase has one authoritative liquidation detection function, correct cashflow normalization, and no phantom bundle weight from an unused charting library
**Depends on**: Nothing (first phase)
**Requirements**: FIX-01, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):
  1. Liquidation detection produces identical results whether called from the engine, server route, or frontend — no fund_size or chart drift after a full liquidation
  2. DEPOSIT and WITHDRAW entries are correctly normalized by the server route and arrive at the engine in the expected shape — a cash fund DEPOSIT does not silently corrupt fund state
  3. The web bundle no longer includes Recharts — `packages/web/package.json` has no recharts entry and `npm run build` succeeds
**Plans**: TBD

Plans:
- [ ] 01-01: Extract detectFullLiquidation into engine, replace all three call sites, add unit tests for all branches
- [ ] 01-02: Verify and fix DEPOSIT/WITHDRAW server normalization; confirm engine receives correct data
- [ ] 01-03: Remove recharts from packages/web/package.json and verify build

### Phase 2: Server Test Coverage
**Goal**: Every server API route and aggregate calculation function has unit test coverage, making the server's data contracts visible and regression-safe
**Depends on**: Phase 1
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Running `npm run test` includes server route tests that pass for all fund CRUD endpoints (GET, POST, PUT, DELETE)
  2. Server route tests for compute endpoints (recommendation, fund state) pass and document expected output shapes
  3. Server route tests explicitly cover DEPOSIT/WITHDRAW normalization behavior — the cashflow contract is encoded in a test, not just known informally
  4. computeAggregateMetrics and computeFundMetrics have unit tests that cover their output fields and edge cases (empty funds, zero values)
**Plans**: TBD

Plans:
- [ ] 02-01: Set up server test infrastructure with supertest and real temp DATA_DIR; write fund CRUD route tests
- [ ] 02-02: Write compute endpoint tests (recommendation, fund state) and DEPOSIT/WITHDRAW normalization tests
- [ ] 02-03: Write aggregate calculation tests for computeAggregateMetrics and computeFundMetrics

### Phase 3: Chart Date Range
**Goal**: Users can filter all fund detail charts by a selected date range that persists across page loads
**Depends on**: Phase 1
**Requirements**: CHART-01, CHART-02, CHART-03, CHART-04
**Success Criteria** (what must be TRUE):
  1. A button row with 1M, 3M, 6M, YTD, 1Y, and All options appears on the fund detail page and responds to clicks
  2. Selecting a date range filters the data shown across all charts on that fund detail page — no chart shows data outside the selected window
  3. Navigating away from a fund and returning shows the same date range that was last selected — the preference survived the navigation
  4. A fund with no saved date range preference defaults to showing All data without any visible error or flash
**Plans**: TBD

Plans:
- [ ] 03-01: Add chart_date_range field to FundConfig types; build ChartDateRangeSelector component with Tailwind button group
- [ ] 03-02: Wire filteredEntries useMemo into FundCharts; debounce config persistence to PUT /funds/:id

### Phase 4: Price/Size Charts
**Goal**: Users can view price history, share accumulation, and cost basis charts for funds that have the relevant data
**Depends on**: Phase 3
**Requirements**: PRICE-01, PRICE-02, PRICE-03, PRICE-04, PRICE-05
**Success Criteria** (what must be TRUE):
  1. A fund with price and share entries shows a price history chart with an average cost basis overlay line
  2. A fund with share entries shows a share accumulation chart showing cumulative shares over time
  3. A fund with price and share entries shows a cost basis vs current price comparison chart
  4. A cash fund or a stock fund with no price/share data shows none of the price/size charts — no empty chart noise
  5. All price/size charts filter their data to the date range selected in Phase 3 — the range selector controls everything
**Plans**: TBD

Plans:
- [ ] 04-01: Build PriceHistoryChart D3 component with cost basis overlay; gate on data presence guard
- [ ] 04-02: Build ShareAccumulationChart D3 component; wire both into FundCharts with filteredEntries from Phase 3
- [ ] 04-03: Build cost basis vs current price chart; verify conditional rendering across fund types and data states

### Phase 5: Configurable Entry Form
**Goal**: Users can configure which entry form fields appear and in what order for each fund, with quick-entry mode for minimal friction on common entries
**Depends on**: Phase 2
**Requirements**: FORM-01, FORM-02, FORM-03, FORM-04, FORM-05, FORM-06, FORM-07
**Success Criteria** (what must be TRUE):
  1. In EditFundConfigModal, a user can toggle individual entry form fields visible or hidden per-fund, and the change persists after saving
  2. In EditFundConfigModal, a user can reorder entry form fields for a fund using up/down controls, and the order persists after saving
  3. A newly created stock fund defaults to showing date, value, and amount fields; a derivatives fund defaults to showing all fields — without any user configuration
  4. Opening the entry form shows today's date pre-filled in the date field and the fund's latest value pre-filled in the value field
  5. A quick-entry toggle reduces the form to just date and value fields regardless of per-fund configuration — enabling the fastest possible common-case entry
  6. The date and value fields cannot be hidden through per-fund configuration — they are always present and always required
**Plans**: TBD

Plans:
- [ ] 05-01: Add entry_fields to FundConfig types; implement sensible defaults per fund type
- [ ] 05-02: Build field visibility/ordering UI in EditFundConfigModal matching EntriesTable column configurator pattern
- [ ] 05-03: Update EntryForm to derive field visibility via useMemo from entryFields prop; add date/value pre-fill and required-field guard
- [ ] 05-04: Add quick-entry mode toggle to entry form; wire entry_fields validation on server before persistence

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Stabilize | 0/3 | Not started | - |
| 2. Server Test Coverage | 0/3 | Not started | - |
| 3. Chart Date Range | 0/2 | Not started | - |
| 4. Price/Size Charts | 0/3 | Not started | - |
| 5. Configurable Entry Form | 0/4 | Not started | - |
