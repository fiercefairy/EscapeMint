# EscapeMint - GitHub Repository Plan

A local-first, open-source capital allocation engine for rules-based fund management.

---

## 1. High-Level Product Spec

### User Stories (v1)

1. **Portfolio Setup**: As a user, I can create a portfolio with multiple sub-funds (Robinhood, Coinbase, M1, etc.)
2. **Sub-Fund Configuration**: As a user, I can configure each sub-fund with target APY, action amount, period, and start date
3. **Snapshot Entry**: As a user, I can enter equity snapshots (date, value) for any sub-fund at any time
4. **Action Recommendations**: As a user, I see buy/sell/hold recommendations based on deviation from expected growth
5. **Action Tracking**: As a user, I can record my actual action (which may differ from recommendation) with a reason
6. **Cash Flow Tracking**: As a user, I can log deposits, withdrawals, dividends, and fees separately from equity snapshots
7. **Audit Trail**: As a user, I can view complete history of snapshots, recommendations, and actions
8. **Export/Import**: As a user, I can export all data and import it on another machine

### Non-Goals (v1)

- No brokerage API integrations
- No live market data or price feeds
- No automated trade execution
- No Coinbase derivatives logic
- No M1 margin borrowing logic
- No multi-user or authentication
- No cloud sync or remote storage

### Roadmap

| Version | Focus |
|---------|-------|
| v1.0 | Core engine, TSV storage, basic UI, single portfolio |
| v1.1 | Charts, improved audit trail, tolerance bands |
| v2.0 | Strategy plugins, per-holding allocation, advanced analytics |

---

## 2. System Architecture

```
+---------------------------------------------------------------------+
|                         Browser (React)                              |
|  +-----------+ +-----------+ +-----------+ +----------+             |
|  | Dashboard | |   Fund    | |  Entry    | |  Audit   |             |
|  |   Screen  | |  Config   | |   Form    | |  Trail   |             |
|  +-----------+ +-----------+ +-----------+ +----------+             |
+---------------------------+-----------------------------------------+
                            | HTTP (localhost:3301)
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

---

## 3. Data Model (Separated TSV + JSON)

### Overview
Each fund has two files:
- **TSV file**: Time-series entries (pure data)
- **JSON file**: Configuration (fund settings, UI preferences)

### Directory Structure
```
data/
└── funds/
    ├── robinhood-tqqq.tsv   # Data entries
    ├── robinhood-tqqq.json  # Config
    ├── coinbase-btc.tsv
    ├── coinbase-btc.json
    └── ...
