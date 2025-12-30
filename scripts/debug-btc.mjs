import XLSX from 'xlsx'

const filePath = '/Users/antic/Downloads/fund - v5.0.4 - snapshot 2025-12-28.xlsx'
const workbook = XLSX.readFile(filePath)

// Get BTC sheet
const sheet = workbook.Sheets['BTC']
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

console.log('=== BTC Row 0 (partial headers) ===')
console.log('Indices 40-65:', data[0]?.slice(40, 65))

console.log('\n=== BTC Row 1 (column headers) ===')
console.log('Indices 40-65:', data[1]?.slice(40, 65))

console.log('\n=== BTC Row 2 (first data row) ===')
console.log('Indices 40-65:', data[2]?.slice(40, 65))

// Look for config columns
const row1 = data[1] || []
const configHeaders = ['Cash APY', 'Margin APR', 'Interval', 'Target APY', 'Input Min', 'Input Mid', 'Input Max', 'Max @', 'Min Profit', 'Accumulate', 'Fund']
console.log('\n=== Config Columns ===')
for (const header of configHeaders) {
  for (let i = 0; i < row1.length; i++) {
    if (row1[i] === header) {
      console.log(`"${header}" at index ${i}, row2 value: ${data[2]?.[i]}`)
    }
  }
}
