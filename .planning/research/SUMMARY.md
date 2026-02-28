# Project Research Summary

**Project:** EscapeMint — Financial Dashboard UX Enhancements
**Domain:** Local-first DCA portfolio tracking dashboard (brownfield milestone)
**Researched:** 2026-02-28
**Confidence:** HIGH

## Executive Summary

EscapeMint is a mature, local-first DCA investing dashboard with an established monorepo architecture (React + D3 + Express + TSV storage). This milestone adds three UX features — configurable entry form fields, chart date range selector, and price/size charts — plus two bug fixes (liquidation detection divergence, cashflow data contract) and server route test coverage. Because the codebase already provides the data, patterns, and extension points for all three features, this is entirely a brownfield integration task. No new packages, no new API routes, and no engine changes are required.

The recommended approach follows existing codebase patterns exactly: per-fund display preferences go into `FundConfig` JSON (matching `chart_bounds`, `charts_collapsed`, `entries_visible_columns`); chart filtering happens client-side in `useMemo` (no server round-trips); new charts use D3 v7 imperative SVG (matching all five existing chart components); field configuration uses the `entries_column_order` / `entries_visible_columns` pattern from `EntriesTable`. The critical architectural insight is that Recharts is in `package.json` but entirely unused — all charts are D3. Any new chart work must follow D3, not Recharts.

The top risks are pre-existing code debt that must be resolved before new features land: liquidation detection logic is independently reimplemented in three places (engine, server, frontend), which causes chart and fund_size drift after full liquidations. Server routes have zero test coverage, meaning cashflow normalization behavior (DEPOSIT on cash funds → HOLD with signed amount) is untested and the contract is invisible. Both must be addressed in an early bug-fix phase before the UX milestone features can build on them reliably.

---

## Key Findings

### Recommended Stack

All three features can be implemented with the existing stack — no new dependencies are needed. The codebase uses React 18.3.1, TypeScript 5.7.2, D3 v7.9.0, Tailwind CSS 3.4.17, react-router-dom v7, and Express 4.x. `@dnd-kit/core` and `@dnd-kit/sortable` are available if drag-to-reorder entry fields is eventually desired, but up/down arrows or a checkbox list are sufficient for the immediate milestone. `recharts` should be uninstalled — it adds ~200 KB to the bundle and zero files import from it.

**Core technologies:**
- D3 7.9.0: all chart rendering — matches every existing chart component; adding Recharts would create a second charting paradigm
- React 18.3.1 + `useState`/`useMemo`: state management for date range selector and field config; no global state library needed
- TypeScript 5.7.2 strict: enforces correct optional config fields (`entry_fields?`, `chart_date_range?`)
- Tailwind CSS 3.4.17: button group UI for date range selector; no date picker library needed
- Native `Date` constructor: sufficient for month arithmetic (1M/3M/6M/YTD/1Y); no date library needed

### Expected Features

Features research confirms all three planned features are table stakes in the financial dashboard domain, with one clear differentiator (per-fund persisted date range preference vs. session-only in competitors).

**Must have (table stakes):**
- Chart date range buttons (1M/3M/6M/YTD/1Y/All) — every financial tool (TradingView, Yahoo Finance, Ghostfolio, Apple Stocks) provides this; its absence is immediately noticed
- Persisted date range per fund — users choose once; resetting on page load is confirmed friction
- Entry form field visibility per fund — 15 fields always visible creates cognitive load; progressive disclosure is the industry standard for action-aware forms
- Price history chart with average cost basis line — any share-tracking portfolio app shows this; DCA users expect to see their cost basis vs. current price
- Share accumulation chart — table stakes for a DCA-specific tool; data is already computed in `computeTimeSeries`
- Conditional chart visibility — charts only shown when relevant data exists; empty charts on cash funds create noise

**Should have (competitive):**
- Average cost basis line overlaid on price chart — directly communicates EscapeMint's DCA value proposition; trivially computed from existing `costBasis / sumShares`
- Per-fund field ordering (not just visibility) — unique among competitors; fund types are heterogeneous enough that per-fund ordering eliminates entry friction for power users

