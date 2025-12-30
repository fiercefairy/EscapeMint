import XLSX from 'xlsx'

const filePath = '/Users/antic/Downloads/fund - v5.0.4 - snapshot 2025-12-28.xlsx'
const workbook = XLSX.readFile(filePath)

// Get M1 sheet to understand column structure
const sheet = workbook.Sheets['M1']
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

console.log('=== Row 0 (partial headers) ===')
console.log('Indices 40-60:', data[0]?.slice(40, 65))

console.log('\n=== Row 1 (column headers) ===')
console.log('Indices 40-60:', data[1]?.slice(40, 65))

console.log('\n=== Row 2 (first data row) ===')
console.log('Indices 40-60:', data[2]?.slice(40, 65))

// Look for "Fund" in headers
const row1 = data[1] || []
for (let i = 0; i < row1.length; i++) {
  if (row1[i] === 'Fund') {
    console.log(`\n"Fund" column found at index ${i}`)
    console.log(`Value in row 2: ${data[2]?.[i]}`)
    console.log(`Value in row 3: ${data[3]?.[i]}`)
  }
}

// Also check for config columns
console.log('\n=== Config Columns (from headers) ===')
const configHeaders = ['Cash APY', 'Margin APR', 'Interval', 'Target APY', 'Input Min', 'Input Mid', 'Input Max', 'Max @', 'Min Profit', 'Accumulate']
for (const header of configHeaders) {
  for (let i = 0; i < row1.length; i++) {
    if (row1[i] === header) {
      console.log(`"${header}" at index ${i}, row2 value: ${data[2]?.[i]}`)
    }
  }
}

// Get Totals to see current fund sizes
const totals = XLSX.utils.sheet_to_json(workbook.Sheets['Totals'], { header: 1 })
console.log('\n=== From Totals Sheet ===')
console.log('Row 1 (fund names):', totals[1]?.slice(0, 22))
console.log('Row 2 (Current Fund Size):', totals[2]?.slice(0, 22))
