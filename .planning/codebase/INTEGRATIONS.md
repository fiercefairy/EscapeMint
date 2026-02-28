# External Integrations

**Analysis Date:** 2026-02-28

## APIs & External Services

**Robinhood Web Scraping:**
- Service: Robinhood trading platform (requires user login)
- What it's used for: Automatic transaction import via browser automation
- SDK/Client: Playwright (chromium) with Chrome DevTools Protocol (CDP)
- Location: `packages/server/src/routes/import.ts` (lines 1089+)
- Auth: User credentials entered via browser login, stored in Chrome user profile at `.browser/`
- Approach: Launches Chrome with `--remote-debugging-port=5549`, connects via CDP, scrapes activity feed

**Coinbase Public API:**
- Service: Coinbase price feed (public endpoint)
- What it's used for: Fetch current BTC-USD spot price for derivatives mark price calculations
- SDK/Client: Fetch API (native browser/Node.js)
- Endpoint: `https://api.coinbase.com/v2/prices/BTC-USD/spot`
- Auth: None (public API)
- Location: `packages/web/src/api/utils.ts` (fetchBtcPrice function)
- Caching: 30-second in-memory cache with request deduplication
- Note: Non-critical integration - failures degrade gracefully, returns cached value

## Data Storage

**Databases:**
- None - local-first architecture only

**File Storage:**
- Local filesystem TSV format
  - Location: `data/funds/{platform}-{ticker}.tsv`
  - Format: Time-series entries with date, value, action, amount, shares, price, dividends, expenses
  - Connection: Via @escapemint/storage package
  - Client: custom TypeScript persistence layer using proper-lockfile for concurrency
  - Concurrency control: File locking (proper-lockfile 4.1.2) prevents simultaneous writes

**Configuration Files:**
- Local filesystem JSON format
  - Location: `data/funds/{platform}-{ticker}.json`
  - Contains: Fund metadata (fund_size_usd, target_apy, DCA amounts, status, etc.)
  - Persistence: Via @escapemint/storage writeFund() function

**Backups:**
- Local filesystem ZIP archives
  - Location: configurable via API (default system backups directory)
  - Format: Zipped TSV + JSON files
  - Library: archiver 7.0.1 (create), unzipper 0.12.3 (restore)
  - API: `packages/server/src/routes/backup.ts`

## Authentication & Identity

**Auth Provider:**
- Custom - No centralized auth provider
- Robinhood login: Handled via browser-based login with CDP (user session stored in `.browser/`)
- Note: System is single-user, local-first application

## Monitoring & Observability

**Error Tracking:**
- None detected - no Sentry, Rollbar, or similar integration

**Logs:**
- Console/stdout
  - Server: `console.log()` calls prefixed with emoji and context
  - Output captured by PM2 with `pm2 logs`
  - No external logging service

**WebSocket Real-time Updates:**
- Service: Custom WebSocket server for import progress updates
- Location: `packages/server/src/services/websocket.ts`
- Purpose: Stream Robinhood import progress to frontend in real-time
- Port: 5551 (same as API server)

## CI/CD & Deployment

**Hosting:**
- Self-hosted/local development with PM2
- No cloud platform integration detected
- Manual deployment via `npm run build && npm start`

**CI Pipeline:**
- None detected - no GitHub Actions, GitLab CI, or similar

**Browser Automation Stack:**
- Playwright 1.57.0 for E2E tests
- Chrome/Chromium via CDP for live browser scraping
- Ports: API (5551), Web UI (5550), CDP (5549), Pages/Backtest (5561)

## Environment Configuration

**Required env vars:**
- NODE_ENV - development/production mode
- PORT - API server port (default 5551)
- DATA_DIR - directory for fund data files (default ./data)
- CDP_PORT - Chrome DevTools Protocol port (default 5549)
- VITE_PORT - Web UI port (default 5550)
- VITE_API_PORT - Web UI proxy target for /api (default 5551)
- VITE_CDP_PORT - Web UI CDP port for browser (default 5549)
- VITE_PAGES_PORT - Backtest pages port (default 5561)

**Secrets location:**
- Chrome user profile: `.browser/` directory
  - Contains: Robinhood login session/cookies
  - Auto-managed by Playwright/Chromium
- No .env files detected - configuration via environment variables only

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## Integration Patterns

**File-based Data Exchange:**
- PDF import: `pdf-parse` for parsing uploaded trading statements
- Excel import: `xlsx` for parsing Excel files (backtest/manual data entry)
- Export formats: TSV (internal), JSON (configuration), ZIP (backups)

**Browser Automation:**
- Robinhood scraping via Playwright + CDP
- Handles 1000+ activity items per import with batch processing and DOM cleanup
- Refresh page every N items to reset browser state and prevent memory leaks
- Error recovery with retry logic for network timeouts

**Real-time Communication:**
- WebSocket for import progress streaming
- Server-to-client only (no client-to-server messages)

---

*Integration audit: 2026-02-28*
