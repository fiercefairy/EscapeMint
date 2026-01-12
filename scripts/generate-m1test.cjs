const fs = require('fs')
const {
  computeFundState,
  computeRecommendation
} = require('../packages/engine/dist/index.js')

// Load pie price data
const pieData = JSON.parse(fs.readFileSync('packages/server/src/data/pie-weekly.json', 'utf8'))

// Dividend data (blended 25% TQQQ + 25% SPXL)
const BASE_TQQQ = 22.7237491607666
const BASE_SPXL = 74.6500015258789
const BASE_PIE = 100
const TQQQ_RATIO = (BASE_PIE / BASE_TQQQ) * 0.25
const SPXL_RATIO = (BASE_PIE / BASE_SPXL) * 0.25

const SPXL_DIVIDENDS = [
  { exDate: '2021-06-22', amount: 0.04113 },
  { exDate: '2021-12-21', amount: 0.11481 },
  { exDate: '2022-06-22', amount: 0.07763 },
  { exDate: '2022-12-20', amount: 0.12356 },
  { exDate: '2023-03-21', amount: 0.26189 },
  { exDate: '2023-06-21', amount: 0.25846 },
  { exDate: '2023-09-19', amount: 0.19445 },
  { exDate: '2023-12-21', amount: 0.30383 },
  { exDate: '2024-03-19', amount: 0.39478 },
  { exDate: '2024-06-25', amount: 0.33671 },
  { exDate: '2024-09-24', amount: 0.19251 },
  { exDate: '2024-12-23', amount: 0.3207 },
  { exDate: '2025-03-25', amount: 0.4935 },
  { exDate: '2025-06-24', amount: 0.57306 },
  { exDate: '2025-09-23', amount: 0.28356 },
  { exDate: '2025-12-23', amount: 0.17186 }
]

const TQQQ_DIVIDENDS = [
  { exDate: '2021-12-23', amount: 0.00003 },
  { exDate: '2022-12-22', amount: 0.04896 },
  { exDate: '2023-03-22', amount: 0.0749 },
  { exDate: '2023-06-21', amount: 0.06379 },
  { exDate: '2023-09-20', amount: 0.06932 },
  { exDate: '2023-12-20', amount: 0.11172 },
  { exDate: '2024-03-20', amount: 0.10757 },
  { exDate: '2024-06-26', amount: 0.14139 },
  { exDate: '2024-09-25', amount: 0.11511 },
  { exDate: '2024-12-23', amount: 0.13771 },
  { exDate: '2025-03-26', amount: 0.09886 },
  { exDate: '2025-06-25', amount: 0.10916 },
  { exDate: '2025-09-24', amount: 0.04891 },
  { exDate: '2025-12-24', amount: 0.08554 }
]

// Create blended dividend schedule
const PIE_DIVIDENDS = []
const allDivDates = new Set([...SPXL_DIVIDENDS.map(d => d.exDate), ...TQQQ_DIVIDENDS.map(d => d.exDate)])
const spxlMap = {}
SPXL_DIVIDENDS.forEach(d => spxlMap[d.exDate] = d.amount)
const tqqqMap = {}
TQQQ_DIVIDENDS.forEach(d => tqqqMap[d.exDate] = d.amount)

for (const date of [...allDivDates].sort()) {
  const pieDiv = ((spxlMap[date] || 0) * SPXL_RATIO) + ((tqqqMap[date] || 0) * TQQQ_RATIO)
  if (pieDiv > 0) PIE_DIVIDENDS.push({ exDate: date, amount: pieDiv })
}

// Fund config
const pieConfig = {
  fund_type: 'stock',
  status: 'active',
  fund_size_usd: 20000,
  target_apy: 0.30,
  interval_days: 7,
  input_min_usd: 200,
  input_mid_usd: 350,
  input_max_usd: 500,
  max_at_pct: -0.25,
  min_profit_usd: 100,
  cash_apy: 0.04,
  margin_apr: 0.05,
  accumulate: true,
  manage_cash: true,
  start_date: pieData[0].date,
  dividend_reinvest: false,
  interest_reinvest: false,
  expense_from_fund: false
}

