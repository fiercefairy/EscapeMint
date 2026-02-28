# Codebase Structure

**Analysis Date:** 2026-02-28

## Directory Layout

```
EscapeMint/
├── packages/                    # Monorepo with 4 independent packages
│   ├── engine/                  # Pure calculation functions
│   │   ├── src/                 # TypeScript source
│   │   ├── test/                # Vitest unit tests
│   │   └── dist/                # Compiled output
│   ├── storage/                 # TSV file persistence layer
│   │   ├── src/                 # TypeScript source
│   │   │   ├── migrations/      # Data migration utilities
│   │   │   └── fund-store.ts    # Main API
│   │   ├── test/                # Vitest unit tests
│   │   └── dist/                # Compiled output
│   ├── server/                  # Express API server
│   │   ├── src/
│   │   │   ├── routes/          # API endpoint handlers
│   │   │   ├── middleware/      # Express middleware
│   │   │   ├── services/        # WebSocket, caching, etc.
│   │   │   ├── utils/           # Helpers (logger, platforms, calculations)
│   │   │   ├── data/            # Embedded data (dividends.json, wallets.json)
│   │   │   └── index.ts         # Entry point
│   │   ├── test/                # Vitest unit + integration tests
│   │   ├── dist/                # Compiled output
│   │   └── vitest.integration.config.ts
│   └── web/                     # React frontend with Vite
│       ├── src/
│       │   ├── pages/           # Page-level components (routed)
│       │   ├── components/      # Reusable React components
│       │   │   ├── entriesTable/    # Sub-components for entries table
│       │   │   ├── fundsTable/      # Sub-components for funds table
│       │   │   └── *.tsx        # Individual components
│       │   ├── contexts/        # React Context providers
│       │   ├── api/             # API client functions
│       │   ├── utils/           # Formatters, helpers
│       │   ├── main.tsx         # Entry point
│       │   ├── App.tsx          # Root component with routes
│       │   └── index.css        # Global styles
│       ├── public/              # Static assets + reports
│       ├── dist/                # Built output
│       └── vite.config.ts       # Vite build config
├── e2e/                         # Playwright E2E tests
├── data/                        # User fund data
│   ├── funds/                   # {platform}-{ticker}.tsv + .json files
│   └── backups/                 # Automated backups
├── docs/                        # Documentation
├── pages/                       # Separate Next.js app for backtesting
├── .planning/                   # GSD planning documents
├── .changelogs/                 # Release notes by version
├── ecosystem.config.cjs         # PM2 config (single source of truth for ports)
├── package.json                 # Root workspace config
└── CLAUDE.md                    # Development guidelines (checked in)
```

## Directory Purposes

**`packages/engine/src/`:**
- Purpose: Pure financial calculation functions with zero dependencies
- Contains: Type definitions (FundState, FundType, ActionType, etc.), calculation engines
- Key files:
  - `types.ts` - Core types (FundType, FundStatus, FundCategory, SubFundConfig)
  - `expected-equity.ts` - `computeFundState()`, `computeCashAvailable()`, `computeRealizedGains()`
  - `derivatives-calculations.ts` - `computeDerivativesState()`, `processTrade()`, `calculateLiquidationPrice()`
  - `aggregate.ts` - `computeFundMetrics()`, `computeAggregateMetrics()`, `computeRealizedAPY()`
  - `recommendation.ts` - `computeRecommendation()` for buy/sell signals
  - `fund-type-config.ts` - `FUND_TYPE_DEFAULTS`, allowed actions by fund type, validation helpers
  - `explainer.ts` - Format functions: `formatCurrency()`, `summarizeFundState()`

**`packages/storage/src/`:**
- Purpose: Atomic file I/O with proper-lockfile for concurrent access
- Contains: Fund data model, TSV parsing/serialization, file locking
- Key files:
  - `fund-store.ts` - Main API: `readFund()`, `writeFund()`, `readAllFunds()`, `appendEntry()`, `deleteEntry()`, `deleteFund()`, `updateFundConfig()`
  - Entry transformers: `entriesToTrades()`, `entriesToDividends()`, `entriesToCashFlows()`, `entriesToExpenses()`, `entriesToCashInterest()`
  - `backup.ts` - `backupFunds()` for creating timestamped backups
  - `migrations/` - Data format upgrade utilities

**`packages/server/src/routes/`:**
- Purpose: REST API endpoints that combine storage reads with engine calculations
- Contains: Endpoint handlers organized by resource
- Key files:
  - `funds.ts` (105KB) - Fund CRUD, entry management, metrics computation, derivatives sync
  - `import.ts` (232KB) - Complex import wizards: CSV, JSON, Excel, Coinbase
  - `platforms.ts` - Platform list/CRUD, platform-level analytics
  - `compute.ts` - `POST /recommendation` for buy/sell calculations
  - `export.ts` - Export funds to CSV/JSON
  - `backup.ts` - Backup/restore endpoints
  - `test-data.ts` - Generate sample data for testing

