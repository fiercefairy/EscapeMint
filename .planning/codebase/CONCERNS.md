# Codebase Concerns

**Analysis Date:** 2026-02-28

## Tech Debt

**Monolithic Import Router:**
- Issue: `/packages/server/src/routes/import.ts` at 6921 lines contains all browser scraping, PDF parsing, and transaction import logic in a single file
- Files: `packages/server/src/routes/import.ts`
- Impact: Very difficult to test individual import flows, debug issues, or add new data sources without touching core logic. Maintenance burden is high. File is approaching unmaintainability threshold.
- Fix approach: Extract into separate modules by data source (Robinhood scraper, M1 scraper, Coinbase scraper, crypto statements, PDF parsing). Each should be independently testable.

**Large Component Complexity:**
- Issue: `packages/web/src/components/ImportWizard.tsx` at 3361 lines and `packages/web/src/components/PortfolioCharts.tsx` at 1928 lines handle multiple concerns in single components
- Files: `packages/web/src/components/ImportWizard.tsx`, `packages/web/src/components/PortfolioCharts.tsx`
- Impact: Hard to test, understand, and modify. React components become difficult to reason about over 1500+ lines.
- Fix approach: Break into smaller, focused components with clear single responsibilities. Extract state management into custom hooks.

**Silent Error Handling via .catch():**
- Issue: Widespread use of `.catch(() => null)` and `.catch(() => [])` throughout codebase silently swallows errors
- Files: `packages/server/src/routes/import.ts` (line 550, 673, 834, 953, 1012, etc.), `packages/server/src/routes/funds.ts` (line 934, 998, 1340, etc.), `packages/web/src/api/utils.ts` (line 101, 103), `packages/web/src/components/ImportWizard.tsx` (line 807)
- Impact: Bugs become invisible - bad reads are silently replaced with empty state instead of being logged and diagnosed. Makes production debugging extremely difficult.
- Fix approach: Either log and report errors, or use explicit error states in UI/API responses. Never silently default to null/empty without logging.

**Unsafe Type Assertions:**
- Issue: Limited use but present: `(entry as unknown as Record<string, unknown>)[col] = ...` in funds.ts lines 2499, 2515
- Files: `packages/server/src/routes/funds.ts`
- Impact: Bypasses TypeScript's type safety for dynamic property assignment. Could hide real type errors.
- Fix approach: Use utility function with proper typing instead of double `as unknown` assertions.

## Deprecated Schema Fields Still in Code

**Legacy Derivatives Margin Fields:**
- Issue: `funding_profit` and `funding_loss` fields marked DEPRECATED but still present in type definitions. Schema uses `FUNDING` action instead.
- Files: `packages/storage/src/fund-store.ts` (implied by entries type), test references in `packages/engine/test/derivatives-calculations.test.ts` line 382
- Impact: Old data files may still contain these fields. New code shouldn't produce them, but parsing logic must still handle them for backward compatibility.
- Fix approach: Keep parsing support for migration path, but document removal timeline. Add migration script to convert old funds that use these fields.

**initialMarginRate vs derivInitialMargin:**
- Issue: Type system uses both `initial_margin_rate` (config) and older `derivInitialMargin` naming (deprecated from components)
- Files: Field naming inconsistency across config and entry types
- Impact: Minor confusion but not breaking - newer code uses `initial_margin_rate` consistently
- Fix approach: Document that `initial_margin_rate` is the canonical name. Update any remaining references.

## Known Bugs & Fragile Areas

**Browser Process Lifecycle Management:**
- Issue: Global `connectedBrowser` and `launchedChromeProcess` variables in import.ts are not properly isolated. Multiple concurrent import requests could interfere with each other.
- Files: `packages/server/src/routes/import.ts` lines 27-28, 1631-1695, 2404
- Impact: If two import requests hit the server simultaneously, browser state could become inconsistent. Kill endpoint could close browser while another request is using it.
- Safe modification: Add a request-scoped browser session ID, queue concurrent imports, or move to connection pool pattern
- Test coverage: No explicit tests for concurrent import scenarios

**Playwright Timeout Values Hard-coded:**
- Issue: Multiple timeouts scattered throughout import.ts: 10000ms (page creation), 15000ms (navigation), 30000ms (goto/download)
- Files: `packages/server/src/routes/import.ts` lines 1247-1250, 1417, 1428, 1556, 1822, 2108, etc.
- Impact: Not configurable; slower networks may timeout. Fast networks waste time waiting. Network issues are hard to debug with silent fallbacks.
- Improvement path: Move to environment variables or per-platform configuration

