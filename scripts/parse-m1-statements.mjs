#!/usr/bin/env node
/**
 * M1 Finance Statement Parser
 *
 * Parses M1-Invest and M1-Earn PDF statements to extract:
 * - Stock dividends (from M1-Invest)
 * - Substitute payments (from M1-Invest)
 * - Cash interest (from M1-Earn/High-Yield Savings)
 *
 * Usage:
 *   node scripts/parse-m1-statements.mjs [options]
 *
 * Options:
 *   --dir <path>     Directory containing M1 PDF statements (default: ./data/statements/m1)
 *   --output <path>  Output JSON file (default: stdout)
 *   --format <type>  Output format: json, tsv, or summary (default: json)
 *   --year <year>    Filter to specific year (optional)
 *   --verbose        Show detailed parsing info
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

// Parse command line arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue
}
const hasArg = (name) => args.includes(`--${name}`)

const STATEMENTS_DIR = getArg('dir', './data/statements/m1')
const OUTPUT_FILE = getArg('output', null)
const OUTPUT_FORMAT = getArg('format', 'json')
const FILTER_YEAR = getArg('year', null)
const VERBOSE = hasArg('verbose')

/**
 * Extract date from filename like M1-Invest-2024-12.pdf or M1-Earn-2025-01.pdf
 */
function parseFilename(filename) {
  const patterns = [
    /M1-Invest-(\d{4})-(\d{2})\.pdf$/i,
    /M1-Earn-(\d{4})-(\d{2})\.pdf$/i,
    /M1-Statement-(\d{4})-(\d{2})\.pdf$/i
  ]

  for (const pattern of patterns) {
    const match = filename.match(pattern)
    if (match) {
      const [, year, month] = match
      const type = filename.toLowerCase().includes('earn') ? 'earn'
                 : filename.toLowerCase().includes('invest') ? 'invest'
                 : 'statement'
      return { year, month, type }
    }
  }
  return null
}

/**
 * Parse M1-Earn statement for interest paid
 */
function parseEarnStatement(text, year, month) {
  const result = {
    type: 'earn',
    period: `${year}-${month}`,
    interest: 0,
    details: []
  }

  // Look for "Interest Paid" in summary section
  // Format: "Interest Paid $681.53" or "Interest Paid                $92.53"
  const interestMatch = text.match(/Interest Paid\s+\$?([\d,]+\.?\d*)/i)
  if (interestMatch) {
    result.interest = parseFloat(interestMatch[1].replace(/,/g, ''))
  }

  // Also look for individual interest application entries
  // Format: "2024-01-31 Interest application $681.53"
  const applicationPattern = /(\d{4}-\d{2}-\d{2})\s+Interest application\s+\$?([\d,]+\.?\d*)/gi
  let match
  while ((match = applicationPattern.exec(text)) !== null) {
    result.details.push({
      date: match[1],
      amount: parseFloat(match[2].replace(/,/g, '')),
      description: 'Interest application'
    })
  }

  return result
}

/**
 * Parse M1-Invest statement for dividends and substitute payments
 */