**Defer (v2+):**
- Custom date range picker (arbitrary start/end) — preset buttons cover 95% of use cases
- Drag-to-reorder fields within the live entry form — high complexity, poor accessibility, rarely used after initial setup; handle in the config editor instead
- Global field visibility presets shared across fund types — defer until multi-fund workflows are better understood
- Chart export (PNG/SVG) — separate feature scope

### Architecture Approach

All three features follow an identical integration path: add optional fields to `FundConfig` in `packages/engine/src/types.ts` and `packages/web/src/api/funds.ts`, persist via the existing `PUT /funds/:id` endpoint (which already accepts `Partial<FundConfig>`), and compute/filter entirely client-side. No new packages, API routes, or storage changes are required. The key pattern is Config-as-Preference-Store: per-fund display preferences live in the fund's `.json` file, matching `chart_bounds`, `charts_collapsed`, `entries_column_order`, and `entries_visible_columns`.

**Major components:**
1. `FundConfig` (engine types + web api/funds.ts) — add `chart_date_range?: ChartDateRange` and `entry_fields?: string[]` as optional fields; backward-compatible with all existing funds
2. `FundCharts.tsx` — add `useMemo` entry filter by date range; add `PriceHistoryChart` and `ShareAccumulationChart` D3 components; gate on `features.supportsShares && entries.some(e => e.price)`
3. `EntryForm.tsx` — accept `entryFields?: string[]` prop; derive field visibility via `useMemo`; guard required fields (date, value) from being hidden
4. `EditFundConfigModal` — extend with field order/visibility configurator matching `EntriesTable` column config pattern; auto-save with debounce
5. `ChartSettings.tsx` or new `ChartDateRangeSelector` component — button group (1M/3M/6M/YTD/1Y/All); debounced `updateFundConfig` call

### Critical Pitfalls

1. **Liquidation detection logic duplicated in 3 places** — engine, server route, and `FundCharts.tsx` each independently detect liquidation with slightly different heuristics; fixes to one do not propagate. Extract a single `detectFullLiquidation()` pure function into `packages/engine/src/` and import it everywhere. Write unit tests for all branches (share-liquidated, value-liquidated, harvest-mode, accumulate-mode partial-sell) before touching any chart features.

2. **Zero server route tests; cashflow contract invisible** — `packages/server/test/` has only one file covering the logger utility; the DEPOSIT-to-HOLD normalization and fund_size recalculation loop are completely untested. Use `supertest` with a real temp `DATA_DIR` (not mocked storage) to write route tests before any form changes. Mocking `@escapemint/storage` is forbidden in route tests — it hides the exact bugs that need catching.

3. **Config write storms on date range selection** — clicking through date range presets rapidly fires multiple concurrent `PUT /funds/:id` requests; without debouncing, the final persisted value may be wrong (last write wins with stale read). Debounce at 500–800ms; update local UI state optimistically immediately.

4. **Entry form stale state after config save** — deriving field visibility in `useState` with an initializer (`useState(() => config.entry_fields)`) only runs once on mount; subsequent config saves produce no re-render. Derive via `useMemo` from the config prop; invalidate/refetch fund config after a successful save.

5. **Price/size charts rendered for funds with no price data** — guarding on `config.fund_type === 'stock'` alone is insufficient; stock funds imported before share tracking was added have no `price`/`shares` entries. Compute `hasPriceData = entries.some(e => e.price !== undefined && e.shares !== undefined)` and gate on both fund type and data presence. D3 `scaleLinear().domain([NaN, NaN])` will otherwise throw silent rendering errors.

---

## Implications for Roadmap

Based on research, the correct sequence addresses pre-existing debt before building new features on top of it.

### Phase 1: Bug Fixes and Server Test Foundation

**Rationale:** Both critical bugs (liquidation detection divergence, cashflow data contract) affect the data that new chart features will display. Building price/size charts on top of incorrect liquidation logic will cause those charts to show wrong values. Server route tests must exist before form behavior changes alter the client's entry payload. This phase unblocks everything that follows.

**Delivers:** Single authoritative `detectFullLiquidation()` engine function imported everywhere; server route tests with real temp filesystem; verified DEPOSIT/WITHDRAW cashflow contract; no more chart/fund_size drift after full liquidations.

**Addresses:** Pitfalls 1 and 2 (liquidation divergence, cashflow mismatch, filesystem mock anti-pattern).

