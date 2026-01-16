import type { HistoricalData, PricePoint, DateRange, DividendPayment } from '../data/types'

export interface Allocation {
  SPXL: number
  BRGNX: number
  TQQQ: number
  BTC: number
}

export interface BlendedPriceResult {
  prices: PricePoint[]
  startingPrices: {
    SPXL: number
    BRGNX: number
    TQQQ: number
    BTC: number
  }
  dividends: {
    SPXL: DividendPayment[]
    BRGNX: DividendPayment[]
    TQQQ: DividendPayment[]
  }
}

export function blendPrices(
  historicalData: Record<string, HistoricalData>,
  allocation: Allocation,
  dateRange: DateRange
): PricePoint[] {
  return blendPricesWithDividends(historicalData, allocation, dateRange).prices
}

export function blendPricesWithDividends(
  historicalData: Record<string, HistoricalData>,
  allocation: Allocation,
  dateRange: DateRange
): BlendedPriceResult {
  const spxl = historicalData.SPXL.prices
  const spy = historicalData.BRGNX.prices
  const tqqq = historicalData.TQQQ.prices
  const btc = historicalData.BTC.prices

  // Build date lookup maps for fast access
  const spxlMap = new Map(spxl.map(p => [p.date, p.value]))
  const spyMap = new Map(spy.map(p => [p.date, p.value]))
  const tqqqMap = new Map(tqqq.map(p => [p.date, p.value]))
  const btcMap = new Map(btc.map(p => [p.date, p.value]))

  // Get all dates in range (use SPXL as reference, it has most complete data)
  const dates = spxl
    .map(p => p.date)
    .filter(d => d >= dateRange.start && d <= dateRange.end)

  if (dates.length === 0) {
    return {
      prices: [],
      startingPrices: { SPXL: 1, BRGNX: 1, TQQQ: 1, BTC: 1 },
      dividends: { SPXL: [], BRGNX: [], TQQQ: [] }
    }
  }

  // Get starting values for normalization
  const firstDate = dates[0]
  const spxlStart = spxlMap.get(firstDate) || 1
  const spyStart = spyMap.get(firstDate) || 1
  const tqqqStart = tqqqMap.get(firstDate) || 1
  const btcStart = btcMap.get(firstDate) || 1

  // Filter dividends to date range
  const spxlDividendsRaw = historicalData.SPXL.dividends || []
  const spyDividendsRaw = historicalData.BRGNX.dividends || []
  const tqqqDividendsRaw = historicalData.TQQQ.dividends || []

  const spxlDividends = spxlDividendsRaw
    .filter(d => d.exDate >= dateRange.start && d.exDate <= dateRange.end)
  const spyDividends = spyDividendsRaw
    .filter(d => d.exDate >= dateRange.start && d.exDate <= dateRange.end)
  const tqqqDividends = tqqqDividendsRaw
    .filter(d => d.exDate >= dateRange.start && d.exDate <= dateRange.end)

  // Debug: Log dividend filtering
  console.log('Price blender dividend filtering:', {
    spxlRaw: spxlDividendsRaw.length,
    spyRaw: spyDividendsRaw.length,
    tqqqRaw: tqqqDividendsRaw.length,
    dateRange,
    spxlFiltered: spxlDividends.length,
    spyFiltered: spyDividends.length,
    tqqqFiltered: tqqqDividends.length
  })

  // Blend prices by allocation, normalizing each asset to start at 100
  const prices = dates.map(date => {
    // Normalize each asset (start value = 100)
    const spxlNorm = ((spxlMap.get(date) || 0) / spxlStart) * 100
    const spyNorm = ((spyMap.get(date) || 0) / spyStart) * 100
    const tqqqNorm = ((tqqqMap.get(date) || 0) / tqqqStart) * 100
    const btcNorm = ((btcMap.get(date) || 0) / btcStart) * 100

    // Calculate weighted blend
    const blendedValue =
      (spxlNorm * allocation.SPXL) +
      (spyNorm * allocation.BRGNX) +
      (tqqqNorm * allocation.TQQQ) +
      (btcNorm * allocation.BTC)

    return {
      date,
      value: blendedValue
    }
  })

  return {
    prices,
    startingPrices: {
      SPXL: spxlStart,
      BRGNX: spyStart,
      TQQQ: tqqqStart,
      BTC: btcStart
    },
    dividends: {
      SPXL: spxlDividends,
      BRGNX: spyDividends,
      TQQQ: tqqqDividends
    }
  }
}