// Track state
const trades = []
const dividends = []
let totalShares = 0
const INITIAL_CASH = 20000
let cashBalance = INITIAL_CASH
let marginBorrowed = 0
let cumulativeInvested = 0  // Track total BUY amounts
const MARGIN_APR = 0.05
const MARGIN_RATE = 0.48  // 48% of equity available as margin
const MARGIN_BUFFER = 0.25  // Use only 75% of available margin to avoid margin calls

const pieEntries = []
const cashEntries = []

function round2(n) {
  return Math.round(n * 100) / 100
}

// Format value for TSV - preserve 0 as '0', convert undefined/null/NaN to ''
function fmt(v) {
  if (v === undefined || v === null || v === '' || Number.isNaN(v)) return ''
  return String(v)
}

// Initial cash deposit
cashEntries.push({
  date: pieData[0].date,
  value: 0,
  cash: cashBalance,
  action: 'DEPOSIT',
  amount: INITIAL_CASH,
  margin_available: 0,
  margin_borrowed: 0,
  notes: 'Initial deposit'
})

let previousDate = ''
const monthlyInterestRate = 0.04 / 12
const monthlyMarginRate = MARGIN_APR / 12
let lastInterestMonth = ''

function getDividendsInRange(startDate, endDate) {
  return PIE_DIVIDENDS.filter(d => d.exDate > startDate && d.exDate <= endDate)
}

