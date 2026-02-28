# Architecture Research

**Domain:** Financial dashboard UX enhancements — configurable forms, chart date ranges, price/size charts
**Researched:** 2026-02-28
**Confidence:** HIGH — all findings derived from direct codebase inspection, no external sources required for a brownfield integration task

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────┐
│                     Web (React/Vite :5550)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  FundDetail  │  │ AddEntryModal│  │ FundCharts           │ │
│  │  (page/route)│  │ EntryForm    │  │ (D3 charts)          │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         │                 │                      │             │
│  ┌──────▼─────────────────▼──────────────────────▼──────────┐ │
│  │              api/ (fetch wrappers)                        │ │
│  │  funds.ts — fetchFund, updateFundConfig, addFundEntry     │ │
│  └──────────────────────────┬────────────────────────────────┘ │
└─────────────────────────────│─────────────────────────────────┘
                              │ HTTP REST
┌─────────────────────────────▼─────────────────────────────────┐
│                  Server (Express :5551)                        │
│  routes/funds.ts                                              │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  PUT /funds/:id  (config patch via updateFundConfig)  │     │
│  │  GET /funds/:id  (full fund data: entries + config)   │     │
│  │  POST /funds/:id/entries  (append new entry)          │     │
│  └───────────────┬──────────────────────────────────────┘     │
└───────────────────│────────────────────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
┌───────────────┐      ┌──────────────────────┐
│    Storage    │      │       Engine          │
│ @escapemint/  │      │  @escapemint/engine   │
│ storage       │      │                       │
│               │      │  computeFundState()   │
│ readFund()    │      │  computeRecommend...  │
│ writeFund()   │      │  getFundTypeFeatures()│
│ appendEntry() │      │  FUND_TYPE_FEATURES   │
│ TSV + JSON    │      │  (pure functions)     │
└───────┬───────┘      └──────────────────────┘
        │
┌───────▼────────────────┐
│  data/funds/           │
│  {platform}-{ticker}   │
│    .tsv  (entries)     │
│    .json (config)      │
└────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `packages/engine/` | Pure calculation functions — fund state, recommendations, fund-type feature flags, category config. Zero dependencies, no I/O. | Nothing; imported by server and web |
| `packages/storage/` | TSV read/write, JSON config, file locking. Source of truth for persisted data. | engine (for types), filesystem |
| `packages/server/` | Express REST API. Orchestrates storage reads and engine computations. Owns the data contract between web and disk. | engine, storage |
| `packages/web/` | React UI. Fetches from server, renders charts and forms, persists user config preferences via PUT /funds/:id. | server (HTTP), engine (imported directly for type helpers and feature flags) |
| `FundConfig` (JSON) | Per-fund persistent settings: chart_bounds, charts_collapsed, entries_column_order, entries_visible_columns. This is where all new per-fund UX preferences must also live. | written by server on PUT, read by web on GET |
| `EntryForm` | Renders form fields for adding/editing entries. Currently renders all fields, filtering by fund type internally. | AddEntryModal, EditEntryModal |
| `FundCharts` | Renders D3 time-series charts for a fund. Computes ChartTimeSeriesPoint[] from FundEntry[] client-side. | FundDetail (parent), DerivativesPriceChart etc |
| `EntriesTable` | Tabular display of entries. Has existing per-fund column visibility/order persisted in FundConfig. | FundDetail, api/funds |

## Recommended Project Structure for New Features

The three active features follow an identical integration path. No new packages are needed; all changes are additive within existing packages.

```
packages/engine/src/
└── types.ts              # Add entry_fields?: string[] to SubFundConfig

packages/web/src/
├── api/
│   └── funds.ts          # Add entry_fields?: string[] to FundConfig interface
├── components/
│   ├── EntryForm.tsx      # Accept entry_fields prop; filter/order fields conditionally
│   ├── AddEntryModal.tsx  # Pass entry_fields from fund config down to EntryForm
│   ├── EditEntryModal.tsx # Same as AddEntryModal
│   ├── FundCharts.tsx     # Add chart_date_range filtering; add price/size charts
│   └── ChartSettings.tsx  # Extend with date range selector (1M/3M/6M/YTD/1Y/All)
└── pages/
    └── FundDetail.tsx     # Wire date range state; pass to FundCharts
```

### Structure Rationale

