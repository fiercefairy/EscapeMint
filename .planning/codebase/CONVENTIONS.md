# Coding Conventions

**Analysis Date:** 2026-02-28

## Naming Patterns

**Files:**
- kebab-case for filenames: `error-handler.ts`, `fund-store.ts`, `test-data.ts`
- PascalCase for React components: `ConfirmDialog.tsx`, `FundDetail.tsx`, `EditFundPanel.tsx`
- Type/interface files may use kebab-case: `derivatives-types.ts`, `fund-type-config.ts`

**Functions:**
- camelCase: `computeFundState`, `formatCurrency`, `createLogger`, `getFundStartDate`
- Prefix functions with purpose verb: `compute*`, `calculate*`, `format*`, `get*`, `create*`, `is*`, `check*`
- Pure calculation functions in engine use `compute` prefix: `computeExpectedTarget`, `computeCashAvailable`
- React hooks use `use` prefix: `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`
- Test utility functions: `makeState`, `generateCashFundConfig`, `createFundViaAPI`
- Descriptive function names for test helpers: `entriesToTrades`, `entriesToDividends`, `getFundStateViaAPI`

**Variables:**
- camelCase: `startDate`, `fundSize`, `cashAvailable`, `targetApy`
- Boolean prefixes: `is*` for derived booleans, `*Enabled` for flags, `*Collapsed` for UI state
  - Examples: `isEditing`, `isCashFund`, `isDerivativesFund`, `chartsCollapsed`, `marginEnabled`
- Suffixes for units: `_usd` for USD amounts, `_pct` for percentages, `_days` for time durations
  - Examples: `fund_size_usd`, `target_apy` (0.30 = 30%), `interval_days`
- API response types use snake_case keys to match server responses: `expected_target_usd`, `actual_value_usd`, `cash_available_usd`

**Types:**
- PascalCase for all types: `FundConfig`, `SubFundConfig`, `FundState`, `ApiError`
- Interfaces for shapes: `interface FundEntry { ... }`
- Type aliases for unions: `type ActionType = 'BUY' | 'SELL' | 'HOLD'`
- Type aliases for specific values: `type FundStatus = 'active' | 'closed'`
- Props interfaces: `interface ComponentNameProps { ... }`
  - Example: `interface ConfirmDialogProps { ... }`
- Enum-like types as discriminated unions: `type FundCategory = 'liquidity' | 'yield' | 'sov' | 'volatility'`

## Code Style

**Formatting:**
- Tool: Prettier
- No semicolons: `const x = 1` not `const x = 1;`
- Single quotes: `'string'` not `"string"`
- No trailing commas: `[a, b]` not `[a, b,]`
- Tab width: 2 spaces
- Print width: 100 characters
- Arrow function parentheses: avoid when single param: `x => x + 1` not `(x) => x + 1`

**Linting:**
- Tool: ESLint with TypeScript plugin
- Config: `eslint.config.js` (flat config format)
- Strict TypeScript: `strict: true` enforces null checks, unused variables, etc.
- Disabled rules for pragmatism:
  - `@typescript-eslint/no-unsafe-*` rules disabled (excessive noise with JSON, API responses, monorepo cross-package inference)
  - `@typescript-eslint/no-floating-promises` disabled (common React event handler pattern)
  - `@typescript-eslint/no-misused-promises` disabled (React event handler pattern)
  - `@typescript-eslint/unbound-method` disabled (common usage pattern)
  - Unused variable pattern: prefix unused params with `_` to suppress lint: `(_req, res) => {}`

## Import Organization

**Order:**
1. Node.js built-ins: `import { join } from 'node:path'`, `import { readFile } from 'node:fs/promises'`
2. External packages: `import express from 'express'`, `import { toast } from 'sonner'`
3. Monorepo packages: `import { computeFundState } from '@escapemint/engine'`, `import { readFund } from '@escapemint/storage'`
4. Relative imports (project files): `import { errorHandler } from '../middleware/error-handler.js'`
5. Type imports separated with leading comma in code: `import type { ApiError } from '../middleware/error-handler.js'`

**Path Aliases:**
- `@escapemint/engine` → `packages/engine/src/`
- `@escapemint/storage` → `packages/storage/src/`
- Explicit imports: avoided `.js` extensions not required in imports (TypeScript handles it)
- But ESM `.js` extensions used in actual source code: `from './types.js'`, `from './expected-equity.js'`

