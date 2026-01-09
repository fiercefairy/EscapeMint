#!/usr/bin/env npx ts-node
/**
 * Migration script to convert cash fund DEPOSIT/WITHDRAW actions to signed amounts.
 *
 * Before: action=DEPOSIT, amount=100 (positive)
 *         action=WITHDRAW, amount=100 (positive)
 *
 * After:  action=HOLD, amount=100 (positive = deposit)
 *         action=HOLD, amount=-100 (negative = withdraw)
 *
 * Run with: npx ts-node scripts/migrate-cash-to-signed-amounts.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const FUNDS_DIR = process.env['DATA_DIR'] ? join(process.env['DATA_DIR'], 'funds') : './data/funds'

interface FundEntry {
  date: string
  value: number
  cash?: number
  action?: string
  amount?: number
  shares?: number
  price?: number
  dividend?: number
  expense?: number
  cash_interest?: number
  fund_size?: number
  margin_available?: number
  margin_borrowed?: number
  notes?: string
  [key: string]: unknown
}

interface FundConfig {
  fund_type?: string
  [key: string]: unknown
}

function parseTSV(content: string): { headers: string[]; entries: FundEntry[] } {
  const lines = content.trim().split('\n')

  // Parse headers (first line that starts with 'date')
  const headerLine = lines.find(l => l.startsWith('date\t'))
  if (!headerLine) throw new Error('No header line found')
  const headers = headerLine.split('\t')

  // Parse entries
  const entries: FundEntry[] = []
  const headerIndex = lines.indexOf(headerLine)

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line?.trim()) continue

    const values = line.split('\t')
    const entry: FundEntry = { date: '', value: 0 }

    headers.forEach((header, idx) => {
      const val = values[idx] ?? ''
      if (header === 'date' || header === 'action' || header === 'notes') {
        entry[header] = val
      } else if (val !== '') {
        entry[header] = parseFloat(val)
      }
    })

    entries.push(entry)
  }

  return { headers, entries }
}

function writeTSV(headers: string[], entries: FundEntry[]): string {
  const lines: string[] = []

  // Headers
  lines.push(headers.join('\t'))

  // Entries
  for (const entry of entries) {
    const values = headers.map(h => {
      const val = entry[h]
      if (val === undefined || val === null || val === '') return ''
      if (typeof val === 'number') {
        // Keep precision for prices, round others to 2 decimals
        if (h === 'price') return val.toFixed(8).replace(/\.?0+$/, '')
        return val.toFixed(2).replace(/\.00$/, '')
      }
      return String(val)
    })
    lines.push(values.join('\t'))
  }

  return lines.join('\n') + '\n'
}

function migrateCashFund(filePath: string): { migrated: number; unchanged: number } {
  const content = readFileSync(filePath, 'utf-8')
  const { headers, entries } = parseTSV(content)

  let migrated = 0
  let unchanged = 0

  for (const entry of entries) {
    if (entry.action === 'DEPOSIT' && entry.amount !== undefined) {
      // DEPOSIT: keep amount positive, change action to HOLD
      entry.action = 'HOLD'
      migrated++
    } else if (entry.action === 'WITHDRAW' && entry.amount !== undefined) {
      // WITHDRAW: make amount negative, change action to HOLD
      entry.amount = -Math.abs(entry.amount)
      entry.action = 'HOLD'
      migrated++
    } else {
      unchanged++
    }
  }

  if (migrated > 0) {
    const newContent = writeTSV(headers, entries)
    writeFileSync(filePath, newContent)
    console.log(`  Migrated ${migrated} entries, ${unchanged} unchanged`)
  }

  return { migrated, unchanged }
}

function main() {
  console.log('Migrating cash fund DEPOSIT/WITHDRAW to signed amounts...\n')
  console.log(`Looking in: ${FUNDS_DIR}\n`)

  const files = readdirSync(FUNDS_DIR).filter(f => f.endsWith('.tsv'))
  let totalMigrated = 0
  let totalUnchanged = 0
  let cashFundsFound = 0

  for (const file of files) {
    const filePath = join(FUNDS_DIR, file)

    // Check if config JSON exists and is a cash fund
    const configPath = filePath.replace('.tsv', '.json')
    let isCashFund = false
    try {
      const configContent = readFileSync(configPath, 'utf-8')
      const config = JSON.parse(configContent)
      isCashFund = config.fund_type === 'cash'
    } catch {
      // No config file or not parseable, check TSV content
      const content = readFileSync(filePath, 'utf-8')
      isCashFund = content.includes('"fund_type":"cash"')
    }

    if (!isCashFund) continue

    cashFundsFound++
    console.log(`Processing: ${file}`)

    const { migrated, unchanged } = migrateCashFund(filePath)
    totalMigrated += migrated
    totalUnchanged += unchanged
  }

  console.log(`\nDone!`)
  console.log(`Cash funds found: ${cashFundsFound}`)
  console.log(`Total entries migrated: ${totalMigrated}`)
  console.log(`Total entries unchanged: ${totalUnchanged}`)
}

main()
