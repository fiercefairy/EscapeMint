import { useState } from 'react'
import { toast } from 'sonner'
import { updateFundEntry, deleteFundEntry, type FundEntry } from '../api/funds'

interface EditEntryModalProps {
  fundId: string
  fundTicker: string
  entryIndex: number
  entry: FundEntry
  onClose: () => void
  onUpdated: () => void
}

type ActionType = '' | 'BUY' | 'SELL' | 'HOLD'

export function EditEntryModal({ fundId, fundTicker, entryIndex, entry, onClose, onUpdated }: EditEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Parse any deposit/withdrawal from notes (legacy format)
  const parseDepositFromNotes = (notes: string | undefined): string => {
    if (!notes) return ''
    const match = notes.match(/Deposit:\s*\$?([\d.]+)/)
    return match ? match[1] ?? '' : ''
  }

  const parseWithdrawalFromNotes = (notes: string | undefined): string => {
    if (!notes) return ''
    const match = notes.match(/Withdrawal:\s*\$?([\d.]+)/)
    return match ? match[1] ?? '' : ''
  }

  const cleanNotesOfDepositWithdrawal = (notes: string | undefined): string => {
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

  // Determine action type - BUY/SELL or HOLD (no trade)
  const getActionType = (): ActionType => {
    if (entry.action === 'BUY' || entry.action === 'SELL') {
      return entry.action
    }
    // DEPOSIT/WITHDRAW actions or no action = HOLD
    return entry.action ? 'HOLD' : ''
  }

  const [formData, setFormData] = useState({
    date: entry.date,
    value: entry.value.toString(),
    action: getActionType(),
    amount: entry.amount?.toString() ?? '',
    deposit: parseDepositFromNotes(entry.notes),
    withdrawal: parseWithdrawalFromNotes(entry.notes),
    dividend: entry.dividend?.toString() ?? '',
    expense: entry.expense?.toString() ?? '',
    cash_interest: entry.cash_interest?.toString() ?? '',
    fund_size: entry.fund_size?.toString() ?? '',
    margin_borrowed: entry.margin_borrowed?.toString() ?? '',
    notes: cleanNotesOfDepositWithdrawal(entry.notes)
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const updatedEntry: FundEntry = {
      date: formData.date,
      value: parseFloat(formData.value) || 0
    }

    // Add action (BUY/SELL/HOLD) - amount only for BUY/SELL
    if (formData.action) {
      updatedEntry.action = formData.action as 'BUY' | 'SELL' | 'HOLD'
      if (formData.action !== 'HOLD' && formData.amount) {
        updatedEntry.amount = parseFloat(formData.amount) || 0
      }
    }

    // Build notes with deposit/withdrawal info
    let notes = formData.notes
    const depositVal = parseFloat(formData.deposit)
    const withdrawalVal = parseFloat(formData.withdrawal)

    if (depositVal > 0) {
      notes = (notes ? notes + ' | ' : '') + `Deposit: $${depositVal}`
    }
    if (withdrawalVal > 0) {
      notes = (notes ? notes + ' | ' : '') + `Withdrawal: $${withdrawalVal}`
    }

    if (notes) {
      updatedEntry.notes = notes
    }

    if (formData.fund_size) {
      updatedEntry.fund_size = parseFloat(formData.fund_size)
    }

    if (formData.dividend) {
      updatedEntry.dividend = parseFloat(formData.dividend)
    }

    if (formData.expense) {
      updatedEntry.expense = parseFloat(formData.expense)
    }

    if (formData.cash_interest) {
      updatedEntry.cash_interest = parseFloat(formData.cash_interest)
    }

    if (formData.margin_borrowed) {
      updatedEntry.margin_borrowed = parseFloat(formData.margin_borrowed)
    }

    const response = await updateFundEntry(fundId, entryIndex, updatedEntry)

    if (response.error) {
      toast.error(response.error)
    } else {
      toast.success('Entry updated')
      onUpdated()
      onClose()
    }

    setLoading(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const response = await deleteFundEntry(fundId, entryIndex)
    if (response.error) {
      toast.error(response.error)
    } else {
      toast.success('Entry deleted')
      onUpdated()
      onClose()
    }
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2">Edit Entry</h2>
        <p className="text-slate-400 text-sm mb-4">Update entry for {fundTicker.toUpperCase()}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date and Equity Value Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Current Equity ($)</label>
              <input
                type="number"
                value={formData.value}
                onChange={e => setFormData({ ...formData, value: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Asset value"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          {/* Action Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Action Taken</label>
              <select
                value={formData.action}
                onChange={e => setFormData({ ...formData, action: e.target.value as ActionType })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              >
                <option value="">Select...</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
                <option value="HOLD">HOLD (no trade)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Amount ($)</label>
              <input
                type="number"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500 disabled:opacity-50"
                placeholder="Trade amount"
                step="0.01"
                min="0"
                disabled={!formData.action || formData.action === 'HOLD'}
              />
            </div>
          </div>

          {/* Deposit/Withdrawal Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Deposit ($)</label>
              <input
                type="number"
                value={formData.deposit}
                onChange={e => setFormData({ ...formData, deposit: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Cash added"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Withdrawal ($)</label>
              <input
                type="number"
                value={formData.withdrawal}
                onChange={e => setFormData({ ...formData, withdrawal: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Cash removed"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Dividend, Expense, Cash Interest Row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Dividend ($)</label>
              <input
                type="number"
                value={formData.dividend}
                onChange={e => setFormData({ ...formData, dividend: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="0"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Expense ($)</label>
              <input
                type="number"
                value={formData.expense}
                onChange={e => setFormData({ ...formData, expense: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="0"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cash Interest ($)</label>
              <input
                type="number"
                value={formData.cash_interest}
                onChange={e => setFormData({ ...formData, cash_interest: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="0"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Fund Size and Margin Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Fund Size ($)</label>
              <input
                type="number"
                value={formData.fund_size}
                onChange={e => setFormData({ ...formData, fund_size: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Override"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Margin Borrowed ($)</label>
              <input
                type="number"
                value={formData.margin_borrowed}
                onChange={e => setFormData({ ...formData, margin_borrowed: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="0"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Notes</label>
            <input
              type="text"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              placeholder="Optional notes"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Delete Section */}
          <div className="border-t border-slate-700 pt-4 mt-4">
            {showDeleteConfirm ? (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-300 mb-3">Are you sure you want to delete this entry? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-1.5 text-sm bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Delete Entry
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
