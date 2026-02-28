# Stack Research

**Domain:** Financial dashboard UX enhancements — React + D3 + Express + TSV
**Researched:** 2026-02-28
**Confidence:** HIGH (existing stack verified from codebase; new additions verified via WebSearch + npm)

---

## Context: What the Existing Stack Actually Is

Before any recommendations, a critical correction to the milestone framing:

> The question mentions "React + Recharts." **Recharts is in package.json but is NOT used.** All charts in this codebase are built with D3 v7 directly (raw SVG imperative approach inside `useEffect`). Recharts is an unused dependency.

Verified by grepping all `src/` files: every chart component imports `* as d3 from 'd3'`. No file imports from `'recharts'`.

This changes the research scope significantly. New price/size charts should follow the existing D3 pattern, not introduce Recharts.

---

## Existing Stack (Do Not Change)

| Technology | Version | Role |
|------------|---------|------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.7.2 | Type safety, strict mode |
| Vite | 6.0.6 | Build tool + dev server |
| Tailwind CSS | 3.4.17 | Utility CSS |
| D3 | 7.9.0 | All chart rendering (SVG imperative) |
| react-router-dom | 7.1.1 | Routing (deep-linkable URLs) |
| sonner | 1.7.2 | Toast notifications |
| Express | 4.x | API server |
| proper-lockfile | (server) | TSV file locking |

---

## Recommended Stack for This Milestone

### Core Technologies (No Changes Needed)

All three features (configurable form fields, date range selector, price/size charts) can be built with the **existing stack** — no new core dependencies required.

| Technology | Version | Purpose | Why Sufficient |
|------------|---------|---------|----------------|
| React | 18.3.1 | State management for date range selector and field config UI | `useState` + `useMemo` are all that's needed; no global state library required |
| D3 | 7.9.0 | Price/size chart rendering | Matches every other chart in the codebase; consistent imperative SVG approach |
| TypeScript | 5.7.2 | Typed field config schema, date range type | Strict mode enforces correctness on new config fields |
| Tailwind CSS | 3.4.17 | Date range button group, field toggle UI | Existing utility classes sufficient for button groups and checkbox lists |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/core` | 6.3.1 | Drag-to-reorder form fields | Only if drag-and-drop field reordering is in scope; skip if up/down arrow buttons suffice |
| `@dnd-kit/sortable` | 10.0.0 | Sortable list preset for dnd-kit | Pair with `@dnd-kit/core` if drag reorder is added |

**Confidence (dnd-kit):** MEDIUM — npm page confirms these versions as latest (published ~Feb 2025). dnd-kit is the current community standard for sortable lists in React, replacing react-beautiful-dnd (no longer maintained). However, the field reordering UX could equally be solved with simpler up/down arrow buttons (no new dependency). Recommend deferring dnd-kit until UX calls for it.

### Development Tools (No Changes)

Existing: Vitest, Playwright, ESLint, Prettier — all sufficient.

---

## Feature-Specific Approach

### 1. Configurable Entry Form Fields

**Pattern:** JSON schema stored in `FundConfig` (in the fund's `.json` file).

Add to `FundConfig`:
```typescript
entry_fields?: string[]   // ordered list of field keys to show
// e.g., ['date', 'value', 'action', 'amount', 'shares', 'price', 'notes']
```

**Rendering approach:** In `EntryForm.tsx`, derive a field definition array from the config, then render only the fields present in `entry_fields` in that order. When `entry_fields` is absent, fall back to current behavior (show all applicable fields for fund type).

**No library needed.** This is a `useMemo` over a config array + conditional JSX render. The existing `EntryForm.tsx` already conditionally shows/hides fields based on `fundType`; the new config layer just adds one more filter.

**Confidence:** HIGH — pure React state pattern, no external deps.

### 2. Chart Date Range Selector

**Pattern:** Preset button group (1M / 3M / 6M / YTD / 1Y / All), persisted to fund JSON config.

**State:** `chart_date_range?: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'All'` added to `FundConfig`.

**Implementation approach:**
1. Add `chart_date_range` to `FundConfig` type in `funds.ts`.
2. Render a button group in `FundCharts.tsx` header (above charts).
3. On button click: call `updateFundConfig(fundId, { chart_date_range: value })` — this persists to the fund's `.json` file, matching how `chart_bounds`, `charts_collapsed`, etc. already work.
4. In `computeTimeSeries()` (or at the chart level), `useMemo` filter the `entries` array to only include entries within the selected range before passing to D3.

**Date range calculation:**
```typescript
// No library needed — native Date arithmetic is sufficient
function getStartDate(range: string): Date | null {
  const now = new Date()
  switch (range) {
    case '1M': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    case '3M': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
    case '6M': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
    case 'YTD': return new Date(now.getFullYear(), 0, 1)
    case '1Y': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    default: return null  // 'All' — no filter
  }
}
```

**No date library needed** (moment.js, date-fns, dayjs). Month arithmetic with JS `Date` constructor handles month rollover correctly. The dataset is user-entered dates (ISO strings), not UTC timestamps with DST complexity.

**Confidence:** HIGH — native Date arithmetic verified as correct for this use case.

### 3. Price/Size Charts

**Pattern:** Two new D3 chart components following exact existing patterns from `DerivativesPriceChart.tsx` and `FundCharts.tsx`.

- **PriceHistoryChart**: Line chart of `entry.price` over time, with cost basis overlay (computed avg). Uses `d3.scaleTime` for X, `d3.scaleLinear` for Y, same interactive hover tooltip pattern as existing charts.
- **SharesAccumulationChart**: Line or area chart of cumulative `sumShares` over time, mirrors `StackedAreaChart` pattern in `FundCharts.tsx`.

**Conditional rendering:** Charts only shown when:
```typescript
const hasPriceData = entries.some(e => e.price != null && e.price > 0)
const hasShareData = entries.some(e => e.shares != null)
```

This matches the project's documented decision: "Only funds with price/size entries should show these charts; avoids empty chart noise."

**Apply date range filter first**, then check `hasPriceData` — avoids showing a chart with 0 data points in the selected range.

**No new library needed.** D3 7.9.0 already handles everything these charts need.

**Confidence:** HIGH — pattern is established in codebase, 5 existing D3 chart components to reference.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Recharts | Already in package.json but **unused** — adding it now would create a second charting paradigm in the codebase, inconsistent with all existing charts | D3 7.9.0 (already used everywhere) |
| moment.js | 67 KB, deprecated, has timezone bugs | Native `Date` constructor (sufficient for this use case) |
| date-fns / dayjs | Extra dependency for functionality native JS handles | Native `Date` arithmetic for range calculation |
| react-date-range / MUI DateRangePicker | Heavy dependencies for a simple preset-button UI | Tailwind button group with 6 hard-coded presets |
| react-hook-form | Overkill for this form; existing pattern uses controlled `useState` form data | Existing `EntryFormData` + `useState` pattern |
| react-beautiful-dnd | No longer maintained (last release 2022) | `@dnd-kit/sortable` if drag-to-reorder is needed |
| Recharts 3.x | 3.0 released June 2025 with breaking changes (state management rewrite, internal API removal); not worth migrating the existing D3 codebase | D3 (already in use) |
| Redux / Zustand for date range state | Global state is not needed; per-fund config persisted via API matches existing pattern | `useState` + `updateFundConfig` API call |

---

## Recharts Removal Recommendation

`recharts` is listed in `packages/web/package.json` but zero source files import from it. It adds ~200 KB to the bundle for no benefit.

**Recommend:** Remove it.

```bash
cd packages/web && npm uninstall recharts @types/recharts
```

Confidence: HIGH — verified by grepping entire `src/` tree.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| D3 7.9.0 for price/size charts | Recharts | If starting greenfield with no existing D3 charts; Recharts is easier for simple charts |
| Native Date arithmetic | date-fns / dayjs | If timezone-aware date math or locale formatting is needed (not needed here: all dates are user-entered YYYY-MM-DD strings) |
| Simple button group for date range | react-date-range picker | If users need to select arbitrary custom start/end dates (not in scope per PROJECT.md) |
| Up/down arrows for field reorder | @dnd-kit/sortable | If UX wireframes call for drag-and-drop; defer until validated |
| `FundConfig.entry_fields` in JSON | Separate user preferences store | If this were multi-user or cloud-synced; local-first TSV model makes fund JSON the right place |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| D3 7.9.0 | React 18.3.1 | No issues; D3 operates on refs, not React state |
| @dnd-kit/core 6.3.1 | React 18.3.1 | Requires React 16+ |
| @dnd-kit/sortable 10.0.0 | @dnd-kit/core 6.3.1 | Must match core version |
| recharts 2.15.0 (current) | React 18.3.1 | Compatible but unused — remove it |

---

## Installation (If dnd-kit field reorder is approved)

```bash
# Only needed if drag-to-reorder field ordering is in scope
npm install @dnd-kit/core @dnd-kit/sortable