```

### TSV File Format (Data Only)

**Line 1 - Column Headers**:
```
date	value	action	amount	dividend	expense	cash_interest	fund_size	margin_borrowed	notes
```

**Line 2+ - Time Series Entries**:
```
2024-01-01	100	BUY	100						Initial DCA
2024-01-08	205	BUY	100						Week 1 - TQQQ up
2024-01-15	295	DEPOSIT	500						Added funds
```

### JSON Config File Format
```json
{
  "fund_size_usd": 10000,
  "target_apy": 0.30,
  "interval_days": 7,
  "input_min_usd": 100,
  "input_mid_usd": 150,
  "input_max_usd": 200,
  "max_at_pct": -0.25,
  "min_profit_usd": 100,
  "cash_apy": 0.044,
  "margin_apr": 0.0725,
  "margin_access_usd": 0,
  "accumulate": true,
  "start_date": "2024-01-01",
  "chart_bounds": { ... },
  "entries_column_order": ["date", "equity", "cash", ...],
  "entries_visible_columns": ["date", "equity", "action", ...]
}
```

### Config Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `fund_size` | Total capital allocated | `10000` |
| `target_apy` | Target annual return | `0.30` (30%) |
| `interval_days` | Trading interval | `7` (weekly) |
| `input_min` | DCA when on-target | `100` |
| `input_mid` | DCA when below target | `150` |
| `input_max` | DCA when significant loss | `200` |
| `max_at_pct` | Threshold for max DCA | `-0.25` (-25%) |
| `min_profit` | Profit threshold to sell | `100` |
| `cash_apy` | Interest on idle cash | `0.044` (4.4%) |
| `margin_apr` | Margin interest rate | `0.0725` (7.25%) |
| `accumulate` | Reinvest or liquidate | `true` |
| `start_date` | Tracking start date | `2024-01-01` |

### Entry Columns

| Column | Description |
|--------|-------------|
| `date` | Entry date (YYYY-MM-DD) |
| `value` | Current equity value |
| `action` | `BUY`, `SELL`, `DEPOSIT`, or `WITHDRAW` |
| `amount` | Trade/transfer amount |
| `dividend` | Dividend received |
| `expense` | Fee/expense paid |
| `cash_interest` | Interest earned on idle cash |
| `fund_size` | Fund size (manual override) |
| `margin_borrowed` | Margin amount borrowed |
| `notes` | Optional notes |

### Action Types

| Action | Effect |
|--------|--------|
| `BUY` | Purchase equity, decreases cash |
| `SELL` | Sell equity, increases cash |
| `DEPOSIT` | Add funds to the account, increases fund_size |
| `WITHDRAW` | Remove funds from account, decreases fund_size |

### Dynamic Fund Size Calculation
Fund size is calculated automatically unless manually overridden:
```
fund_size = initial_fund_size + deposits - withdrawals + dividends + cash_interest - expenses
```

---

## 4. Calculation Engine

### Core Concepts

**Start Input (Total Invested)**: Sum of all buy trades minus sell trades
```
StartInput = Σ(BuyAmount) - Σ(SellAmount)
```

**Expected Target Value**: Based on compounding from each investment
```
ExpectedGain = Σ(Trade_i * ((1 + TargetAPY)^(DaysElapsed_i / 365) - 1))
ExpectedTarget = StartInput + ExpectedGain
```

**Actual Gain**: Current market value vs total invested
```
GainUSD = ActualValue - StartInput
GainPct = (ActualValue / StartInput) - 1
```

**Target Difference**: How far above/below expected
```
TargetDiff = ActualValue - ExpectedTarget
```

### Decision Logic (from spreadsheet)

**Determining Action Amount (Limit):**
```
If GainUSD < 0:                       // Lost money this period
    If GainPct < MaxAtPct:            // Loss exceeds threshold (e.g., -25%)
        Limit = InputMax              // Buy max amount
    Else:
        Limit = InputMid              // Buy mid amount
Else:                                 // Made money or break-even
    Limit = InputMin                  // Buy min amount
```

**Determining Action Type:**
```
If TargetDiff > MinProfit:            // Above target by profit threshold
    If Accumulate:
        Action = SELL, Amount = Limit // Sell the limit amount
    Else:
        Action = SELL, Amount = All   // Sell everything
Else If CashAvailable < Limit:
    If MarginAvailable > 0:
        Action = BUY, Amount = min(Limit, MarginAvailable)
    Else:
        Action = BUY, Amount = CashAvailable  // Buy what we can
Else:
    Action = BUY, Amount = Limit      // Normal DCA buy
```

### Cash Tracking

**Cash Available**: Fund size minus invested, plus deposits/withdrawals
```
CashAvailable = FundSize - StartInput + Σ(Deposits) - Σ(Withdrawals)
```

**Cash Interest**: Interest earned on idle cash between periods
```
CashInterest = CashAvailable * ((1 + CashAPY)^(DaysElapsed/365) - 1)
```

### Realized Gains

**Realized Gain** accumulates:
- Cash interest earned
- Dividends received
- Expenses paid (negative)
- Profits from sells (when selling above cost basis)

---

## 5. API Endpoints

Base URL: `http://localhost:3301/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /funds | List all funds with summary |
| POST | /funds | Create a new fund |
| GET | /funds/:id | Get fund with all entries |
| PUT | /funds/:id | Update fund config |
| DELETE | /funds/:id | Delete a fund |
| GET | /funds/:id/state | Get computed state and recommendation |
| POST | /funds/:id/entries | Add an entry (snapshot + action) |
| POST | /compute/recommendation | Dry-run computation |
| GET | /api/health | Health check |

---

## 6. Milestones

- [x] M0: Project setup (monorepo, TypeScript, ESLint, PM2)
- [x] M1: Engine + Storage layer (fund-store, calculations)
- [x] M2: API routes (funds CRUD, state, entries, export/import)
- [x] M3: React UI (dashboard, fund view, entry form, audit trail, settings)
- [x] M4: Polish + Build fixes
- [x] M5: Storage refactor (separate TSV/JSON), DEPOSIT/WITHDRAW actions, column reordering

---

## 7. Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, TypeScript
- **Storage**: TSV files (data) + JSON files (config) with atomic writes
- **Testing**: Vitest
- **CI**: GitHub Actions