function parseInvestStatement(text, year, month) {
  const result = {
    type: 'invest',
    period: `${year}-${month}`,
    dividends: [],
    substitutePayments: [],
    totalDividends: 0,
    totalSubstitutePayments: 0
  }

  // Extract summary totals
  // "Paid dividends $332.28 $1,447.21"
  const dividendSummary = text.match(/Paid dividends\s+\$?([\d,]+\.?\d*)/i)
  if (dividendSummary) {
    result.totalDividends = parseFloat(dividendSummary[1].replace(/,/g, ''))
  }

  // "Substitute payments $1,229.02 $1,705.53"
  const subPaySummary = text.match(/Substitute payments\s+\$?([\d,]+\.?\d*)/i)
  if (subPaySummary) {
    result.totalSubstitutePayments = parseFloat(subPaySummary[1].replace(/,/g, ''))
  }

  // Extract individual dividend entries
  // Format: "12/12/2024 12/12/2024 Dividend DIV:MSFT(0.8300/sh):TAXCD:A MSFT -- -- -- -- -- $32.92"
  // Or: "DIVIDEND 12/12/24 C VANGUARD INDEX FUNDS 0.9412 $217.20"

  // Pattern for newer format statements
  const divPattern1 = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+Dividend\s+DIV:(\w+)\([^)]+\)[^\$]*\$?([\d,]+\.?\d*)/gi
  let match
  while ((match = divPattern1.exec(text)) !== null) {
    const [, dateStr, symbol, amount] = match
    const [m, d, y] = dateStr.split('/')
    result.dividends.push({
      date: `${y}-${m}-${d}`,
      symbol,
      amount: parseFloat(amount.replace(/,/g, '')),
      type: 'dividend'
    })
  }

  // Pattern for older IRA format: "DIVIDEND 12/26/25 C NVIDIA CORP 0.01 $0.19"
  const divPattern2 = /DIVIDEND\s+(\d{2}\/\d{2}\/\d{2,4})\s+\w\s+([A-Z][A-Z0-9\s]+?)\s+([\d.]+)\s+\$?([\d,]+\.?\d*)/gi
  while ((match = divPattern2.exec(text)) !== null) {
    const [, dateStr, desc, , amount] = match
    const dateParts = dateStr.split('/')
    let y = dateParts[2]
    if (y.length === 2) y = '20' + y
    result.dividends.push({
      date: `${y}-${dateParts[0]}-${dateParts[1]}`,
      symbol: desc.trim().split(/\s+/)[0], // First word is usually the symbol-like identifier
      amount: parseFloat(amount.replace(/,/g, '')),
      type: 'dividend',
      description: desc.trim()
    })
  }

  // Pattern for substitute payments
  // "12/20/2024 12/20/2024 Subst payment DIV:MSTY(3.0821/sh):TAXCD:A MSTY -- -- -- -- -- $1,143.46"
  const subPattern1 = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+Subst payment\s+DIV:(\w+)\([^)]+\)[^\$]*\$?([\d,]+\.?\d*)/gi
  while ((match = subPattern1.exec(text)) !== null) {
    const [, dateStr, symbol, amount] = match
    const [m, d, y] = dateStr.split('/')
    result.substitutePayments.push({
      date: `${y}-${m}-${d}`,
      symbol,
      amount: parseFloat(amount.replace(/,/g, '')),
      type: 'substitute'
    })
  }

  // Pattern for older IRA format: "SUB PAY 12/01/25 O TIDAL TRUST II 0.1352 $2.97"
  const subPattern2 = /SUB PAY\s+(\d{2}\/\d{2}\/\d{2,4})\s+\w\s+([A-Z][A-Z0-9\s]+?)\s+([\d.]+)\s+\$?([\d,]+\.?\d*)/gi
  while ((match = subPattern2.exec(text)) !== null) {
    const [, dateStr, desc, , amount] = match
    const dateParts = dateStr.split('/')
    let y = dateParts[2]
    if (y.length === 2) y = '20' + y
    result.substitutePayments.push({
      date: `${y}-${dateParts[0]}-${dateParts[1]}`,
      symbol: desc.trim(),
      amount: parseFloat(amount.replace(/,/g, '')),
      type: 'substitute',
      description: desc.trim()
    })
  }

  return result
}

/**
 * Parse a combined M1-Statement file (older format)
 */
function parseStatementFile(text, year, month) {
  // These older statements may contain both invest and earn data
  const investResult = parseInvestStatement(text, year, month)
  const earnResult = parseEarnStatement(text, year, month)

  return {
    type: 'combined',
    period: `${year}-${month}`,
    invest: investResult,
    earn: earnResult
  }
}

/**
 * Process a single PDF file
 */
async function processPdf(filePath) {
  const filename = basename(filePath)
  const parsed = parseFilename(filename)

  if (!parsed) {
    if (VERBOSE) console.error(`Skipping unrecognized file: ${filename}`)
    return null
  }

  if (FILTER_YEAR && parsed.year !== FILTER_YEAR) {
    return null
  }

  const dataBuffer = await readFile(filePath)
  const data = new Uint8Array(dataBuffer)
  const parser = new PDFParse(data)
  await parser.load()
  const result = await parser.getText()
  // Combine all page texts
  const text = result.pages.map(p => p.text).join('\n')

  if (VERBOSE) {
    console.error(`Processing: ${filename} (${parsed.type} ${parsed.year}-${parsed.month})`)
  }

  switch (parsed.type) {
    case 'earn':
      return parseEarnStatement(text, parsed.year, parsed.month)
    case 'invest':
      return parseInvestStatement(text, parsed.year, parsed.month)
    case 'statement':
      return parseStatementFile(text, parsed.year, parsed.month)
    default:
      return null
  }
}

/**
 * Main function
 */
