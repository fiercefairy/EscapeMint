# Architecture

**Analysis Date:** 2026-02-28

## Pattern Overview

**Overall:** Layered monorepo with distinct separation of concerns across four packages.

**Key Characteristics:**
- Pure computation layer (`@escapemint/engine`) with zero external dependencies
- File-based persistence with file locking for concurrent access (`@escapemint/storage`)
- Express API layer (`@escapemint/server`) that coordinates storage and calculations
- React frontend (`@escapemint/web`) with deep-linkable routes, no modals without URLs
- Unidirectional data flow: Web → API → Storage (TSV files) → Engine (calculations)

## Layers

**Engine Layer:**
- Purpose: Pure, deterministic financial calculations for fund state, metrics, and recommendations
- Location: `packages/engine/src/`
- Contains: Calculation functions, type definitions, fund configuration rules
- Depends on: Nothing (zero external dependencies)
- Used by: Storage, Server, Web

**Storage Layer:**
- Purpose: TSV file persistence with atomic read-modify-write operations using file locking
- Location: `packages/storage/src/`
- Contains: File I/O, fund data serialization, entry parsing, fund store interface
- Depends on: Engine (types, cost basis calculations), `proper-lockfile` for concurrency
- Used by: Server routes

**API/Server Layer:**
- Purpose: REST API endpoints that orchestrate storage reads, engine calculations, and complex business logic
- Location: `packages/server/src/`
- Contains: Routes, middleware, services (WebSocket, caching), utilities
- Depends on: Engine, Storage, Express, utilities (platforms, metrics, calculations)
- Used by: Web frontend via HTTP/WebSocket

**Web/Frontend Layer:**
- Purpose: User interface with React components, page-based routing, real-time dashboard
- Location: `packages/web/src/`
- Contains: Pages, components, API client, contexts, utilities
- Depends on: Engine (for client-side calculations), React Router, D3/Recharts, Sonner
- Used by: End users via browser

## Data Flow

**Fund State Computation:**

1. User adds entry via web form → `EditEntryModal.tsx` → API POST `/api/v1/funds/{id}/entries`
2. Server route (`packages/server/src/routes/funds.ts`) receives entry, calls `appendEntry()` from storage
3. Storage acquires file lock, reads TSV, appends new entry, writes back atomically
4. API response includes fresh fund state computed by engine: `computeFundState()` from `packages/engine/src/expected-equity.ts`
5. Web receives response, dispatches `FUNDS_CHANGED_EVENT`, components re-fetch fund data
6. `FundDetail.tsx` or Dashboard calls API GET `/api/v1/funds/{id}` to refresh state
7. Server reads fund from storage, transforms entries to trades/dividends/cashflows, calls engine to compute metrics
8. Web receives JSON, renders charts and metrics via Recharts/D3

**Dashboard Data Refresh:**

1. `Dashboard.tsx` uses `DashboardContext` to manage async fund list fetches
2. Calls API GET `/api/v1/funds` → returns all non-test funds with current metrics
3. Server computes aggregate metrics via `computeAggregateMetrics()` across all funds
4. Web stores in context, re-renders FundCards and charts

**Recommendation Flow:**

1. `FundDetail.tsx` fetches latest fund data including current equity
2. Calls API POST `/api/v1/compute/recommendation` with fund config, trades, cash flows, dividends, expenses, snapshot date, equity
3. Server route (`packages/server/src/routes/compute.ts`) calls engine `computeFundState()` then `computeRecommendation()`
4. Engine returns FundState (current allocation, excess/deficit) and Recommendation (action: BUY/SELL amount)
5. Web displays in `FundCharts.tsx` as text overlay on charts

**State Management:**

- **Engine State:** Stateless functions, deterministic given inputs. No persistence.
- **Storage State:** Fund files on disk (TSV for entries, JSON for config). Single source of truth.
- **API State:** No persistent state. Optional in-memory cache via `dashboard-cache.ts` for metrics (invalidated on fund changes).
- **Web State:**
  - React Context (`DashboardContext`, `SettingsContext`) for UI state, fund lists, user settings
  - Custom event `FUNDS_CHANGED_EVENT` for cross-component communication
  - No Redux or global state manager - contexts handle local scope

## Key Abstractions

