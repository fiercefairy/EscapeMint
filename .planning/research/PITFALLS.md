# Pitfalls Research

**Domain:** Financial tracking dashboard — configurable forms, chart date ranges, price/size charts, bug fixes, server route test coverage
**Researched:** 2026-02-28
**Confidence:** HIGH (codebase patterns verified directly; implementation risks derived from actual code)

---

## Critical Pitfalls

### Pitfall 1: Liquidation Detection Logic Divergence Between Engine, Server, and Frontend

**What goes wrong:**
The codebase has three independent implementations of liquidation detection logic: `packages/server/src/routes/funds.ts` (fund_size auto-calc loop), `packages/web/src/components/FundCharts.tsx` (time-series computation), and presumably `packages/engine/src/`. Each uses a slightly different heuristic (shares-based vs. value-based vs. dollar-based). A fix to one does not automatically propagate to the others. When the logic is fragile in one place, the inconsistency surfaces as mismatched chart values, fund_size drift, or phantom cost-basis re-accumulation after a liquidation.

**Why it happens:**
The engine computes liquidation for recommendation purposes; the server recomputes it for fund_size tracking; the frontend recomputes it again for chart time-series. There is no single authoritative `detectLiquidation()` function that all three sites call. Developers fixing a bug in one location do not realize the other sites exist.

**How to avoid:**
Before touching any liquidation logic, audit all three call sites. Extract a single `detectFullLiquidation(entry, sumShares, totalSells, costBasis, isAccumulate)` pure function into `packages/engine/src/` and import it everywhere. Write unit tests in `packages/engine/test/` covering all detection branches: share-liquidated, value-liquidated, harvest-mode dollar-liquidated, and accumulate-mode partial-sell. The server and frontend should call the engine function — not reimplement it.

**Warning signs:**
- `packages/web/src/components/FundCharts.tsx` lines 116-126 mirror logic found independently in `packages/server/src/routes/funds.ts` lines 1440-1447.
- Any comment that says "matches engine" next to inline logic is a red flag — it means the logic is duplicated rather than imported.
- Chart `realizedGains` disagrees with server-side `gain_usd` for funds that had a full liquidation.

**Phase to address:** Bug Fix phase (before adding new chart features that consume this data).

---

### Pitfall 2: Cashflow Handling Data Contract Mismatch Between Frontend and Server

**What goes wrong:**
The server POST `/funds/:id/entries` route normalizes DEPOSIT/WITHDRAW actions into HOLD with signed amounts for cash funds (lines 1498-1504 in funds.ts). Trading funds reject DEPOSIT/WITHDRAW entirely (lines 1407-1414). If the client sends a DEPOSIT entry body that does not match what the server expects — or if the server's transformation silently drops fields (e.g., `amount` sign conventions differ) — the cashflow aggregate calculation in `computeFundState` will be wrong. The bug is invisible until APY numbers drift.

**Why it happens:**
The normalization happens server-side without a corresponding schema contract or documented API behavior. Client code (AddEntryModal, EntryForm) builds entry payloads from form state, but there is no validation layer that asserts "DEPOSIT on a cash fund must have amount > 0 before posting." Silent server-side transformation makes integration bugs hard to detect without server route tests.

**How to avoid:**
Add server route integration tests for DEPOSIT/WITHDRAW scenarios on both cash funds and trading funds. Verify the response body, not just status 200. Test that: (a) a DEPOSIT to a cash fund produces a HOLD entry with positive amount in the TSV, (b) a WITHDRAW produces HOLD with negative amount, (c) a DEPOSIT to a trading fund returns 400. This locks the contract before the feature work changes the client-side form behavior.

**Warning signs:**
- Only one test file exists in `packages/server/test/` and it covers only the logger utility — no route tests at all.
- The route's internal normalization logic is never exercised by any automated test.
- Fund size drift on cash funds after a DEPOSIT (fund_size should increase by deposit amount; if it does not, the normalization is broken).

**Phase to address:** Server Route Tests phase (must precede any cashflow-related form changes).

---

