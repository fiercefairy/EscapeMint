import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPXL_DIVIDENDS, TQQQ_DIVIDENDS, SPY_DIVIDENDS, BRGNX_DIVIDENDS, type DividendPayment } from '../../packages/server/src/data/dividends.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface OHLCVPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface PricePoint {
  date: string
  value: number
}

interface HistoricalData {
  ticker: string
  name: string
  type: 'stock' | 'crypto'
  startDate: string
  endDate: string
  dataPoints: number
  prices: PricePoint[]
  dividends?: DividendPayment[]
}

async function loadOHLCVData(jsonPath: string): Promise<PricePoint[]> {
  const content = await readFile(jsonPath, 'utf-8')
  const ohlcvData: OHLCVPoint[] = JSON.parse(content)

  return ohlcvData
    .filter(p => p.close > 0 && p.date)
    .map(p => ({
      date: p.date,
      value: p.close
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function buildHistoricalData() {
  const serverDataDir = resolve(__dirname, '../../packages/server/src/data')
  const outputDir = resolve(__dirname, '../public/data')

  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true })
  }

  // Process SPXL (3x S&P 500)
  console.log('Processing SPXL data from server weekly data...')
  const spxlPrices = await loadOHLCVData(resolve(serverDataDir, 'spxl-weekly.json'))
  if (spxlPrices.length === 0) {
    throw new Error('No valid SPXL data found')
  }

  const spxlData: HistoricalData = {
    ticker: 'SPXL',
    name: 'Direxion Daily S&P 500 Bull 3X Shares',
    type: 'stock',
    startDate: spxlPrices[0].date,
    endDate: spxlPrices[spxlPrices.length - 1].date,
    dataPoints: spxlPrices.length,
    prices: spxlPrices,
    dividends: SPXL_DIVIDENDS
  }
  await writeFile(
    resolve(outputDir, 'spxl-weekly.json'),
    JSON.stringify(spxlData, null, 2)
  )
  console.log(`✓ SPXL: ${spxlData.dataPoints} points (${spxlData.startDate} to ${spxlData.endDate})`)

  // Process SPY (S&P 500)
  console.log('Processing SPY data from server weekly data...')
  const spyPrices = await loadOHLCVData(resolve(serverDataDir, 'spy-weekly.json'))
  if (spyPrices.length === 0) {
    throw new Error('No valid SPY data found')
  }

  const spyData: HistoricalData = {
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    type: 'stock',
    startDate: spyPrices[0].date,
    endDate: spyPrices[spyPrices.length - 1].date,
    dataPoints: spyPrices.length,
    prices: spyPrices,
    dividends: SPY_DIVIDENDS
  }
  await writeFile(
    resolve(outputDir, 'spy-weekly.json'),
    JSON.stringify(spyData, null, 2)
  )
  console.log(`✓ SPY: ${spyData.dataPoints} points (${spyData.startDate} to ${spyData.endDate})`)

  // Process TQQQ (3x NASDAQ)
  console.log('Processing TQQQ data from server weekly data...')
  const tqqqPrices = await loadOHLCVData(resolve(serverDataDir, 'tqqq-weekly.json'))
  if (tqqqPrices.length === 0) {
    throw new Error('No valid TQQQ data found')
  }

  const tqqqData: HistoricalData = {
    ticker: 'TQQQ',
    name: 'ProShares UltraPro QQQ',
    type: 'stock',
    startDate: tqqqPrices[0].date,
    endDate: tqqqPrices[tqqqPrices.length - 1].date,
    dataPoints: tqqqPrices.length,
    prices: tqqqPrices,
    dividends: TQQQ_DIVIDENDS
  }
  await writeFile(
    resolve(outputDir, 'tqqq-weekly.json'),
    JSON.stringify(tqqqData, null, 2)
  )
  console.log(`✓ TQQQ: ${tqqqData.dataPoints} points (${tqqqData.startDate} to ${tqqqData.endDate})`)

  // Process BRGNX (Russell 1000 - SPXL comparison baseline)
  console.log('Processing BRGNX data from server weekly data...')
  const brgnxPrices = await loadOHLCVData(resolve(serverDataDir, 'brgnx-weekly.json'))
  if (brgnxPrices.length === 0) {
    throw new Error('No valid BRGNX data found')
  }

  const brgnxData: HistoricalData = {
    ticker: 'BRGNX',
    name: 'BlackRock Russell 1000 Index Fund',
    type: 'stock',
    startDate: brgnxPrices[0].date,
    endDate: brgnxPrices[brgnxPrices.length - 1].date,
    dataPoints: brgnxPrices.length,
    prices: brgnxPrices,
    dividends: BRGNX_DIVIDENDS
  }
  await writeFile(
    resolve(outputDir, 'brgnx-weekly.json'),
    JSON.stringify(brgnxData, null, 2)
  )
  console.log(`✓ BRGNX: ${brgnxData.dataPoints} points (${brgnxData.startDate} to ${brgnxData.endDate})`)

  // Process BTC
  console.log('Processing BTC data from server weekly data...')
  const btcPrices = await loadOHLCVData(resolve(serverDataDir, 'btcusd-weekly.json'))
  if (btcPrices.length === 0) {
    throw new Error('No valid BTC data found')
  }

  const btcData: HistoricalData = {
    ticker: 'BTC',
    name: 'Bitcoin',
    type: 'crypto',
    startDate: btcPrices[0].date,
    endDate: btcPrices[btcPrices.length - 1].date,
    dataPoints: btcPrices.length,
    prices: btcPrices
  }
  await writeFile(
    resolve(outputDir, 'btc-weekly.json'),
    JSON.stringify(btcData, null, 2)
  )
  console.log(`✓ BTC: ${btcData.dataPoints} points (${btcData.startDate} to ${btcData.endDate})`)

  console.log('\n✓ Historical data built successfully!')
}

buildHistoricalData().catch((error) => {
  console.error('Error building historical data:', error)
  process.exit(1)
})
