# EscapeMint

## What This Is

A local-first, rules-based capital allocation engine for systematic DCA investing. EscapeMint helps individuals manage investments across multiple brokerages using deterministic buy/sell recommendations, transparent TSV data storage, and emotion-free decision-making. It's a retirement system, not a trading platform.

## Core Value

The system must reliably compute and display fund state, recommendations, and metrics so users can make informed DCA decisions without emotion or guesswork.

## Requirements

### Validated

- ✓ Multi-platform fund management (Robinhood, Coinbase, M1, Crypto.com, custom) — existing
- ✓ Tiered DCA recommendations (min/mid/max based on performance) — existing
- ✓ Accumulate and harvest modes — existing
- ✓ Cash interest tracking — existing
- ✓ Derivatives/perpetual futures support — existing
- ✓ TSV file persistence with file locking — existing
- ✓ Dashboard with aggregate metrics, allocation charts, APY tracking — existing
- ✓ Fund detail views with charts and recommendations — existing
- ✓ Deep-linkable routes for all views — existing
- ✓ Add/edit/delete entries via modal forms — existing
- ✓ iCloud backup/restore and JSON export/import — existing
- ✓ Platform management (create, rename, delete) — existing
- ✓ Fund creation with inline platform creation — existing
- ✓ Test data generation system — existing
- ✓ E2E test suite (130+ tests, 9 spec files) — existing
- ✓ Engine unit tests (135 tests) and storage unit tests (9 tests) — existing
- ✓ WebSocket real-time updates — existing

### Active

- [ ] Configurable entry form fields — per-fund field visibility and ordering for quick entry
- [ ] Chart date range selector — 1M/3M/6M/YTD/1Y/All filtering, persisted per-fund in config
- [ ] Price/size charts — price history, share accumulation, cost basis vs current price
- [ ] Fix liquidation detection logic fragility in funds.ts
- [ ] Fix cashflow handling (DEPOSIT/WITHDRAW) — verify server route passes correct data
- [ ] Server route unit tests for all API endpoints
- [ ] Aggregate calculation tests (computeAggregateMetrics, computeFundMetrics)

### Out of Scope

- Keyboard shortcuts (j/k navigation, Enter, Esc) — deferred to later v1.0 work
- Mobile-responsive layout — deferred to later v1.0 work
- Tax lot tracking (FIFO) — v1.0 goal but not this milestone
- Documentation (Getting Started, Ticker Choices, API reference) — separate effort
- Strategy plugins, benchmark comparison, goal setting — v2.0
- Currency support, multi-account aggregation, CSV/PDF export — v2.0
- PWA/offline, community features — long-term vision

## Context

- Brownfield project at v0.40.7 with established versioning and changelog system (.changelogs/)
- Monorepo: engine (pure calc), storage (TSV persistence), server (Express API), web (React/Vite)
- Ports: Web 5550, API 5551, CDP 5549 (defined in ecosystem.config.cjs)
- Data: TSV entries + JSON config per fund in data/funds/
- Testing: Vitest for unit, Playwright for E2E (single worker, sequential)
- Entry form friction is the primary UX pain point — users want quick date+value entry for the common case
- Chart date range should persist in fund JSON config (not session-only)
- Price/size charts only relevant for funds tracking share-level data

## Constraints

- **Local-first**: No cloud dependencies, no telemetry, no external API calls
- **Data format**: TSV files are the source of truth; JSON config is supplementary
- **Tech stack**: TypeScript strict mode, React 18, Express 4, Vite 6, Tailwind 3
- **Code style**: Functional programming, no classes, no try/catch unless necessary, Prettier (no semicolons, single quotes)
- **UI patterns**: Sonner toasts (never window.alert), ConfirmDialog (never window.confirm), all views deep-linkable
- **Testing**: E2E tests use "test" platform, single Playwright worker, no data conflicts
- **Versioning**: SemVer with changelogs in .changelogs/v{version}.md, version bumps in package.json

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Per-fund entry_fields config in JSON | Allows different funds to show different fields; derivatives need more fields than simple stock funds | — Pending |
| Chart range persisted in fund config | User preference should survive page refresh; consistent with how other fund prefs are stored | — Pending |
| Price/size charts conditional on data | Only funds with price/size entries should show these charts; avoids empty chart noise | — Pending |

---
*Last updated: 2026-02-28 after initialization*