pieData.forEach((point, weekIndex) => {
  const price = point.close
  const currentValue = totalShares * price

  // Margin available = 48% of pie equity
  const marginAvailable = currentValue * MARGIN_RATE

  // Check for dividends since last entry
  if (previousDate && totalShares > 0) {
    const periodDividends = getDividendsInRange(previousDate, point.date)
    for (const div of periodDividends) {
      const dividendAmount = totalShares * div.amount

      // Dividends first pay down margin, then go to cash
      if (marginBorrowed > 0) {
        const payDown = Math.min(dividendAmount, marginBorrowed)
        marginBorrowed -= payDown
        const remainder = dividendAmount - payDown
        cashBalance += remainder

        cashEntries.push({
          date: div.exDate,
          value: round2(cashBalance),
          cash: round2(cashBalance),
          action: 'HOLD',
          amount: round2(dividendAmount),
          margin_available: round2(marginAvailable),
          margin_borrowed: round2(marginBorrowed),
          notes: payDown > 0 ? 'pie dividend (' + round2(payDown) + ' to margin)' : 'pie dividend'
        })
      } else {
        cashBalance += dividendAmount
        cashEntries.push({
          date: div.exDate,
          value: round2(cashBalance - dividendAmount),
          cash: round2(cashBalance),
          action: 'HOLD',
          amount: round2(dividendAmount),
          margin_available: round2(marginAvailable),
          margin_borrowed: 0,
          notes: 'pie dividend'
        })
      }

      dividends.push({ date: div.exDate, amount_usd: dividendAmount })

      pieEntries.push({
        date: div.exDate,
        value: round2(currentValue),
        action: 'HOLD',
        dividend: round2(dividendAmount),
        price: round2(price),
        fund_size: round2(cumulativeInvested)
      })
    }
  }

  const currentMonth = point.date.substring(0, 7)

  // Compute fund state
  const state = computeFundState(pieConfig, trades, [], dividends, [], currentValue, point.date)

  // Available to spend = cash + margin available (minus already borrowed, with buffer)
  // Also HOLD on margin if already using more than 75% of available (margin call risk)
  const marginUtilization = marginAvailable > 0 ? marginBorrowed / marginAvailable : 0
  const canUseMargin = marginUtilization < (1 - MARGIN_BUFFER)  // Only use margin if < 75% utilized
  const availableMargin = canUseMargin ? Math.max(0, (marginAvailable - marginBorrowed) * (1 - MARGIN_BUFFER)) : 0
  state.cash_available_usd = cashBalance + availableMargin

  const rec = computeRecommendation(pieConfig, state)

  let action = 'HOLD'
  let amount = 0
  let usedMargin = 0

  if (rec) {
    if (rec.action === 'BUY') {
      let buyAmount = Math.min(rec.amount, cashBalance + availableMargin)

      if (buyAmount > 0) {
        // Use cash first, then margin (capped at available)
        const fromCash = Math.min(buyAmount, cashBalance)
        const fromMargin = Math.min(buyAmount - fromCash, availableMargin)
        const actualBuyAmount = fromCash + fromMargin

        if (actualBuyAmount > 0) {
          action = 'BUY'
          amount = round2(actualBuyAmount)

          cashBalance -= fromCash
          if (fromMargin > 0) {
            marginBorrowed += fromMargin
            usedMargin = fromMargin
          }

          // Track cumulative invested and update fund_size
          cumulativeInvested += amount  // Use rounded amount to match app calculation

          const sharesToBuy = actualBuyAmount / price
          totalShares += sharesToBuy
          trades.push({ date: point.date, type: 'buy', amount_usd: actualBuyAmount, shares: sharesToBuy })

          const newMarginAvailable = (totalShares * price) * MARGIN_RATE

          cashEntries.push({
            date: point.date,
            value: round2(cashBalance + fromCash),
            cash: round2(cashBalance),
            action: 'HOLD',
            amount: -amount,
            margin_available: round2(newMarginAvailable),
            margin_borrowed: round2(marginBorrowed),
            notes: fromMargin > 0 ? 'pie BUY (' + round2(fromMargin) + ' from margin)' : 'pie BUY'
          })
        }
      }
    } else if (rec.action === 'SELL') {
      const sellAmount = rec.amount
      const sharesToSell = Math.min(sellAmount / price, totalShares)
      const actualSellAmount = sharesToSell * price

      if (sharesToSell > 0) {
        action = 'SELL'
        amount = round2(actualSellAmount)
        totalShares -= sharesToSell

        // Sell proceeds first pay down margin, then go to cash
        let proceeds = actualSellAmount
        let paidToMargin = 0
        if (marginBorrowed > 0) {
          paidToMargin = Math.min(proceeds, marginBorrowed)
          marginBorrowed -= paidToMargin
          proceeds -= paidToMargin
        }
        cashBalance += proceeds

        trades.push({ date: point.date, type: 'sell', amount_usd: actualSellAmount, shares: sharesToSell, value: currentValue })

        const newMarginAvailable = (totalShares * price) * MARGIN_RATE

        cashEntries.push({
          date: point.date,
          value: round2(cashBalance - proceeds),
          cash: round2(cashBalance),
          action: 'HOLD',
          amount: round2(proceeds),
          margin_available: round2(newMarginAvailable),
          margin_borrowed: round2(marginBorrowed),
          notes: paidToMargin > 0 ? 'pie SELL (' + round2(paidToMargin) + ' to margin)' : 'pie SELL'
        })
      }
    }
  }

  // Create pie entry
  pieEntries.push({
    date: point.date,
    value: weekIndex === 0 ? 0 : round2(currentValue),
    action,
    amount: amount || '',
    shares: amount ? (amount / price) : '',
    price: round2(price),
    fund_size: round2(cumulativeInvested),
    margin: usedMargin > 0 ? round2(usedMargin) : ''
  })

  // Monthly interest on cash, margin interest on borrowed
  if (currentMonth !== lastInterestMonth && weekIndex > 0) {
    // Cash interest
    let cashInterest = 0
    if (cashBalance > 0) {
      cashInterest = cashBalance * monthlyInterestRate
      cashBalance += cashInterest
    }

    // Margin interest expense
    let marginInterest = 0
    if (marginBorrowed > 0) {
      marginInterest = marginBorrowed * monthlyMarginRate
      marginBorrowed += marginInterest  // Interest accrues to borrowed amount

      cashEntries.push({
        date: point.date,
        value: round2(cashBalance),
        cash: round2(cashBalance),
        action: 'HOLD',
        expense: round2(marginInterest),
        margin_expense: round2(marginInterest),
        margin_available: round2(marginAvailable),
        margin_borrowed: round2(marginBorrowed),
        notes: 'margin interest'
      })
    }

    if (cashInterest > 0.01) {
      cashEntries.push({
        date: point.date,
        value: round2(cashBalance - cashInterest),
        cash: round2(cashBalance),
        action: 'HOLD',
        cash_interest: round2(cashInterest),
        margin_available: round2(marginAvailable),
        margin_borrowed: round2(marginBorrowed),
        notes: '40% of pie equity (' + Math.round(currentValue) + ')'
      })
    }

    lastInterestMonth = currentMonth
  }

  previousDate = point.date
})

