#!/usr/bin/env node
/**
 * Backfill cash interest for a fund based on APY rates per entry.
 *
 * Usage: node scripts/backfill-cash-interest.mjs <fund-file> <apy-file>
 *
 * The APY file should have one APY percentage per line (e.g., "4.65" for 4.65%)
 * corresponding to each entry in order (oldest to newest).
 *
 * Interest is calculated daily based on cash balance and paid out monthly.
 * Any remaining accrued interest is paid on the final entry.
 */

import { readFileSync, writeFileSync } from 'fs'

function parseTSV(content) {
  const lines = content.trim().split('\n')
  const headers = lines[0].split('\t')

  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const entry = {
      date: values[0],
      value: parseFloat(values[1]) || 0,
      action: values[2] || undefined,
      amount: values[3] ? parseFloat(values[3]) : undefined,
      dividend: values[4] ? parseFloat(values[4]) : undefined,
      expense: values[5] ? parseFloat(values[5]) : undefined,
      cash_interest: values[6] ? parseFloat(values[6]) : undefined,
      fund_size: values[7] ? parseFloat(values[7]) : undefined,
      margin_borrowed: values[8] ? parseFloat(values[8]) : undefined,
      notes: values[9] || undefined
    }
    entries.push(entry)
  }

  return { headers, entries }
}

function entriesToTSV(headers, entries) {
  const lines = [headers.join('\t')]

  for (const e of entries) {
    const row = [
      e.date,
      e.value.toString(),
      e.action ?? '',
      e.amount?.toString() ?? '',
      e.dividend?.toString() ?? '',
      e.expense?.toString() ?? '',
      e.cash_interest ? e.cash_interest.toFixed(2) : '',
      e.fund_size?.toString() ?? '',
      e.margin_borrowed?.toString() ?? '',
      e.notes ?? ''
    ]
    lines.push(row.join('\t'))
  }

  return lines.join('\n') + '\n'
}

function getMonth(dateStr) {
  return dateStr.slice(0, 7) // "YYYY-MM"
}

function daysBetween(date1, date2) {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log('Usage: node scripts/backfill-cash-interest.mjs <fund-file> <apy-file>')
    console.log('  apy-file: one APY percentage per line (e.g., 4.65 for 4.65%)')
    process.exit(1)
  }

  const fundFile = args[0]
  const apyFile = args[1]

  // Read fund data
  const fundContent = readFileSync(fundFile, 'utf-8')
  const { headers, entries } = parseTSV(fundContent)

  // Read APY rates
  const apyContent = readFileSync(apyFile, 'utf-8')
  const apyRates = apyContent.trim().split('\n').map(line => {
    const val = parseFloat(line.replace('%', '').trim())
    return val / 100 // Convert percentage to decimal
  })

  if (apyRates.length !== entries.length) {
    console.error(`Mismatch: ${entries.length} entries but ${apyRates.length} APY rates`)
    process.exit(1)
  }

  // Calculate cash balance and interest for each entry
  let totalInvested = 0
  let accruedInterest = 0
  let lastPaidMonth = ''
  let prevDate = ''

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const apy = apyRates[i]
    const currentMonth = getMonth(entry.date)

    // Update invested amount based on action
    if (entry.action === 'BUY' && entry.amount) {
      totalInvested += entry.amount
    } else if (entry.action === 'SELL' && entry.amount) {
      totalInvested -= entry.amount
      if (totalInvested < 0) totalInvested = 0
    }

    // Calculate cash available
    const fundSize = entry.fund_size ?? 0
    const cash = Math.max(0, fundSize - totalInvested)

    // Calculate days since last entry (for interest calculation)
    const days = prevDate ? daysBetween(prevDate, entry.date) : 1

    // Daily interest rate from APY: (1 + APY)^(1/365) - 1
    const dailyRate = Math.pow(1 + apy, 1/365) - 1

    // Accrue interest for the period
    const periodInterest = cash * dailyRate * days
    accruedInterest += periodInterest

    // Check if we should pay out (new month or final entry)
    const isNewMonth = lastPaidMonth && currentMonth !== lastPaidMonth
    const isFinalEntry = i === entries.length - 1

    if (isNewMonth || isFinalEntry) {
      // Pay out accrued interest
      if (accruedInterest > 0.01) {
        entry.cash_interest = Math.round(accruedInterest * 100) / 100
        console.log(`${entry.date}: Paid $${entry.cash_interest.toFixed(2)} cash interest (cash: $${cash.toFixed(2)}, APY: ${(apy * 100).toFixed(2)}%)`)
        accruedInterest = 0
      }
    }

    lastPaidMonth = currentMonth
    prevDate = entry.date
  }

  // Write updated fund data
  const outputContent = entriesToTSV(headers, entries)
  writeFileSync(fundFile, outputContent)
  console.log(`\nUpdated ${fundFile}`)
}

main()
