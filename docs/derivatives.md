# Derivatives Data Model

EscapeMint supports perpetual futures tracking through the `derivatives` fund type. This document describes the data model specific to derivatives funds.

## Overview

Derivatives funds differ from stock/crypto funds in several key ways:

- **No traditional equity** - Value is based on margin + unrealized P&L
- **Contracts instead of shares** - Positions measured in contract count
- **FIFO cost basis** - Realized P&L calculated using first-in-first-out
- **Funding payments** - Periodic payments received or paid
- **Margin tracking** - Separate from position value

## Entry Actions

| Action | Description | Fields Used |
|--------|-------------|-------------|
| `DEPOSIT` | Add margin/collateral | `amount` (USD deposited) |
| `WITHDRAW` | Remove margin/collateral | `amount` (USD withdrawn) |
| `BUY` | Buy contracts (go long / close short) | `contracts`, `price`, `amount` |
| `SELL` | Sell contracts (go short / close long) | `contracts`, `price`, `amount` |
| `FUNDING` | Funding payment (+ or -) | `amount` (funding received/paid) |
| `INTEREST` | USDC interest earned | `amount` (interest credited) |
| `REBATE` | Trading rebate | `amount` (rebate credited) |
| `FEE` | Trading fee | `amount` (fee paid) |

## Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Entry date (YYYY-MM-DD) |
| `action` | string | One of the actions above |
| `contracts` | number | Contract count for trades (+ = long, - = short) |
| `price` | number | Price per contract for trades |
| `amount` | number | USD amount for deposits/withdrawals/funding/interest/rebates/fees |
| `fee` | number | Trading fee for BUY/SELL actions (optional) |
| `margin` | number | Actual margin locked for BUY trades (optional, see Margin Tracking) |
| `notes` | string | Optional notes |

## TSV Example

```tsv
date	action	amount	contracts	price	fee	margin	notes
2025-09-14	DEPOSIT	100000					Initial margin deposit
2025-09-14	BUY	1158.25	1	115825	0.83	282.50	First contract
2025-09-15	FUNDING	-0.03					Daily funding
2025-09-18	INTEREST	87.76					USDC interest
2025-09-19	BUY	11593	10	115930	8.30	2830.00	Add to position
2025-10-01	SELL	5796.50	5	115930	4.15		Partial close
```

## Calculated Fields

These fields are computed at runtime, not stored in the TSV:

| Field | Calculation | Description |
|-------|-------------|-------------|
| `margin_balance` | deposits - withdrawals + funding + interest + rebates - fees + realized_pnl | Available margin/cash |
| `position` | Running sum of contracts | Net contract position |
| `avg_entry` | FIFO weighted average | Average entry price for open position |
| `unrealized_pnl` | `(mark_price - avg_entry) × position × multiplier` | Open P&L |
| `realized_pnl` | Running sum of closed trade P&L | Closed P&L |
| `cum_funding` | Running sum of FUNDING amounts | Total funding payments |
| `cum_interest` | Running sum of INTEREST amounts | Total interest earned |
| `cum_fees` | Running sum of FEE amounts and per-trade fees | Total trading fees |
| `equity` | `margin_balance + unrealized_pnl` | Total account value |
| `margin_locked` | Sum of `margin` in open cost basis lots | Actual margin locked in positions |
| `leverage` | `notional_value / equity` | Dynamic leverage ratio |
| `available_funds` | `margin_balance - margin_locked` | Free margin for new trades |

## P&L Calculations

### Unrealized P&L

```
unrealized_pnl = (mark_price - avg_entry) × position × contract_multiplier

Example (BTC perpetuals with 0.01 BTC multiplier):
- Long 100 contracts at $95,000, mark price $100,000
- unrealized_pnl = ($100,000 - $95,000) × 100 × 0.01 = $5,000
```

### Realized P&L (FIFO)

When closing a position, realized P&L is calculated using FIFO (First-In-First-Out):

```
realized_pnl = (exit_price - entry_price) × contracts_closed × contract_multiplier

For partial closes, FIFO determines which lots are closed first.
```

### Equity

```
equity = margin_balance + unrealized_pnl
       = (deposits - withdrawals + funding + interest + rebates + realized_pnl) + unrealized_pnl
```

## Margin Tracking

Coinbase (and similar exchanges) use dynamic leverage, not fixed leverage. The `margin` field allows tracking the actual margin locked per trade for accurate "available funds" calculations.

### Why Track Per-Trade Margin?

On Coinbase Advanced Trade:
- **Leverage is dynamic**: `leverage = notional_value / equity`
- **Leverage changes with**: BTC price, unrealized P&L, collateral changes
- **Margin required is fixed at entry**: The margin locked when opening a position stays constant

The default calculation uses 20% of notional value, but actual margin varies based on exchange risk rules.

### How It Works

1. **BUY Entry**: Record `margin` as the actual margin required (from trade confirmation)
2. **FIFO Tracking**: Each lot in the cost basis queue tracks its own margin
3. **SELL Entry**: Margin is released proportionally via FIFO matching
4. **Fallback**: If `margin` is not specified, calculates as `amount × 0.20`

### Example

```
BTC price: $90,100
1 contract = 0.01 BTC
Notional value: $901
Leverage: ~4.1x
Actual margin required: $223.14  <-- Record this in `margin` field
```

Without the `margin` field, the system would calculate `$901 × 0.20 = $180.20`, which is less than actual.

### Display

The UI shows:
- **Margin Locked**: Total actual margin in open positions (sum from FIFO queue)
- **Leverage**: Dynamic ratio (notional / equity), color-coded for risk
- **Available Funds**: `margin_balance - margin_locked` (actual free cash)

## Configuration

Derivatives funds use specific configuration options:

```json
{
  "fund_type": "derivatives",
  "initial_margin_rate": 0.20,
  "maintenance_margin_rate": 0.05,
  "contract_multiplier": 0.01,
  "margin_enabled": true,
  "accumulate": false
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `initial_margin_rate` | 0.20 | Initial margin requirement (20%) |
| `maintenance_margin_rate` | 0.05 | Maintenance margin requirement (5%) |
| `contract_multiplier` | 0.01 | BTC per contract (0.01 for Coinbase) |

## UI Display

The derivatives fund detail page shows specialized information:

### Summary Cards
- **Position**: Net contracts, average entry price
- **Margin**: Available margin, margin used
- **P&L**: Unrealized, Realized, Total
- **Funding**: Cumulative funding (profit - loss)
- **Interest**: Cumulative USDC interest
- **Liquidation**: Estimated liquidation price

### Entries Table Columns
- Date, Action, Amount, Contracts, Price
- Position (running), Avg Entry (running)
- Margin (running), Unrealized, Realized
- Equity, Funding (cumulative), Interest (cumulative)

## API Integration

Derivatives funds integrate with the Coinbase API for live data:

- **Positions**: Fetch current contract positions
- **Portfolio**: Margin and equity summary
- **Fills**: Trade history for FIFO calculations
- **Funding**: Funding payment history
- **Price**: Current mark price

API keys are stored securely in macOS Keychain. All operations are read-only.
