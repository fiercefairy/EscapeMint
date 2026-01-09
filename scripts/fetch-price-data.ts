/**
 * Fetch 5 years of weekly price data for test fund generation
 * Run with: npx tsx scripts/fetch-price-data.ts
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface PriceData {
  date: string // YYYY-MM-DD
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const OUTPUT_DIR = join(__dirname, '../packages/server/src/data')

// Get date 5 years ago
function getFiveYearsAgo(): Date {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 5)
  return date
}

// For stocks that don't trade on Wednesday (holiday), find nearest available day
function getWednesdayOrNearest(data: PriceData[]): PriceData[] {
  const result: PriceData[] = []
  const dataByDate = new Map(data.map(d => [d.date, d]))

  // Start from 5 years ago, iterate week by week
  const startDate = getFiveYearsAgo()
  const endDate = new Date()

  // Find first Wednesday
  while (startDate.getDay() !== 3) {
    startDate.setDate(startDate.getDate() + 1)
  }

  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]

    // Try Wednesday first
    if (dataByDate.has(dateStr)) {
      result.push(dataByDate.get(dateStr)!)
    } else {
      // Try Thursday (day after)
      const thursday = new Date(currentDate)
      thursday.setDate(thursday.getDate() + 1)
      const thursdayStr = thursday.toISOString().split('T')[0]

      if (dataByDate.has(thursdayStr)) {
        // Use Thursday's data but mark it as the Wednesday date
        const thursdayData = { ...dataByDate.get(thursdayStr)!, date: dateStr }
        result.push(thursdayData)
      } else {
        // Try Tuesday (day before)
        const tuesday = new Date(currentDate)
        tuesday.setDate(tuesday.getDate() - 1)
        const tuesdayStr = tuesday.toISOString().split('T')[0]

        if (dataByDate.has(tuesdayStr)) {
          const tuesdayData = { ...dataByDate.get(tuesdayStr)!, date: dateStr }
          result.push(tuesdayData)
        }
        // If neither available, skip this week
      }
    }

    // Move to next Wednesday
    currentDate.setDate(currentDate.getDate() + 7)
  }

  return result
}

// Fetch from Yahoo Finance
async function fetchYahooFinance(symbol: string): Promise<PriceData[]> {
  const fiveYearsAgo = getFiveYearsAgo()
  const period1 = Math.floor(fiveYearsAgo.getTime() / 1000)
  const period2 = Math.floor(Date.now() / 1000)

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`

  console.log(`Fetching ${symbol} from Yahoo Finance...`)

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  })

  if (!response.ok) {
    throw new Error(`Yahoo Finance API error: ${response.status} ${response.statusText}`)
  }

  const json = await response.json()
  const result = json.chart.result[0]
  const timestamps = result.timestamp
  const quote = result.indicators.quote[0]

  const data: PriceData[] = []
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.close[i] === null) continue

    const date = new Date(timestamps[i] * 1000)
    data.push({
      date: date.toISOString().split('T')[0],
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i]
    })
  }

  return data
}

// Fetch BTC-USD from Yahoo Finance (they have crypto data)
async function fetchBitcoinYahoo(): Promise<PriceData[]> {
  // BTC-USD is available on Yahoo Finance
  return fetchYahooFinance('BTC-USD')
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log('Starting price data fetch...\n')

  // Fetch stock data
  const tqqqRaw = await fetchYahooFinance('TQQQ')
  const spxlRaw = await fetchYahooFinance('SPXL')

  // Fetch crypto data (Yahoo Finance has BTC-USD)
  const btcRaw = await fetchBitcoinYahoo()

  // Filter to Wednesdays (or nearest trading day for stocks)
  const tqqq = getWednesdayOrNearest(tqqqRaw)
  const spxl = getWednesdayOrNearest(spxlRaw)
  // BTC trades 24/7 but Yahoo Finance only has daily data, use same logic
  const btc = getWednesdayOrNearest(btcRaw)

  console.log(`\nTQQQ: ${tqqqRaw.length} daily -> ${tqqq.length} weekly (Wednesdays)`)
  console.log(`SPXL: ${spxlRaw.length} daily -> ${spxl.length} weekly (Wednesdays)`)
  console.log(`BTC: ${btcRaw.length} daily -> ${btc.length} weekly (Wednesdays)`)

  // Save to files
  const tqqqPath = join(OUTPUT_DIR, 'tqqq-weekly.json')
  const spxlPath = join(OUTPUT_DIR, 'spxl-weekly.json')
  const btcPath = join(OUTPUT_DIR, 'btcusd-weekly.json')

  writeFileSync(tqqqPath, JSON.stringify(tqqq, null, 2))
  writeFileSync(spxlPath, JSON.stringify(spxl, null, 2))
  writeFileSync(btcPath, JSON.stringify(btc, null, 2))

  console.log(`\nSaved to:`)
  console.log(`  ${tqqqPath}`)
  console.log(`  ${spxlPath}`)
  console.log(`  ${btcPath}`)

  // Print date ranges
  console.log(`\nDate ranges:`)
  console.log(`  TQQQ: ${tqqq[0]?.date} to ${tqqq[tqqq.length - 1]?.date}`)
  console.log(`  SPXL: ${spxl[0]?.date} to ${spxl[spxl.length - 1]?.date}`)
  console.log(`  BTC: ${btc[0]?.date} to ${btc[btc.length - 1]?.date}`)
}

main().catch(console.error)
