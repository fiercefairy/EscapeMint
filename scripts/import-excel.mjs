import XLSX from 'xlsx'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const filePath = process.argv[2] || '/Users/antic/Downloads/fund - v5.0.4 - snapshot 2025-12-28.xlsx'
const outputDir = join(projectRoot, 'data', 'funds')

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

const workbook = XLSX.readFile(filePath)

// Platform mapping based on Totals sheet structure
const platformMap = {
  'BTC': 'robinhood',
  'ETH': 'robinhood',
  'SPXL': 'robinhood',
  'STRC': 'robinhood',
  'TQQQ': 'robinhood',
  'M1': 'm1',
  'M1-C': 'm1',
  'BTC-D': 'coinbase',
  'CRO': 'cryptocom',
  'DOGE': 'cryptocom',
  'BTC-C': 'closed',
  'FNGA': 'closed',
  'LTC': 'closed',
  'MSTR': 'closed',
  'MSTU': 'closed',
  'QLD': 'closed',
  'SOL': 'closed',
  'VTI': 'closed',
  'VYM': 'closed',
  'MSTY': 'robinhood'
}

// Find column indices by header name
function findColumns(headerRow) {
  const cols = {}
  for (let i = 0; i < headerRow.length; i++) {
    const header = headerRow[i]
    switch (header) {
      case 'Date': cols.date = i; break
      case '$ Value': cols.value = i; break
      case 'Dividend': cols.dividend = i; break
      case 'Expense': cols.expense = i; break
      case 'Limit': cols.limit = i; break
      case '⚡Buy/(Sell)': cols.action_amount = i; break
      case 'Fund': cols.fund_size = i; break
      case 'Cash APY': cols.cash_apy = i; break
      case 'Margin APR': cols.margin_apr = i; break
      case 'Interval': cols.interval_days = i; break
      case 'Target APY': cols.target_apy = i; break
      case 'Input Min': cols.input_min = i; break
      case 'Input Mid': cols.input_mid = i; break
      case 'Input Max': cols.input_max = i; break
      case 'Max @': cols.max_at_pct = i; break
      case 'Min Profit': cols.min_profit = i; break
      case 'Accumulate': cols.accumulate = i; break
    }
  }
  return cols
}

// Skip non-fund sheets
const skipSheets = ['Totals', 'Template']

function excelDateToISO(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') return null
  const date = new Date((excelDate - 25569) * 86400 * 1000)
  return date.toISOString().split('T')[0]
}

function parseConfig(row, cols) {
  const cash_apy = parseFloat(row[cols.cash_apy])
  return {
    fund_size: parseFloat(row[cols.fund_size]) || 0,
    cash_apy: cash_apy > 0 ? cash_apy : 0.044, // Default to 4.4% if 0 or missing
    margin_apr: parseFloat(row[cols.margin_apr]) || 0.0725,
    interval_days: parseInt(row[cols.interval_days]) || 7,
    target_apy: parseFloat(row[cols.target_apy]) || 0.25,
    input_min: parseFloat(row[cols.input_min]) || 100,
    input_mid: parseFloat(row[cols.input_mid]) || 150,
    input_max: parseFloat(row[cols.input_max]) || 200,
    max_at_pct: parseFloat(row[cols.max_at_pct]) || -0.25,
    min_profit: parseFloat(row[cols.min_profit]) || 100,
    accumulate: row[cols.accumulate] === true || row[cols.accumulate] === 'true'
  }
}

function processFundSheet(sheetName, sheet, currentFundSizes = {}) {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  if (data.length < 3) {
    console.log(`  Skipping ${sheetName}: not enough rows`)
    return null
  }

  // Get header row (row 1) and find column indices
  const headerRow = data[1] || []
  const cols = findColumns(headerRow)

  if (!cols.date && cols.date !== 0) {
    console.log(`  Skipping ${sheetName}: could not find Date column`)
    return null
  }

  // Find first data row (row with numeric date)
  let firstDataRow = 2
  for (let i = 2; i < data.length; i++) {
    if (typeof data[i]?.[cols.date] === 'number') {
      firstDataRow = i
      break
    }
  }

  // Get config from first data row
  const configRow = data[firstDataRow]
  if (!configRow) {
    console.log(`  Skipping ${sheetName}: no config row found`)
    return null
  }

  const config = parseConfig(configRow, cols)
  const platform = platformMap[sheetName] || 'unknown'
  const ticker = sheetName.toLowerCase().replace('-', '')

  // Get fund size from config
  let fundSize = config.fund_size

  // Parse entries
  const entries = []
  let startDate = null

  for (let i = firstDataRow; i < data.length; i++) {
    const row = data[i]
    if (!row || typeof row[cols.date] !== 'number') continue

    const date = excelDateToISO(row[cols.date])
    if (!date) continue

    if (!startDate) startDate = date

    const value = parseFloat(row[cols.value]) || 0
    const dividend = parseFloat(row[cols.dividend]) || 0
    const expense = parseFloat(row[cols.expense]) || 0
    const actionAmount = parseFloat(row[cols.action_amount]) || 0
    const rowFundSize = parseFloat(row[cols.fund_size])

    // Determine action type
    let action = ''
    let amount = 0
    if (actionAmount > 0) {
      action = 'BUY'
      amount = actionAmount
    } else if (actionAmount < 0) {
      action = 'SELL'
      amount = Math.abs(actionAmount)
    }

    // Update fund size if it changed
    if (rowFundSize && rowFundSize !== fundSize) {
      fundSize = rowFundSize
    }

    entries.push({
      date,
      value,
      action: action || undefined,
      amount: amount || undefined,
      dividend: dividend || undefined,
      expense: expense || undefined,
      fund_size: rowFundSize || undefined,
      notes: undefined
    })
  }

  if (entries.length === 0) {
    console.log(`  Skipping ${sheetName}: no valid entries`)
    return null
  }

  // Use current fund size from Totals sheet if available, else from last entry
  const currentFundSize = currentFundSizes[sheetName] || fundSize

  return {
    id: `${platform}-${ticker}`,
    platform,
    ticker,
    config: {
      fund_size: currentFundSize,
      target_apy: config.target_apy,
      interval_days: config.interval_days,
      input_min: config.input_min,
      input_mid: config.input_mid,
      input_max: config.input_max,
      max_at_pct: config.max_at_pct,
      min_profit: config.min_profit,
      cash_apy: config.cash_apy,
      margin_apr: config.margin_apr,
      accumulate: config.accumulate,
      start_date: startDate
    },
    entries
  }
}

