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

## Milestones

### v1.0 - Stable Release

The milestone where EscapeMint is reliable enough for anyone to use confidently. This means:

- **Engine correctness** - Every fund type (stock, crypto, cash, derivatives) produces accurate APY calculations across all edge cases: multi-cycle positions, idle gaps, partial liquidations. Tax lot tracking (FIFO) provides cost basis and realized gains.
- **Data integrity** - Comprehensive test coverage gives confidence that calculations are correct and regressions are caught. API routes, aggregate calculations, and charts all have dedicated test suites.
- **Frictionless daily use** - Adding an entry takes under 30 seconds. The UI adapts to each fund's needs with configurable fields, focused chart views, and keyboard-driven navigation. Works on mobile.
- **Self-documenting** - A new user can go from zero to tracking their first fund without asking for help. Strategy rationale, configuration options, and API surface are all documented.

### v2.0 - Strategy Plugins & Advanced Analytics

The milestone where EscapeMint becomes a thinking tool, not just a tracking tool:

- **Pluggable strategies** - Users can define custom DCA strategies beyond the built-in tiered min/mid/max approach, and allocate within funds pie-style.
- **Analytical depth** - Performance attribution, drawdown analysis, correlation matrices, and benchmark comparisons help users understand *why* their portfolio behaves the way it does.
- **Data portability** - Multi-currency support, cross-platform aggregation, split handling, and tax-ready exports make EscapeMint the single source of truth regardless of how many brokerages a user touches.

---

## Long-Term Vision

### The Money Tree Network

The ultimate success state: a user has multiple funds in harvest mode, each yielding regular cash flow. Mature funds seed new funds. The portfolio becomes self-sustaining. Financial independence is achieved without speculation, stress, or sleepless nights.

### PWA / Offline

EscapeMint becomes an installable app that works fully offline with background sync — a portable financial cockpit that lives on your device.

### Community

Anonymized strategy templates let users share configurations. A backtesting engine with historical data validates strategies before committing real capital.

---

## Non-Goals

Things EscapeMint will **never** be:

- **A brokerage** - We don't execute trades. We advise; you execute.
- **A data aggregator** - No brokerage API integrations that could break or leak credentials.
- **A social platform** - No leaderboards, no sharing portfolios, no gamification.
- **A day trading tool** - No intraday data, no real-time feeds, no order books.
- **SaaS** - No hosted version, no subscriptions, no accounts. Run it yourself, own your data.

---

For the tactical backlog and current work items, see [PLAN.md](./PLAN.md).