**Avoids:** Building price/size charts on top of incorrect liquidation cost-basis data; adding form changes whose DEPOSIT normalization is untested.

**Research flag:** Standard patterns; no additional research needed. Extraction pattern (engine function + unit tests) is well-established in this codebase.

---

### Phase 2: Chart Date Range Selector

**Rationale:** Purest feature — no form changes, pure display enhancement. Establishes `chart_date_range` config field and `filteredEntries` data flow that Phase 3 (price/size charts) depends on. Lowest implementation risk, highest user-visible impact per effort. Ships standalone.

**Delivers:** 1M/3M/6M/YTD/1Y/All button group above `FundCharts`; date range persisted to fund config JSON; `filteredEntries` `useMemo` slice in `FundCharts` that all chart components reuse.

**Addresses:** "Date range buttons are table stakes" (FEATURES.md P1); per-fund persistence differentiator vs. competitors.

**Avoids:** Config write storm (debounce 500ms); D3 resize re-render loop (keep date range state close to chart, not at page level); server-side date filtering (wrong architectural layer).

**Uses:** Native `Date` constructor arithmetic (no date library); Tailwind button group (no picker library); `updateFundConfig` via existing `PUT /funds/:id`.

**Research flag:** Standard patterns; well-documented in codebase. No additional research needed.

---

### Phase 3: Price/Size Charts

**Rationale:** Depends on Phase 2's `filteredEntries` data flow — price/size charts must respect the date range filter. Depends on Phase 1's corrected liquidation logic — `costBasis` and `sumShares` in `computeTimeSeries` must be accurate for cost basis overlay to be meaningful. Data (`sumShares`, `costBasis`) is already computed client-side in `FundCharts.tsx`; no new API needed.

**Delivers:** `PriceHistoryChart` D3 component (line chart of `entry.price` over time with average cost basis overlay); `ShareAccumulationChart` D3 component (area chart of cumulative `sumShares`); conditional rendering guarded on both fund type and data presence.

**Addresses:** "Price chart with cost basis overlay" and "Share accumulation chart" (FEATURES.md P1 table stakes); DCA value proposition visualization.

**Avoids:** Showing charts for funds with no price data (guard on `entries.some(e => e.price !== undefined && e.shares !== undefined)`); D3 NaN domain errors; rendering for cash/derivatives fund types.

**Implements:** Fund-Type Feature Gating pattern (`getFundTypeFeatures(fundType).supportsShares`) plus data-presence guard.

**Research flag:** Standard D3 patterns; `DerivativesPriceChart.tsx` is the direct template. No additional research needed.

---

### Phase 4: Configurable Entry Form Fields

**Rationale:** Independent of Phases 2 and 3 (no shared dependencies), but benefits from the server route tests established in Phase 1 — field config save goes through `PUT /funds/:id`, which now has test coverage. Most complex UX phase due to stale state risk and required-field validation. Placed last because it touches the most files (EntryForm, AddEntryModal, EditEntryModal, EditFundConfigModal) and has the highest regression surface.

**Delivers:** `entry_fields?: string[]` in `FundConfig`; field visibility/ordering UI in `EditFundConfigModal` (checkbox list with order, matching `EntriesTable` column configurator); `EntryForm` accepts `entryFields` prop and derives visibility via `useMemo`; required fields (date, value) cannot be hidden; auto-save with debounce.

**Addresses:** "Entry form only showing relevant fields for the action type" (FEATURES.md P1 table stakes); per-fund configurable field order (differentiator).

**Avoids:** Stale state after config save (derive from prop via `useMemo`, not `useState` initializer); required field hidden = silent data corruption (validate before POST); drag-and-drop in live form (defer to v1.x).

**Research flag:** Standard React prop-drilling pattern. The `EntriesTable` column configurator is the direct template. No additional research needed.

---

### Phase Ordering Rationale

- Phase 1 before everything: liquidation bug affects chart data accuracy; server test absence hides cashflow contract bugs; both must be resolved before building features on top.
- Phase 2 before Phase 3: `filteredEntries` from date range filtering is a natural dependency for price/size charts; establishes the data pipeline that Phase 3 consumes.
- Phase 4 is independent: configurable form fields have no data dependency on Phases 2 or 3, but are placed last due to wider file surface area and higher regression risk — placed after the foundation is solid.
- All phases follow existing patterns: Config-as-Preference-Store, Fund-Type Feature Gating, Client-Side Entry Filtering — no new architectural patterns introduced.

