# Technology Stack

**Analysis Date:** 2026-02-28

## Languages

**Primary:**
- TypeScript 5.7.2 - Used across all packages with strict mode enabled (strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true)

**Secondary:**
- JavaScript (Node.js) - Node configuration and build scripts
- CSS - Tailwind CSS for styling

## Runtime

**Environment:**
- Node.js 20.0.0 or higher (specified in `package.json` engines.node)

**Package Manager:**
- npm (monorepo with workspaces)
- Lockfile: pnpm style lock present (found .pnpm directory in node_modules)

## Frameworks

**Core:**
- Express 4.21.2 - RESTful API server in `packages/server/src/index.ts`
- React 18.3.1 - Frontend UI framework
- Vite 6.0.6 - Build tool and dev server for web and pages packages

**Testing:**
- Vitest 2.1.8 - Unit test runner for all packages
- Playwright 1.57.0 (also 1.49.0 in server) - E2E testing with single worker configuration

**Build/Dev:**
- TypeScript Compiler (tsc) 5.7.2 - Type checking and transpilation
- tsx 4.19.2 - TypeScript execution for development
- PM2 5.4.3 - Process manager for running dev servers (API, Web, Browser, Pages)

## Key Dependencies

**Critical:**
- @escapemint/engine - Internal package with zero dependencies (pure calculation functions)
- @escapemint/storage - Internal package with file locking via proper-lockfile
- @escapemint/web - Internal package with UI components
- proper-lockfile 4.1.2 - File locking for concurrent TSV file access in storage layer
- uuid 11.0.4 - Fund ID generation

**Infrastructure:**
- cors 2.8.5 - CORS middleware for Express API
- ws 8.19.0 - WebSocket support for real-time updates
- archiver 7.0.1 - Backup file compression (ZIP format)
- unzipper 0.12.3 - Backup file extraction
- playwright 1.49.0 - Browser automation and CDP connection for Robinhood scraping
- chromium (via playwright) - Browser engine for import automation via CDP

**Frontend:**
- react-router-dom 7.1.1 - Client-side routing
- recharts 2.15.0 - Chart visualization library
- d3 7.9.0 - Data-driven document manipulation (manual chunking in build)
- sonner 1.7.2 - Toast notifications (replaces window.alert)
- react-dom 18.3.1 - React DOM rendering

**Data Processing:**
- zod 3.24.1 - Schema validation
- pdf-parse 2.4.5 - PDF document parsing (root dependency)
- xlsx 0.18.5 - Excel file parsing (dev dependency, used in browser environment)

## Configuration

**Environment:**
- Node environment set via process.env.NODE_ENV (development/production)
- CDP_PORT: 5549 (Chrome DevTools Protocol for browser automation)
- PORT: 5551 (Express API server)
- DATA_DIR: ./data (fund data location, overridable via env)
- BROWSER_USER_DATA_DIR: ./.browser (Chrome user profile for CDP)

**Build:**
- tsconfig.json - Base TypeScript configuration extending tsconfig.base.json
- tsconfig.base.json - Target ES2022, ESNext modules, strict mode enabled
- .prettierrc - Formatting: no semicolons, single quotes, 100 char line width, 2-space tabs
- eslint.config.js - ESLint 9.17.0 with typescript-eslint, React plugin, React Hooks plugin
- ecosystem.config.cjs - PM2 configuration with port definitions as single source of truth
- vite.config.ts (packages/web) - React plugin, path aliases, D3/React vendor split in build
- playwright.config.ts - Chromium only, single worker, sequential execution, 15-30s timeouts

**Package Versions:**
- @vitejs/plugin-react 4.3.4 - Vite React plugin with Fast Refresh
- @types/node 22.0.0 - Node.js type definitions
- tailwindcss 3.4.17 - Utility CSS framework
- autoprefixer 10.4.20 - PostCSS plugin for vendor prefixes
- postcss 8.4.49 - CSS transformation
- jsdom 27.4.0 - DOM implementation for testing

## Platform Requirements

**Development:**
- Node.js 20+
- Chrome/Chromium for browser automation and E2E tests
- 50MB+ JSON request body support (configured in Express middleware)

**Production:**
- Node.js 20+
- Chrome/Chromium available at system level for Robinhood scraping via CDP
- Directory for `data/funds/` TSV and JSON files
- `.browser/` directory for Chrome user profile

---

*Stack analysis: 2026-02-28*
