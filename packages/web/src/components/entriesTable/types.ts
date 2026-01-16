import type { FundEntry, FundType } from '../../api/funds'

// Column definitions with default visibility and fund type availability
export const ALL_COLUMNS = [
  { id: 'date', label: 'Date', defaultVisible: true, excludeFrom: [] },
  { id: 'equity', label: 'Equity', defaultVisible: true, excludeFrom: ['derivatives'] },
  { id: 'cash', label: 'Cash', defaultVisible: false, excludeFrom: ['cash'] },
  { id: 'action', label: 'Action', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'amount', label: 'Amount', defaultVisible: true, excludeFrom: [] },
  { id: 'shares', label: 'Shares', defaultVisible: false, excludeFrom: ['cash', 'derivatives'] },
  { id: 'cumShares', label: 'Σ Shares', defaultVisible: false, excludeFrom: ['cash', 'derivatives'] },
  { id: 'price', label: 'Price', defaultVisible: false, excludeFrom: ['cash'] },
  { id: 'invested', label: 'Invested', defaultVisible: true, excludeFrom: ['cash', 'derivatives'] },
  { id: 'dividend', label: 'Dividend', defaultVisible: true, excludeFrom: ['cash', 'crypto', 'derivatives'] },
  { id: 'expense', label: 'Expense', defaultVisible: false, excludeFrom: ['derivatives'] },
  { id: 'extracted', label: 'Extracted', defaultVisible: true, excludeFrom: ['cash', 'derivatives'] },
  { id: 'cashInt', label: 'Cash Int', defaultVisible: false, excludeFrom: ['derivatives'] },
  { id: 'unrealized', label: 'Unrealized', defaultVisible: false, excludeFrom: ['cash'] },
  { id: 'realized', label: 'Realized', defaultVisible: true, excludeFrom: [] },
  { id: 'liquidPnl', label: 'Liquid P&L', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'realizedApy', label: 'Realized APY', defaultVisible: true, excludeFrom: [] },
  { id: 'liquidApy', label: 'Liq APY', defaultVisible: true, excludeFrom: ['cash'] },
  { id: 'cumExpense', label: 'Σ Exp', defaultVisible: false, excludeFrom: ['derivatives'] },
  { id: 'cumDividends', label: 'Σ Div', defaultVisible: true, excludeFrom: ['cash', 'crypto', 'derivatives'] },
  { id: 'cumExtracted', label: 'Σ Extracted', defaultVisible: true, excludeFrom: ['cash', 'derivatives'] },
  { id: 'cumCashInt', label: 'Σ Int', defaultVisible: false, excludeFrom: ['derivatives'] },
  { id: 'marginAvail', label: 'Margin Avail', defaultVisible: false, excludeFrom: [] },
  { id: 'marginBorrowed', label: 'Margin Borrowed', defaultVisible: false, excludeFrom: [] },
  { id: 'fundSize', label: 'Fund Size', defaultVisible: true, excludeFrom: ['derivatives'] },
  { id: 'notes', label: 'Notes', defaultVisible: true, excludeFrom: [] },
  { id: 'edit', label: 'Edit', defaultVisible: true, excludeFrom: [] },
  // Derivatives-specific columns
  { id: 'contracts', label: 'Contracts', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'position', label: 'Position', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'avgEntry', label: 'Avg Entry', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'marginBalance', label: 'Cash', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'derivEquity', label: 'Equity', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'cumFunding', label: 'Σ Funding', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'cumInterest', label: 'Σ Interest', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'cumRebates', label: 'Σ Rebates', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'cumFees', label: 'Σ Fees', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'fee', label: 'Fee', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'margin', label: 'Margin', defaultVisible: false, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'marginLocked', label: 'Margin Locked', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'leverage', label: 'Leverage', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'liquidationPrice', label: 'Liq Price', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] },
  { id: 'distanceToLiq', label: 'Dist to Liq', defaultVisible: true, excludeFrom: ['stock', 'crypto', 'cash'] }
] as const

export type ColumnId = typeof ALL_COLUMNS[number]['id']