### Pitfall 3: Configurable Entry Form Fields Stored in Config Causing Stale UI State

**What goes wrong:**
The plan is to store `entry_fields` (visibility and order) per-fund in the JSON config. If the form reads this config once on mount and never reacts to updates, then: (a) opening the form while an async config write is in-flight shows stale fields, and (b) saving field preferences triggers a config write that does not re-render the form until the next navigation. This manifests as the form flashing or showing wrong fields after a preference change.

**Why it happens:**
React components that derive local state from props in a `useState(() => computeFromProps())` initializer do not react to subsequent prop changes — the initializer runs only once. EntryForm already uses this pattern (line 37: `getInitialFormData()`). If field visibility is layered on top with the same pattern, it will break after the first save.

**How to avoid:**
Derive field visibility from config via `useMemo` (not `useState` with an initializer). Keep the config object in the parent (fund detail page) and pass it as a prop — do not copy it into local state. After a successful config write, invalidate/refetch the fund config so the parent re-renders with updated visibility. The existing `updateFundConfig` API call pattern in `FundCharts.tsx` (which updates chart bounds) shows the correct flow: call API, wait for success, then the page re-fetches.

**Warning signs:**
- Field visibility stored in `useState(config?.entry_fields ?? defaultFields)` at form initialization.
- No re-fetch or invalidation after saving field preferences.
- Form state initialized from config inside `useEffect` without a dependency on the config prop.

**Phase to address:** Configurable Entry Form phase.

---

### Pitfall 4: Chart Date Range Persisted to Config on Every Interaction — Config Write Storms

**What goes wrong:**
If date range selection is wired to persist on every change (e.g., each click on "1M", "3M", etc. triggers a PUT to `/funds/:id`), and the user quickly clicks through multiple ranges, the server will receive concurrent or rapid-fire config writes. Since `writeFund` uses `proper-lockfile`, these will queue up and serialize, but each write reads-then-writes the entire JSON file. A slow write can be overtaken by a stale read, causing the final persisted value to be wrong. This is a read-modify-write race that the lock prevents within a single request but not across rapid sequential requests if the lock is not held between the read and the write in all callers.

**Why it happens:**
Developers wire the onChange of a date range picker directly to the persistence call without debouncing, not realizing that clicking through multiple options generates multiple requests. The lock prevents concurrent corruption but not the "last write wins stale read" problem when requests overlap.

**How to avoid:**
Debounce the config write by 500-800ms after the user stops interacting with the date range selector. Optimistically update local state immediately so the UI feels responsive, but delay the API call. Use the existing `updateFundConfig` pattern seen in ChartSettings component — note that component also does not debounce, so this is a pre-existing pattern to improve. Add a test for rapid config updates in the server route test suite.

**Warning signs:**
- Date range onChange handler calls `updateFundConfig` synchronously without debounce.
- Multiple in-flight PUT requests visible in DevTools Network tab when clicking through ranges quickly.
- Config file has an intermediate range value rather than the final one after rapid clicking.

**Phase to address:** Chart Date Range phase.

---

### Pitfall 5: Price/Size Charts Shown for Funds Without Price or Shares Data

**What goes wrong:**
Price/size charts (price history, share accumulation, cost basis vs. current price) only make sense for funds that track share-level data — entries with `price` and `shares` fields populated. If the chart is rendered unconditionally, funds that only have `value` entries (e.g., cash-only HOLD entries, derivatives entries without per-entry price data) will show empty or broken charts: zero-length SVG paths, NaN axes, or charts showing a single point.

**Why it happens:**
Developers add the chart component to the fund detail page and guard it with `if (hasPriceData)` — but they check for data presence before the entries finish loading, or they check only the latest entry instead of whether *any* entries have price/shares data. The existing `FundCharts.tsx` already does this for derivatives-specific charts (DerivativesPriceChart is only rendered when `isDerivativesFund`), but a similar guard for the new price/shares charts must check actual data presence, not just fund type.