### Research Flags

Phases with standard patterns (skip research-phase):
- **All four phases:** All implementation patterns are fully established in the existing codebase with direct file references. Architecture research identified exact extension points, exact line numbers of existing patterns to follow, and exact anti-patterns to avoid. No external research gaps remain.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified by direct codebase grep; D3-vs-Recharts finding confirmed across entire `src/` tree; npm versions confirmed |
| Features | HIGH | Table stakes confirmed across 4+ competitors (Apple Stocks, TradingView, Ghostfolio, Portfolio Performance); codebase confirms all data is already computed |
| Architecture | HIGH | All findings from direct codebase inspection; exact file paths, line numbers, and extension points identified; no external assumptions |
| Pitfalls | HIGH | Liquidation duplication confirmed at specific line numbers in two files; server test gap confirmed by `packages/server/test/` directory contents |

**Overall confidence:** HIGH

### Gaps to Address

- **Debounce timing for config writes:** 500–800ms is recommended but not validated against the lockfile acquisition timing in `proper-lockfile`. If writes are slow on the user's filesystem, a shorter debounce may still cause contention. Validate during Phase 2 implementation by observing Network tab behavior with rapid clicking.

- **`entry_fields` field ordering in EditFundConfigModal:** The exact UI pattern (ordered checkbox list vs. simple unordered toggle list vs. drag-to-reorder) is not fully specified. The `EntriesTable` column configurator is the template, but it uses a different interaction model than the form itself. Validate UX during Phase 4 implementation; start with simple ordered list with up/down buttons before considering drag-and-drop.

- **`entry_fields` validation on server:** The pitfalls research recommends validating `entry_fields` values against `ENTRY_HEADERS` on the server before persisting (prevents malformed config). This is a minor validation step not currently in the server route — flag for implementation during Phase 4.

---

## Sources

### Primary (HIGH confidence)

- EscapeMint codebase direct inspection — `packages/web/src/components/FundCharts.tsx`, `EntryForm.tsx`, `EntriesTable.tsx`, `ChartSettings.tsx`, `api/funds.ts`, `pages/FundDetail.tsx`, `packages/engine/src/types.ts`, `packages/server/src/routes/funds.ts`, `packages/web/package.json`
- EscapeMint planning docs — `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`
- MDN — `Date` constructor month arithmetic behavior for range calculation

### Secondary (MEDIUM confidence)

- [Ghostfolio](https://www.ghostfol.io/en) — WTD/MTD/YTD/1Y/5Y/Max date range patterns; transaction management UI
- [Portfolio Performance](https://www.portfolio-performance.info/en/) — open source; time series chart patterns, share accumulation
- [Wealthfolio HN Discussion](https://news.ycombinator.com/item?id=46006016) — manual entry form, price quotes tab, cost basis patterns
- [@dnd-kit/core npm](https://www.npmjs.com/package/@dnd-kit/core) v6.3.1 — React drag-and-drop sortable lists
- [Recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) — breaking changes confirming D3 is the right choice for this codebase
- [Node.js Testing Best Practices (goldbergyoni, 2025)](https://github.com/goldbergyoni/nodejs-testing-best-practices) — real filesystem approach for route tests

### Tertiary (MEDIUM/LOW confidence)

- [Fintech UX Best Practices 2026](https://www.eleken.co/blog-posts/fintech-ux-best-practices) — progressive disclosure, form friction reduction
- [Apple Support — Stocks chart date ranges](https://support.apple.com/en-euro/guide/stocks/stc4cfc704df/mac) — canonical preset set (1D/1W/1M/3M/6M/1Y/2Y/5Y/10Y)
- [Common Mistakes in React Admin Dashboards](https://dev.to/vaibhavg/common-mistakes-in-react-admin-dashboards-and-how-to-avoid-them-1i70) — D3 re-render patterns

---

*Research completed: 2026-02-28*
*Ready for roadmap: yes*
