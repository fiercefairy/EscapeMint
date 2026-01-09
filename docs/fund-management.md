# Fund Management

This guide explains how EscapeMint tracks and manages funds, including positions, cash, and the different fund types.

## Fund Types

### Trading Funds (Stock/Crypto)

Trading funds hold actual investments (stocks, ETFs, crypto) and receive BUY/SELL recommendations.

```
Platform: Robinhood
Ticker: TQQQ
Type: stock

Tracks:
- Market value of position
- Shares owned
- Cost basis (total invested)
- Dividends received
- Unrealized/realized gains
```

### Cash Funds

Cash funds track idle cash and interest earned. Each platform typically has one cash fund.

```
Platform: Robinhood
Ticker: CASH
Type: cash

Tracks:
- Cash balance
- Interest earned (via entry records)
- Deposits/withdrawals
```

## Key Metrics

### Fund Size

The total capital allocated to a fund (cash + invested value).

```
Fund Size = Cash Available + Current Position Value
```

For a $10,000 fund with $8,000 invested and $2,000 cash:
```
Fund Size: $10,000
Cash: $2,000
Position Value: $8,200 (market fluctuation)
```

### Start Input

Total amount actually invested (sum of all BUYs minus SELLs), accounting for full liquidations.

```
Start Input = Σ(BUY amounts) - Σ(SELL amounts)
```

When a position is fully liquidated (value goes to zero or shares go to zero), the start input resets:
```
Before liquidation: Start Input = $5,000
After full liquidation: Start Input = $0
New BUY: Start Input = $100
```

### Expected Target

What your investment would be worth at your target APY, using periodic compounding for each trade.

```
For each trade:
  Expected Gain = Trade Amount × ((1 + APY)^(Days / 365) - 1)

Expected Target = Start Input + Σ(Expected Gains)
```

Example with 30% APY target:
```
Day 0:   BUY $1,000 → Expected = $1,000
Day 30:  BUY $500   → Expected = $1,000 × 1.021 + $500 = $1,521
Day 60:  Check      → Expected = $1,521 × 1.021 = $1,553
```

### Target Difference

How far above or below target you are:

```
Target Diff = Actual Value - Expected Target

Positive: Above target (consider selling)
Negative: Below target (continue buying)
```

### Gain Metrics

```
Unrealized Gain = Current Value - Start Input
Realized Gain = Total Profit Taken (SELLs - BUYs for closed portions)
Gain % = (Current Value / Start Input) - 1
```

## Cash Management

### With Cash Pool (manage_cash: true)

The fund maintains its own cash reserve. BUY actions draw from this cash, SELL actions add to it.

```
Fund Size: $10,000
┌─────────────────────────────────────────┐
│           Fund Cash Pool                │
│                                         │
│  Cash: $3,000    Position: $7,200       │
│                                         │
│  BUY $500 → Cash: $2,500                │
│  SELL $300 → Cash: $2,800               │
└─────────────────────────────────────────┘
```

### Without Cash Pool (manage_cash: false)

Cash is managed at the platform level via a separate cash fund.

```
Platform: Robinhood
┌────────────────────────────────────────────────────┐
│ Platform Cash Fund (robinhood-cash)                │
│ Balance: $5,000                                    │
└────────────────────────────────────────────────────┘
            │
            ├──── TQQQ Fund (manage_cash: false)
            │     Position: $3,000
            │     Cash: Uses platform cash
            │
            └──── VYM Fund (manage_cash: false)
                  Position: $2,000
                  Cash: Uses platform cash
```

## Entry Types

### BUY

Purchase more of the asset.

```tsv
date        value   action  amount  shares  price
2024-01-15  1050    BUY     100     2.5     40.00
```

- `value`: Position value BEFORE the buy
- `amount`: Dollar amount purchased
- `shares`: Number of shares bought (optional)
- `price`: Price per share (optional)

### SELL

Sell some or all of the position.

```tsv
date        value   action  amount  shares  price
2024-02-01  1200    SELL    200     4       50.00
```

- `value`: Position value BEFORE the sell
- `amount`: Dollar amount sold
- `shares`: Number of shares sold (optional)

### HOLD

No action taken (just recording a snapshot).

```tsv
date        value   action  notes
2024-02-08  1150    HOLD    Market closed, no trade
```

### DEPOSIT

Add cash to the fund (increases fund_size).

```tsv
date        value   action   amount  fund_size
2024-03-01  1150    DEPOSIT  1000    11000
```

### WITHDRAW

Remove cash from the fund (decreases fund_size).

```tsv
date        value    action    amount  fund_size
2024-03-15  1200     WITHDRAW  500     10500
```

## Tracking Dividends and Interest

### Dividends

Recorded on entries when received:

```tsv
date        value   action  dividend
2024-03-15  1200    HOLD    25.50
```

Cumulative dividends are tracked for reporting:
- Add to realized gains
- Optionally reinvest (dividend_reinvest setting)

### Cash Interest

Tracked via `cash_interest` field on entries:

```tsv
date        value   action  cash_interest
2024-03-31  5000    HOLD    18.25
```

Interest is earned on idle cash and tracked cumulatively.

## Shares and Price Tracking

For precise cost basis tracking, record shares and prices:

```tsv
date        value   action  amount  shares    price
2024-01-01  0       BUY     1000    25.0000   40.00
2024-01-15  1050    BUY     500     11.9048   42.00
2024-02-01  1800    SELL    600     14.2857   42.00
```

### Cost Basis Calculation

```
Total Shares = 25 + 11.9048 - 14.2857 = 22.619
Total Cost = $1,500 - $600 = $900 (remaining investment)
Average Cost = $900 / 22.619 = $39.79/share
```

## Fund Lifecycle

### 1. Creation

```
Create fund with initial configuration:
- Fund size (capital allocation)
- Target APY
- DCA amounts
- Other settings
```

### 2. Active Trading

```
While fund is active:
1. Enter current value snapshot
2. Receive BUY/SELL/HOLD recommendation
3. Execute trade (or not)
4. Record entry
5. Repeat at configured interval
```

### 3. Closing a Fund

Set `status: closed` or `fund_size_usd: 0` to close.

Closed funds:
- No longer receive recommendations
- Show final metrics (total return, APY, etc.)
- Remain visible for historical reference

## Multi-Platform Organization

Organize funds by platform with a clear naming convention:

```
data/funds/
├── robinhood-tqqq.tsv      # Robinhood TQQQ position
├── robinhood-vym.tsv       # Robinhood VYM position
├── robinhood-cash.tsv      # Robinhood cash fund
├── coinbase-btc.tsv        # Coinbase Bitcoin
├── coinbase-eth.tsv        # Coinbase Ethereum
├── coinbase-cash.tsv       # Coinbase cash (USDC)
└── m1-conservative.tsv     # M1 Finance pie
```

## Auditing and Verification

### Manual Audit

Mark funds as audited after verifying against brokerage statements:

```json
{
  "audited": "2024-03-15"
}
```

### Reconciliation

Compare EscapeMint totals to actual brokerage values:

```
EscapeMint shows:
- Position value: $5,234.50
- Cash: $1,823.40
- Total: $7,057.90

Brokerage shows:
- Position value: $5,234.50
- Cash: $1,823.40
- Total: $7,057.90

✓ Reconciled
```

Regular reconciliation catches data entry errors and ensures accuracy.
