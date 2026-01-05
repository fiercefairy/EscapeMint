const fs = require('fs')

// Historical statement data (May-Aug 2023) - only data BEFORE scrape starts (Aug 17)
const statementTransactions = [
  // May 2023
  { date: '2023-05-14', type: 'deposit', amount: 2500, title: 'Transfer from M1 Checking' },
  { date: '2023-05-14', type: 'deposit', amount: 5000, title: 'Transfer from M1 Checking' },
  { date: '2023-05-19', type: 'deposit', amount: 20000, title: 'Transfer from linked bank' },
  { date: '2023-05-23', type: 'deposit', amount: 10000, title: 'Transfer from linked bank' },
  { date: '2023-05-24', type: 'deposit', amount: 15000, title: 'Transfer from linked bank' },
  { date: '2023-05-30', type: 'deposit', amount: 22000, title: 'Transfer from linked bank' },
  { date: '2023-05-31', type: 'interest', amount: 86.95, title: 'Interest application' },

  // June 2023
  { date: '2023-06-27', type: 'deposit', amount: 50000, title: 'Transfer from linked bank' },
  { date: '2023-06-28', type: 'deposit', amount: 30000, title: 'Transfer from linked bank' },
  { date: '2023-06-30', type: 'interest', amount: 338.63, title: 'Interest application' },

  // July 2023
  { date: '2023-07-05', type: 'deposit', amount: 50000, title: 'Transfer from linked bank' },
  { date: '2023-07-17', type: 'withdrawal', amount: 20000, title: 'Transfer to linked bank' },
  { date: '2023-07-20', type: 'withdrawal', amount: 50000, title: 'Transfer to linked bank' },
  { date: '2023-07-21', type: 'transfer', amount: 500, title: 'Instant transfer to M1 Invest', direction: 'out' },
  { date: '2023-07-28', type: 'transfer', amount: 500, title: 'Instant transfer to M1 Invest', direction: 'out' },
  { date: '2023-07-31', type: 'interest', amount: 698.65, title: 'Interest application' },
  { date: '2023-07-31', type: 'withdrawal', amount: 30000, title: 'Transfer to linked bank' },

  // August 2023 - ONLY transactions BEFORE Aug 17 (scrape start)
  { date: '2023-08-04', type: 'transfer', amount: 500, title: 'Instant transfer to M1 Invest', direction: 'out' },
  { date: '2023-08-10', type: 'transfer', amount: 1000, title: 'Instant transfer to M1 Invest', direction: 'out' },
  { date: '2023-08-14', type: 'deposit', amount: 10000, title: 'Transfer from linked bank' },
  { date: '2023-08-16', type: 'deposit', amount: 11000, title: 'Transfer from linked bank' },
  // Aug 17+ is in the scrape data
]

// Load scrape archive
const scrapeData = JSON.parse(fs.readFileSync('data/scrape-archives/m1-cash.json', 'utf8'))

// Scrape starts from 2023-08-17
const scrapeStartDate = '2023-08-17'

// Process scrape transactions - only those from Aug 17 onwards
const scrapeTransactions = scrapeData.transactions
  .filter(tx => tx.date && tx.date >= scrapeStartDate)
  .map(tx => {
    const isNegative = tx.details?.originalAmount?.startsWith('-')
    return {
      date: tx.date,
      type: tx.type,
      amount: tx.amount,
      title: tx.title,
      direction: isNegative ? 'out' : 'in'
    }
  })

console.log('Statement transactions (before Aug 17):', statementTransactions.length)
console.log('Scrape transactions (Aug 17+):', scrapeTransactions.length)

// Combine all transactions
const allTransactions = [...statementTransactions, ...scrapeTransactions]

// Sort by date, then by transaction order within same date
allTransactions.sort((a, b) => a.date.localeCompare(b.date))

// Process transactions into entries
const entries = []
let runningBalance = 0

