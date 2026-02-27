# GOALS.md

The north star for EscapeMint: what we're building, why, and what success looks like.

---

## Mission

**Escape the rat race. Mint your financial freedom.**

EscapeMint exists to give individuals a transparent, emotionless, rules-based system for building long-term wealth through systematic dollar cost averaging. It is a retirement system, not a trading platform.

---

## Core Tenets

These are non-negotiable principles that guide every decision:

1. **Local-first** - Your financial data never leaves your machine. No cloud, no telemetry, no third-party dependencies.
2. **Emotion-free** - The system makes recommendations based on rules and math, not fear or greed.
3. **Transparent** - All data is plain-text TSV files you can inspect, edit, and version control.
4. **Long only** - We never short. We only bet on assets going up over time.
5. **Forever assets** - Only hold what survives economic catastrophe (indexes, BTC).
6. **Simple by default** - The system should be usable by someone who doesn't understand finance beyond "buy low, sell high."

---

## v1.0 - Stable Release

The milestone where EscapeMint is reliable enough for anyone to use confidently.

### Engine Completeness
- [ ] All fund types (stock, crypto, cash, derivatives) fully tested and documented
- [ ] TWAP-based APY calculation is accurate across all edge cases (multi-cycle, idle gaps, partial liquidation)
- [ ] Recommendation engine handles every combination of fund config flags correctly
- [ ] Tax lot tracking (FIFO) for cost basis and realized gains

### Data Integrity
- [ ] Server route unit tests for all API endpoints
- [ ] Aggregate calculation tests
- [ ] Visual regression tests for charts
- [ ] 95%+ feature coverage in E2E suite

### UX Polish
- [ ] Configurable entry form fields (per-fund field visibility and ordering)
- [ ] Chart date range selector (1M, 3M, 6M, YTD, 1Y, All)
- [ ] Price/size charts when tracking share-level data
- [ ] Keyboard shortcuts (j/k navigation, Enter to open, Esc to close)
- [ ] Mobile-responsive layout

### Documentation
- [ ] Getting Started guide for new users
- [ ] Ticker Choices guide (why TQQQ over VTI for DCA)
- [ ] API reference (OpenAPI/Swagger)
- [ ] Complete configuration reference with examples

---

## v2.0 - Strategy Plugins & Advanced Analytics

### Strategy Layer
- [ ] Plugin system for custom DCA strategies beyond tiered min/mid/max
- [ ] Per-holding allocation within a fund (pie-style)
- [ ] Benchmark comparison (vs SPY, BTC, custom benchmark)
- [ ] Goal setting with target dates and amounts

### Analytics
- [ ] Performance attribution (break down gains by dividends, price appreciation, interest)
- [ ] Comparison mode (side-by-side fund analysis)
- [ ] Drawdown analysis and recovery time tracking
- [ ] Portfolio correlation matrix

### Data & Integration
- [ ] Currency support for non-USD funds with exchange rate conversion
- [ ] Multi-account aggregation (same ticker across platforms as single view)
- [ ] Split handling (adjust historical prices/shares automatically)
- [ ] CSV/PDF export for tax reporting

---

## Long-Term Vision

### The Money Tree Network
The ultimate success state: a user has multiple funds in harvest mode, each yielding regular cash flow. Mature funds seed new funds. The portfolio becomes self-sustaining. Financial independence is achieved without speculation, stress, or sleepless nights.

### PWA / Offline
- [ ] Service worker for full offline access
- [ ] Installable as a desktop/mobile app
- [ ] Background sync when connectivity returns

### Community
- [ ] Shareable fund configurations (anonymized strategy templates)
- [ ] Backtesting engine with historical data for strategy validation before committing real capital
- [ ] Public backtest page with onboarding wizard (already started in `pages/`)

---

## Non-Goals

Things EscapeMint will **never** be:

- **A brokerage** - We don't execute trades. We advise; you execute.
- **A data aggregator** - No brokerage API integrations that could break or leak credentials.
- **A social platform** - No leaderboards, no sharing portfolios, no gamification.
- **A day trading tool** - No intraday data, no real-time feeds, no order books.
- **SaaS** - No hosted version, no subscriptions, no accounts. Run it yourself, own your data.
