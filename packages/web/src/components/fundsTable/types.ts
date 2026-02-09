import type { PlatformFundMetrics } from '../../api/platforms'

// Column definitions for funds table
export const ALL_FUND_COLUMNS = [
  { id: 'ticker', label: 'Fund', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'fundType', label: 'Type', defaultVisible: false },
  { id: 'fundSize', label: 'Fund Size', defaultVisible: true },
  { id: 'currentValue', label: 'Value', defaultVisible: true },
  { id: 'cash', label: 'Cash', defaultVisible: true },
  { id: 'startInput', label: 'Invested', defaultVisible: true },
  { id: 'unrealized', label: 'Unrealized', defaultVisible: true },
  { id: 'realized', label: 'Realized', defaultVisible: false },
  { id: 'liquidPnl', label: 'Liquid P&L', defaultVisible: true },
  { id: 'dividends', label: 'Dividends', defaultVisible: false },
  { id: 'expenses', label: 'Expenses', defaultVisible: false },
  { id: 'cashInterest', label: 'Interest', defaultVisible: false },
  { id: 'daysActive', label: 'Days', defaultVisible: false },
  { id: 'realizedAPY', label: 'Real APY', defaultVisible: true },
  { id: 'liquidAPY', label: 'Liq APY', defaultVisible: true },
  { id: 'entries', label: 'Entries', defaultVisible: true },
  { id: 'audited', label: 'Audited', defaultVisible: false },
  // Derivatives-specific columns
  { id: 'position', label: 'Contracts', defaultVisible: false },
  { id: 'avgEntry', label: 'Avg Entry', defaultVisible: false },
  { id: 'marginBalance', label: 'Margin Bal', defaultVisible: false },
  { id: 'sumFunding', label: 'Funding', defaultVisible: false },
  { id: 'sumFees', label: 'Fees', defaultVisible: false }
] as const

export type FundColumnId = typeof ALL_FUND_COLUMNS[number]['id']

export const getDefaultFundColumns = (): Set<FundColumnId> => {
  return new Set(
    ALL_FUND_COLUMNS
      .filter(c => c.defaultVisible)
      .map(c => c.id)
  )
}

export const getDefaultFundColumnOrder = (): FundColumnId[] => {
  return ALL_FUND_COLUMNS.map(c => c.id)
}

export type { PlatformFundMetrics }