- **No new API routes needed:** all three features persist in FundConfig JSON via the existing `PUT /funds/:id` endpoint. The server already accepts `Partial<FundConfig>` and merges it.
- **No engine changes needed:** date filtering is a client-side slice of existing FundEntry[]; price/size chart data is already present in FundEntry (shares, price fields). Engine has no knowledge of display preferences.
- **No storage changes needed:** FundConfig already has an open `[key: string]: unknown` surface through its optional fields. New JSON keys are backward-compatible.
- **Web imports engine directly** (already established pattern): `getFundTypeFeatures()` and `FUND_TYPE_FEATURES` are used in FundDetail and FundCharts to gate feature display. Price/size charts gate on `features.supportsShares`.

## Architectural Patterns

### Pattern 1: Config-as-Preference Store

**What:** Per-fund display preferences (column order, chart bounds, collapsed state) are stored in the fund's `.json` config file via `updateFundConfig(id, patch)`. The `FundConfig` interface acts as a typed bag for both financial parameters and UX state.

**When to use:** Any per-fund setting that should survive page refresh and be fund-specific. This is the correct slot for: `entry_fields`, `chart_date_range`.

**Example:**
```typescript
// web/src/pages/FundDetail.tsx — existing pattern for chart_bounds
const updateChartDateRange = useCallback(async (range: ChartDateRange) => {
  setChartDateRange(range)
  if (!id) return
  await updateFundConfig(id, { chart_date_range: range })
}, [id])

// Sync from config on load — existing pattern
useEffect(() => {
  if (!fund) return
  setChartDateRange(fund.config.chart_date_range ?? 'all')
}, [fund])
```

**Trade-offs:** Config file grows with UI state, but this is already established in the codebase (chart_bounds, charts_collapsed, entries_column_order, entries_visible_columns). The file is small JSON; no performance concern.

### Pattern 2: Fund-Type Feature Gating

**What:** `getFundTypeFeatures(fundType)` from `@escapemint/engine` returns a `FundTypeFeatures` object with boolean flags (`supportsShares`, `supportsDividends`, etc.). UI components import this to conditionally render sections.

**When to use:** Whenever a feature should only appear for certain fund types. Price/size charts gate on `features.supportsShares` (true for stock/crypto, false for cash/derivatives).

**Example:**
```typescript
// Existing pattern in FundCharts.tsx
const features = getFundTypeFeatures(config.fund_type ?? 'stock')
// ... later:
{!isCashFund && !isDerivativesFund && <ValueChart ... />}

// New price/size charts follow same pattern
{features.supportsShares && entries.some(e => e.price != null) && (
  <PriceSizeChart entries={filteredEntries} config={config} />
)}
```

### Pattern 3: Client-Side Entry Filtering for Date Ranges

**What:** FundCharts already receives the full `FundEntry[]` array from the parent. Date range filtering is a `useMemo` slice over that array — no server round-trip needed.

**When to use:** All chart filtering. The server returns complete fund history; the client filters for display.

**Example:**
```typescript
// In FundCharts.tsx
const filteredEntries = useMemo(() => {
  if (!chartDateRange || chartDateRange === 'all') return entries
  const cutoff = getDateRangeCutoff(chartDateRange) // '1m' → 30 days ago
  return entries.filter(e => new Date(e.date) >= cutoff)
}, [entries, chartDateRange])
```

### Pattern 4: Configurable Entry Form Fields

**What:** `EntryForm.tsx` currently renders all fields applicable to a fund type. The `entry_fields` config array specifies which fields to show and in what order. Fields absent from `entry_fields` are hidden; the complete set remains accessible via an "Advanced" toggle or via column visibility (matching the EntriesTable pattern).

**When to use:** Allowing users to strip the entry form down to just `date + value` for the common DCA case, while keeping all fields available for derivatives power users.

**Example:**
```typescript
// EntryForm props extension
interface EntryFormProps {
  // ... existing props ...
  entryFields?: string[]  // from fund.config.entry_fields; undefined = show all
}

// Inside EntryForm render
const isFieldVisible = (field: string) =>
  !entryFields || entryFields.length === 0 || entryFields.includes(field)
```

## Data Flow

### Config Preference Persistence Flow

```
User changes date range / field order / entry_fields
    ↓
FundDetail (or FundCharts callback)
    ↓ updateFundConfig(id, { chart_date_range: range })
api/funds.ts → PUT /funds/:id
    ↓
server/routes/funds.ts
    ↓ readFund() → merge config → writeFund()
storage: {platform}-{ticker}.json updated
    ↓ returns updated FundDetail
Web updates local state immediately (optimistic); config synced on next load
```