**`packages/server/src/middleware/`:**
- Purpose: Express request/response processing
- Key files:
  - `error-handler.ts` - Global error handler, error creator helpers (`badRequest()`, `notFound()`, `validationError()`)

**`packages/server/src/services/`:**
- Purpose: Stateful services used by routes
- Key files:
  - `websocket.ts` - WebSocket server for real-time updates (Playwright browser automation feedback)
  - `dashboard-cache.ts` - In-memory cache for dashboard metrics (invalidated on fund changes)

**`packages/server/src/utils/`:**
- Purpose: Helper functions used across routes
- Key files:
  - `logger.ts` - Structured logging with `createLogger(context)`
  - `platforms.ts` - Platform utilities: `readPlatformsData()`, `writePlatformsData()`, `isTestPlatform()`
  - `fund-metrics.ts` - `computeFundFinalMetrics()` - compound interest APY calculation
  - `calculations.ts` - Date parsing, rounding helpers
  - `test-data-generator.ts` - Sample data creation

**`packages/server/src/data/`:**
- Purpose: Embedded reference data
- Key files:
  - `dividends.ts` - Historical dividend data for stocks
  - `wallets.json` - Known crypto wallet addresses (for scraping)

**`packages/web/src/pages/`:**
- Purpose: Page-level components mapped to routes (deep-linkable)
- Key files:
  - `Dashboard.tsx` - Main view: fund list, aggregate metrics, charts
  - `FundDetail.tsx` (78KB) - Single fund view: entries table, charts, add/edit entry modals, fund config
  - `PlatformDetail.tsx` - Platform-level view with analytics
  - `Settings.tsx` - App settings, test data generation, import/export
  - `Platforms.tsx` - Platform management
  - `AuditTrail.tsx` - Entry history by date
  - `Backtest.tsx` - Wrapper for separate backtesting app

**`packages/web/src/components/`:**
- Purpose: Reusable UI components
- Contains: Modals, panels, charts, tables, forms
- Key components:
  - `FundCharts.tsx` - Multi-chart visualization (value, allocation, derivatives-specific)
  - `EntryForm.tsx` - Form for adding/editing entries with action-specific fields
  - `EditFundConfigModal.tsx` - Modal for fund parameters
  - `CreateFundModal.tsx` - Create new fund
  - `ImportWizard.tsx` - Multi-step import UI
  - `entriesTable/` - Entries table sub-component
  - `fundsTable/` - Funds list sub-component
  - `Layout.tsx` - Root layout with navigation
  - Chart components: `DerivativesValueChart.tsx`, `DerivativesPriceChart.tsx`, `DerivativesMarginChart.tsx`, `DerivativesCapturedProfitChart.tsx`
  - `ConfirmDialog.tsx` - Confirmation modal (not `window.confirm`)

**`packages/web/src/contexts/`:**
- Purpose: React Context providers for state management
- Key files:
  - `DashboardContext.tsx` - Fund list, metrics, refresh trigger, async state
  - `SettingsContext.tsx` - User settings (theme, visibility preferences)

**`packages/web/src/api/`:**
- Purpose: REST API client functions
- Key files:
  - `funds.ts` - Fetch/create/update/delete funds, entries, metrics
  - `platforms.ts` - Platform CRUD and info
  - `import.ts` - Import workflows (CSV, import from Coinbase, etc.)
  - `utils.ts` - Base fetch functions: `fetchJson()`, `postJson()`, `putJson()`, `deleteResource()`, `API_BASE` constant

**`packages/web/src/utils/`:**
- Purpose: Utility functions (formatters, helpers)
- Key files:
  - `format.ts` - `formatCurrency()`, `formatPercent()`, date formatters

**`e2e/`:**
- Purpose: End-to-end tests with Playwright
- Contains: Test suites for full user workflows
- Config: `playwright.config.ts` (single worker to prevent data conflicts), `e2e/generate-coverage-report.ts` for test coverage analysis

**`data/funds/`:**
- Purpose: User-created fund files (generated at runtime)
- Contains: `{platform}-{ticker}.tsv` (entries) and `{platform}-{ticker}.json` (config)
- Example: `coinbase-BTC.tsv`, `coinbase-BTC.json`

**`docs/`:**
- Purpose: Architecture and feature documentation
- Key files:
  - `architecture.md` - System design
  - `derivatives.md` - Perpetual futures data model
  - `data-format.md` - TSV file structure and entry fields
  - `configuration.md` - All SubFundConfig options

## Key File Locations

**Entry Points:**
- `packages/server/src/index.ts` - API server starts here
- `packages/web/src/main.tsx` - Web app entry, mounts React to DOM
- `ecosystem.config.cjs` - PM2 configuration, defines dev/prod start commands

**Configuration:**
- `ecosystem.config.cjs` - Port numbers (Web: 5550, API: 5551, CDP: 5549)
- `packages/server/tsconfig.json` - TypeScript config for server
- `packages/web/vite.config.ts` - Vite build config
- `tsconfig.json` - Root TypeScript config (strict mode enabled)
- `.prettierrc` - Prettier config (no semicolons, single quotes, no trailing commas)
- `eslint.config.js` - ESLint rules for code quality

