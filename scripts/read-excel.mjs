import XLSX from 'xlsx'
import { readFileSync } from 'fs'

const filePath = process.argv[2] || '/Users/antic/Downloads/fund - v5.0.4 - snapshot 2025-12-28.xlsx'

const workbook = XLSX.readFile(filePath)

console.log('=== Sheet Names ===')
console.log(workbook.SheetNames.join('\n'))

// Read Totals sheet
if (workbook.SheetNames.includes('Totals')) {
  console.log('\n=== Totals Sheet ===')
  const totals = XLSX.utils.sheet_to_json(workbook.Sheets['Totals'], { header: 1 })
  totals.slice(0, 30).forEach((row, i) => {
    console.log(`Row ${i}: ${JSON.stringify(row)}`)
  })
}

// Read each sub-fund sheet (skip Totals and any other non-fund sheets)
const skipSheets = ['Totals', 'Config', 'Settings', 'Instructions', 'Template']
const fundSheets = workbook.SheetNames.filter(name => !skipSheets.includes(name))

console.log('\n=== Fund Sheets ===')
console.log(fundSheets.join(', '))

// Sample first fund sheet
if (fundSheets.length > 0) {
  const firstFund = fundSheets[0]
  console.log(`\n=== ${firstFund} Sheet (first 20 rows) ===`)
  const fundData = XLSX.utils.sheet_to_json(workbook.Sheets[firstFund], { header: 1 })
  fundData.slice(0, 20).forEach((row, i) => {
    console.log(`Row ${i}: ${JSON.stringify(row)}`)
  })

  // Show column headers from row that has 'Date' or similar
  console.log(`\n=== ${firstFund} Total Rows: ${fundData.length} ===`)
}