**Import Style:**
- Named imports preferred: `import { computeFundState, computeRecommendation } from '@escapemint/engine'`
- Type imports separated: `import type { FundState, SubFundConfig } from '@escapemint/engine'`
- Destructure combined: `import type { FundEntry, FundData }`
- Default imports for components: `import { ConfirmDialog } from '../components/ConfirmDialog'`
- Namespace imports for large modules: `import * as d3 from 'd3'`

## Error Handling

**Patterns:**
- Custom error types with properties: `interface ApiError extends Error { statusCode?: number; code?: string; }`
- Error creation helpers: `createError(message, statusCode, code)`, `notFound(resource)`, `badRequest(message)`
- Error propagation to middleware: `async (req, res, next) => { ... .catch(next) }`
- Error handler middleware logs and formats responses: `errorHandler` middleware in `packages/server/src/middleware/error-handler.ts`
- Client errors (4xx): Single-line warning with emoji: `⚠️ 404 NOT_FOUND: Fund not found`
- Server errors (5xx): Error message with full stack trace: `❌ 500 INTERNAL_ERROR:...` plus `console.error(err.stack)`
- Async errors caught with `.catch(next)` pattern rather than try/catch when possible
- No window.alert or confirm in frontend—use toast notifications (Sonner) and ConfirmDialog component

## Logging

**Framework:** Custom logger in `packages/server/src/utils/logger.ts`

**Patterns:**
- Single-line structured logs with emoji prefix for severity level
- Format: `[timestamp] [LEVEL] [context] message`
- Levels: `debug`, `info`, `warn`, `error`, `silent`
- Environment control: `LOG_LEVEL` env var (default: `info`)
- Logger creation: `const logger = createLogger('context-name')`
- Usage: `logger.info('message', value)`, `logger.error('message', error)`
- Server startup logs include port and WebSocket URL: `EscapeMint API running on http://localhost:5551`
- Include timing context to diagnose sequencing: log action start/complete times

## Comments

**When to Comment:**
- JSDoc for public APIs and exported functions: All exported functions should have JSDoc explaining params, returns, and purpose
- Complex business logic: Multi-step calculations explained with inline comments
- Config objects and test data: Inline comments explaining values and units
- Non-obvious constraints: Why something is a certain way (e.g., "margin is tracked separately as borrowing capacity, not an allocation category")

**JSDoc/TSDoc:**
- Function comments above export: `export function name() { /** ... */ }`
- Param comments: `@param name - description`, `@param name The description` (space or dash)
- Return comments: `@returns description`
- Example in types:
  ```typescript
  /**
   * Fund category represents investment philosophy pillars:
   * - 'liquidity': 24/7 cash access for spending/investing
   * - 'yield': Stable high-yield instruments (STRC or similar stable dividend stocks)
   * - 'sov': Store of Value, hedge against fiat (BTC)
   * - 'volatility': Capture market fluctuations (TQQQ, whole market exposure)
   */
  export type FundCategory = 'liquidity' | 'yield' | 'sov' | 'volatility'
  ```

## Function Design

**Size:**
- Pure calculation functions typically 5-50 lines
- API route handlers 30-80 lines (including validation and response formatting)
- Components 100-300 lines, split if larger with composable hooks

**Parameters:**
- Ordered semantically: configs first, then data, then optional flags
- Multiple related params grouped into objects: `config: SubFundConfig`, `state: FundState`
- Optional params via object destructuring: `function generateCashFundConfig(overrides: Partial<FundConfig> = {})`
- Test data generators take partial overrides: `makeState({ cash_available_usd: 5000 })`

**Return Values:**
- Pure functions return computed values directly: `computeFundState(): FundState`
- API handlers use `.json()` or `.status().json()`: `res.json(funds)`
- Error cases throw or use error helper: `throw notFound('Fund')`
- Null for "not found" in some contexts: `computeRecommendation() => Recommendation | null`
- Functions that skip work return silently: `if (!allFunds) return` in route handlers

## Module Design

**Exports:**
- Grouped by type and function: All types exported before functions
- Barrel export pattern in index files: `packages/engine/src/index.ts` re-exports all public APIs
- Type exports separated from value exports: `export type { ... }` from `export { ... }`

**Barrel Files:**
- `packages/engine/src/index.ts`: Central export of all engine APIs
- Re-exports organized by feature module
- Enables clean imports: `import { computeFundState } from '@escapemint/engine'`

---

*Convention analysis: 2026-02-28*
