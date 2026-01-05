const fs = require('fs')

// Read the old m1-save.tsv with margin data
const oldData = fs.readFileSync('data.backup/funds/m1-save.tsv', 'utf8')
const oldLines = oldData.trim().split('\n')
const oldHeaders = oldLines[0].split('\t')

// Build a map of date -> {margin_available, margin_borrowed}
const marginByDate = {}
for (let i = 1; i < oldLines.length; i++) {
  const cols = oldLines[i].split('\t')
  const date = cols[0]
  const marginAvailableIdx = oldHeaders.indexOf('margin_available')
  const marginBorrowedIdx = oldHeaders.indexOf('margin_borrowed')

  const marginAvailable = cols[marginAvailableIdx] || ''
  const marginBorrowed = cols[marginBorrowedIdx] || ''

  if (marginAvailable || marginBorrowed) {
    marginByDate[date] = {
      margin_available: marginAvailable,
      margin_borrowed: marginBorrowed
    }
  }
}

console.log('Found margin data for', Object.keys(marginByDate).length, 'dates')

// Read the new m1-cash.tsv
const newData = fs.readFileSync('data/funds/m1-cash.tsv', 'utf8')
const newLines = newData.trim().split('\n')
const newHeaders = newLines[0].split('\t')

const marginAvailableIdx = newHeaders.indexOf('margin_available')
const marginBorrowedIdx = newHeaders.indexOf('margin_borrowed')

console.log('margin_available column index:', marginAvailableIdx)
console.log('margin_borrowed column index:', marginBorrowedIdx)

// Process each line and merge margin data
let mergedCount = 0
const updatedLines = [newLines[0]] // Keep header

for (let i = 1; i < newLines.length; i++) {
  const cols = newLines[i].split('\t')
  const date = cols[0]

  if (marginByDate[date]) {
    cols[marginAvailableIdx] = marginByDate[date].margin_available
    cols[marginBorrowedIdx] = marginByDate[date].margin_borrowed
    mergedCount++
  }

  updatedLines.push(cols.join('\t'))
}

console.log('Merged margin data for', mergedCount, 'entries')

// Write updated file
fs.writeFileSync('data/funds/m1-cash.tsv', updatedLines.join('\n') + '\n')
console.log('Updated data/funds/m1-cash.tsv')
