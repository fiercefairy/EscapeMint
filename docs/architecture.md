# System Architecture

EscapeMint is organized as a monorepo with four packages that follow a clear separation of concerns.

## Overview Diagram

```
+---------------------------------------------------------------------+
|                         Browser (React)                              |
|  +-----------+ +-----------+ +-----------+ +----------+             |
|  | Dashboard | |   Fund    | |  Entry    | |  Audit   |             |
|  |   Screen  | |  Config   | |   Form    | |  Trail   |             |
|  +-----------+ +-----------+ +-----------+ +----------+             |
+---------------------------+-----------------------------------------+
                            | HTTP (localhost:5551)
+---------------------------+-----------------------------------------+
|                     Node/Express Backend                             |
|  +--------------------------------------------------------------+   |
|  |                   REST API (Funds Router)                     |   |
|  +-----------------------------+--------------------------------+   |
|                                |                                     |
|  +------------+  +-------------+-------+                            |
|  |Calculation |  |   Fund Store       |                            |
|  |  Engine    |  |   (TSV I/O)        |                            |
|  |(pure funcs)|  |                    |                            |
|  +------------+  +-------------+-------+                            |
+--------------------------------+------------------------------------+
                                 |
+--------------------------------+------------------------------------+
|                    ./data/funds/ (TSV Files)                        |
|  robinhood-tqqq.tsv | coinbase-btc.tsv | m1-vti.tsv | ...          |
+---------------------------------------------------------------------+
```

## Package Structure

```
packages/
├── engine/     # Pure calculation functions (zero dependencies)
├── storage/    # TSV file persistence with file locking
├── server/     # Express API (port 5551)
└── web/        # React frontend with Vite (port 5550)
```

### Engine (`@escapemint/engine`)

The calculation engine contains pure functions with zero external dependencies. All business logic for DCA recommendations, expected value calculations, and fund state computation lives here.

**Key files:**
- `types.ts` - Core type definitions (FundType, SubFundConfig, etc.)
- `fund-type-config.ts` - Centralized fund type configuration
- `expected-equity.ts` - Expected target and gain calculations
- `recommendation.ts` - Buy/sell/hold recommendation logic
- `aggregate.ts` - Portfolio-level aggregation
- `derivatives-calculations.ts` - FIFO cost basis, P&L for futures

**Design principles:**
- Pure functions only (no side effects)
- No I/O operations
- Fully testable in isolation

### Storage (`@escapemint/storage`)

The storage layer handles file I/O for fund data stored in TSV format.

**Key files:**
- `fund-store.ts` - CRUD operations for fund files
- Uses `proper-lockfile` for concurrent access safety

**Design principles:**
- Atomic writes to prevent data corruption
- Human-readable TSV format
- Separate TSV (data) and JSON (config) files

### Server (`@escapemint/server`)

Express.js API that orchestrates the engine and storage layers.

**Key directories:**
- `routes/` - API endpoints (funds, platforms, import, derivatives)
- `utils/` - Shared utilities (calculations, keychain, coinbase-api)

**Port:** 5551 (configurable via `ecosystem.config.cjs`)

### Web (`@escapemint/web`)

React frontend built with Vite.

**Key directories:**
- `pages/` - Route components (Dashboard, FundDetail, etc.)
- `components/` - Reusable UI components
- `api/` - API client functions

**Port:** 5550 (configurable via `ecosystem.config.cjs`)

## Data Flow

1. **User action** → React component
2. **API call** → Express route handler
3. **Business logic** → Engine calculation functions
4. **Persistence** → Storage layer writes to TSV files
5. **Response** → JSON returned to frontend

## Port Configuration

All ports are defined in a single source of truth: `ecosystem.config.cjs`

| Service | Port | Description |
|---------|------|-------------|
| Web | 5550 | Vite dev server (React UI) |
| API | 5551 | Express API server |
| CDP | 5549 | Chrome DevTools Protocol (browser automation) |

## Process Management

PM2 manages all development processes:

```bash
npm run dev          # Start all servers
npm run dev:stop     # Stop all servers
npm run dev:restart  # Restart all servers
npm run dev:logs     # View logs
```

Configuration in `ecosystem.config.cjs` handles:
- Auto-restart on file changes
- Environment variable injection
- Browser launcher for scraping features