**How to avoid:**
Compute `const hasPriceData = entries.some(e => e.price !== undefined && e.shares !== undefined)` from the loaded entries, not from config. Render price/size charts only when `hasPriceData` is true AND the fund is a trading fund type (`stock` or `crypto`). A fund type check alone is insufficient because stock funds imported before share tracking was added will have entries without price/shares.

**Warning signs:**
- Chart guard using `config.fund_type === 'stock'` without also checking for data presence.
- Chart receiving an empty data array but still rendering axes with NaN domain.
- D3 `scaleLinear().domain([NaN, NaN])` warning in browser console.

**Phase to address:** Price/Size Charts phase.

---

### Pitfall 6: Server Route Tests That Mock the Filesystem Diverge from Real Behavior

**What goes wrong:**
When adding server route tests for the first time, the temptation is to mock `readFund`/`writeFund`/`appendEntry` at the module level to avoid touching disk. This produces tests that pass but do not catch the real bugs: TSV serialization edge cases, fund_size recalculation loops, lockfile acquisition behavior, and the DEPOSIT normalization transformation. Mocked storage means the tests cannot verify what actually ends up in the file.

**Why it happens:**
Filesystem integration is seen as slow or complex, so developers mock it. But the project's storage layer (`packages/storage`) is already designed to be testable — the existing `fund-store.test.ts` writes to a temp directory. Server route tests should follow the same pattern: spin up the Express app with a temp DATA_DIR, run real requests via supertest, and verify the final TSV state after the request.

**How to avoid:**
Use supertest to mount the Express app with `DATA_DIR` pointed at a temporary directory created per-test with `mkdtemp`. Do not mock storage modules. Write the fund fixture file before the test, run the request, then read the resulting file and assert on its contents. This catches the DEPOSIT normalization, fund_size recalculation, and cashflow sync paths that mock-only tests miss. Reference: the existing E2E tests (`e2e/`) use the "test" platform against the real running server — the unit test approach should use a fresh temp directory per test suite, not the live data directory.

**Warning signs:**
- `vi.mock('@escapemint/storage', ...)` at the top of a server route test file.
- Tests that only assert `expect(response.status).toBe(200)` without reading the final file state.
- Tests that pass but none of the known cashflow or liquidation bugs are reproduced.

**Phase to address:** Server Route Tests phase.

---

### Pitfall 7: D3 Chart Re-Render on Every Parent State Change (Resize Loops)

**What goes wrong:**
The existing `FundCharts.tsx` uses `useEffect` with a `resize` prop to force D3 to re-draw when the sidebar toggles (SIDEBAR_TOGGLED_EVENT). If the date range selector adds additional state to the same parent component, every selection will trigger a full D3 SVG teardown-and-rebuild (`svg.selectAll('*').remove()` is the existing pattern). This is acceptable for small datasets but will cause visible flicker on funds with 100+ entries because D3 recomputes the entire time-series in-place.

**Why it happens:**
D3 imperative re-renders are not React-aware. The existing pattern clears and redraws the entire SVG on any relevant state change. Adding date range state to the same component tree without isolating it will cause spurious re-draws.

**How to avoid:**
Filter the entries array for the date range *before* passing it into the chart computation — do not filter inside the D3 `useEffect`. Keep date range state as close to the chart as possible (not in the page-level component) to prevent unrelated state changes from triggering D3 redraws. Use `useMemo` to memoize the filtered/computed time-series array so D3 only re-runs when the actual data changes.

**Warning signs:**
- Date range state lifted to the fund detail page level (same level as `entries`).
- D3 `useEffect` dependency array includes a date range string or index.
- Visible chart flicker when toggling the sidebar or switching tabs (indicates too many re-draws).