for (const tx of allTransactions) {
  const entry = {
    date: tx.date,
    value: 0,
    action: null,
    amount: null,
    cash_interest: null,
    expense: null,
    margin_available: null,
    notes: tx.title
  }

  const title = (tx.title || '').toLowerCase()

  if (tx.type === 'interest') {
    entry.action = 'HOLD'
    entry.cash_interest = tx.amount
    runningBalance += tx.amount
  } else if (tx.type === 'deposit') {
    entry.action = 'DEPOSIT'
    entry.amount = tx.amount
    runningBalance += tx.amount
  } else if (tx.type === 'withdrawal') {
    entry.action = 'WITHDRAW'
    entry.amount = tx.amount
    runningBalance -= tx.amount
  } else if (tx.type === 'transfer') {
    if (title.includes('from m1 invest') || title.includes('from m1 checking')) {
      entry.action = 'DEPOSIT'
      entry.amount = tx.amount
      runningBalance += tx.amount
    } else if (title.includes('to m1 invest')) {
      entry.action = 'WITHDRAW'
      entry.amount = tx.amount
      runningBalance -= tx.amount
    } else if (title.includes('to m1 borrow')) {
      entry.action = 'WITHDRAW'
      entry.amount = tx.amount
      entry.notes = 'Margin payment to M1 Borrow'
      runningBalance -= tx.amount
    } else if (title === 'deposit') {
      entry.action = 'DEPOSIT'
      entry.amount = tx.amount
      runningBalance += tx.amount
    } else if (title.includes('m1 plus membership')) {
      entry.action = 'HOLD'
      entry.expense = tx.amount
      entry.notes = 'M1 Plus Membership fee'
      runningBalance -= tx.amount
    } else {
      console.error('Unknown transfer:', tx.title, tx)
      continue
    }
  }

  entry.value = Math.round(runningBalance * 100) / 100
  entries.push(entry)
}

console.log('\nTotal entries:', entries.length)
console.log('Final balance:', runningBalance.toFixed(2))

// Check for anomalies
let minBalance = Infinity
let minDate = ''
entries.forEach(e => {
  if (e.value < minBalance) {
    minBalance = e.value
    minDate = e.date
  }
})
console.log('Minimum balance:', minBalance.toFixed(2), 'on', minDate)

// Generate TSV
const headers = ['date', 'value', 'cash', 'action', 'amount', 'shares', 'price', 'dividend', 'expense', 'cash_interest', 'fund_size', 'margin_available', 'margin_borrowed', 'notes']
const rows = [headers.join('\t')]

entries.forEach(e => {
  const row = [
    e.date,
    e.value,
    '', // cash
    e.action || '',
    e.amount || '',
    '', // shares
    '', // price
    '', // dividend
    e.expense || '',
    e.cash_interest || '',
    '', // fund_size
    e.margin_available || '',
    '', // margin_borrowed
    e.notes || ''
  ]
  rows.push(row.join('\t'))
})

// Write TSV
fs.writeFileSync('data/funds/m1-cash.tsv', rows.join('\n') + '\n')
console.log('\nWrote', entries.length, 'entries to data/funds/m1-cash.tsv')

// Show first few entries
console.log('\nFirst 10 entries:')
entries.slice(0, 10).forEach(e => {
  console.log(`  ${e.date}: $${e.value.toFixed(2)} (${e.action} ${e.amount || e.cash_interest || ''})`)
})

// Show balance around key dates
console.log('\nBalances at key dates:')
const keyDates = ['2023-05-31', '2023-06-30', '2023-07-31', '2023-08-16', '2023-08-31', '2023-11-05', '2025-12-31']
keyDates.forEach(date => {
  const entry = [...entries].reverse().find(e => e.date <= date)
  if (entry) {
    console.log(`  ${date}: $${entry.value.toFixed(2)} (from ${entry.date})`)
  }
})

// Verify: what should Aug 17 balance be?
// Statement shows Aug 16 had deposit of $11K
// So balance before Aug 17 should be: May-July balance + Aug 4-16 transactions
console.log('\n--- Verification ---')
const aug16Entry = entries.find(e => e.date === '2023-08-16')
if (aug16Entry) {
  console.log('Balance after Aug 16 deposit:', aug16Entry.value.toFixed(2))
}
const aug17Entries = entries.filter(e => e.date === '2023-08-17')
console.log('Aug 17 transactions:', aug17Entries.length)
aug17Entries.forEach(e => console.log(`  ${e.action} $${e.amount || ''} -> $${e.value}`))
