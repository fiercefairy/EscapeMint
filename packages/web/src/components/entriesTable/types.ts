import type { FundEntry, FundType } from '../../api/funds'

// Column definitions with default visibility and fund type availability
export const ALL_COLUMNS = [
  { id: 'date', label: 'Date', defaultVisible: true, excludeFrom: [] },
  { id: 'equity', label: 'Equity', defaultVisible: true, excludeFrom: [] },
  { id: 'cash', label: 'Cash', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'action', label: 'Action', defaultVisible: true, excludeFrom: [] },
  { id: 'amount', label: 'Amount', defaultVisible: true, excludeFrom: [] },
  { id: 'shares', label: 'Shares', defaultVisible: false, excludeFrom: ['cash'] },
  { id: 'cumShares', label: 'Σ Shares', defaultVisible: false, excludeFrom: ['cash'] },
  { id: 'price', label: 'Price', defaultVisible: false, excludeFrom: ['cash'] },
  { id: 'invested', label: 'Invested', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'dividend', label: 'Dividend', defaultVisible: true, excludeFrom: ['cash', 'crypto'] },
  { id: 'expense', label: 'Expense', defaultVisible: true, excludeFrom: [] },
  { id: 'extracted', label: 'Extracted', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'cashInt', label: 'Cash Int', defaultVisible: true, excludeFrom: [] },
  { id: 'unrealized', label: 'Unrealized', defaultVisible: false, excludeFrom: ['cash'] },
  { id: 'realized', label: 'Realized', defaultVisible: true, excludeFrom: [] },
  { id: 'liquidPnl', label: 'Liquid P&L', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'realizedApy', label: 'Realized APY', defaultVisible: true, excludeFrom: [] },
  { id: 'liquidApy', label: 'Liq APY', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'cumExpense', label: 'Σ Exp', defaultVisible: true, excludeFrom: [] },
  { id: 'cumDividends', label: 'Σ Div', defaultVisible: true, excludeFrom: ['cash', 'crypto'] },
  { id: 'cumExtracted', label: 'Σ Extracted', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'cumCashInt', label: 'Σ Int', defaultVisible: true, excludeFrom: [] },
  { id: 'marginAvail', label: 'Margin Avail', defaultVisible: false, excludeFrom: [] },
  { id: 'marginBorrowed', label: 'Margin Borrowed', defaultVisible: false, excludeFrom: [] },
  { id: 'fundSize', label: 'Fund Size', defaultVisible: true, excludeFrom: [] },
  { id: 'notes', label: 'Notes', defaultVisible: true, excludeFrom: [] },
  { id: 'edit', label: 'Edit', defaultVisible: true, excludeFrom: [] }
] as const

export type ColumnId = typeof ALL_COLUMNS[number]['id']

// Get columns available for a specific fund type
export const getColumnsForFundType = (fundType: FundType = 'stock') => {
  return ALL_COLUMNS.filter(c => !c.excludeFrom.includes(fundType))
}

export const getDefaultColumns = (fundType: FundType = 'stock'): Set<ColumnId> => {
  return new Set(
    getColumnsForFundType(fundType)
      .filter(c => c.defaultVisible)
      .map(c => c.id)
  )
}

export const getDefaultColumnOrder = (fundType: FundType = 'stock'): ColumnId[] => {
  return getColumnsForFundType(fundType).map(c => c.id)
}

// Computed entry type with all calculated fields
export interface ComputedEntry extends FundEntry {
  originalIndex: number
  fundSize: number
  totalInvested: number
  calculatedCash: number  // Calculated from fundSize - invested (display uses tracked cash ?? calculatedCash)
  cumDividends: number
  cumExpenses: number
  cumCashInterest: number
  extracted: number
  cumExtracted: number
  cumShares: number
  unrealized: number
  realized: number
  liquidPnl: number
  realizedApy: number
  liquidApy: number
  hasIntegrityIssue: boolean
}
