# Requirements: EscapeMint

**Defined:** 2026-02-28
**Core Value:** The system must reliably compute and display fund state, recommendations, and metrics so users can make informed DCA decisions without emotion or guesswork.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Bug Fixes

- [ ] **FIX-01**: Liquidation detection logic is consistent across all three implementations (server, web, engine)
- [ ] **FIX-02**: DEPOSIT/WITHDRAW cashflow handling is correct — server route passes properly normalized data to engine
- [ ] **FIX-03**: Unused Recharts dependency removed from packages/web/package.json

### Server Tests

- [ ] **TEST-01**: Server route unit tests exist for all fund CRUD endpoints (GET/POST/PUT/DELETE)
- [ ] **TEST-02**: Server route unit tests exist for compute endpoints (recommendation, fund state)
- [ ] **TEST-03**: Server route unit tests verify DEPOSIT/WITHDRAW normalization behavior
- [ ] **TEST-04**: Aggregate calculation tests exist for computeAggregateMetrics and computeFundMetrics

### Chart Date Range

- [ ] **CHART-01**: User can select chart date range via button row (1M, 3M, 6M, YTD, 1Y, All)
- [ ] **CHART-02**: Selected date range filters all charts on the fund detail page
- [ ] **CHART-03**: Selected date range persists per-fund in the fund JSON config
- [ ] **CHART-04**: Date range defaults to "All" when no preference is saved

### Price/Size Charts

- [ ] **PRICE-01**: User can view price history chart over time when fund has price data
- [ ] **PRICE-02**: User can view share accumulation chart over time when fund has share data
- [ ] **PRICE-03**: User can view cost basis vs current price comparison chart
- [ ] **PRICE-04**: Price/size charts only render when actual price/share data exists in entries (not based on fund type)
- [ ] **PRICE-05**: Price/size charts respect the selected date range from CHART-01

### Entry Form Configuration

- [ ] **FORM-01**: User can configure which entry form fields are visible per-fund
- [ ] **FORM-02**: User can configure the ordering of entry form fields per-fund
- [ ] **FORM-03**: Each fund type has sensible default field visibility (stock: date+value+amount, derivatives: all fields)
- [ ] **FORM-04**: Date field pre-fills with today's date
- [ ] **FORM-05**: Value field pre-fills with the fund's latest value
- [ ] **FORM-06**: Entry form field configuration UI lives in EditFundConfigModal
- [ ] **FORM-07**: Quick entry mode available — toggle to show only date + value for minimal friction

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Entry Form Enhancements

- **FORM-V2-01**: Drag-to-reorder field ordering (requires @dnd-kit dependency)
- **FORM-V2-02**: Per-action field templates (BUY shows different fields than DEPOSIT)

### Chart Enhancements

- **CHART-V2-01**: Custom date range picker (arbitrary start/end dates)
- **CHART-V2-02**: Chart comparison mode (overlay two funds)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Candlestick charts | Wrong data model — one price per trade entry, not OHLCV |
| Real-time price feeds | Violates local-first constraint |
| Drag-to-reorder in entry form | High complexity, low frequency — up/down arrows sufficient for v1 |
| Visual regression tests | Separate v1.0 effort, not this milestone |
| Keyboard shortcuts | Separate v1.0 effort, not this milestone |
| Mobile responsive layout | Separate v1.0 effort, not this milestone |

## Traceability

All 23 v1 requirements mapped to phases 1-5. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 1 | Pending |
| FIX-02 | Phase 1 | Pending |
| FIX-03 | Phase 1 | Pending |
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 2 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 2 | Pending |
| CHART-01 | Phase 3 | Pending |
| CHART-02 | Phase 3 | Pending |
| CHART-03 | Phase 3 | Pending |
| CHART-04 | Phase 3 | Pending |
| PRICE-01 | Phase 4 | Pending |
| PRICE-02 | Phase 4 | Pending |
| PRICE-03 | Phase 4 | Pending |
| PRICE-04 | Phase 4 | Pending |
| PRICE-05 | Phase 4 | Pending |
| FORM-01 | Phase 5 | Pending |
| FORM-02 | Phase 5 | Pending |
| FORM-03 | Phase 5 | Pending |
| FORM-04 | Phase 5 | Pending |
| FORM-05 | Phase 5 | Pending |
| FORM-06 | Phase 5 | Pending |
| FORM-07 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation — all 23 requirements mapped to phases 1-5*
