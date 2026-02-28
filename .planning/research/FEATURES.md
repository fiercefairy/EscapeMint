# Feature Research

**Domain:** Financial portfolio tracking / systematic DCA dashboard — entry form UX, chart date filtering, price+share visualization
**Researched:** 2026-02-28
**Confidence:** HIGH (codebase analysis) / MEDIUM (competitor patterns via WebSearch)

---

## Context: What This Is Researching

This is a **subsequent milestone** for EscapeMint (v0.40.7+), a local-first DCA investing dashboard with an established architecture. The three active features are:

1. **Configurable entry form fields** — per-fund visibility and ordering for quick entry
2. **Chart date range selector** — 1M/3M/6M/YTD/1Y/All, persisted per-fund in JSON config
3. **Price/size charts** — price history, share accumulation, cost basis vs current price

All three features already have defined config extension points in the FundConfig type. This research answers: what does the industry expect, what differentiates, and what to deliberately avoid.

---

## Existing Codebase Touchpoints

| Feature | Existing Foundation | What's Missing |
|---------|--------------------|-----------------|
| Configurable entry form | `EntryForm.tsx` has all 15 fields; `entries_column_order`/`entries_visible_columns` pattern already used in EntriesTable | No parallel `entry_fields` config for the *form* itself |
| Chart date range | `FundCharts.tsx` renders all data; `chart_bounds` persisted per-fund in config | No date range selector UI; no `chart_range` config field |
| Price/size charts | `FundCharts.tsx` computes `sumShares`, `costBasis` in `computeTimeSeries()` | No chart rendering those values; no conditional rendering guard |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Date range buttons (1M/3M/6M/YTD/1Y/All) on charts | Every financial charting tool — TradingView, Yahoo Finance, Ghostfolio, Apple Stocks — has this. Users immediately look for it. | LOW | Standard button group above/below chart. The data already exists; just need to slice the `computedTimeSeries` array. |
| Persisted date range preference per fund | Users choose a range once; finding it reset every page load is friction. | LOW | Write selected range to `fund.config.chart_date_range` via existing `updateFundConfig` API. Pattern matches existing `chart_bounds` persistence. |
| Entry form only showing relevant fields for the action type | Showing 15 fields when entering a simple BUY (date + equity + amount) creates unnecessary cognitive load. Industry standard is action-aware progressive disclosure. | MEDIUM | EntryForm already has some conditional rendering (cash fund path, derivatives check). Extend to field-level show/hide driven by config + selected action. |
| Price chart with cost basis overlay | Any share-tracking portfolio app (Portfolio Performance, Wealthfolio, Ghostfolio) shows price history with average cost basis line. Users DCA'ing into stocks expect to see this. | MEDIUM | `sumShares` and `costBasis` are already computed in `computeTimeSeries`; add `avgCostBasis` = `costBasis / sumShares`. Needs new chart component. |
| Share accumulation chart | DCA users need to see how many shares they've accumulated over time. Table stakes for any DCA-specific tool. | LOW | Data (`sumShares` running total) is already computed in `computeTimeSeries`. Add new chart panel using existing D3 patterns. |
| Charts conditionally visible based on data | Showing an empty price chart for a cash fund with no `shares` entries is noise. Users expect charts to appear only when relevant data exists. | LOW | Guard rendering on `entries.some(e => e.price)` and `entries.some(e => e.shares)`. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-fund configurable field order in entry form | Most portfolio trackers have one fixed form layout. EscapeMint's fund types are heterogeneous (cash/stock/crypto/derivatives with different data needs). Letting power users reorder/hide fields per fund eliminates entry friction at the fund level, not just globally. | MEDIUM | Extend `FundConfig` with `entry_fields: string[]` (ordered list of visible field names). Reuse the drag-and-drop or checkbox pattern from `EntriesTable`'s column config. |
| Formula input in entry form (already exists) | Most trackers require exact values. EscapeMint already supports `=500.97+459.55` in numeric fields. This is rare and genuinely useful for DCA users combining partial lot prices. | NONE | Already implemented; just needs to remain on visible fields. |
| Average cost basis line on price chart | Shows the DCA effect visually — price oscillates around your average cost, which trends down over time. This directly communicates EscapeMint's core value proposition. | LOW | Simple horizontal-tracking line drawn over the price chart. Trivially computed from `costBasis / sumShares` at each data point. |
| Digit error detection on equity input (already exists) | Warns users when entered equity is 10x off from prior entry (likely extra/missing digit). No other tracker does this. | NONE | Already implemented; keep it on the primary equity field regardless of form config. |
| Default date = today in quick entry | DCA users add entries the same day. Pre-populating today's date eliminates the most common input. | NONE | Already implemented. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Global field visibility settings that override all funds | "I always want to see shares on every form" | Defeats the per-fund purpose. Derivatives, cash, and stock funds have fundamentally different field requirements. Global settings create an exception-heavy config tree. | Use per-fund `entry_fields` config with sensible fund-type defaults (engine's `FUND_TYPE_DEFAULTS` pattern). |
| Drag-and-drop field reordering inside the live entry form | Seems like ultimate customization | High implementation complexity, poor accessibility, and rarely used after initial setup. Users set it once and forget. | Reorder fields in the fund config editor (EditFundConfigModal), not in the form itself. |
| Animated chart transitions on range change | Feels polished | Adds complexity to the D3 re-render cycle. EscapeMint charts use SVG DOM manipulation — transitions require careful cleanup to avoid stale element accumulation. Currently CONCERNS.md flags chart complexity. | Instant re-render on range change. No animation needed for a data-entry tool. |
| Candlestick / OHLCV chart | Users know it from trading apps | EscapeMint tracks portfolio equity, not live market prices. It has one price point per BUY/SELL entry, not daily OHLCV data. A candlestick chart would be empty or misleading. | Line chart of `entry.price` per BUY action is the correct representation. |
| Real-time price feed integration | "Show me the current market price" | Violates the local-first, no-external-API-calls constraint. Creates internet dependency for a tool designed to work offline. | Manual price entry on each BUY; compute average cost basis from recorded data. |
| Per-session (not persisted) date range | Simpler to implement | Users set a preferred range once and want it sticky. Session-only range requires re-selecting every page load — confirmed friction point from PROJECT.md. | Always persist to fund config via `updateFundConfig`. |
| Chart zoom/pan via mouse drag | Rich interaction model | D3 brush/zoom requires significant event handling complexity that conflicts with the existing hover tooltip interaction. | Date range buttons cover 95% of use cases. Custom date range is v2 scope. |