# Remove unused dependency
cd packages/web && npm uninstall recharts
```

Otherwise, **no new installations required** for this milestone.

---

## Sources

- Codebase grep — confirmed D3 is used for all charts, Recharts is unused (HIGH confidence)
- `packages/web/package.json` — verified current dependency versions (HIGH confidence)
- [recharts GitHub releases](https://github.com/recharts/recharts/releases) — v3.x is latest major; installed version is 2.15.0 (unused). 3.0 introduced breaking state management changes (MEDIUM confidence via WebFetch)
- [recharts 3.0 migration guide](https://github.com/recharts/recharts/wiki/3.0-migration-guide) — confirms CategoricalChartState removed, internal API breaking changes (MEDIUM confidence via WebSearch)
- [@dnd-kit/core npm](https://www.npmjs.com/package/@dnd-kit/core) — v6.3.1, last published ~Feb 2025 (MEDIUM confidence via WebSearch)
- [@dnd-kit/sortable npm](https://www.npmjs.com/package/@dnd-kit/sortable) — v10.0.0, last published ~Feb 2025 (MEDIUM confidence via WebSearch)
- [React state management 2025](https://www.developerway.com/posts/react-state-management-2025) — confirms useState + API persistence is appropriate for per-fund config (MEDIUM confidence)
- Native JS Date constructor month arithmetic — verified correct behavior for month rollover (e.g., `new Date(2026, -1, 1)` → Dec 2025) (HIGH confidence from MDN spec knowledge)

---

*Stack research for: EscapeMint financial dashboard UX enhancements (configurable form fields, chart date range, price/size charts)*
*Researched: 2026-02-28*
