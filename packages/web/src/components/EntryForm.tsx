import { useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { FundEntry } from '../api/funds'

export type ActionType = '' | 'BUY' | 'SELL' | 'HOLD'

export interface EntryFormData {
  date: string
  value: string
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
  notes: string
}

interface EntryFormProps {
  formData: EntryFormData
  setFormData: React.Dispatch<React.SetStateAction<EntryFormData>>
  existingEntries?: FundEntry[]
  baseFundSize?: number
  showFundSizeAdjustment?: boolean
  cashAvailable?: number | undefined
  marginAvailable?: number | undefined
  currentFundSize?: number | undefined
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

export function EntryForm({ formData, setFormData, existingEntries = [], baseFundSize = 0, showFundSizeAdjustment = false, cashAvailable, marginAvailable, currentFundSize }: EntryFormProps) {
  // Get cumulative shares from all existing entries
  const getCumulativeShares = useCallback(() => {
    let total = 0
    for (const e of existingEntries) {
      if (e?.shares) total += e.shares
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

    // Calculate price per share from this transaction
    const price = amount / Math.abs(shares)

    // Get cumulative shares from prior entries
    const priorShares = getCumulativeShares()

    if (priorShares === 0) {
      toast.error('No prior share history to calculate equity from')
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
    const deposit = parseFloat(formData.deposit) || 0
    const withdrawal = parseFloat(formData.withdrawal) || 0
    const dividend = parseFloat(formData.dividend) || 0
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
      const deposit = parseFloat(formData.deposit) || 0
      const withdrawal = parseFloat(formData.withdrawal) || 0
      const adjustment = deposit - withdrawal
      if (adjustment !== 0) {
        const newFundSize = currentFundSize + adjustment
        setFormData(prev => {
          // Only update if fund_size is empty or was auto-set (avoid overwriting manual entry)
          const currentVal = parseFloat(prev.fund_size) || 0
          const expectedPrev = currentFundSize + (parseFloat(prev.deposit) || 0) - (parseFloat(prev.withdrawal) || 0)
          if (prev.fund_size === '' || Math.abs(currentVal - expectedPrev) < 0.01) {
            return { ...prev, fund_size: newFundSize.toFixed(2) }
          }
          return prev
        })
      }
    }
  }, [formData.deposit, formData.withdrawal, currentFundSize, showFundSizeAdjustment, setFormData])

  return (
    <div className="space-y-4">
      {/* ACTION SECTION */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">Action</h3>

        {/* Row 1: Date, Equity, Action, Amount */}
        <div className="grid grid-cols-4 gap-4">
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
              onChange={e => setFormData(prev => ({ ...prev, action: e.target.value as ActionType }))}
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
            {/* Shortfall helper - show deposit/borrow buttons when amount exceeds cash */}
            {formData.action === 'BUY' && cashAvailable !== undefined && currentFundSize !== undefined && (() => {
              const amount = parseFloat(formData.amount) || 0
              const shortfall = amount - cashAvailable
              if (shortfall > 0.01) {
                return (
                  <div className="mt-1 flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const depositAmount = Math.ceil(shortfall)
                        const newFundSize = currentFundSize + depositAmount
                        setFormData(prev => ({
                          ...prev,
                          deposit: depositAmount.toFixed(2),
                          fund_size: newFundSize.toFixed(2)
                        }))
                        toast.success(`Deposit $${depositAmount} added, fund size → $${newFundSize.toFixed(2)}`)
                      }}
                      className="px-2 py-0.5 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
                    >
                      Deposit ${Math.ceil(shortfall)}
                    </button>
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

        {/* Row 2: Shares, Price, Calc Button */}
        <div className="grid grid-cols-4 gap-4">
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
      </div>

      {/* FUND MANAGEMENT SECTION */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">Fund Management</h3>

        {/* Row 1: Fund Size, Deposit, Withdrawal */}
        <div className="grid grid-cols-4 gap-4">
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
          <div>
            <label className="block text-sm text-slate-400 mb-1">Deposit ($)</label>
            <input
              type="number"
              value={formData.deposit}
              onChange={e => setFormData(prev => ({ ...prev, deposit: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              placeholder="0"
              step="0.01"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Withdrawal ($)</label>
            <input
              type="number"
              value={formData.withdrawal}
              onChange={e => setFormData(prev => ({ ...prev, withdrawal: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              placeholder="0"
              step="0.01"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Dividend ($)</label>
            <input
              type="number"
              value={formData.dividend}
              onChange={e => setFormData(prev => ({ ...prev, dividend: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              placeholder="0"
              step="0.01"
              min="0"
            />
          </div>
        </div>

        {/* Row 2: Expense, Interest, Margin Available, Margin Borrowed */}
        <div className="grid grid-cols-4 gap-4">
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
      </div>
    </div>
  )
}

// Helper to build FundEntry from form data
export function buildEntryFromForm(formData: EntryFormData): Partial<FundEntry> {
  const entry: Partial<FundEntry> = {
    date: formData.date,
    value: parseFloat(formData.value) || 0
  }

  const depositVal = parseFloat(formData.deposit) || 0
  const withdrawalVal = parseFloat(formData.withdrawal) || 0
  let notes = formData.notes

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

  if (formData.shares) entry.shares = parseFloat(formData.shares)
  if (formData.price) entry.price = parseFloat(formData.price)

  const fundSize = parseFloat(formData.fund_size) || 0
  if (fundSize > 0) entry.fund_size = fundSize

  if (notes) entry.notes = notes
  if (formData.dividend) entry.dividend = parseFloat(formData.dividend)
  if (formData.expense) entry.expense = parseFloat(formData.expense)
  if (formData.cash_interest) entry.cash_interest = parseFloat(formData.cash_interest)
  if (formData.margin_available) entry.margin_available = parseFloat(formData.margin_available)
  if (formData.margin_borrowed) entry.margin_borrowed = parseFloat(formData.margin_borrowed)

  return entry
}

// Helper to create initial form data for new entry
export function createEmptyFormData(): EntryFormData {
  return {
    date: new Date().toISOString().split('T')[0] as string,
    value: '',
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
    notes: ''
  }
}

// Helper to create form data from existing entry
export function createFormDataFromEntry(entry: FundEntry, calculatedFundSize?: number): EntryFormData {
  const getActionType = (): ActionType => {
    if (entry.action === 'BUY' || entry.action === 'SELL') return entry.action
    return entry.action ? 'HOLD' : ''
  }

  return {
    date: entry.date,
    value: entry.value.toFixed(2),
    action: getActionType(),
    amount: entry.amount?.toFixed(2) ?? '',
    shares: entry.shares?.toString() ?? '',
    price: entry.price?.toFixed(8) ?? '',
    deposit: parseDepositFromNotes(entry.notes),
    withdrawal: parseWithdrawalFromNotes(entry.notes),
    dividend: entry.dividend?.toFixed(2) ?? '',
    expense: entry.expense?.toFixed(2) ?? '',
    cash_interest: entry.cash_interest?.toFixed(2) ?? '',
    fund_size: (entry.fund_size ?? calculatedFundSize)?.toFixed(2) ?? '',
    margin_available: entry.margin_available?.toFixed(2) ?? '',
    margin_borrowed: entry.margin_borrowed?.toFixed(2) ?? '',
    notes: cleanNotesOfDepositWithdrawal(entry.notes)
  }
}
