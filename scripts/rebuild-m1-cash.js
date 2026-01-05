const fs = require('fs');

// Load archive
const data = JSON.parse(fs.readFileSync('data/scrape-archives/m1-cash.json', 'utf8'));

// Process transactions
function processTransaction(tx) {
  if (!tx.date) return null;

  const entry = {
    date: tx.date,
    value: 0,
    action: null,
    amount: null,
    cash_interest: null,
    expense: null,
    margin_available: null,
    notes: tx.title
  };

  const title = (tx.title || '').toLowerCase();

  if (tx.type === 'interest') {
    entry.action = 'HOLD';
    entry.cash_interest = tx.amount;
  } else if (tx.type === 'deposit') {
    entry.action = 'DEPOSIT';
    entry.amount = tx.amount;
  } else if (tx.type === 'withdrawal') {
    entry.action = 'WITHDRAW';
    entry.amount = tx.amount;
  } else if (tx.type === 'transfer') {
    if (title.includes('from m1 invest')) {
      entry.action = 'DEPOSIT';
      entry.amount = tx.amount;
      entry.notes = 'Transfer from M1 Invest';
    } else if (title.includes('to m1 invest')) {
      entry.action = 'WITHDRAW';
      entry.amount = tx.amount;
      entry.notes = 'Transfer to M1 Invest';
    } else if (title.includes('to m1 borrow')) {
      entry.action = 'WITHDRAW';
      entry.amount = tx.amount;
      entry.notes = 'Margin payment to M1 Borrow';
    } else if (title === 'deposit') {
      entry.action = 'DEPOSIT';
      entry.amount = tx.amount;
    } else if (title.includes('m1 plus membership')) {
      entry.action = 'HOLD';
      entry.expense = tx.amount;
      entry.notes = 'M1 Plus Membership fee';
    } else {
      console.error('Unknown transfer:', tx.title);
      return null;
    }
  }

  return entry;
}

// Process all transactions
const entries = data.transactions
  .map(processTransaction)
  .filter(e => e !== null);

// Sort by date
entries.sort((a, b) => a.date.localeCompare(b.date));

// Calculate net change up to 2023-11-05 (the original migration date)
// The account had $150,000 at that point according to original data
let netChangeBefore = 0;
entries.forEach(e => {
  if (e.date > '2023-11-05') return;
  if (e.action === 'DEPOSIT' && e.amount) netChangeBefore += e.amount;
  else if (e.action === 'WITHDRAW' && e.amount) netChangeBefore -= e.amount;
  else if (e.cash_interest) netChangeBefore += e.cash_interest;
  else if (e.expense) netChangeBefore -= e.expense;
});

console.log('Net change before 2023-11-05:', netChangeBefore.toFixed(2));
console.log('To have $150,000 on 2023-11-05, opening balance needed:', (150000 - netChangeBefore).toFixed(2));

// Calculate the minimum balance (most negative point) to determine opening balance
let runningBalance = 0;
let minRunningBalance = 0;
entries.forEach(e => {
  if (e.action === 'DEPOSIT' && e.amount) runningBalance += e.amount;
  else if (e.action === 'WITHDRAW' && e.amount) runningBalance -= e.amount;
  else if (e.cash_interest) runningBalance += e.cash_interest;
  else if (e.expense) runningBalance -= e.expense;
  if (runningBalance < minRunningBalance) minRunningBalance = runningBalance;
});

// Opening balance should make the minimum point = 0 (or slightly positive)
const openingBalance = Math.ceil(-minRunningBalance) + 100; // Add $100 buffer
console.log('Minimum running balance without opening:', minRunningBalance.toFixed(2));
console.log('Opening balance to stay positive:', openingBalance);

entries.unshift({
  date: '2023-08-01',
  value: openingBalance,
  action: 'DEPOSIT',
  amount: openingBalance,
  cash_interest: null,
  expense: null,
  margin_available: null,
  notes: 'Opening balance (calculated to keep balance non-negative)'
});

// Calculate running balance
let balance = 0;
entries.forEach(e => {
  if (e.action === 'DEPOSIT' && e.amount) balance += e.amount;
  else if (e.action === 'WITHDRAW' && e.amount) balance -= e.amount;
  else if (e.cash_interest) balance += e.cash_interest;
  else if (e.expense) balance -= e.expense;
  e.value = Math.round(balance * 100) / 100;
});

console.log('\nTotal entries:', entries.length);
console.log('Final balance:', balance.toFixed(2));

// Generate TSV
const headers = ['date', 'value', 'cash', 'action', 'amount', 'shares', 'price', 'dividend', 'expense', 'cash_interest', 'fund_size', 'margin_available', 'margin_borrowed', 'notes'];
const rows = [headers.join('\t')];

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
  ];
  rows.push(row.join('\t'));
});

// Write TSV
fs.writeFileSync('data/funds/m1-cash.tsv', rows.join('\n') + '\n');
console.log('\nWrote', entries.length, 'entries to data/funds/m1-cash.tsv');

// Verify balance on 2023-11-05
const nov5Entry = entries.find(e => e.date === '2023-11-05' || (e.date > '2023-11-05' && entries.indexOf(e) > 0));
const nov5Index = entries.findIndex(e => e.date > '2023-11-05');
if (nov5Index > 0) {
  console.log('Balance just before 2023-11-05:', entries[nov5Index - 1].value.toFixed(2));
}