**Core Logic:**
- `packages/engine/src/expected-equity.ts` - Fund state calculations
- `packages/engine/src/aggregate.ts` - Metrics and APY calculations
- `packages/storage/src/fund-store.ts` - TSV file I/O
- `packages/server/src/routes/funds.ts` - Fund endpoint logic

**Testing:**
- `packages/engine/test/` - Unit tests for engine calculations
- `packages/storage/test/` - Unit tests for storage layer
- `packages/server/test/` - Unit + integration tests for API
- `e2e/` - Playwright E2E test suites

## Naming Conventions

**Files:**
- Routes: `{resource-name}.ts` in `packages/server/src/routes/` (e.g., `funds.ts`, `platforms.ts`)
- Components: `PascalCase.tsx` for React components (e.g., `FundCharts.tsx`, `EntryForm.tsx`)
- Utilities: `camelCase.ts` (e.g., `logger.ts`, `calculations.ts`)
- Contexts: `PascalCase.tsx` with Context suffix implied (e.g., `DashboardContext.tsx`)
- Tests: `*.test.ts` or `*.spec.ts` colocated with source

**Directories:**
- Plural for collections: `routes/`, `components/`, `utils/`, `pages/`, `tests/`
- Feature modules: lowercase dash-separated (e.g., `entriesTable/`, `fundsTable/`)

**Exports:**
- Named exports preferred for functions and types
- Barrel files (index.ts) used in sub-components directories
- Example: `components/entriesTable/index.ts` exports all table exports

**Variables:**
- Functions: camelCase (e.g., `computeFundState`, `readFund`)
- Constants: UPPER_SNAKE_CASE (e.g., `FUND_CATEGORIES`, `ENTRY_HEADERS`, `LOCK_OPTIONS`)
- Interfaces: PascalCase (e.g., `FundState`, `FundEntry`, `SubFundConfig`)
- React props: PascalCase component names, camelCase prop names

## Where to Add New Code

**New API Endpoint:**
- Create route handler in `packages/server/src/routes/{resource}.ts`
- Mount router in `packages/server/src/index.ts` via `app.use('/api/v1/{resource}', {resource}Router)`
- Call storage functions (e.g., `readFund()`) and engine calculations (e.g., `computeFundState()`)
- Use error helpers: `badRequest()`, `notFound()` from error-handler middleware
- Test with `npm run test:integration` in server package

**New Frontend Page:**
- Create page component in `packages/web/src/pages/{PageName}.tsx`
- Add route to `packages/web/src/App.tsx` with `<Route path="/path/:param" element={<PageName />} />`
- Import and use existing components from `packages/web/src/components/`
- Use `DashboardContext` for fund data or call API directly via `packages/web/src/api/`

**New Reusable Component:**
- Create in `packages/web/src/components/{ComponentName}.tsx`
- If it's part of a sub-feature, put in sub-directory (e.g., `components/fundsTable/NewTable.tsx`)
- Export from `components/index.ts` or sub-component barrel file
- Use Tailwind CSS for styling (already configured)
- Prefer functional components with hooks

**New Calculation Function:**
- Add to appropriate file in `packages/engine/src/`:
  - Fund state calculations: `expected-equity.ts`
  - Metrics/APY: `aggregate.ts`
  - Recommendation logic: `recommendation.ts`
  - Derivatives-specific: `derivatives-calculations.ts`
- Pure function (no side effects, no dependencies on storage/API)
- Test with `npm run test:engine`
- Export from `packages/engine/src/index.ts`

**New Storage Operation:**
- Add function to `packages/storage/src/fund-store.ts`
- Use `withFileLock()` for any read-modify-write operation
- Test with `npm run test:storage`
- Export from `packages/storage/src/index.ts`

**New Utility:**
- Server utilities: `packages/server/src/utils/{feature}.ts`
- Web utilities: `packages/web/src/utils/{feature}.ts`
- Keep pure functions without side effects when possible
- If it needs logging: use `createLogger(context)` in server, console in web

## Special Directories

**`data/funds/`:**
- Purpose: Runtime-generated user fund files
- Generated: Yes (created by user via UI or import)
- Committed: No (included in .gitignore)
- Format: `{platform}-{ticker}.tsv` (entries) paired with `{platform}-{ticker}.json` (config)

**`.planning/`:**
- Purpose: GSD planning documents (architecture, structure, conventions, concerns)
- Generated: Yes (by GSD tools)
- Committed: Yes (tracked in git for future reference)

**`data.backup/`:**
- Purpose: Manual backups of fund data
- Generated: Yes (user-initiated backups)
- Committed: No (ignored by git)

**`e2e/`:**
- Purpose: End-to-end test suites
- Generated: No (manually written tests)
- Committed: Yes (test code tracked)
- Single Playwright worker to prevent test data conflicts

---

*Structure analysis: 2026-02-28*
