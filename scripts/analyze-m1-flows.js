const fs = require('fs')

// Statement transactions (May-Aug 16)
const statementDeposits = 2500 + 5000 + 20000 + 10000 + 15000 + 22000 + 50000 + 30000 + 50000 + 10000 + 11000
const statementWithdrawals = 20000 + 50000 + 500 + 500 + 30000 + 500 + 1000
const statementInterest = 86.95 + 338.63 + 698.65

console.log('=== STATEMENT DATA (May - Aug 16) ===')
console.log('Deposits:', statementDeposits.toFixed(2))
console.log('Withdrawals:', statementWithdrawals.toFixed(2))
console.log('Interest:', statementInterest.toFixed(2))
console.log('Net:', (statementDeposits - statementWithdrawals + statementInterest).toFixed(2))

// Load scrape archive
const scrapeData = JSON.parse(fs.readFileSync('data/scrape-archives/m1-cash.json', 'utf8'))

// Analyze scrape data (Aug 17+)
let scrapeDeposits = 0
let scrapeWithdrawals = 0
let scrapeInterest = 0
let scrapeMembershipFees = 0
let scrapeTransfersIn = 0
let scrapeTransfersOut = 0

const scrapeTxns = scrapeData.transactions.filter(tx => tx.date && tx.date >= '2023-08-17')

for (const tx of scrapeTxns) {
  const isNegative = tx.details?.originalAmount?.startsWith('-')
  const title = (tx.title || '').toLowerCase()

  if (tx.type === 'interest') {
    scrapeInterest += tx.amount
  } else if (tx.type === 'deposit') {
    scrapeDeposits += tx.amount
  } else if (tx.type === 'withdrawal') {
    scrapeWithdrawals += tx.amount
  } else if (tx.type === 'transfer') {
    if (title.includes('from m1 invest') || title.includes('from m1 checking')) {
      scrapeTransfersIn += tx.amount
    } else if (title.includes('to m1 invest')) {
      scrapeTransfersOut += tx.amount
    } else if (title.includes('to m1 borrow')) {
      scrapeTransfersOut += tx.amount
    } else if (title === 'deposit') {
      scrapeDeposits += tx.amount
    } else if (title.includes('m1 plus membership')) {
      scrapeMembershipFees += tx.amount
    } else {
      console.log('Unknown transfer:', tx.title, tx.amount)
    }
  }
}

console.log('\n=== SCRAPE DATA (Aug 17+) ===')
console.log('Bank Deposits:', scrapeDeposits.toFixed(2))
console.log('Bank Withdrawals:', scrapeWithdrawals.toFixed(2))
console.log('Interest:', scrapeInterest.toFixed(2))
console.log('Transfers In (from M1 Invest):', scrapeTransfersIn.toFixed(2))
console.log('Transfers Out (to M1 Invest/Borrow):', scrapeTransfersOut.toFixed(2))
console.log('Membership Fees:', scrapeMembershipFees.toFixed(2))

const scrapeNet = scrapeDeposits - scrapeWithdrawals + scrapeInterest + scrapeTransfersIn - scrapeTransfersOut - scrapeMembershipFees
console.log('Net:', scrapeNet.toFixed(2))

// Total
const totalIn = statementDeposits + statementInterest + scrapeDeposits + scrapeInterest + scrapeTransfersIn
const totalOut = statementWithdrawals + scrapeWithdrawals + scrapeTransfersOut + scrapeMembershipFees
console.log('\n=== TOTALS ===')
console.log('Total In:', totalIn.toFixed(2))
console.log('Total Out:', totalOut.toFixed(2))
console.log('Net Balance:', (totalIn - totalOut).toFixed(2))

// What's the actual current balance? User needs to tell us
console.log('\n=== RECONCILIATION ===')
console.log('If current M1 Earn balance is $X, then we are missing:')
console.log('Missing = X - (' + (totalIn - totalOut).toFixed(2) + ') = X + ' + (totalOut - totalIn).toFixed(2))
