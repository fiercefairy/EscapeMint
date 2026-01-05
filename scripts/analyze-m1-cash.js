const data = require('../data/scrape-archives/m1-cash.json');

// Find transactions with empty/invalid dates
const badDates = data.transactions.filter(t => !t.date || t.date === '');
console.log('Transactions with empty dates:', badDates.length);
badDates.forEach(t => console.log(JSON.stringify(t)));

// Get date range
const validDates = data.transactions.filter(t => t.date).map(t => t.date).sort();
console.log('\nDate range:', validDates[0], 'to', validDates[validDates.length - 1]);

// Count by type
const typeCounts = {};
data.transactions.forEach(t => {
  typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
});
console.log('\nTransaction counts by type:', typeCounts);

// Sum by type (accounting for direction)
const typeSums = {};
data.transactions.filter(t => t.date).forEach(t => {
  const sign = t.details?.originalAmount?.startsWith('-') ? -1 : 1;
  typeSums[t.type] = (typeSums[t.type] || 0) + (t.amount * sign);
});
console.log('\nNet amounts by type:');
Object.entries(typeSums).forEach(([k, v]) => console.log('  ' + k + ':', v.toFixed(2)));

// Look at unique transfer titles to see all transfer types
const transferTitles = [...new Set(data.transactions.filter(t => t.type === 'transfer').map(t => t.title))];
console.log('\nUnique transfer titles:');
transferTitles.forEach(t => console.log('  -', t));

// Calculate what opening balance would need to be
let runningBalance = 0;
let minBalance = 0;
const sorted = data.transactions.filter(t => t.date).sort((a, b) => a.date.localeCompare(b.date));

sorted.forEach(t => {
  const sign = t.details?.originalAmount?.startsWith('-') ? -1 : 1;
  runningBalance += t.amount * sign;
  if (runningBalance < minBalance) {
    minBalance = runningBalance;
    console.log('New min balance:', minBalance.toFixed(2), 'on', t.date, '-', t.title);
  }
});

console.log('\nFinal running balance (from $0 start):', runningBalance.toFixed(2));
console.log('Minimum balance reached:', minBalance.toFixed(2));
console.log('Opening balance needed to stay positive:', Math.ceil(-minBalance));
