# Unreleased Changes

## Added

- Dependabot grouping for React ecosystem (`react`, `react-dom`, `@types/react`, `@types/react-dom`) and Vitest ecosystem (`vitest`, `@vitest/*`) to prevent version mismatches
- Dependabot coverage for `pages/` directory (has its own `package-lock.json` outside workspace)
- Peer dependency check (`npm ls`) in CI to catch version mismatches before merge
- `.nvmrc` pinned to Node 20 (matching CI and `engines` constraint)

## Changed

- Version bumps and changelog finalization now happen only during `/release`, not on every commit
- `/cam` appends to `.changelogs/NEXT.md` instead of creating per-version changelog files
- Consolidated unreleased changelogs (v0.42.18-21) into `NEXT.md` and reset version to v0.42.17
- Removed project-level `/pr` and `/gitup` commands (redundant with global `/release` and standard git)
- Pages CI workflow uses `npm ci` instead of `npm install` for reproducible builds

## Fixed

- Aggregate projected annual return now uses portfolio-level time-weighted realized APY instead of summing individually-compounded per-fund projections (short-duration funds with modest returns were getting exponentially inflated APYs)
- Dashboard cache projected return uses same portfolio-level formula for consistency
- React 19/ReactDOM 18 version mismatch: pinned both to `^18.3.1` with `@types/react@^18.3.18`
- `@vitest/coverage-v8` aligned with vitest 4.x across all packages
- Dashboard table shows actual fund size (`latestFundSize`) instead of static config value (`config.fund_size_usd`)
- Aggregate API now uses `fundSize` from `computeFundFinalMetrics()` instead of config override

## Removed
