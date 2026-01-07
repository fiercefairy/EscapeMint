# EscapeMint Documentation

Welcome to the EscapeMint documentation. This guide explains how the rules-based investment system works.

## Table of Contents

1. [Investment Strategy](./investment-strategy.md) - The DCA in/out methodology
2. [Fund Management](./fund-management.md) - How funds track positions and cash
3. [Configuration Guide](./configuration.md) - All configuration options explained
4. [Data Format](./data-format.md) - TSV file structure and entry types
5. [System Architecture](./architecture.md) - Package structure and data flow
6. [Derivatives](./derivatives.md) - Perpetual futures data model

## Quick Overview

EscapeMint is a **rules-based capital allocation engine** that helps you manage investments using a systematic approach:

- **Buy low, sell high** - Automatically adjusts purchase amounts based on performance
- **No emotions** - Deterministic rules remove emotional decision-making
- **Transparent** - All data stored in plain text files you can audit
- **Local-first** - Runs on your machine with no cloud dependencies

### The Core Idea

Instead of trying to time the market, EscapeMint uses a **tiered DCA (Dollar Cost Averaging)** strategy:

```
When asset is DOWN  → Buy MORE (accumulate at lower prices)
When asset is UP    → Buy LESS or SELL (take profits)
```

This creates a natural "buy low, sell high" behavior without requiring market predictions.

### How It Works

1. **Set a target growth rate** (e.g., 25% APY)
2. **Configure DCA amounts** (min, mid, max)
3. **Enter snapshots** of your portfolio value
4. **Get recommendations** for BUY/SELL/HOLD actions
5. **Execute trades** and record them

The system tracks your expected value (what you'd have at target APY) vs actual value, then recommends actions to optimize returns.

## Getting Started

See the main [README.md](../README.md) for installation instructions.