function writeFundFile(fund) {
  const configLine = [
    `#fund_size:${fund.config.fund_size}`,
    `target_apy:${fund.config.target_apy}`,
    `interval_days:${fund.config.interval_days}`,
    `input_min:${fund.config.input_min}`,
    `input_mid:${fund.config.input_mid}`,
    `input_max:${fund.config.input_max}`,
    `max_at_pct:${fund.config.max_at_pct}`,
    `min_profit:${fund.config.min_profit}`,
    `cash_apy:${fund.config.cash_apy}`,
    `margin_apr:${fund.config.margin_apr}`,
    `accumulate:${fund.config.accumulate}`,
    `start_date:${fund.config.start_date}`
  ].join('\t')

  const headers = 'date\tvalue\taction\tamount\tdividend\texpense\tfund_size\tnotes'

  const rows = fund.entries.map(e => [
    e.date,
    e.value,
    e.action || '',
    e.amount || '',
    e.dividend || '',
    e.expense || '',
    e.fund_size || '',
    e.notes || ''
  ].join('\t'))

  const content = [configLine, headers, ...rows].join('\n') + '\n'
  const filePath = join(outputDir, `${fund.id}.tsv`)

  writeFileSync(filePath, content)
  console.log(`  Written: ${filePath} (${fund.entries.length} entries)`)
}

// Get current fund sizes from Totals sheet
const currentFundSizes = {}
const totalsSheet = workbook.Sheets['Totals']
if (totalsSheet) {
  const totalsData = XLSX.utils.sheet_to_json(totalsSheet, { header: 1 })
  const fundNames = totalsData[1] || []
  const fundSizes = totalsData[2] || []

  for (let i = 1; i < fundNames.length; i++) {
    const name = fundNames[i]
    const size = parseFloat(fundSizes[i])
    if (name && !isNaN(size)) {
      currentFundSizes[name] = size
    }
  }
}
console.log('Current fund sizes from Totals:', currentFundSizes)

// Process all fund sheets
console.log('\n=== Importing Funds ===')
const fundSheets = workbook.SheetNames.filter(name => !skipSheets.includes(name))

let importedCount = 0
for (const sheetName of fundSheets) {
  console.log(`Processing: ${sheetName}`)
  const fund = processFundSheet(sheetName, workbook.Sheets[sheetName], currentFundSizes)
  if (fund) {
    writeFundFile(fund)
    importedCount++
  }
}

console.log(`\n=== Import Complete ===`)
console.log(`Imported ${importedCount} funds to ${outputDir}`)

// Also extract and save Totals data for dashboard reference
if (totalsSheet) {
  const totalsData = XLSX.utils.sheet_to_json(totalsSheet, { header: 1 })
  const totalsPath = join(outputDir, '..', 'totals-snapshot.json')

  // Extract key metrics from Totals
  const metrics = {
    snapshot_date: new Date().toISOString().split('T')[0],
    funds: [],
    aggregate: {}
  }

  // Row indices for metrics
  const METRIC_ROWS = {
    current_fund_size: 2,
    time_weighted_fund_size: 3,
    days_active: 5,
    current_as_asset: 16,
    asset_liquid_value: 17,
    asset_target_value: 18,
    fund_liquid_value: 19,
    realized_cash_interest: 20,
    realized_dividend: 21,
    realized_expense: 22,
    realized_asset_revenue: 23,
    realized_gain: 24,
    realized_apy: 25,
    projected_annual_return: 27,
    current_fund_liquid_return: 28,
    current_fund_liquid_gain: 29
  }

  // Fund column indices (from row 1)
  const fundNames = totalsData[1]?.slice(1, 20) || []

  for (let i = 0; i < fundNames.length; i++) {
    const fundName = fundNames[i]
    if (!fundName || fundName === 'All' || fundName === 'ck') continue

    const fundMetrics = {
      name: fundName,
      platform: platformMap[fundName] || 'unknown'
    }

    for (const [key, rowIdx] of Object.entries(METRIC_ROWS)) {
      const row = totalsData[rowIdx]
      if (row) {
        fundMetrics[key] = parseFloat(row[i + 1]) || 0
      }
    }

    metrics.funds.push(fundMetrics)
  }

  // Get aggregate values (column "All" - index 20)
  const allColIdx = 20
  for (const [key, rowIdx] of Object.entries(METRIC_ROWS)) {
    const row = totalsData[rowIdx]
    if (row) {
      metrics.aggregate[key] = parseFloat(row[allColIdx]) || 0
    }
  }

  writeFileSync(totalsPath, JSON.stringify(metrics, null, 2))
  console.log(`Saved totals snapshot to ${totalsPath}`)
}