// Write pie TSV
const pieHeader = 'date\tvalue\tcash\taction\tamount\tshares\tprice\tdividend\texpense\tcash_interest\tfund_size\tmargin_available\tmargin_borrowed\tmargin_expense\tnotes\tcontracts\tentry_price\tliquidation_price\tunrealized_pnl\tfunding_profit\tfunding_loss\tmargin_locked\tfee\tmargin'
const pieLines = [pieHeader]
pieEntries.forEach(e => {
  pieLines.push([
    e.date, e.value || '', '', e.action, e.amount || '', e.shares || '', e.price || '', e.dividend || '', '', '', e.fund_size || '', '', '', '', '', '', '', '', '', '', '', '', '', e.margin || ''
  ].join('\t'))
})
fs.writeFileSync('data/funds/m1test-pie.tsv', pieLines.join('\n') + '\n')

// Write cash TSV
const cashHeader = 'date\tvalue\tcash\taction\tamount\tshares\tprice\tdividend\texpense\tcash_interest\tfund_size\tmargin_available\tmargin_borrowed\tmargin_expense\tnotes'
const cashLines = [cashHeader]
cashEntries.forEach(e => {
  cashLines.push([
    e.date, fmt(e.value), fmt(e.cash), e.action, fmt(e.amount), '', '', '', fmt(e.expense), fmt(e.cash_interest), '', fmt(e.margin_available), fmt(e.margin_borrowed), fmt(e.margin_expense), fmt(e.notes)
  ].join('\t'))
})
fs.writeFileSync('data/funds/m1test-cash.tsv', cashLines.join('\n') + '\n')

// Summary
console.log('=== Generated m1test funds with margin ===')
console.log('Pie entries:', pieEntries.length)
console.log('Cash entries:', cashEntries.length)
console.log('Total trades:', trades.length)
console.log('Total dividends:', dividends.length, '($' + dividends.reduce((s,d) => s + d.amount_usd, 0).toFixed(2) + ')')
console.log('Final shares:', totalShares.toFixed(4))
console.log('Final cash:', cashBalance.toFixed(2))
console.log('Final margin borrowed:', marginBorrowed.toFixed(2))
console.log('Final pie value:', (totalShares * pieData[pieData.length-1].close).toFixed(2))

// Check for margin usage
const marginEntries = pieEntries.filter(e => e.margin)
console.log('\nMargin usage entries:', marginEntries.length)
if (marginEntries.length > 0) {
  console.log('Sample margin uses:')
  marginEntries.slice(0, 5).forEach(e => console.log('  ' + e.date + ': $' + e.margin + ' from margin'))
}

// Actions distribution
const actions = pieEntries.filter(e => e.action).map(e => e.action)
const counts = {}
actions.forEach(a => counts[a] = (counts[a] || 0) + 1)
console.log('\nActions:', counts)
