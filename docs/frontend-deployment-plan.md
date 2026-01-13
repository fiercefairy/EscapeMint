# Frontend-Only GitHub Pages Deployment Plan

This document outlines the plan to create a GitHub Pages deployment of EscapeMint that runs entirely in the browser, using localStorage for data persistence and bundling all demo/test data.

## Objective

Create a static frontend deployment that:
1. Runs entirely in the browser (no backend server required)
2. Loads demo/test data automatically
3. Saves all changes to localStorage
4. Allows import/export of data
5. Retains full recommendation engine functionality

## Current Architecture Analysis

### What Currently Runs Where

| Component | Location | Dependencies |
|-----------|----------|--------------|
| Recommendation Logic | `@escapemint/engine` | None (pure functions) |
| Fund State Calculations | `@escapemint/engine` | None (pure functions) |
| Aggregate Metrics | `@escapemint/engine` | None (pure functions) |
| TSV Parsing/Serialization | `@escapemint/storage` | Node.js `fs` module |
| File I/O | `@escapemint/storage` | Node.js `fs` module |
| API Endpoints | `@escapemint/server` | Express, Storage |
| React UI | `@escapemint/web` | Engine (types only) |

### Key Insight

The engine package has **zero dependencies** and contains all business logic as pure functions. It's already browser-compatible and can be directly imported by the frontend.

## Implementation Strategy

### Phase 1: Create Browser-Compatible Storage Layer

**Goal:** Create a localStorage-based storage adapter that mirrors the file-based storage API.

#### 1.1 Create `packages/web/src/storage/` Directory

```
packages/web/src/storage/
├── index.ts              # Main exports
├── types.ts              # Re-export storage types for browser use
├── local-store.ts        # localStorage implementation
├── data-transforms.ts    # Entry/Trade conversion (port from storage)
└── demo-data.ts          # Bundled test/demo fund data
```

#### 1.2 Port Data Transformation Functions

