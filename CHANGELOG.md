# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-01-07

### New Features

#### Coinbase Derivatives Integration
- New `derivatives` fund type for perpetual futures tracking
- API Key Management with secure storage in macOS Keychain
- Coinbase API Client with JWT authentication (ES256) for read-only access to:
  - Positions, portfolio summary, historical fills, funding payments, current price
- FIFO Cost Basis Tracking for proper lot tracking and tax purposes
- Liquidation Price Calculation based on margin, position size, and equity
- Safe Order Ladder suggesting limit orders that keep equity positive at $0 BTC
- Funding/Rewards Archive with manual and bulk import

#### Derivatives UI Components
- `DerivativesDashboard`: Position summary with P&L, margin, contracts
- `FundingTracker`: Funding payments and USDC rewards with cumulative totals
- `ApiKeyModal`: Manage Coinbase API keys stored in Keychain
- `DerivativesFundDetail` page with tabbed navigation

#### Derivatives API Endpoints
- Key management: `GET/POST/DELETE /api/v1/derivatives/api-keys`
- Test credentials: `POST /api/v1/derivatives/api-keys/:name/test`
- Position data: `GET /api/v1/derivatives/positions`, `/portfolio`, `/fills/:productId`, `/funding/:productId`, `/price/:productId`
- Archive endpoints: `GET /api/v1/import/coinbase-btcd/archive`
- Manual/bulk import: `POST /api/v1/import/coinbase-btcd/funding/manual`, `/funding/bulk`, `/rewards/manual`, `/rewards/bulk`

#### Derivatives Routes
- `/derivatives/:id` - Position dashboard
- `/derivatives/:id/funding` - Funding & rewards tracker
- `/derivatives/:id/history` - Trade history

### Security
- All Coinbase operations are GET-only (read-only, no trade execution)
- API secrets never stored in files or logged (Keychain only)
- Fresh JWT generated for each request (2-min expiry)

### Code Quality

#### Fund Type Configuration Refactoring
- Created centralized `packages/engine/src/fund-type-config.ts` with:
  - `FUND_TYPE_DEFAULTS` - Default config values per fund type
  - `FUND_TYPE_FEATURES` - Feature flags (trading, recommendations, dividends, etc.)
  - `ALLOWED_ACTIONS` - Valid entry actions per fund type
  - Helper functions: `isCashFund()`, `isDerivativesFund()`, `isTradingFund()`, `getFundTypeFeatures()`
- Refactored 11 files to use centralized config instead of inline type checks
- Reduced inline `isCashFund`/`isDerivativesFund` declarations by ~70%
- Adding new fund types now requires changes to 1-2 files instead of 10+

## [0.5.1] - 2026-01-05

### Improvements
- Removed Cash APY settings from UI (interest is tracked directly via entries)

## [0.5.0] - 2026-01-05

### New Features
- Created centralized API utilities (`fetchJson`, `postJson`, `putJson`, `deleteResource`) reducing ~300 lines of duplicate code
- Created EventSource streaming helper (`createEventStream`) for SSE handling
- Created server calculation utilities (`calculateStartInputWithLiquidation`, `sortEntriesByDate`)
- Added `HOLD` action type to Recommendation interface
- Shared Cash Fund for Recommendations: Trading funds with `manage_cash=false` use platform's shared cash fund
- M1 Finance Cash Import: Direct routing to `m1-cash` fund with duplicate detection
- M1 Finance Cash Account Scraper with pagination and incremental archive
- Browser Scraping with Real-Time Progress via SSE

### Improvements
- DRY/YAGNI audit reducing ~1,000 lines of duplicate/unused code
- Removed unused SubFund feature (5 files, ~400 lines)
- Fixed E2E tests to properly respect `manage_cash=true` on trading funds
- Fixed TypeScript declaration emit for Express routers
- Added explicit type annotations for better type safety

### Fixed
- SELL handling in `computeExpectedTarget`: Now proportionally reduces expected gain
- APY denominator in `computeClosedFundMetrics`: Uses `totalInvested` for correct ROI
- Implemented missing config options: `dividend_reinvest`, `interest_reinvest`, `expense_from_fund`

## [0.4.0] - 2025-12-15

### New Features
- Platform-Level Cash Tracking with auto-create cash funds
- `FundType`: `'trading' | 'cash'` to distinguish fund types
- Cash isolation: Trading funds have `manage_cash=false`
- Cash fund TWFS for aggregate metrics
- Dashboard improvements: Cash funds pinned to top, aggregate panel with cash balance

## [0.3.0] - 2025-11-01

### New Features
- Platform dashboards with aggregate metrics
- CSV import from Robinhood
- Platform-level configs
- APY history tracking

## [0.2.0] - 2025-10-01

### New Features
- Storage refactor: Separate TSV (data) and JSON (config) files
- DEPOSIT/WITHDRAW actions for cash flow tracking
- Column reordering in entries table
- Charts and improved audit trail

## [0.1.0] - 2025-09-01

### New Features
- Core calculation engine with pure functions
- TSV storage layer with file locking
- Express API with fund CRUD operations
- React frontend with dashboard, fund view, entry form, audit trail
- PM2 process management for development
