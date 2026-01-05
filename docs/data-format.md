# Data Format

EscapeMint stores all fund data in TSV (Tab-Separated Values) files with JSON configuration headers. This format is human-readable, version-control friendly, and easy to edit manually.

## File Structure

Each fund file has two parts:

1. **Configuration header** - JSON object with fund settings
2. **Entry data** - TSV table with transaction history

```
{JSON configuration on first line}
date	value	action	amount	shares	price	dividend	cash_interest	fund_size	notes
2024-01-01	0	BUY	1000	25	40.00				Initial purchase
2024-01-15	1050	BUY	100	2.38	42.00				Weekly DCA
```

## Configuration Header

The first line contains a JSON object with fund settings:

```json
{"fund_size_usd":10000,"target_apy":0.25,"interval_days":7,"input_min_usd":100,"input_mid_usd":200,"input_max_usd":500,"max_at_pct":-0.25,"min_profit_usd":100,"accumulate":true,"start_date":"2024-01-01","status":"active","fund_type":"stock"}
```

See [Configuration Guide](./configuration.md) for all available options.

## TSV Columns

### Required Columns

| Column | Type | Description |
|--------|------|-------------|
| `date` | YYYY-MM-DD | Date of the entry |
| `value` | number | Position value BEFORE the action |
| `action` | string | Action type (see below) |

### Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| `amount` | number | Dollar amount for BUY/SELL/DEPOSIT/WITHDRAW |
| `shares` | number | Number of shares for BUY/SELL |
| `price` | number | Price per share for BUY/SELL |
| `dividend` | number | Dividend payment received |
| `cash_interest` | number | Interest earned on cash |
| `fund_size` | number | New fund size after DEPOSIT/WITHDRAW |
| `notes` | string | Free-form notes |

## Action Types

### BUY

Purchase more of the asset.

```tsv
date	value	action	amount	shares	price	notes
2024-01-15	1050	BUY	100	2.38	42.00	Weekly DCA
```

- `value`: Position value BEFORE buying
- `amount`: Dollar amount spent
- `shares`: Number of shares purchased (optional but recommended)
- `price`: Price per share (optional but recommended)

### SELL

Sell some or all of the position.

```tsv
date	value	action	amount	shares	price	notes
2024-02-01	1200	SELL	200	4.76	42.00	Taking profits
```

- `value`: Position value BEFORE selling
- `amount`: Dollar amount received
- `shares`: Number of shares sold (optional but recommended)

### HOLD

No action taken, just recording a snapshot.

```tsv
date	value	action	notes
2024-02-08	1150	HOLD	Market closed
```

- `value`: Current position value
- Useful for tracking value changes without trading

### DEPOSIT

Add capital to the fund (increases fund_size).

```tsv
date	value	action	amount	fund_size	notes
2024-03-01	1150	DEPOSIT	1000	11000	Monthly contribution
```

- `amount`: Amount being deposited
- `fund_size`: New total fund size after deposit

### WITHDRAW

Remove capital from the fund (decreases fund_size).

```tsv
date	value	action	amount	fund_size	notes
2024-03-15	1200	WITHDRAW	500	10500	Emergency fund
```

- `amount`: Amount being withdrawn
- `fund_size`: New total fund size after withdrawal

## Recording Dividends and Interest

### Dividends

Record dividends on any entry type:

```tsv
date	value	action	dividend	notes
2024-03-15	1200	HOLD	25.50	Q1 dividend
```

Or combined with a trade:

```tsv
date	value	action	amount	shares	price	dividend	notes
2024-03-15	1200	BUY	100	2.5	40.00	25.50	Weekly DCA + dividend
```

### Cash Interest

Record interest earned on idle cash:

```tsv
date	value	action	cash_interest	notes
2024-03-31	5000	HOLD	18.25	March interest
```

## Example Files

### Trading Fund (Stock)

```
{"fund_size_usd":10000,"target_apy":0.25,"interval_days":7,"input_min_usd":100,"input_mid_usd":200,"input_max_usd":500,"max_at_pct":-0.25,"min_profit_usd":100,"accumulate":true,"start_date":"2024-01-01","status":"active","fund_type":"stock","manage_cash":false}
date	value	action	amount	shares	price	dividend	notes
2024-01-01	0	BUY	1000	25.0000	40.00		Initial purchase
2024-01-08	980	BUY	200	5.1282	39.00		Price dip - mid tier
2024-01-15	1250	BUY	100	2.3256	43.00		On track - min tier
2024-01-22	1400	SELL	100	2.2222	45.00		Above target
2024-01-29	1350	HOLD				Market closed
2024-02-01	1380	HOLD			15.50	Quarterly dividend
```

### Cash Fund

```
{"fund_size_usd":0,"status":"active","fund_type":"cash","start_date":"2024-01-01"}
date	value	action	amount	cash_interest	notes
2024-01-01	5000	DEPOSIT	5000		Initial deposit
2024-01-08	4800	WITHDRAW	200		Transfer to TQQQ fund
2024-01-15	4900	DEPOSIT	100		TQQQ sale proceeds
2024-01-31	4900	HOLD		12.25	January interest
2024-02-28	4912.25	HOLD		12.50	February interest
```

### Crypto Fund

```
{"fund_size_usd":5000,"target_apy":0.40,"interval_days":7,"input_min_usd":50,"input_mid_usd":150,"input_max_usd":400,"max_at_pct":-0.30,"min_profit_usd":100,"accumulate":true,"start_date":"2024-01-01","status":"active","fund_type":"crypto"}
date	value	action	amount	shares	price	notes
2024-01-01	0	BUY	500	0.01190476	42000		Initial BTC purchase
2024-01-08	480	BUY	150	0.00365854	41000		Small dip
2024-01-15	700	BUY	50	0.00111111	45000		On track
2024-01-22	950	SELL	100	0.00200000	50000		Taking profits
```

## Data Integrity

### Best Practices

1. **Always record shares and prices** - Enables accurate cost basis tracking
2. **Use consistent date format** - YYYY-MM-DD only
3. **Value is BEFORE action** - Record position value before the trade executes
4. **Keep notes concise** - Avoid tabs and newlines in notes

### Validation Rules

The system validates:
- Required columns (date, value, action) are present
- Date format is valid YYYY-MM-DD
- Numeric fields contain valid numbers
- Action is a valid type (BUY, SELL, HOLD, DEPOSIT, WITHDRAW)

### Manual Editing

You can edit TSV files directly in:
- Any text editor
- Excel/Google Sheets (export as TSV)
- VS Code with TSV/CSV extensions

When editing manually:
1. Use actual tab characters between columns
2. Don't add quotes around values
3. Leave empty columns blank (not null or undefined)
4. Keep the header line as valid JSON

## File Organization

Organize fund files by platform:

```
data/funds/
├── robinhood-tqqq.tsv      # Robinhood TQQQ position
├── robinhood-vym.tsv       # Robinhood VYM position
├── robinhood-cash.tsv      # Robinhood cash fund
├── coinbase-btc.tsv        # Coinbase Bitcoin
├── coinbase-eth.tsv        # Coinbase Ethereum
├── coinbase-cash.tsv       # Coinbase USDC cash
└── m1-growth.tsv           # M1 Finance pie
```

Naming convention: `{platform}-{ticker}.tsv`

- Platform: lowercase brokerage name
- Ticker: lowercase symbol or descriptor
- Cash funds: `{platform}-cash.tsv`