---

## Feature Dependencies

```
[entry_fields config in FundConfig]
    └──required by──> [Configurable entry form UI]
                          └──reads from──> [EditFundConfigModal or dedicated fields editor]

[chart_range config in FundConfig]
    └──required by──> [Date range selector UI in FundCharts]
                          └──persists via──> [updateFundConfig API call]

[entries with entry.price > 0]
    └──guards──> [Price/size charts]
                     └──computes from──> [computeTimeSeries (sumShares, costBasis already tracked)]
                          └──renders in──> [New PriceSizeChart component or extension to FundCharts]

[Date range selector]
    └──enhances──> [Price/size charts] (users want to zoom into accumulation periods)
    └──enhances──> [Existing value/allocation charts] (same filter applied uniformly)

[entries_column_order / entries_visible_columns (existing)]
    └──precedes and models──> [entry_fields config] (same storage + API pattern, different UI layer)
```

### Dependency Notes

- **Date range selector requires chart_range in FundConfig:** The selector is stateful — it must persist or it's useless. The FundConfig JSON is the right home (matches `chart_bounds` precedent at `packages/web/src/api/funds.ts:52`).
- **Price/size charts require entry.price data:** Charts must be conditionally rendered. Funds without share/price entries should not show these charts. Guard with `entries.some(e => e.price)`.
- **Date range filter should apply to all charts uniformly:** Users expect one range selector to control all chart panels on the fund detail page, not per-chart selectors. This means the filter must live above `FundCharts` and slice the data before passing it down.
- **Configurable entry form does NOT depend on date range or price charts:** These are independent features that can ship in any order.

---

## MVP Definition

### Launch With (this milestone)

- [x] Date range selector: 1M/3M/6M/YTD/1Y/All buttons above `FundCharts`, persisted via `updateFundConfig` — **highest user-visible value, lowest complexity**
- [x] Configurable entry form: `entry_fields` array in FundConfig drives which fields show; fund-type defaults from engine; editable in `EditFundConfigModal` — **eliminates primary UX pain point per PROJECT.md**
- [x] Price/size charts: Price history line + average cost basis line + share accumulation area chart, conditionally rendered when `entry.price`/`entry.shares` data exists — **closes the DCA visualization gap**

### Add After Validation (v1.x)

- [ ] Drag-to-reorder fields within the form config editor (currently: list with toggle; later: ordered list) — add when users request specific ordering frequently
- [ ] Custom date range picker (start date / end date inputs) — add if YTD/1Y/All don't cover user needs

### Future Consideration (v2+)