The following functions from `@escapemint/storage` need to be ported to the web package (they don't use Node.js APIs):

- `entriesToTrades()` - Convert entries to Trade objects
- `entriesToDividends()` - Extract dividend records
- `entriesToExpenses()` - Extract expense records
- `entriesToCashFlows()` - Extract cash flow records
- `entriesToCashInterest()` - Sum cash interest
- `getLatestEquity()` - Get most recent equity value

These are pure functions that just iterate over arrays - no changes needed.

#### 1.3 Implement LocalStorage Store

Create `local-store.ts` with the following interface:

```typescript
interface LocalFundStore {
  // Read operations
  listFunds(): FundData[]
  readFund(id: string): FundData | null

  // Write operations
  writeFund(data: FundData): void
  deleteFund(id: string): void

  // Entry operations
  appendEntry(id: string, entry: FundEntry): void
  updateEntry(id: string, entryIndex: number, entry: FundEntry): void
  deleteEntry(id: string, entryIndex: number): void

  // Config operations
  updateFundConfig(id: string, config: Partial<SubFundConfig>): SubFundConfig

  // Import/Export
  exportAllData(): string  // JSON export
  importData(json: string): void
  loadDemoData(): void  // Initialize with test data
  clearAllData(): void
}
```

Storage format in localStorage:
```
escapemint:funds = ["robinhood-tqqq", "coinbase-btc", ...]  // Index
escapemint:fund:robinhood-tqqq = { config: {...}, entries: [...] }
escapemint:fund:coinbase-btc = { config: {...}, entries: [...] }
```

### Phase 2: Bundle Demo Data

**Goal:** Include test fund data in the frontend bundle for immediate use.

#### 2.1 Export Test Data as JSON

Create a build script that reads all `test-*.tsv` and `test-*.json` files from `data/funds/` and outputs them as a TypeScript module:

```typescript
// packages/web/src/storage/demo-data.ts
export const DEMO_FUNDS: FundData[] = [
  {
    id: 'test-btc',
    platform: 'test',
    ticker: 'btc',
    config: { /* ... */ },
    entries: [ /* ... */ ]
  },
  // ... more demo funds
]
```

#### 2.2 Build Script

Create `scripts/export-demo-data.ts`:
```bash
npm run build:demo-data  # Generates demo-data.ts from test funds
```

### Phase 3: Create Dual-Mode API Layer

**Goal:** Create an API layer that works in both modes (server-connected and standalone).

#### 3.1 Create API Abstraction

```typescript
// packages/web/src/api/adapter.ts

type StorageMode = 'server' | 'local'

interface FundApi {
  fetchFunds(): Promise<FundSummary[]>
  fetchFund(id: string): Promise<FundDetail>
  fetchFundState(id: string): Promise<FundStateResponse>
  createFund(data: CreateFundInput): Promise<FundDetail>
  updateFund(id: string, updates: UpdateFundInput): Promise<FundDetail>
  deleteFund(id: string): Promise<void>
  addEntry(id: string, entry: FundEntry): Promise<EntryResponse>
  updateEntry(id: string, index: number, entry: FundEntry): Promise<EntryResponse>
  deleteEntry(id: string, index: number): Promise<void>
  previewRecommendation(id: string, value: number, date?: string): Promise<PreviewResponse>
  // ... etc
}

function createFundApi(mode: StorageMode): FundApi
```

#### 3.2 Server API Implementation

The existing `packages/web/src/api/funds.ts` becomes the server implementation - minimal changes needed, just wrap in the interface.

#### 3.3 Local API Implementation

Create `packages/web/src/api/local-funds.ts`:

```typescript
import { LocalFundStore } from '../storage/local-store'
import {
  computeFundState,
  computeRecommendation,
  computeAggregateMetrics
} from '@escapemint/engine'
import { entriesToTrades, entriesToDividends, ... } from '../storage/data-transforms'

export function createLocalFundApi(store: LocalFundStore): FundApi {
  return {
    async fetchFundState(id: string) {
      const fund = store.readFund(id)
      if (!fund) throw new Error('Fund not found')

      const trades = entriesToTrades(fund.entries)
      const dividends = entriesToDividends(fund.entries)
      const expenses = entriesToExpenses(fund.entries)
      const cashFlows = entriesToCashFlows(fund.entries)
      const cashInterest = entriesToCashInterest(fund.entries)
      const latest = getLatestEquity(fund.entries)

      const state = computeFundState({
        config: fund.config,
        trades,
        dividends,
        expenses,
        cashInterest,
        cashFlows,
        snapshotDate: latest?.date ?? new Date().toISOString().split('T')[0],
        equityValue: latest?.value ?? 0
      })

      const recommendation = computeRecommendation(fund.config, state)

      return {
        fund: { id: fund.id, platform: fund.platform, ticker: fund.ticker, config: fund.config },
        state,
        recommendation,
        closedMetrics: null,
        // ... other fields
      }
    },
    // ... other methods
  }
}
```

### Phase 4: Environment Configuration

**Goal:** Configure build to detect deployment mode.

#### 4.1 Environment Variables

```bash
# .env.development (local dev with server)
VITE_STORAGE_MODE=server
VITE_API_BASE=http://localhost:5551

# .env.production (GitHub Pages)
VITE_STORAGE_MODE=local
```

#### 4.2 Build Configuration

Update `packages/web/vite.config.ts`:

```typescript
export default defineConfig({
  // For GitHub Pages, set base path
  base: process.env.VITE_STORAGE_MODE === 'local' ? '/EscapeMint/' : '/',

  build: {
    // Ensure engine is bundled (not externalized)
    rollupOptions: {
      // Include engine in the bundle
    }
  }
})
```

#### 4.3 API Provider Context

```typescript
// packages/web/src/context/ApiContext.tsx
import { createContext, useContext, ReactNode } from 'react'
import { createFundApi, StorageMode } from '../api/adapter'

const mode = (import.meta.env.VITE_STORAGE_MODE || 'server') as StorageMode
const api = createFundApi(mode)

const ApiContext = createContext(api)

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useApi() {
  return useContext(ApiContext)
}
```

### Phase 5: Import/Export UI

**Goal:** Allow users to save their data and restore it.

#### 5.1 Export Functionality

Add export button to Settings or Dashboard:
```typescript
function handleExport() {
  const data = store.exportAllData()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `escapemint-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

#### 5.2 Import Functionality

Add import button with file picker:
```typescript
function handleImport(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const json = e.target?.result as string
    store.importData(json)
    toast.success('Data imported successfully')
    // Refresh UI
  }
  reader.readAsText(file)
}
```

#### 5.3 Demo Data Reset

Add "Load Demo Data" button for new users:
```typescript
function handleLoadDemo() {
  store.clearAllData()
  store.loadDemoData()
  toast.success('Demo data loaded')
}
```

### Phase 6: GitHub Pages Deployment

**Goal:** Set up automated deployment.

#### 6.1 GitHub Actions Workflow

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run build:packages
      - run: npm run build:demo-data
      - run: npm run build:web:pages
        env:
          VITE_STORAGE_MODE: local

      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

#### 6.2 Build Scripts

Add to root `package.json`:
```json
{
  "scripts": {
    "build:demo-data": "tsx scripts/export-demo-data.ts",
    "build:web:pages": "npm run build -w @escapemint/web"
  }
}
```

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `packages/web/src/storage/index.ts` | Storage module exports |
| `packages/web/src/storage/local-store.ts` | localStorage implementation |
| `packages/web/src/storage/data-transforms.ts` | Entry conversion functions |
| `packages/web/src/storage/demo-data.ts` | Bundled demo fund data (generated) |
| `packages/web/src/api/adapter.ts` | API abstraction layer |
| `packages/web/src/api/local-funds.ts` | Local storage API implementation |
| `packages/web/src/context/ApiContext.tsx` | React context for API access |
| `packages/web/src/components/DataManagement.tsx` | Import/Export UI |
| `scripts/export-demo-data.ts` | Demo data build script |
| `.github/workflows/deploy-pages.yml` | GitHub Actions workflow |

### Modified Files

| File | Changes |
|------|---------|
| `packages/web/src/api/funds.ts` | Refactor to implement FundApi interface |
| `packages/web/vite.config.ts` | Add base path config for Pages |
| `packages/web/src/App.tsx` | Wrap with ApiProvider |
| `packages/web/src/pages/*.tsx` | Use `useApi()` instead of direct imports |
| `package.json` (root) | Add build scripts |

## Migration Path

### For Existing Users

1. Local data mode is independent of server mode
2. Users can export data from server version and import to Pages version
3. Export format is compatible between versions

### For New Users

1. GitHub Pages version shows demo data by default
2. "Clear Data" option removes demo data
3. "Import" allows loading real data

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| localStorage size limits (~5-10MB) | Warn users when approaching limits; suggest export |
| Browser storage can be cleared | Prominent "Export" reminder; auto-backup prompt |
| Engine bundle size | Already small (~50KB gzipped); tree-shaking enabled |
| Demo data staleness | Regenerate on each release |

## Testing Strategy

1. **Unit Tests:** Extend engine tests to cover browser usage
2. **Integration Tests:** Test local storage API implementation
3. **E2E Tests:** Create separate Playwright config for static deployment
4. **Manual Testing:** Test on GitHub Pages preview before merge

## Implementation Order

1. **Phase 1:** Browser storage layer (2-3 days)
   - Port data transforms
   - Implement localStorage store

2. **Phase 2:** Bundle demo data (1 day)
   - Create export script
   - Generate demo-data.ts

3. **Phase 3:** Dual-mode API (2-3 days)
   - Create API abstraction
   - Implement local API with engine calls
   - Update all components to use context

4. **Phase 4:** Environment config (1 day)
   - Set up env variables
   - Configure Vite build

5. **Phase 5:** Import/Export UI (1 day)
   - Add export button
   - Add import dialog
   - Add demo data reset

6. **Phase 6:** GitHub Pages deployment (1 day)
   - Create workflow
   - Test deployment
   - Update docs

## Success Criteria

- [ ] Static build runs without server errors
- [ ] Demo data loads on first visit
- [ ] All recommendations compute correctly in browser
- [ ] Data persists across page reloads
- [ ] Export produces valid JSON
- [ ] Import restores all data
- [ ] GitHub Pages deployment is live and functional
- [ ] All E2E tests pass on static deployment

## Future Enhancements

1. **Service Worker:** Offline support with cached bundle
2. **IndexedDB:** Larger storage capacity for heavy users
3. **Cloud Sync:** Optional sync to user's cloud storage (Google Drive, Dropbox)
4. **PWA:** Installable app with offline capability
