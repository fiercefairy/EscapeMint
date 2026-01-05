# EscapeMint

A local-first, open-source capital allocation engine for rules-based fund management.

## Overview

EscapeMint helps you manage investments across multiple accounts (Robinhood, Coinbase, M1, etc.) using deterministic, rules-based DCA (Dollar Cost Averaging) logic. It advises buy/sell actions based on your target growth expectations, automatically adjusting DCA amounts based on asset performance.

## Features

- **Multi-Account Support**: Track multiple sub-funds with individual configurations
- **Tiered DCA**: Automatically buy more when assets are down, less when on-target
- **Accumulate Mode**: Choose to reinvest profits or liquidate when above target
- **Cash Interest Tracking**: Track interest earned on idle cash
- **Transparent & Auditable**: All data stored as plain TSV files you can inspect
- **Local-First**: Runs entirely on your machine, no cloud dependencies
- **No External Data**: Manual equity snapshots, no brokerage API required

## Quick Start

### Prerequisites

- Node.js 20+ ([download](https://nodejs.org/))

### Installation

```bash
# Clone the repository
git clone https://github.com/atomantic/escapemint.git
cd escapemint

# Install dependencies, build packages, and set up data
npm run setup

# Start the development servers
npm run dev
```

The app will be available at:
- **Frontend**: http://localhost:5550
- **API**: http://localhost:5551

Press `Ctrl+C` to exit the logs view. The servers will continue running in the background.

### PM2 Commands

The app uses PM2 for process management with automatic restart on file changes:

```bash
npm run dev          # Start both frontend and API servers
npm run dev:stop     # Stop all servers
npm run dev:restart  # Restart all servers
npm run dev:status   # Check server status
npm run dev:logs     # View logs (Ctrl+C to exit)
npm run stop         # Stop all servers
```

## How It Works

### The Fund Model

Each sub-fund tracks:
1. **Fund Size**: Total capital allocated (cash + invested)
2. **Cash Available**: Uninvested cash earning interest
3. **Start Input**: Total amount invested (sum of buys - sells)
4. **Actual Value**: Current market value of investments

### The DCA Strategy

EscapeMint uses a tiered DCA strategy based on performance:

| Performance | DCA Amount |
|-------------|------------|
| On-track or gaining | `input_min_usd` (smallest amount) |
| Below target | `input_mid_usd` (medium amount) |
| Significant loss (< `max_at_pct`) | `input_max_usd` (largest amount) |

When your investment is performing well above target (by `min_profit_usd`):
- **Accumulate mode (true)**: Sell the DCA amount to take profits
- **Accumulate mode (false)**: Liquidate entire position back to cash

### Example Workflow

```
Day 0:  Create fund "Robinhood:TQQQ" - $10,000 fund size
        Config: min=$100, mid=$150, max=$200, target=30% APY
        Cash: $10,000 | Invested: $0

Day 1:  Initial BUY $100
        Cash: $9,900 | Invested: $100 | Value: $100

Day 8:  Enter snapshot - TQQQ value is $95 (-5% loss)
        Since loss is small, use mid amount
        Recommendation: BUY $150

Day 8:  Execute BUY $149.99 (actual execution)
        Cash: $9,750 | Invested: $250 | Value: $245

Day 15: Enter snapshot - TQQQ value is $180 (-26% loss)
        Loss exceeds -25% threshold, use max amount
        Recommendation: BUY $200
```

## Configuration

Each sub-fund is configured with:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `fund_size_usd` | Total capital in the fund | `10000` |
| `target_apy` | Target annual growth rate | `0.30` (30%) |
| `interval_days` | Days between actions | `7` (weekly) |
| `input_min_usd` | DCA when on-target | `100` |
| `input_mid_usd` | DCA when below target | `150` |
| `input_max_usd` | DCA when significant loss | `200` |
| `max_at_pct` | Loss threshold for max DCA | `-0.25` (-25%) |
| `min_profit_usd` | Profit threshold to sell | `100` |
| `cash_apy` | Interest on idle cash | `0.044` (4.4%) |
| `margin_apr` | Margin interest rate | `0.0725` (7.25%) |
| `accumulate` | Reinvest or liquidate profits | `true` |
| `start_date` | When tracking begins | `2024-01-01` |

## Project Structure

```
escapemint/
├── packages/
│   ├── engine/     # Pure calculation functions
│   ├── storage/    # TSV persistence layer (fund-store)
│   ├── server/     # Express API (port 5551)
│   └── web/        # React frontend (port 5550)
├── data/
│   └── funds/      # Your fund files (gitignored)
├── data.example/
│   └── funds/      # Sample fund files
├── ecosystem.config.cjs  # PM2 configuration
└── package.json
```

## Scripts

```bash
npm run setup        # Install deps + initialize data
npm run dev          # Start development servers (PM2)
npm run dev:stop     # Stop development servers
npm run build        # Build all packages
npm run test         # Run all tests
npm run lint         # Lint code
npm run typecheck    # Type check
```

## Data Storage

Each fund is stored as a single TSV file in `./data/funds/`:

```
data/
└── funds/
    ├── robinhood-tqqq.tsv
    ├── coinbase-btc.tsv
    └── m1-vti.tsv
```

Each file contains:
- **Line 1**: Config header (fund size, target APY, DCA amounts, etc.)
- **Line 2**: Column headers
- **Line 3+**: Time-series entries (date, value, action, amount, notes)

Example file:
```
#fund_size:10000	target_apy:0.30	interval_days:7	input_min:100	...
date	value	action	amount	dividend	expense	fund_size	notes
2024-01-01	100	BUY	100				Initial DCA
2024-01-08	205	BUY	100				Week 1 - TQQQ up
```

## Calculation Method

**Expected Target Value** uses periodic compounding on each purchase:

```
ExpectedGain = Σ(Trade_i × ((1 + APY)^(Days_i / 365) - 1))
ExpectedTarget = StartInput + ExpectedGain
```

**Actual Gain**:
```
GainUSD = ActualValue - StartInput
GainPct = (ActualValue / StartInput) - 1
```

**Target Difference** (determines if above/below target):
```
TargetDiff = ActualValue - ExpectedTarget
```

## Security & Privacy

- **Local-only**: No network calls except localhost
- **No telemetry**: Zero analytics or tracking
- **You own your data**: Plain-text TSV files, fully portable

## Development

### Building from Source

```bash
npm run build        # Build all packages
npm run build:web    # Build frontend only
npm run build:server # Build API only
```

### Running Tests

```bash
npm run test         # Run all tests
npm run test:engine  # Test calculation engine only
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss proposed changes.