- [ ] Global field visibility presets shared across multiple funds of the same type — defer until multi-fund workflows are better understood
- [ ] Chart export (PNG/SVG) — separate feature, different scope

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chart date range selector | HIGH — zero-friction browsing of historical data | LOW — filter data array + persist to config | P1 |
| Configurable entry form fields | HIGH — primary UX pain point per PROJECT.md | MEDIUM — config schema + form rendering logic | P1 |
| Price/size charts | MEDIUM — relevant only for stock/crypto funds with shares data | MEDIUM — new D3 chart component + data computation | P1 |
| Field reorder within form editor | LOW — users accept a fixed order once configured | MEDIUM — DnD or ordered list UI | P3 |
| Custom date range picker | LOW — preset buttons cover 95% of use cases | MEDIUM — date picker + validation | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Ghostfolio | Portfolio Performance | Wealthfolio | EscapeMint (current) | EscapeMint (target) |
|---------|------------|----------------------|-------------|----------------------|---------------------|
| Date range filter | WTD/MTD/YTD/1Y/5Y/Max | Full date range pickers | Area chart with zoom | None | 1M/3M/6M/YTD/1Y/All buttons |
| Date range persisted | Unknown | Session only (app state) | Session only | N/A | Per-fund in config JSON |
| Entry form fields | Fixed per asset type | Fixed transaction form | Fixed activity form | All 15 fields always shown | Per-fund configurable |
| Price history chart | Yes (live market data) | Yes (imported prices) | Manual price entry | No | Entry-based price line |
| Average cost basis | Yes | Yes (TWR/IRR methods) | Average cost basis input | Computed but not charted | Line overlay on price chart |
| Share accumulation | Holdings table only | Yes (time series) | Holdings count display | Computed but not charted | Area chart over time |
| Conditional charts | N/A (always has data) | N/A (always has data) | N/A | N/A | Guard on price/shares data |
| Local-first | No (cloud) | Yes (desktop app) | Yes (desktop app) | Yes | Yes (maintained) |

**Key differentiator:** EscapeMint is the only tool in this set that persists chart range preference to fund-level config (not global app state, not session only). This directly serves multi-fund workflows where different funds have different natural viewing horizons (e.g., a short-term cash fund viewed at 3M vs. a long-term stock fund viewed at 1Y).

---

## Implementation Confidence Notes

| Claim | Confidence | Source |
|-------|------------|--------|
| Date range buttons are table stakes | HIGH | Direct observation across Apple Stocks, Yahoo Finance, TradingView, Ghostfolio, Portfolio Performance |
| Per-fund config persistence pattern is correct | HIGH | Codebase — `chart_bounds` already does this exact pattern in `FundCharts.tsx:1440-1457` |
| `sumShares` and `costBasis` are pre-computed | HIGH | Codebase — `FundCharts.tsx:73-170` in `computeTimeSeries` |
| Conditional chart rendering on price/shares data | HIGH | Codebase — `FundCharts.tsx` already has `isDerivativesFund` conditional chart rendering as a model |
| Per-fund configurable fields (not global) is the right scope | HIGH | PROJECT.md explicit requirement + `entries_column_order` precedent in `EntriesTable.tsx:111-112` |
| Drag-to-reorder in form is lower value than in table | MEDIUM | Fintech UX sources (form completion rates drop with complex interactions); verified against progressive disclosure patterns |
| Candlestick chart is wrong for this data model | HIGH | Codebase — EscapeMint has one price point per trade entry, not OHLCV time series |

---

## Sources

- EscapeMint codebase: `packages/web/src/components/FundCharts.tsx`, `EntryForm.tsx`, `api/funds.ts`, `pages/FundDetail.tsx`
- EscapeMint planning: `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`
- Competitor: [Ghostfolio – Open Source Wealth Management Software](https://www.ghostfol.io/en) — WTD/MTD/YTD/1Y/5Y/Max date ranges; transaction management
- Competitor: [Portfolio Performance](https://www.portfolio-performance.info/en/) — open source, full transaction history, performance charts
- Competitor: [Wealthfolio 2.0 HN Discussion](https://news.ycombinator.com/item?id=46006016) — manual entry form, price quotes tab, cost basis entry patterns
- UX: [Fintech UX Best Practices 2026](https://www.eleken.co/blog-posts/fintech-ux-best-practices) — progressive disclosure, form friction reduction
- UX: [10 Best Fintech UX Practices for Mobile Apps in 2025](https://procreator.design/blog/best-fintech-ux-practices-for-mobile-apps/) — "every extra input field lowers completion rate"
- UX: [Progressive Disclosure in SaaS UX Design](https://lollypop.design/blog/2025/may/progressive-disclosure/) — field visibility patterns
- Charting: [Apple Support — Stocks chart date ranges](https://support.apple.com/en-euro/guide/stocks/stc4cfc704df/mac) — 1D/1W/1M/3M/6M/1Y/2Y/5Y/10Y as the canonical set
- Charting: [Ghostfolio Returns — ROAI for Today/WTD/MTD/YTD/1Y/5Y/Max](https://sourceforge.net/software/product/Ghostfolio/) — confirms YTD is always between 3M and 1Y

---

*Feature research for: EscapeMint — entry form UX, chart date filtering, price/size visualization*
*Researched: 2026-02-28*
