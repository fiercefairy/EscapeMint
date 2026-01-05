# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-01-05

### New Features
- Created centralized API utilities (`fetchJson`, `postJson`, `putJson`, `deleteResource`) reducing ~300 lines of duplicate code
- Created EventSource streaming helper (`createEventStream`) for SSE handling
- Created server calculation utilities (`calculateStartInputWithLiquidation`, `sortEntriesByDate`)
- Added `HOLD` action type to Recommendation interface

### Improvements
- DRY/YAGNI audit reducing ~1,000 lines of duplicate/unused code
- Removed unused SubFund feature (5 files, ~400 lines)
- Removed Cash APY settings from UI (interest is tracked directly via entries)
- Fixed E2E tests to properly respect `manage_cash=true` on trading funds
- Fixed TypeScript declaration emit for Express routers
- Added explicit type annotations for better type safety

## [0.4.0] - Previous Release

- Platform cash tracking system
- Fund management improvements