**Phase to address:** Chart Date Range phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline liquidation detection logic in server route | Avoids adding engine function | Bug fixes must be applied in 3 places; logic drift guaranteed | Never — extract to engine |
| Chart date range in sessionStorage only (not config) | Simpler implementation | Preference lost on refresh; inconsistent with how chart_bounds works | Only if decided date range is intentionally session-only |
| Mock `@escapemint/storage` in route tests | Faster test setup | Tests cannot catch TSV serialization bugs or DEPOSIT normalization | Never — use temp directory |
| Skip E2E tests for entry form field config | Saves test authoring time | Field visibility bugs only caught in production | Never — field visibility is the primary UX goal |
| Per-field `useState` for each configurable entry field | Simple to implement | Causes stale state after config save | Never — derive from config via useMemo |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `updateFundConfig` + form field config | Shallow-merging config object (losing existing `chart_bounds` or `entries_visible_columns`) | Always spread existing config before writing: `{ ...fund.config, entry_fields: newFields }` |
| `appendEntry` + fund_size recalculation | Sending entry body without `fund_size`, assuming server auto-calc handles all cases | Verify all fund types (cash, trading, derivatives) produce correct `fund_size` after POST |
| `entriesToCashFlows` in aggregate endpoint | Called only for `isCashFund` — trading funds with DEPOSIT/WITHDRAW are silently excluded from cashflow aggregates | Add route test asserting cashflow totals after DEPOSIT to cash fund |
| D3 date parsing with TSV date strings | `new Date("2024-01-15")` returns midnight UTC, not local time — chart axes may show wrong day | Use `parseLocalDate` (already in `packages/server/src/utils/calculations.ts`) or `d3.timeParse('%Y-%m-%d')` |
| E2E test cleanup with "test" platform | Tests that do not call `deleteFundViaAPI` leave test data that skews the next test run | Wrap each test in `beforeEach`/`afterEach` with explicit cleanup; assert cleanup succeeded |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Computing full time-series before applying date range filter | Chart lag increases proportionally to total entry count | Filter entries array *before* passing to `computeTimeSeries()`, not inside it | Funds with 200+ entries (3-4 years of weekly entries) |
| Calling `readAllFunds` in aggregate endpoint without caching | Dashboard refresh takes multiple seconds with 20+ funds | Dashboard cache exists (`packages/server/src/services/dashboard-cache.ts`) — route tests must verify cache invalidation on config write | 15+ funds with 100+ entries each |
| D3 SVG teardown/rebuild on every render | Chart flicker; high CPU on animation frame | Memoize filtered data; use D3 update pattern (enter/update/exit) instead of clearing entire SVG | Any fund with 50+ data points |
| Simultaneous config writes (no debounce) | Wrong final persisted value; lockfile contention timeouts | Debounce at 500ms; optimistic UI update | Rapid sequential clicks (date range switching) |

---

## Security Mistakes

Not applicable — local-first app with no authentication surface. There are no credentials, no multi-user paths, and no external network calls. The only relevant concern is:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Writing arbitrary `entry_fields` config from unvalidated form input to the fund JSON | Malformed JSON could corrupt the config file; unknown keys would be silently preserved | Validate the `entry_fields` array on the server side: assert each entry is a known column ID from the `ENTRY_HEADERS` constant in `fund-store.ts` before persisting |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Saving field preferences requires a separate explicit "Save" step | User configures fields, closes modal, loses preference | Auto-save field config changes with debounce (same pattern as chart bounds — no explicit save button) |
| Date range selector that does not persist resets to "All" on every page navigation | User constantly re-selects 1Y range for every fund | Persist in fund config JSON (as planned); show loading state during initial config fetch |
| Price chart visible for cash/derivatives funds with no price data | Empty chart with "no data" message is confusing | Gate chart rendering on `entries.some(e => e.price !== undefined)` |
| Configurable fields that reorder the form breaking keyboard tab order | Keyboard users lose muscle memory | CSS `order` property for visual reorder; `tabIndex` stays DOM-order unless explicitly managed |
| Form submits with hidden required fields (e.g., `amount` hidden but action requires it) | Silent data corruption — entry saved with amount=undefined | Validate visible fields only; if a required field is hidden, either show it or set a default value before POST |

---

## "Looks Done But Isn't" Checklist