// Get columns available for a specific fund type
export const getColumnsForFundType = (fundType: FundType = 'stock') => {
  return ALL_COLUMNS.filter(c => !(c.excludeFrom as readonly string[]).includes(fundType))
}

// Cash fund specific defaults - use 'equity' for cash balance (not 'cash' which is for stock funds)
// Action column excluded since cash funds always use HOLD with signed amounts
const CASH_FUND_DEFAULT_COLUMNS: ColumnId[] = [
  'date', 'equity', 'amount', 'expense', 'cashInt', 'fundSize',
  'realized', 'realizedApy', 'cumExpense', 'cumCashInt', 'marginAvail', 'marginBorrowed', 'edit'
]

const CASH_FUND_COLUMN_ORDER: ColumnId[] = [
  'date', 'equity', 'amount', 'expense', 'cashInt', 'fundSize',
  'realized', 'realizedApy', 'cumExpense', 'cumCashInt', 'marginAvail', 'marginBorrowed', 'notes', 'edit'
]

// Derivatives fund specific defaults
const DERIVATIVES_FUND_DEFAULT_COLUMNS: ColumnId[] = [
  'date', 'action', 'amount', 'contracts', 'price', 'fee', 'margin', 'position', 'avgEntry',
  'marginBalance', 'marginLocked', 'leverage', 'derivEquity', 'unrealized', 'realized', 'liquidPnl',
  'realizedApy', 'cumFunding', 'cumInterest', 'cumRebates', 'cumFees', 'notes', 'edit'
]

const DERIVATIVES_FUND_COLUMN_ORDER: ColumnId[] = [
  'date', 'action', 'amount', 'contracts', 'price', 'fee', 'margin', 'position', 'avgEntry',
  'marginBalance', 'marginLocked', 'leverage', 'derivEquity', 'unrealized', 'realized', 'liquidPnl',
  'realizedApy', 'cumFunding', 'cumInterest', 'cumRebates', 'cumFees', 'notes', 'edit'
]

export const getDefaultColumns = (fundType: FundType = 'stock'): Set<ColumnId> => {
  if (fundType === 'cash') {
    return new Set(CASH_FUND_DEFAULT_COLUMNS)
  }
  if (fundType === 'derivatives') {
    return new Set(DERIVATIVES_FUND_DEFAULT_COLUMNS)
  }
  return new Set(
    getColumnsForFundType(fundType)
      .filter(c => c.defaultVisible)
      .map(c => c.id)
  )
}

export const getDefaultColumnOrder = (fundType: FundType = 'stock'): ColumnId[] => {
  if (fundType === 'cash') {
    return CASH_FUND_COLUMN_ORDER
  }
  if (fundType === 'derivatives') {
    return DERIVATIVES_FUND_COLUMN_ORDER
  }
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
  hasMarginIntegrityIssue: boolean  // margin_borrowed > margin_available
  // Derivatives-specific computed fields
  derivPosition?: number       // Net contract position
  derivAvgEntry?: number       // Average entry price (BTC price)
  derivMarginBalance?: number  // Running cash/margin balance
  derivCostBasis?: number      // Total cost basis of open position
  derivUnrealized?: number     // Unrealized P&L
  derivRealized?: number       // Realized P&L
  derivEquity?: number         // Position value at entry price (cost basis)
  derivCumFunding?: number     // Cumulative funding
  derivCumInterest?: number    // Cumulative interest
  derivCumRebates?: number     // Cumulative rebates
  derivCumFees?: number        // Cumulative fees (trading fees)
  // Margin tracking
  derivNotionalValue?: number      // Position value at avgEntry price
  derivMarginLocked?: number       // Actual margin locked (sum from FIFO queue)
  derivMaintenanceMargin?: number  // Minimum margin required (typically 5%)
  derivAvailableFunds?: number     // marginBalance - marginLocked
  derivMarginRatio?: number        // maintenanceMargin / marginBalance
  derivLeverage?: number           // Dynamic leverage: notionalValue / equity
  // Liquidation tracking
  derivLiquidationPrice?: number   // Estimated liquidation price
  derivMarginHealth?: number       // Buffer above liquidation (higher is safer)
  derivDistanceToLiq?: number      // Percentage distance to liquidation
}