**Early Exit Optimization May Skip Valid Transactions:**
- Issue: `MAX_CONSECUTIVE_EXISTING` threshold (50, 30, 50 across different scrapers) causes scraper to stop early if it encounters many existing transactions
- Files: `packages/server/src/routes/import.ts` lines 1434, 3350, 5189 with logic at 1477, 3372, 5280
- Impact: If user has gaps in history (old → new → old again), the scraper will miss the oldest transactions. User must do "full" sync which is slower.
- Improvement path: Use date-based detection instead of transaction count heuristic. Track scrape progress per date range.

**Cash Fund Balance Recalculation Missing Atomic Guarantee:**
- Issue: Fund entries are read, modified in memory, then written back to disk without validation that the entries haven't changed on disk
- Files: `packages/server/src/routes/funds.ts` line 2646-2673
- Impact: Race condition - if two clients modify same fund simultaneously, one person's changes are lost silently
- Safe modification: Implement version/timestamp check before write, or acquire full file lock for read-modify-write cycle

## Scaling Limits

**File-Based Storage Concurrency:**
- Current: Uses `proper-lockfile` with 5 retries, 100-1000ms timeout
- Files: `packages/storage/src/fund-store.ts` line 61
- Limit: If many concurrent requests hit same fund, lock contention becomes high. Retries will eventually fail.
- Scaling path: Move to database (SQLite for local, PostgreSQL for cloud), or implement queue-based write model

**Single Browser Instance for All Scraping:**
- Current: One global browser for all platform scrapes
- Files: `packages/server/src/routes/import.ts` lines 27-28
- Limit: Only one scrape operation per server at a time (when browser is in use). Second request blocks or fails.
- Scaling path: Implement browser pool or dedicated scraper service. Use job queue (Bull, RQ) for import tasks.

**TSV File Line-by-Line Parsing:**
- Current: Every fund read/write loads entire file into memory and parses line by line
- Files: `packages/storage/src/fund-store.ts` line 287-291
- Limit: Funds with 10000+ entries become slow to read. Memory usage scales linearly.
- Scaling path: For very large funds, implement streaming parser or archival (move old entries to separate files)

**Browser Memory Accumulation During Long Scrapes:**
- Current: Playwright contexts and pages created during scrape are not cleaned up until scrape completes
- Files: `packages/server/src/routes/import.ts` (pages created at 1250, 1267, etc.)
- Impact: Very long scrapes (1000+ transactions) may leak memory if pages aren't properly closed
- Fix approach: Implement explicit page cleanup in finally blocks, or limit pages per context

## Security Considerations

**Playwright Browser Data Directory Not Isolated:**
- Issue: Chrome user profile stored in `./.browser` or system location, reused across all scraping sessions
- Files: `packages/server/src/routes/import.ts` line 1654 (BROWSER_USER_DATA_DIR)
- Risk: Cookies, session tokens, and login state persist between requests. If two users' scrapes run in same browser session, they could see each other's data.
- Current mitigation: Single-user desktop app, but not safe for multi-user deployment
- Recommendations: Use separate browser profiles per platform, or wipe cookies/cache between scrapes. Implement sandboxed contexts per session.

**Robinhood CSV/PDF Import File Upload:**
- Issue: Files uploaded via import endpoints are stored in `data/statements/` directories without validation
- Files: `packages/server/src/routes/import.ts` (CSV import logic), POST `/import/robinhood-csv`, POST `/import/m1-csv`
- Risk: No file type validation, size limits, or sandboxing. Malicious files could be read as transaction data.
- Current mitigation: Files are only parsed as CSV/TSV, not executed
- Recommendations: Validate MIME types, enforce file size limits (< 10MB), sanitize paths, implement virus scan if multi-user

**API Keys Stored in Coinbase Transaction Archive:**
- Issue: Archives may contain API key references in Coinbase data structures
- Files: `packages/server/src/routes/import.ts` (Coinbase import sections)
- Risk: Archives are stored in `data/scrape-archives/` which could be backed up or leaked
- Recommendations: Never store raw API credentials. Use secure credential storage or rotate frequently.

## Testing & Coverage Gaps

**Import Flows Not Tested End-to-End:**
- What's not tested: Actual browser scraping with real websites (only unit tests for parsing). Robinhood, M1, Coinbase scrape flows lack integration tests.
- Files: `packages/server/test/` (only logger.test.ts exists), no `import.test.ts`
- Risk: Scraper breakage won't be caught until user reports it. Scraper changes could break without feedback.
- Priority: High - import is most complex and fragile part of the system
- Approach: Create E2E tests with mock websites, or use VCR-style recorded HTTP responses