- [ ] **Configurable entry fields:** Field config is saved to server — verify the `PUT /funds/:id` response includes the updated `entry_fields` and that the form re-reads it on next open (not from stale cache).
- [ ] **Chart date range:** Range is persisted to config — verify that navigating away and returning to the fund shows the saved range, not "All".
- [ ] **Price/size charts:** Charts only appear for funds that have entries with both `price` and `shares` populated — verify a stock fund with only `value` entries does not show these charts.
- [ ] **Liquidation fix:** After fixing the engine, run the existing invariants test (`packages/engine/test/invariants.test.ts`) and the derivatives calculations test to confirm no regressions.
- [ ] **Server route tests:** Tests exercise the real TSV file output — verify by reading the resulting `.tsv` file after each POST and asserting field values, not just HTTP status.
- [ ] **Cashflow fix:** After verifying the DEPOSIT/WITHDRAW server route, confirm that `computeFundState` receives the correct `CashFlow[]` array — log the intermediate value in the test before asserting aggregate metrics.
- [ ] **Field ordering:** When entry fields are reordered in config, the form renders in that order — verify via a Playwright test that clicks fields in a specific order and checks the resulting TSV column ordering.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Liquidation detection divergence causes wrong fund size | HIGH | Audit all 3 call sites; write regression test that reproduces the wrong value; extract shared function; verify test passes |
| Config write storm corrupts fund JSON | MEDIUM | Fund JSON is small and human-readable; restore from iCloud backup; add debounce |
| Server route tests mock storage instead of testing real files | MEDIUM | Delete mock-based tests; rewrite with temp directory approach; restore coverage by covering the same scenarios |
| Price/size chart shown for wrong fund type | LOW | Add `hasPriceData` guard; no data corruption possible |
| Date range not persisted (session-only) | LOW | Add config write call; no data at risk |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Liquidation detection divergence | Bug Fix phase (fix liquidation) | Engine unit test reproduces old wrong value, new value passes |
| Cashflow DEPOSIT/WITHDRAW mismatch | Bug Fix phase (fix cashflow) + Server Route Tests | Route test asserts TSV output after DEPOSIT to cash fund |
| Configurable form stale state | Configurable Entry Form phase | Playwright test: change fields, navigate away, return — fields still configured |
| Config write storms (date range) | Chart Date Range phase | Network tab shows single request after rapid selection; final config matches last selection |
| Price/size chart on no-data funds | Price/Size Charts phase | Unit test: fund with no price entries does not render price chart |
| Filesystem mock divergence in tests | Server Route Tests phase | `vi.mock` is forbidden in route test files; CI enforces real temp directory approach |
| D3 resize re-render loops | Chart Date Range phase | Performance test: rapid sidebar toggle does not cause chart CPU spike |

---

## Sources

- Direct codebase inspection: `packages/server/src/routes/funds.ts` (liquidation detection at lines 1440-1447; DEPOSIT normalization at lines 1498-1504)
- Direct codebase inspection: `packages/web/src/components/FundCharts.tsx` (duplicate liquidation detection at lines 116-126)
- [Common Mistakes in React Admin Dashboards](https://dev.to/vaibhavg/common-mistakes-in-react-admin-dashboards-and-how-to-avoid-them-1i70)
- [Playwright Best Practices — test isolation](https://playwright.dev/docs/best-practices)
- [Playwright — How to write isolated tests against a real database](https://github.com/microsoft/playwright/issues/33699)
- [Node.js Testing Best Practices (goldbergyoni, 2025)](https://github.com/goldbergyoni/nodejs-testing-best-practices)
- [Unit Testing Essentials for Express API](https://rrawat.com/blog/unit-test-express-api)
- [Handling conditional field visibility in dynamic forms](https://gist.github.com/timhwang21/6a0d5530eb2f3dffaefd680837f23120)
- [TradingView — Save user settings in chart library](https://www.tradingview.com/charting-library-docs/latest/saving_loading/user-settings/)

---

*Pitfalls research for: EscapeMint financial dashboard — milestone: configurable forms, chart date ranges, price/size charts, bug fixes, server route tests*
*Researched: 2026-02-28*