**FundEntry:**
- Purpose: Single time-series row representing a fund snapshot at a point in time
- Examples: `packages/storage/src/fund-store.ts` (interface definition), `packages/engine/src/types.ts` (Trade, CashFlow, Dividend derivatives)
- Pattern: Union type for different action types; entries transformed to domain types (Trade, CashFlow) via `entriesToTrades()`, `entriesToDividends()` helper functions in storage

**FundState:**
- Purpose: Computed financial state of a fund at a snapshot date
- Examples: `packages/engine/src/expected-equity.ts` (computeFundState function), `packages/server/src/routes/funds.ts` (serialized in API responses)
- Pattern: Immutable object containing actual_value, start_input, gain, target_pct, allocation percentages by category

**FundConfig (SubFundConfig):**
- Purpose: Fund rules and parameters that drive calculations (target APY, interval, category allocation, etc.)
- Examples: `packages/engine/src/types.ts` (SubFundConfig interface), `packages/web/src/api/funds.ts` (FundConfig with extended fields), `packages/storage/src/fund-store.ts` (persisted as JSON)
- Pattern: Immutable configuration object; used with entries to compute state

**Fund Metrics:**
- Purpose: Derived metrics including APY, time-weighted fund size, realized gains
- Examples: `packages/engine/src/aggregate.ts` (computeFundMetrics, computeAggregateMetrics), `packages/server/src/utils/fund-metrics.ts` (final metrics with compound interest)
- Pattern: Higher-level aggregations of fund state, used for dashboard display

**Entry Transformers:**
- Purpose: Convert time-series entries to domain types for engine calculation
- Examples: `entriesToTrades()`, `entriesToDividends()`, `entriesToCashFlows()` in `packages/storage/src/fund-store.ts`
- Pattern: Filter and map entry list by action type, return strongly-typed arrays

## Entry Points

**API Server:**
- Location: `packages/server/src/index.ts`
- Triggers: `npm run dev:api` or `node dist/index.js` in production
- Responsibilities: Create Express app, mount all routers, initialize WebSocket, start HTTP server on port 5551

**Web Application:**
- Location: `packages/web/src/main.tsx`
- Triggers: Browser load of index.html, Vite development server, or production build
- Responsibilities: Mount React app to DOM, set up providers (Router, Settings, Toaster), route to entry page (Dashboard)

**CLI Entry (Backtest):**
- Location: `pages/` (separate Next.js app)
- Triggers: `npm run dev:backtest`
- Responsibilities: Analyze historical performance, generate backtesting reports

## Error Handling

**Strategy:** Minimal try/catch use; errors propagate to middleware/caller where appropriate.

**Patterns:**

- **API Errors:** Middleware catches and formats errors. Custom error creators: `badRequest()`, `notFound()`, `validationError()` in `packages/server/src/middleware/error-handler.ts`
- **Storage Errors:** File lock failures logged to console with warning emoji. Read/parse errors caught in route handlers and returned as 500 errors.
- **Engine:** Functions assume valid input; no error handling needed (pure calculations).
- **Web:** API errors caught in try/catch around fetch calls, displayed to user via toast notifications (Sonner toast, never `window.alert`)

## Cross-Cutting Concerns

**Logging:**
- Server: Structured logger via `createLogger(context)` in `packages/server/src/utils/logger.ts`
- Log levels: debug, info (default), warn, error, silent (controlled by `LOG_LEVEL` env var)
- Error logs: Emoji-prefixed (⚠️ for 4xx, ❌ for 5xx) with status code, error code, message
- Web: Console logs only (no server logger in browser)

**Validation:**
- Schema validation: Zod used for request body schemas in routes (e.g., platforms route, import route)
- Fund config validation: Handled by engine via `getFundTypeFeatures()`, `isValidAction()`, `applyFundTypeDefaults()` in `packages/engine/src/fund-type-config.ts`
- Entry validation: Storage layer checks for required fields (date, value), type converters validate during parse

**Authentication:**
- Not implemented. System is local-first with no multi-user access control.
- Future concern: Platform credentials stored separately via Keychain API (`api_key_name` reference in fund config)

**Concurrency:**
- File locking via `proper-lockfile` in storage layer ensures atomic read-modify-write for fund files
- Single-user system; no session/token management

---

*Architecture analysis: 2026-02-28*