**Browser State Consistency Not Validated:**
- What's not tested: Browser process crashes, CDP connection drops, page navigation failures
- Files: `packages/server/src/routes/import.ts`
- Risk: If browser dies mid-scrape, user has no clear error message
- Priority: Medium
- Approach: Add tests for process death, reconnection, and graceful degradation

**Concurrent Import/Modification Not Tested:**
- What's not tested: Two simultaneous edits to same fund, import + manual entry at same time
- Files: `packages/server/src/routes/funds.ts`, `packages/server/src/routes/import.ts`
- Risk: Data loss, race conditions, corrupted state
- Priority: High
- Approach: Add integration tests with parallel requests using same fund

**Cash Fund Sync Logic Not Covered:**
- What's not tested: Cash fund sync with sub-funds (POST `/funds/:id/sync-cash`)
- Files: `packages/server/src/routes/funds.ts` line 2546-2683
- Risk: Complex logic for mapping trades and dividends to cash entries, untested
- Priority: Medium
- Approach: Add unit tests for trade→cash mapping, edge cases (no dividend, full liquidation)

## Fragile Areas Requiring Care

**Derivatives Calculations State:**
- Files: `packages/engine/src/derivatives-calculations.ts` (large, complex algorithm)
- Why fragile: Changes to margin calculation, liquidation price, or funding payment logic can silently produce wrong numbers. Engine outputs are used by UI and must be precise.
- Safe modification: Comprehensive test suite exists but any margin-rate change requires review of all margin-related tests
- Test coverage: Good coverage for derivatives-calculations tests, but edge cases around liquidation and margin calls are minimal

**Fund Entry Parsing & Serialization Round-Trip:**
- Files: `packages/storage/src/fund-store.ts` lines 117-236
- Why fragile: TSV format has no schema versioning. Adding new fields breaks old files. Column order must match serialization exactly.
- Safe modification: Add comprehensive tests for round-trip parsing of all field types. Test with real old fund files.
- Test coverage: Minimal explicit testing of parseEntry/serializeEntry

**Platform-Specific Import Logic:**
- Files: `packages/server/src/routes/import.ts` (multiple platform-specific scrape functions)
- Why fragile: Each platform (Robinhood, M1, Coinbase) has different selectors, workflows, and error states. Website changes break scraper without warning.
- Safe modification: Maintain separate test data and mock pages for each platform. Use feature flags to disable broken scrapers.
- Test coverage: No integration tests for scraping

## Dependencies at Risk

**Playwright as Critical Dependency:**
- Risk: Playwright is large, has frequent updates, and requires browser binaries. If maintainers stop supporting a platform, scraping breaks.
- Impact: Core import functionality depends entirely on Playwright
- Migration plan: Keep updated to latest stable. Have fallback plan (manual import via CSV if Playwright breaks). Consider CDP-level implementation if risk gets too high.

**TSV as Data Format:**
- Risk: Tab-separated values are fragile (what if data contains tabs?), have no official schema, and no versioning
- Impact: No way to migrate schema as needs change. Adding new fields requires careful column order management.
- Migration plan: Long-term: migrate to SQLite or JSON Lines format. Short-term: add version field to fund config, implement migration functions.

**PM2 for Process Management:**
- Risk: PM2 is third-party Node service manager. Global state can get corrupt if not shut down cleanly.
- Impact: Multiple imports or restarts could leave orphaned Chrome processes
- Mitigation: Ensure proper cleanup in PM2 ecosystem.config.js. Document graceful shutdown.

## Missing Critical Features

**No Undo for Transaction Imports:**
- Problem: Once transactions are imported, there's no undo. User must manually delete entries if import was incorrect.
- Blocks: Can't safely retry failed imports, can't revert to previous state
- Workaround: Manual deletion via UI, or restore from backup

**No Transaction Deduplication Strategy:**
- Problem: If user runs import twice, will it create duplicates? Code has some checks but not comprehensive.
- Blocks: Multi-import workflows not safe
- Approach: Implement transaction hash/ID to detect duplicates across imports

**No Data Validation After Import:**
- Problem: Imported transactions are not validated for consistency (e.g., sum of trades vs. account balance)
- Blocks: Can't detect if import is missing transactions or has duplicates
- Approach: Add post-import validation pass that checks data integrity

---

*Concerns audit: 2026-02-28*