async function main() {
  const files = await readdir(STATEMENTS_DIR)
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf')).sort()

  const results = {
    earnInterest: [],
    investDividends: [],
    investSubstitutePayments: [],
    summaryByMonth: {}
  }

  for (const file of pdfFiles) {
    const filePath = join(STATEMENTS_DIR, file)
    const data = await processPdf(filePath)

    if (!data) continue

    const period = data.period

    if (!results.summaryByMonth[period]) {
      results.summaryByMonth[period] = {
        earnInterest: 0,
        investDividends: 0,
        investSubstitutePayments: 0
      }
    }

    if (data.type === 'earn') {
      if (data.interest > 0) {
        results.earnInterest.push({
          period: data.period,
          amount: data.interest,
          details: data.details
        })
        results.summaryByMonth[period].earnInterest = data.interest
      }
    } else if (data.type === 'invest') {
      results.summaryByMonth[period].investDividends = data.totalDividends
      results.summaryByMonth[period].investSubstitutePayments = data.totalSubstitutePayments

      results.investDividends.push(...data.dividends)
      results.investSubstitutePayments.push(...data.substitutePayments)
    } else if (data.type === 'combined') {
      if (data.earn.interest > 0) {
        results.earnInterest.push({
          period: data.period,
          amount: data.earn.interest,
          details: data.earn.details
        })
        results.summaryByMonth[period].earnInterest = data.earn.interest
      }
      results.summaryByMonth[period].investDividends = data.invest.totalDividends
      results.summaryByMonth[period].investSubstitutePayments = data.invest.totalSubstitutePayments

      results.investDividends.push(...data.invest.dividends)
      results.investSubstitutePayments.push(...data.invest.substitutePayments)
    }
  }

  // Sort results by date
  results.earnInterest.sort((a, b) => a.period.localeCompare(b.period))
  results.investDividends.sort((a, b) => a.date.localeCompare(b.date))
  results.investSubstitutePayments.sort((a, b) => a.date.localeCompare(b.date))

  // Calculate totals
  results.totals = {
    earnInterest: results.earnInterest.reduce((sum, e) => sum + e.amount, 0),
    investDividends: results.investDividends.reduce((sum, d) => sum + d.amount, 0),
    investSubstitutePayments: results.investSubstitutePayments.reduce((sum, s) => sum + s.amount, 0)
  }

  // Output based on format
  let output
  switch (OUTPUT_FORMAT) {
    case 'summary':
      output = formatSummary(results)
      break
    case 'tsv':
      output = formatTsv(results)
      break
    case 'json':
    default:
      output = JSON.stringify(results, null, 2)
  }

  if (OUTPUT_FILE) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(OUTPUT_FILE, output)
    console.log(`Output written to ${OUTPUT_FILE}`)
  } else {
    console.log(output)
  }
}

function formatSummary(results) {
  const lines = [
    '=== M1 Statement Summary ===',
    '',
    '--- Monthly M1-Earn Interest ---'
  ]

  for (const entry of results.earnInterest) {
    lines.push(`${entry.period}: $${entry.amount.toFixed(2)}`)
  }
  lines.push(`TOTAL Earn Interest: $${results.totals.earnInterest.toFixed(2)}`)

  lines.push('', '--- Monthly Invest Summary ---')
  const periods = Object.keys(results.summaryByMonth).sort()
  for (const period of periods) {
    const data = results.summaryByMonth[period]
    const total = data.investDividends + data.investSubstitutePayments
    if (total > 0) {
      lines.push(`${period}: Div $${data.investDividends.toFixed(2)} + Sub $${data.investSubstitutePayments.toFixed(2)} = $${total.toFixed(2)}`)
    }
  }
  lines.push(`TOTAL Stock Dividends: $${results.totals.investDividends.toFixed(2)}`)
  lines.push(`TOTAL Substitute Payments: $${results.totals.investSubstitutePayments.toFixed(2)}`)

  return lines.join('\n')
}

function formatTsv(results) {
  const lines = ['type\tperiod\tdate\tsymbol\tamount\tdescription']

  for (const entry of results.earnInterest) {
    // Use last day of month as the date for earn interest
    const [year, month] = entry.period.split('-')
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    const date = `${entry.period}-${lastDay}`
    lines.push(`earn_interest\t${entry.period}\t${date}\t\t${entry.amount}\tM1 Earn Interest`)
  }

  for (const div of results.investDividends) {
    lines.push(`dividend\t${div.date.slice(0, 7)}\t${div.date}\t${div.symbol}\t${div.amount}\t${div.description || ''}`)
  }

  for (const sub of results.investSubstitutePayments) {
    lines.push(`substitute\t${sub.date.slice(0, 7)}\t${sub.date}\t${sub.symbol}\t${sub.amount}\t${sub.description || ''}`)
  }

  return lines.join('\n')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
