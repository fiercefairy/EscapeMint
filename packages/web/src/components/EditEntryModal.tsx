import { useState } from 'react'
import { toast } from 'sonner'
import { updateFundEntry, type FundEntry } from '../api/funds'

interface EditEntryModalProps {
  fundId: string
  fundTicker: string
  entryIndex: number
  entry: FundEntry
  onClose: () => void
  onUpdated: () => void
}

export function EditEntryModal({ fundId, fundTicker, entryIndex, entry, onClose, onUpdated }: EditEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    date: entry.date,
    value: entry.value.toString(),
    action: (entry.action ?? '') as '' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW',
    amount: entry.amount?.toString() ?? '',
    fund_size: entry.fund_size?.toString() ?? '',
    dividend: entry.dividend?.toString() ?? '',
    expense: entry.expense?.toString() ?? '',
    cash_interest: entry.cash_interest?.toString() ?? '',
    margin_borrowed: entry.margin_borrowed?.toString() ?? '',
    notes: entry.notes ?? ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const updatedEntry: FundEntry = {
      date: formData.date,
      value: parseFloat(formData.value) || 0
    }

    if (formData.action) {
      updatedEntry.action = formData.action
      updatedEntry.amount = parseFloat(formData.amount) || 0
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

    if (formData.notes) {
      updatedEntry.notes = formData.notes
    }

    const response = await updateFundEntry(fundId, entryIndex, updatedEntry)

    if (response.error) {
      toast.error(response.error)
    } else {
      toast.success('Entry updated successfully')
      onUpdated()
      onClose()
    }

    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2">Edit Entry</h2>
        <p className="text-slate-400 text-sm mb-4">Update entry for {fundTicker.toUpperCase()}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date and Value Row */}
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
              <label className="block text-sm text-slate-400 mb-1">Equity Value ($)</label>
              <input
                type="number"
                value={formData.value}
                onChange={e => setFormData({ ...formData, value: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Current value"
                step="0.01"
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
                onChange={e => setFormData({ ...formData, action: e.target.value as '' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW' })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              >
                <option value="">None</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="WITHDRAW">WITHDRAW</option>
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
                disabled={!formData.action}
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
                placeholder="Override fund size"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Margin Borrowed ($)</label>
              <input
                type="number"
                value={formData.margin_borrowed}
                onChange={e => setFormData({ ...formData, margin_borrowed: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Optional"
                step="0.01"
              />
            </div>
          </div>

          {/* Dividend and Expense Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Dividend ($)</label>
              <input
                type="number"
                value={formData.dividend}
                onChange={e => setFormData({ ...formData, dividend: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Optional"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Expense ($)</label>
              <input
                type="number"
                value={formData.expense}
                onChange={e => setFormData({ ...formData, expense: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                placeholder="Optional"
                step="0.01"
              />
            </div>
          </div>

          {/* Cash Interest */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Cash Interest ($)</label>
            <input
              type="number"
              value={formData.cash_interest}
              onChange={e => setFormData({ ...formData, cash_interest: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              placeholder="Optional"
              step="0.01"
            />
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
        </form>
      </div>
    </div>
  )
}
