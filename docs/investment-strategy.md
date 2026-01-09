# Investment Strategy: Tiered DCA In/Out

EscapeMint uses a **tiered Dollar Cost Averaging (DCA)** strategy that automatically adjusts investment amounts based on asset performance. This creates a systematic "buy low, sell high" behavior.

## The Problem with Traditional DCA

Traditional DCA invests a fixed amount at regular intervals regardless of price:

```
Week 1: Buy $100 (price $50) → 2 shares
Week 2: Buy $100 (price $40) → 2.5 shares
Week 3: Buy $100 (price $60) → 1.67 shares
Week 4: Buy $100 (price $30) → 3.33 shares
```

This is better than lump-sum investing in volatile markets, but it doesn't capitalize on buying opportunities when prices drop significantly.

## Tiered DCA: The EscapeMint Approach

EscapeMint uses **three tiers** of DCA amounts based on performance:

| Performance | DCA Amount | Reasoning |
|-------------|------------|-----------|
| Gaining or on-track | `input_min` | Asset doing well, invest conservatively |
| Below cost basis | `input_mid` | Asset down, good buying opportunity |
| Significant loss | `input_max` | Asset way down, maximize accumulation |

### Example Configuration

```
input_min_usd: $100   (when profitable)
input_mid_usd: $200   (when losing < 25%)
input_max_usd: $500   (when losing > 25%)
max_at_pct: -0.25     (threshold for max tier)
```

### How Tiers Are Selected

```
┌─────────────────────────────────────────────────────────┐
│                     START                               │
└─────────────────────┬───────────────────────────────────┘
                      ▼
           ┌─────────────────────┐
           │  gain_usd < 0 ?     │
           │  (losing money)     │
           └──────────┬──────────┘
                      │
        ┌─────────────┴─────────────┐
        │ YES                   NO  │
        ▼                           ▼
┌───────────────────┐      ┌───────────────────┐
│  gain_pct <       │      │  Use input_min    │
│  max_at_pct ?     │      │  (on track)       │
└────────┬──────────┘      └───────────────────┘
         │
   ┌─────┴─────┐
   │YES     NO │
   ▼           ▼
┌──────────┐ ┌──────────┐
│input_max │ │input_mid │
│(big loss)│ │(small    │
└──────────┘ │ loss)    │
             └──────────┘
```

## The Sell Side: Taking Profits

When your investment exceeds the target growth rate by more than `min_profit_usd`, EscapeMint recommends selling:

### Accumulate Mode (default: true)

**Accumulate = true**: Sell only the DCA amount to take partial profits

```
Target value:  $1,200
Actual value:  $1,350  (above by $150)
min_profit:    $100

Action: SELL $100-$500 (the current tier amount)
Result: Lock in some profits, keep the rest invested
```

**Accumulate = false**: Liquidate the entire position

```
Target value:  $1,200
Actual value:  $1,350  (above by $150)
min_profit:    $100

Action: SELL $1,350 (entire position)
Result: Cash out completely, restart DCA cycle
```

### When to Use Each Mode

| Mode | Best For | Behavior |
|------|----------|----------|
| `accumulate: true` | Long-term growth | Sells profits, keeps core position |
| `accumulate: false` | Swing trading | Liquidates when profitable, restarts |

## Complete Decision Flow

```
┌─────────────────────────────────────────────────────────┐
│                  Get Current State                      │
│   - actual_value: Current market value                  │
│   - expected_target: What you'd have at target APY      │
│   - target_diff: actual - expected                      │
│   - gain_pct: (actual - invested) / invested            │
└─────────────────────┬───────────────────────────────────┘
                      ▼
           ┌─────────────────────┐
           │ target_diff >       │
           │ min_profit_usd ?    │
           │ (above target)      │
           └──────────┬──────────┘
                      │
        ┌─────────────┴─────────────┐
        │ YES                   NO  │
        ▼                           ▼
┌───────────────────┐      ┌───────────────────┐
│      SELL         │      │ Select DCA tier   │
│                   │      │ based on gain_pct │
│ accumulate=true:  │      └─────────┬─────────┘
│   sell limit amt  │                │
│                   │                ▼
│ accumulate=false: │      ┌───────────────────┐
│   sell everything │      │  cash >= limit ?  │
└───────────────────┘      └─────────┬─────────┘
                                     │
                           ┌─────────┴─────────┐
                           │YES             NO │
                           ▼                   ▼
                    ┌────────────┐      ┌────────────┐
                    │ BUY limit  │      │ BUY what   │
                    │ amount     │      │ you can    │
                    └────────────┘      │ afford     │
                                        └────────────┘
```

## Real-World Example

### Initial Setup

```
Fund: Robinhood TQQQ
Fund Size: $10,000
Target APY: 30%
Interval: 7 days

DCA Tiers:
- input_min: $100 (when profitable)
- input_mid: $200 (when down < 25%)
- input_max: $500 (when down > 25%)
- max_at_pct: -25%
- min_profit: $100
```

### Month 1: Building Position (Bear Market)

| Week | Value | Gain % | Tier | Action | Cash After |
|------|-------|--------|------|--------|------------|
| 1 | $0 | - | min | BUY $100 | $9,900 |
| 2 | $90 | -10% | mid | BUY $200 | $9,700 |
| 3 | $250 | -14% | mid | BUY $200 | $9,500 |
| 4 | $350 | -30% | max | BUY $500 | $9,000 |

**Result**: Accumulated $1,000 invested at low prices

### Month 2: Recovery (Bull Market)

| Week | Value | Gain % | Target | Diff | Action |
|------|-------|--------|--------|------|--------|
| 5 | $1,100 | +10% | $1,020 | +$80 | BUY $100 |
| 6 | $1,250 | +14% | $1,125 | +$125 | SELL $100 |
| 7 | $1,180 | +7% | $1,135 | +$45 | BUY $100 |
| 8 | $1,350 | +15% | $1,245 | +$105 | SELL $100 |

**Result**: Taking profits when above target, buying on dips

## Why This Works

### 1. Buys More at Lower Prices
When the market drops 25%+, you're buying at a discount with larger amounts.

### 2. Automatic Rebalancing
Selling when above target naturally rebalances your portfolio.

### 3. Removes Emotion
Fixed rules prevent panic selling during crashes or FOMO buying at peaks.

### 4. Compounds Gains
Taking profits and reinvesting creates a compounding cycle.

## Comparison to Buy-and-Hold

| Scenario | Buy & Hold | Tiered DCA |
|----------|------------|------------|
| Steady growth | Similar returns | Similar returns |
| Volatile growth | Miss buying opportunities | Accumulates more shares |
| Crash then recovery | Hold through drawdown | Accumulates at lows, profits on recovery |
| Prolonged decline | Stuck with losses | Limits exposure, builds cash |

## Key Insights

1. **The system favors volatility** - More price swings = more opportunities
2. **Cash is strategic** - Having cash available lets you buy dips
3. **Patience pays** - The strategy works over months/years, not days
4. **No predictions needed** - Rules respond to what happened, not what might happen
