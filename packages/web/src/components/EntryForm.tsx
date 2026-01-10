import { useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { FundEntry, FundType } from '../api/funds'
import {
  isCashFund as checkIsCashFund,
  getFundTypeFeatures
} from '@escapemint/engine'

export type ActionType = '' | 'BUY' | 'SELL' | 'HOLD'

export interface EntryFormData {
  date: string
  value: string
  cash: string  // Actual cash available in account
  action: ActionType
  amount: string
  shares: string
  price: string
  deposit: string
  withdrawal: string
  dividend: string
  expense: string
  cash_interest: string
  fund_size: string
  margin_available: string
  margin_borrowed: string
  margin_expense: string  // Margin interest expense for cash funds with margin
  notes: string
  // Derivatives-specific
  margin: string  // Actual margin locked for BUY/SELL trades
}

export interface EntryFormProps {
  formData: EntryFormData
  setFormData: React.Dispatch<React.SetStateAction<EntryFormData>>
  existingEntries?: FundEntry[]
  baseFundSize?: number
  showFundSizeAdjustment?: boolean
  cashAvailable?: number | undefined
  marginAvailable?: number | undefined
  currentFundSize?: number | undefined
  fundType?: FundType | undefined
  manageCash?: boolean | undefined
  marginEnabled?: boolean | undefined
}

// Parse deposit/withdrawal from notes (legacy format)
export const parseDepositFromNotes = (notes: string | undefined): string => {
  if (!notes) return ''
  const match = notes.match(/Deposit:\s*\$?([\d.]+)/)
  return match ? match[1] ?? '' : ''
}

export const parseWithdrawalFromNotes = (notes: string | undefined): string => {
  if (!notes) return ''
  const match = notes.match(/Withdrawal:\s*\$?([\d.]+)/)
  return match ? match[1] ?? '' : ''
}

export const cleanNotesOfDepositWithdrawal = (notes: string | undefined): string => {
  if (!notes) return ''
  return notes
    .replace(/\s*\|\s*Deposit:\s*\$?[\d.]+/g, '')
    .replace(/Deposit:\s*\$?[\d.]+\s*\|\s*/g, '')
    .replace(/Deposit:\s*\$?[\d.]+/g, '')
    .replace(/\s*\|\s*Withdrawal:\s*\$?[\d.]+/g, '')
    .replace(/Withdrawal:\s*\$?[\d.]+\s*\|\s*/g, '')
    .replace(/Withdrawal:\s*\$?[\d.]+/g, '')
    .trim()
}

// Parse formula value (e.g., "=101+102.3" -> 203.3) or plain number
export const parseFormulaValue = (input: string): number => {
  if (!input) return 0
  const trimmed = input.trim()

  // If starts with =, evaluate the formula
  if (trimmed.startsWith('=')) {
    const formula = trimmed.slice(1)
    // Split by + and - while keeping the operators
    const parts = formula.split(/([+-])/).filter(p => p.trim())

    let result = 0
    let currentOp = '+'

    for (const part of parts) {
      const trimmedPart = part.trim()
      if (trimmedPart === '+' || trimmedPart === '-') {
        currentOp = trimmedPart
      } else {
        const num = parseFloat(trimmedPart)
        if (!isNaN(num)) {
          result = currentOp === '+' ? result + num : result - num
        }
      }
    }
    return result
  }

  // Plain number
  return parseFloat(trimmed) || 0
}

export function EntryForm({ formData, setFormData, existingEntries = [], baseFundSize = 0, showFundSizeAdjustment = false, cashAvailable, marginAvailable, currentFundSize, fundType = 'stock', manageCash = true, marginEnabled = false }: EntryFormProps) {
  const isCashFund = checkIsCashFund(fundType)
  const _features = getFundTypeFeatures(fundType)
  const isCryptoFund = fundType === 'crypto'
  // Get cumulative shares from entries BEFORE the current date
  const getCumulativeShares = useCallback((beforeDate: string) => {
    let total = 0
    // Sort entries by date and only count those before the given date
    const sorted = [...existingEntries].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    for (const e of sorted) {
      if (e.date >= beforeDate) break // Stop when we reach the current date
      if (e?.shares) {
        // BUY adds shares, SELL subtracts shares
        const sharesAbs = Math.abs(e.shares)
        total += e.action === 'SELL' ? -sharesAbs : sharesAbs
      }
    }
    return total
  }, [existingEntries])

  // Calculate price from amount/shares, then equity from prior holdings at that price
  const calculatePriceEquity = () => {
    const amount = parseFloat(formData.amount) || 0
    const shares = parseFloat(formData.shares) || 0

    if (!amount || !shares) {
      toast.error('Enter amount and shares first')
      return
    }

    if (!formData.date) {
      toast.error('Enter date first')
      return
    }

    // Calculate price per share from this transaction
    const price = amount / Math.abs(shares)

    // Get cumulative shares from entries BEFORE the selected date
    const priorShares = getCumulativeShares(formData.date)

    if (priorShares === 0) {
      toast.error('No prior share history before this date to calculate equity from')
      return
    }

    // Equity = prior holdings × current price
    const equity = priorShares * price

    setFormData(prev => ({
      ...prev,
      price: price.toFixed(8),
      value: equity.toFixed(2)
    }))
    toast.success(`Price: $${price.toFixed(8)} | Prior shares: ${priorShares.toLocaleString()} | Equity: $${equity.toFixed(2)}`)
  }

  // Calculate fund size adjustment from deposit/withdrawal/dividend/expense/interest
  const fundSizeAdjustment = useMemo(() => {
    const deposit = parseFormulaValue(formData.deposit)
    const withdrawal = parseFormulaValue(formData.withdrawal)
    const dividend = parseFormulaValue(formData.dividend)
    const expense = parseFloat(formData.expense) || 0
    const cashInterest = parseFloat(formData.cash_interest) || 0
    return deposit - withdrawal + dividend - expense + cashInterest
  }, [formData.deposit, formData.withdrawal, formData.dividend, formData.expense, formData.cash_interest])

  // Auto-update fund size when adjustments change (only for edit mode with baseFundSize)
  useEffect(() => {
    if (showFundSizeAdjustment && baseFundSize > 0) {
      const newFundSize = baseFundSize + fundSizeAdjustment
      setFormData(prev => ({ ...prev, fund_size: newFundSize.toFixed(2) }))
    }
  }, [fundSizeAdjustment, baseFundSize, showFundSizeAdjustment, setFormData])

  // Auto-update fund size when deposit/withdrawal changes in add mode (using currentFundSize from preview)
  useEffect(() => {
    if (!showFundSizeAdjustment && currentFundSize !== undefined && currentFundSize > 0) {
      const deposit = parseFormulaValue(formData.deposit)
      const withdrawal = parseFormulaValue(formData.withdrawal)
      const adjustment = deposit - withdrawal
      if (adjustment !== 0) {
        const newFundSize = currentFundSize + adjustment
        setFormData(prev => {
          // Only update if fund_size is empty or was auto-set (avoid overwriting manual entry)
          const currentVal = parseFloat(prev.fund_size) || 0
          const expectedPrev = currentFundSize + parseFormulaValue(prev.deposit) - parseFormulaValue(prev.withdrawal)
          if (prev.fund_size === '' || Math.abs(currentVal - expectedPrev) < 0.01) {
            return { ...prev, fund_size: newFundSize.toFixed(2) }
          }
          return prev
        })
      }
    }
  }, [formData.deposit, formData.withdrawal, currentFundSize, showFundSizeAdjustment, setFormData])

  // Simplified form for cash funds - single Amount field with sign
  if (isCashFund) {
    // Parse amount to show appropriate styling
    const amountValue = parseFormulaValue(formData.amount)
    const formatCurrency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
    const amountColorClass = amountValue > 0 ? 'border-green-500' : amountValue < 0 ? 'border-red-500' : 'border-slate-600'

    return (
      <div className="space-y-4">
        {/* CASH FUND ENTRY */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-blue-400 border-b border-slate-700 pb-1">Cash Balance Entry</h3>

          {/* Row 1: Date, Cash Balance, Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cash Balance ($)</label>
              <input
                type="number"
                value={formData.value}
                onChange={e => setFormData(prev => ({ ...prev, value: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="Current cash balance"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Amount ($)</label>
              <input
                type="text"
                value={formData.amount}
                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                className={`w-full px-3 py-2 bg-slate-700 border rounded-lg text-white focus:outline-none focus:border-blue-500 ${amountColorClass}`}
                placeholder="+100 deposit, -50 withdraw"
              />
              <p className="text-xs text-slate-500 mt-1">
                {amountValue > 0 ? (
                  <span className="text-green-400">Deposit: +{formatCurrency(amountValue)}</span>
                ) : amountValue < 0 ? (
                  <span className="text-red-400">Withdraw: {formatCurrency(amountValue)}</span>
                ) : (
                  'Positive = deposit, negative = withdraw'
                )}
              </p>
            </div>
          </div>

          {/* Row 2: Interest, Margin Expense (if margin enabled), Margin Available, Margin Borrowed, Notes */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${marginEnabled ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Interest Earned ($)</label>
              <input
                type="number"
                value={formData.cash_interest}
                onChange={e => setFormData(prev => ({ ...prev, cash_interest: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="0"
                step="0.01"
                min="0"
              />
            </div>
            {marginEnabled && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Margin Expense ($)</label>
                <input
                  type="number"
                  value={formData.margin_expense}
                  onChange={e => setFormData(prev => ({ ...prev, margin_expense: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-red-600/50 rounded-lg text-white focus:outline-none focus:border-red-500"
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
                <p className="text-xs text-slate-500 mt-1">Interest charged on margin</p>
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Margin Available ($)</label>
              <input
                type="number"
                value={formData.margin_available}
                onChange={e => setFormData(prev => ({ ...prev, margin_available: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="0"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Margin Borrowed ($)</label>
              <input
                type="number"
                value={formData.margin_borrowed}
                onChange={e => setFormData(prev => ({ ...prev, margin_borrowed: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="Optional"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Standard trading fund form
  return (
    <div className="space-y-4">
      {/* ACTION SECTION */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">Action</h3>

        {/* Row 1: Date, Equity, Action, Amount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Equity ($)</label>
            <input
              type="number"
              value={formData.value}
              onChange={e => setFormData(prev => ({ ...prev, value: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              placeholder="Asset value"
              step="0.01"
              min="0"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Action</label>
            <select
              value={formData.action}
              onChange={e => {
                const action = e.target.value as ActionType
                setFormData(prev => ({
                  ...prev,
                  action,
                  // Clear amount when HOLD is selected
                  amount: action === 'HOLD' ? '' : prev.amount
                }))
              }}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
            >
              <option value="">Select...</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="HOLD">HOLD</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Amount ($)</label>
            <input
              type="number"
              value={formData.amount}
              onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500 disabled:opacity-50"
              placeholder="Trade amount"
              step="0.01"
              min="0"
              disabled={!formData.action || formData.action === 'HOLD'}
            />
            {/* Shortfall helper - show info when amount exceeds cash */}
            {formData.action === 'BUY' && cashAvailable !== undefined && (() => {
              const amount = parseFloat(formData.amount) || 0
              const shortfall = amount - cashAvailable
              if (shortfall > 0.01) {
                return (
                  <div className="mt-1 flex gap-2 flex-wrap items-center">
                    <span className="text-xs text-amber-400">
                      Shortfall: ${Math.ceil(shortfall)} - deposit to platform cash fund
                    </span>
                    {(marginAvailable ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const borrowAmount = Math.min(Math.ceil(shortfall), marginAvailable ?? 0)
                          setFormData(prev => ({
                            ...prev,
                            margin_borrowed: (parseFloat(prev.margin_borrowed || '0') + borrowAmount).toFixed(2)
                          }))
                          toast.success(`Margin borrow $${borrowAmount} added`)
                        }}
                        className="px-2 py-0.5 text-xs bg-purple-700 hover:bg-purple-600 text-white rounded transition-colors"
                      >
                        Borrow ${Math.min(Math.ceil(shortfall), marginAvailable ?? 0)}
                      </button>
                    )}
                  </div>
                )
              }
              return null
            })()}
          </div>
        </div>

        {/* Derivatives: Margin input for BUY trades */}
        {fundType === 'derivatives' && formData.action === 'BUY' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div className="sm:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Margin Locked ($)</label>
              <input
                type="number"
                value={formData.margin}
                onChange={e => setFormData(prev => ({ ...prev, margin: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-amber-500"
                placeholder={`Default: ${((parseFloat(formData.amount) || 0) * 0.20).toFixed(2)} (20%)`}
                step="0.01"
                min="0"
              />
              <p className="text-xs text-slate-500 mt-1">
                Actual margin required by exchange (from trade confirmation)
              </p>
            </div>
          </div>
        )}

      </div>

      {/* OPTIONAL FIELDS SECTION - Collapsible */}
      <details className="group">
        <summary className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1 cursor-pointer hover:text-slate-200 list-none flex items-center gap-2">
          <span className="text-slate-500 group-open:rotate-90 transition-transform">▶</span>
          Optional
        </summary>
        <div className="space-y-3 pt-3">
          {/* Shares, Price, Calc Button, Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Shares/Units</label>
              <input
                type="number"
                value={formData.shares}
                onChange={e => setFormData(prev => ({ ...prev, shares: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="0"
                step="any"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Price ($)</label>
              <input
                type="number"
                value={formData.price}
                onChange={e => setFormData(prev => ({ ...prev, price: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Per unit"
                step="any"
                min="0"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={calculatePriceEquity}
                className="w-full px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors text-sm"
                title="Calculate price from amount/shares, then equity from prior holdings"
              >
                Calc Price/Equity
              </button>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Fund Size + trading-specific fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fund Size ($)</label>
              <input
                type="number"
                value={formData.fund_size}
                onChange={e => setFormData(prev => ({ ...prev, fund_size: e.target.value }))}
                className={`w-full px-3 py-2 bg-slate-700 border rounded-lg text-white focus:outline-none focus:border-mint-500 ${
                  showFundSizeAdjustment && fundSizeAdjustment !== 0 ? 'border-mint-500' : 'border-slate-600'
                }`}
                placeholder="Override"
                step="0.01"
                min="0"
              />
              {showFundSizeAdjustment && fundSizeAdjustment !== 0 && (
                <p className={`text-xs mt-1 ${fundSizeAdjustment > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fundSizeAdjustment > 0 ? '+' : ''}{fundSizeAdjustment.toFixed(2)} adjustment
                  {baseFundSize > 0 && <span className="text-slate-500"> (base: ${baseFundSize.toFixed(2)})</span>}
                </p>
              )}
            </div>
            {/* Cash field - only show when fund manages its own cash */}
            {manageCash ? (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Cash ($)</label>
                <input
                  type="number"
                  value={formData.cash}
                  onChange={e => setFormData(prev => ({ ...prev, cash: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                  placeholder="Optional"
                  step="0.01"
                  min="0"
                />
              </div>
            ) : (
              <div className={isCryptoFund ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-1 lg:col-span-2'}>
                <div className="flex items-center h-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg">
                  <span className="text-sm text-slate-400">
                    Cash is managed at the platform level. Use the platform's cash fund for deposits/withdrawals.
                  </span>
                </div>
              </div>
            )}
            {!isCryptoFund && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Dividend ($)</label>
                <input
                  type="text"
                  value={formData.dividend}
                  onChange={e => setFormData(prev => ({ ...prev, dividend: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                  placeholder="0 or =10+20"
                />
              </div>
            )}
          </div>

          {/* Row 2: Expense, Interest, Margin Available, Margin Borrowed - only show if manageCash is true */}
          {manageCash && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Expense ($)</label>
                <input
                  type="number"
                  value={formData.expense}
                  onChange={e => setFormData(prev => ({ ...prev, expense: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Interest ($)</label>
                <input
                  type="number"
                  value={formData.cash_interest}
                  onChange={e => setFormData(prev => ({ ...prev, cash_interest: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Margin Available ($)</label>
                <input
                  type="number"
                  value={formData.margin_available}
                  onChange={e => setFormData(prev => ({ ...prev, margin_available: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Margin Borrowed ($)</label>
                <input
                  type="number"
                  value={formData.margin_borrowed}
                  onChange={e => setFormData(prev => ({ ...prev, margin_borrowed: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                  placeholder="0"
                  step="0.01"
                />
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

// Helper to build FundEntry from form data
export function buildEntryFromForm(formData: EntryFormData, fundType?: FundType): Partial<FundEntry> {
  const entry: Partial<FundEntry> = {
    date: formData.date,
    value: parseFloat(formData.value) || 0
  }

  const isCashFund = fundType === 'cash'
  let notes = formData.notes

  // Cash fund: use signed amount field directly
  // Positive amount = DEPOSIT (external money in), Negative amount = WITHDRAW (external money out)
  // MARGIN action for margin expense (interest charged on borrowed margin)
  if (isCashFund) {
    const signedAmount = parseFormulaValue(formData.amount)
    const marginExpense = parseFloat(formData.margin_expense) || 0

    // Store margin expense in a structured field if present
    if (marginExpense > 0) {
      entry.margin_expense = marginExpense
    }

    // Determine action: deposit/withdraw takes priority over pure margin expense
    if (signedAmount > 0) {
      entry.action = 'DEPOSIT'
      entry.amount = signedAmount
      if (marginExpense > 0) {
        notes = (notes ? notes + ' | ' : '') + `Margin expense: $${marginExpense}`
      }
    } else if (signedAmount < 0) {
      entry.action = 'WITHDRAW'
      entry.amount = signedAmount // Store as negative
      if (marginExpense > 0) {
        notes = (notes ? notes + ' | ' : '') + `Margin expense: $${marginExpense}`
      }
    } else if (marginExpense > 0) {
      // Pure margin expense with no external cash flow
      entry.action = 'MARGIN'
      entry.amount = marginExpense
    } else {
      entry.action = 'HOLD'
    }
  } else {
    // Trading funds: use separate deposit/withdrawal fields (legacy support)
    const depositVal = parseFormulaValue(formData.deposit)
    const withdrawalVal = parseFormulaValue(formData.withdrawal)

    // Handle action - DEPOSIT/WITHDRAW are tracked cumulatively for fund_size calculation
    if (depositVal > 0 && (!formData.action || formData.action === 'HOLD')) {
      entry.action = 'DEPOSIT'
      entry.amount = depositVal
    } else if (withdrawalVal > 0 && (!formData.action || formData.action === 'HOLD')) {
      entry.action = 'WITHDRAW'
      entry.amount = withdrawalVal
    } else if (formData.action && formData.action !== 'HOLD') {
      entry.action = formData.action
      entry.amount = parseFloat(formData.amount) || 0
      if (depositVal > 0) {
        notes = (notes ? notes + ' | ' : '') + `Deposit: $${depositVal}`
      }
      if (withdrawalVal > 0) {
        notes = (notes ? notes + ' | ' : '') + `Withdrawal: $${withdrawalVal}`
      }
    } else if (formData.action === 'HOLD') {
      entry.action = 'HOLD'
    }
  }

  if (formData.shares) entry.shares = parseFloat(formData.shares)
  if (formData.price) entry.price = parseFloat(formData.price)

  const fundSize = parseFloat(formData.fund_size) || 0
  if (fundSize > 0) entry.fund_size = fundSize

  if (notes) entry.notes = notes
  if (formData.dividend) entry.dividend = parseFormulaValue(formData.dividend)
  if (formData.expense) entry.expense = parseFloat(formData.expense)
  if (formData.cash_interest) entry.cash_interest = parseFloat(formData.cash_interest)
  if (formData.margin_available) entry.margin_available = parseFloat(formData.margin_available)
  if (formData.margin_borrowed) entry.margin_borrowed = parseFloat(formData.margin_borrowed)
  if (formData.cash) entry.cash = parseFloat(formData.cash)
  // Derivatives-specific: actual margin locked for BUY/SELL trades
  if (fundType === 'derivatives' && formData.margin) {
    entry.margin = parseFloat(formData.margin)
  }

  return entry
}

// Helper to create initial form data for new entry
export function createEmptyFormData(): EntryFormData {
  return {
    date: new Date().toISOString().split('T')[0] as string,
    value: '',
    cash: '',
    action: '' as ActionType,
    amount: '',
    shares: '',
    price: '',
    deposit: '',
    withdrawal: '',
    dividend: '',
    expense: '',
    cash_interest: '',
    fund_size: '',
    margin_available: '',
    margin_borrowed: '',
    margin_expense: '',
    notes: '',
    margin: ''
  }
}

// Helper to create form data from existing entry
export function createFormDataFromEntry(entry: FundEntry, calculatedFundSize?: number, fundType?: FundType): EntryFormData {
  const isCashFund = fundType === 'cash'

  const getActionType = (): ActionType => {
    if (entry.action === 'BUY' || entry.action === 'SELL') return entry.action
    return entry.action ? 'HOLD' : ''
  }

  // For cash funds: convert to signed amount for the unified Amount field
  // DEPOSIT = positive, WITHDRAW = negative (handle old format where WITHDRAW had positive amount)
  // MARGIN = margin expense, shown in separate field
  const getCashFundAmount = (): string => {
    // MARGIN entries have amount in margin_expense field, not amount field
    if (entry.action === 'MARGIN') {
      return ''
    }
    if (entry.action === 'DEPOSIT' && entry.amount) {
      return entry.amount.toFixed(2) // Keep positive
    }
    if (entry.action === 'WITHDRAW' && entry.amount) {
      // Old format stored as positive, new format as negative
      // Convert to negative for form display
      return entry.amount > 0 ? (-entry.amount).toFixed(2) : entry.amount.toFixed(2)
    }
    // HOLD with amount - already signed
    if (entry.amount) {
      return entry.amount.toFixed(2)
    }
    return ''
  }

  // Get margin expense for MARGIN action entries
  const getMarginExpense = (): string => {
    if (entry.action === 'MARGIN' && entry.amount) {
      return entry.amount.toFixed(2)
    }
    return ''
  }

  // For trading funds: use separate deposit/withdrawal fields (legacy support)
  const getDeposit = (): string => {
    if (entry.action === 'DEPOSIT' && entry.amount) {
      return entry.amount.toFixed(2)
    }
    // HOLD with positive amount = deposit
    if (entry.action === 'HOLD' && entry.amount && entry.amount > 0) {
      return entry.amount.toFixed(2)
    }
    return parseDepositFromNotes(entry.notes)
  }

  const getWithdrawal = (): string => {
    if (entry.action === 'WITHDRAW' && entry.amount) {
      return Math.abs(entry.amount).toFixed(2) // Show as positive in withdrawal field
    }
    // HOLD with negative amount = withdrawal
    if (entry.action === 'HOLD' && entry.amount && entry.amount < 0) {
      return Math.abs(entry.amount).toFixed(2)
    }
    return parseWithdrawalFromNotes(entry.notes)
  }

  return {
    date: entry.date,
    value: entry.value.toFixed(2),
    cash: entry.cash?.toFixed(2) ?? '',
    action: getActionType(),
    // For cash funds, use signed amount; for trading funds, use raw amount
    amount: isCashFund ? getCashFundAmount() : (entry.amount?.toFixed(2) ?? ''),
    shares: entry.shares?.toString() ?? '',
    price: entry.price?.toFixed(8) ?? '',
    deposit: getDeposit(),
    withdrawal: getWithdrawal(),
    dividend: entry.dividend?.toFixed(2) ?? '',
    expense: entry.expense?.toFixed(2) ?? '',
    cash_interest: entry.cash_interest?.toFixed(2) ?? '',
    fund_size: (entry.fund_size ?? calculatedFundSize)?.toFixed(2) ?? '',
    margin_available: entry.margin_available?.toFixed(2) ?? '',
    margin_borrowed: entry.margin_borrowed?.toFixed(2) ?? '',
    margin_expense: getMarginExpense(),
    notes: cleanNotesOfDepositWithdrawal(entry.notes),
    margin: entry.margin?.toFixed(2) ?? ''
  }
}