### Chart Rendering Flow (existing, extended)

```
FundDetail loads → fetchFund(id) → FundEntry[] + FundConfig
    ↓
FundCharts receives entries[], config, fundId
    ↓ useMemo: filter entries by chart_date_range
    ↓ useMemo: compute ChartTimeSeriesPoint[] from filteredEntries (client-side)
    ↓ D3 useEffect renders chart into SVG ref
User changes range → ChartSettings callback → updateFundConfig + local state update
    ↓ filteredEntries recomputed → chart re-renders
```

### Entry Form Field Gating Flow

```
FundDetail loads → fund.config.entry_fields (string[] | undefined)
    ↓ passed as prop to AddEntryModal / EditEntryModal
    ↓ passed as prop to EntryForm
EntryForm: isFieldVisible(field) gates each section
User saves field config in EditFundConfigModal → updateFundConfig({ entry_fields: [...] })
    ↓ fund state reloaded → entry form re-renders with new field set
```

### Price/Size Chart Data Flow

```
FundEntry[] (already loaded in FundDetail)
    ↓ entries with price != null and shares != null
    ↓ client-side filter: entries where supportsShares && any entry has price
FundCharts: new PriceSizeChart component receives filteredEntries
    ↓ useMemo computes: date, price, cumulative shares, cost basis
    ↓ Recharts or D3 renders: price line + share accumulation bar/area
No server changes. No new API endpoints.
```

## Suggested Build Order

Dependencies between the three features determine ordering. All are low-coupling and can be developed independently, but this order minimizes rework:

**Phase 1 — Chart Date Range** (no form changes, pure display)
- Easiest: add `chart_date_range` to FundConfig type (engine types.ts + web api/funds.ts)
- Add `ChartDateRange` type: `'1m' | '3m' | '6m' | 'ytd' | '1y' | 'all'`
- Add date range selector UI to ChartSettings or FundCharts header
- Add `getDateRangeCutoff(range)` utility
- Filter entries in FundCharts `useMemo` before chart computation
- Persist selection via `updateFundConfig`
- Blocks nothing else; can ship standalone

**Phase 2 — Price/Size Charts** (depends on date range being filterable)
- Add `PriceChart` and `ShareAccumulationChart` components (or one combined component)
- Gate display on `features.supportsShares && entries.some(e => e.price != null)`
- Use `filteredEntries` from Phase 1 date range filter (natural dependency)
- No new config fields required — conditional rendering only
- Can reuse D3 patterns from existing `DerivativesPriceChart.tsx`

**Phase 3 — Configurable Entry Form Fields** (independent of 1 and 2)
- Add `entry_fields?: string[]` to FundConfig (engine types.ts + web api/funds.ts)
- Add field ordering/visibility UI to `EditFundConfigModal` (matching EntriesTable column configurator pattern)
- Modify `EntryForm` to accept and apply `entryFields` prop
- Wire through `AddEntryModal` and `EditEntryModal`
- Validate that required fields (date, value) cannot be hidden

## Anti-Patterns

### Anti-Pattern 1: Server-Side Date Filtering

**What people do:** Add a `?from=` query param to `GET /funds/:id` and filter entries in the server route.

**Why it's wrong:** Complete fund history is already loaded on the FundDetail page for the entries table. Server filtering would require a second fetch, creates cache inconsistency, and complicates the entries table which shows unfiltered data. The payload is not large enough to justify the complexity.

**Do this instead:** Filter in `useMemo` inside `FundCharts`. The server returns all entries; the chart component slices them.

### Anti-Pattern 2: New Config Schema Outside FundConfig

**What people do:** Store date range in `localStorage` or React context, or create a new sidecar config file.

**Why it's wrong:** The codebase has an established pattern: per-fund display preferences go in the fund's `.json` config. `chart_bounds`, `charts_collapsed`, `entries_column_order`, `entries_visible_columns` are all there. Breaking this pattern creates two sources of truth and breaks portability (iCloud backup already captures `.json` files).

**Do this instead:** Add to `FundConfig` interface and persist via `updateFundConfig`.

### Anti-Pattern 3: Engine Changes for Display Features

**What people do:** Add display-related fields or filtering logic to the engine package.

