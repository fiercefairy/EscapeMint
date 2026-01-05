import { describe, it, expect } from 'vitest'
import {
  entriesToTrades,
  entriesToDividends,
  entriesToExpenses,
  entriesToCashInterest,
  getLatestEquity,
  type FundEntry
} from '../src/fund-store.js'

describe('entriesToTrades', () => {
  it('converts BUY entries to buy trades', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 0, action: 'BUY', amount: 100 },
      { date: '2024-01-02', value: 100, action: 'BUY', amount: 100 }
    ]
    const trades = entriesToTrades(entries)
    expect(trades).toHaveLength(2)
    expect(trades[0]).toEqual({ date: '2024-01-01', amount_usd: 100, type: 'buy', value: 0 })
    expect(trades[1]).toEqual({ date: '2024-01-02', amount_usd: 100, type: 'buy', value: 100 })
  })

  it('converts SELL entries to sell trades', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 1000, action: 'SELL', amount: 500 }
    ]
    const trades = entriesToTrades(entries)
    expect(trades).toHaveLength(1)
    expect(trades[0]).toEqual({ date: '2024-01-01', amount_usd: 500, type: 'sell', value: 1000 })
  })

  it('ignores entries without action or amount', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 100 },
      { date: '2024-01-02', value: 200, action: 'BUY' }
    ]
    const trades = entriesToTrades(entries)
    expect(trades).toHaveLength(0)
  })
})

describe('entriesToDividends', () => {
  it('extracts dividend entries', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 100, dividend: 5.50 },
      { date: '2024-01-02', value: 105 },
      { date: '2024-01-03', value: 110, dividend: 6.25 }
    ]
    const dividends = entriesToDividends(entries)
    expect(dividends).toHaveLength(2)
    expect(dividends[0]).toEqual({ date: '2024-01-01', amount_usd: 5.50 })
    expect(dividends[1]).toEqual({ date: '2024-01-03', amount_usd: 6.25 })
  })
})

describe('entriesToExpenses', () => {
  it('extracts expense entries', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 100, expense: 2.50 },
      { date: '2024-01-02', value: 98 }
    ]
    const expenses = entriesToExpenses(entries)
    expect(expenses).toHaveLength(1)
    expect(expenses[0]).toEqual({ date: '2024-01-01', amount_usd: 2.50 })
  })
})

describe('entriesToCashInterest', () => {
  it('sums all cash interest', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 100, cash_interest: 10 },
      { date: '2024-01-02', value: 110, cash_interest: 15 },
      { date: '2024-01-03', value: 125 }
    ]
    const total = entriesToCashInterest(entries)
    expect(total).toBe(25)
  })

  it('returns 0 for no cash interest', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 100 }
    ]
    const total = entriesToCashInterest(entries)
    expect(total).toBe(0)
  })
})

describe('getLatestEquity', () => {
  it('returns latest entry with value', () => {
    const entries: FundEntry[] = [
      { date: '2024-01-01', value: 100 },
      { date: '2024-01-02', value: 200 },
      { date: '2024-01-03', value: 150 }
    ]
    const latest = getLatestEquity(entries)
    expect(latest).toEqual({ date: '2024-01-03', value: 150 })
  })

  it('returns null for empty entries', () => {
    const latest = getLatestEquity([])
    expect(latest).toBeNull()
  })
})