**Why it's wrong:** Engine is a pure calculation library with zero dependencies. Display preferences and date filtering are UI concerns. Adding them to engine violates the package boundary and breaks the engine's testability.

**Do this instead:** All three features are web-only concerns (with config persistence through server). Engine is not modified.

### Anti-Pattern 4: Making entry_fields Required

**What people do:** Require `entry_fields` in the type and set a default in every fund create path.

**Why it's wrong:** `undefined` correctly means "show all fields" — backward compatible with all existing funds. Making it required would need a migration of 20+ existing JSON config files.

**Do this instead:** `entry_fields?: string[]` optional. Guard in EntryForm: `if (!entryFields || entryFields.length === 0) showAll`.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| engine → web | Direct import (`@escapemint/engine`) | Web uses `getFundTypeFeatures`, type helpers. This is already established. |
| web → server | HTTP REST via `api/funds.ts` fetch wrappers | All config updates go through `PUT /funds/:id` with `Partial<FundConfig>` |
| server → storage | Direct function calls (`readFund`, `writeFund`, `appendEntry`) | Server orchestrates; storage is stateless |
| server → engine | Direct function calls (`computeFundState`, `computeRecommendation`) | Engine computes; server passes data |
| FundDetail → FundCharts | Props: `entries[]`, `config`, `fundId`, `computedEntries`, `resize` | FundCharts is display-only; FundDetail owns data fetch and config mutations |
| FundDetail → EntryForm | Via AddEntryModal/EditEntryModal props | `entry_fields` would pass through this chain |

### Key Existing Extension Points

The following show exactly where new features plug in — no structural changes needed:

**`FundConfig` interface** (`packages/engine/src/types.ts` and `packages/web/src/api/funds.ts`):
Current optional config fields already include: `chart_bounds`, `charts_collapsed`, `entries_column_order`, `entries_visible_columns`. Add: `chart_date_range`, `entry_fields`.

**`FundCharts` props** (`packages/web/src/components/FundCharts.tsx`):
Already accepts `entries[]` and `config`. The `config.chart_date_range` can be read directly; no new prop needed. Price/size charts are new components rendered inside `FundCharts` conditional block.

**`EntryForm` props** (`packages/web/src/components/EntryForm.tsx`):
Already has `fundType` prop for feature gating. Add `entryFields?: string[]` alongside it.

**`ChartSettings` component** (`packages/web/src/components/ChartSettings.tsx`):
Currently handles Y-axis bounds. Either extend this or create a parallel `ChartDateRangeSelector` component. Extend is simpler; parallel component is more reusable.

## Scaling Considerations

This is a local-first, single-user application. Scaling is not a concern. The relevant constraint is:

| Concern | Current Approach | Implication for Features |
|---------|------------------|--------------------------|
| Client-side chart computation | `useMemo` over all entries | Date range filter reduces computation set — net improvement |
| Config file size | Small JSON per fund | 2 new optional fields add < 50 bytes |
| E2E test isolation | "test" platform, single worker | New features need test coverage using test platform funds |

## Sources

- Direct inspection: `packages/engine/src/types.ts` — `SubFundConfig` interface
- Direct inspection: `packages/engine/src/fund-type-config.ts` — `FundTypeFeatures`, `FUND_TYPE_FEATURES`
- Direct inspection: `packages/web/src/api/funds.ts` — `FundConfig`, `updateFundConfig`
- Direct inspection: `packages/web/src/components/FundCharts.tsx` — chart rendering pattern
- Direct inspection: `packages/web/src/components/EntryForm.tsx` — form field pattern
- Direct inspection: `packages/web/src/components/ChartSettings.tsx` — existing settings UI pattern
- Direct inspection: `packages/web/src/components/entriesTable/types.ts` — column config pattern (the template for entry_fields)
- Direct inspection: `packages/web/src/components/entriesTable/EntriesTable.tsx` — `saveColumnPrefs` → `updateFundConfig` pattern
- Direct inspection: `packages/web/src/pages/FundDetail.tsx` — `updateApyBounds` / `updatePnlBounds` patterns for config persistence
- Direct inspection: `packages/server/src/routes/funds.ts` — `PUT /funds/:id` accepts `Partial<FundConfig>`

---
*Architecture research for: EscapeMint — financial dashboard UX enhancements (configurable forms, chart date ranges, price/size charts)*
*Researched: 2026-02-28*
