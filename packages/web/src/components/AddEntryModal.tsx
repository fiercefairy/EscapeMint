import { useState } from 'react'
import { toast } from 'sonner'
import { addFundEntry, type FundEntry, type FundState, type Recommendation } from '../api/funds'

interface AddEntryModalProps {
  fundId: string
  fundTicker: string
  currentRecommendation?: Recommendation | null | undefined
  onClose: () => void
  onAdded: () => void
}

export function AddEntryModal({ fundId, fundTicker, currentRecommendation, onClose, onAdded }: AddEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ state: FundState; recommendation: Recommendation } | null>(null)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0] as string,
    value: '',
    action: '' as '' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW',
    amount: '',
    dividend: '',
    expense: '',
    notes: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const entry: Partial<FundEntry> = {
      date: formData.date,
      value: parseFloat(formData.value) || 0
    }

    if (formData.action) {
      entry.action = formData.action
      entry.amount = parseFloat(formData.amount) || 0
    }

    if (formData.dividend) {
      entry.dividend = parseFloat(formData.dividend)
    }

    if (formData.expense) {
      entry.expense = parseFloat(formData.expense)
    }

    if (formData.notes) {
      entry.notes = formData.notes
    }

    const response = await addFundEntry(fundId, entry)

    if (response.error) {
      toast.error(response.error)
    } else if (response.data) {
      toast.success('Entry added successfully')
      setResult({
        state: response.data.state,
        recommendation: response.data.recommendation
      })
    }

    setLoading(false)
  }

  const handleClose = () => {
    if (result) {
      onAdded()
    }
    onClose()
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  const formatPercent = (value: number) => {
    const pct = value * 100
    return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
  }

  // If we have a result, show the recommendation
  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Entry Added</h2>

          {/* State Summary */}
          <div className="bg-slate-900 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-400">Actual Value</p>
                <p className="text-mint-400 font-medium">{formatCurrency(result.state.actual_value_usd)}</p>
              </div>
              <div>
                <p className="text-slate-400">Expected Target</p>
                <p className="text-white font-medium">{formatCurrency(result.state.expected_target_usd)}</p>
              </div>
              <div>
                <p className="text-slate-400">Gain</p>
                <p className={`font-medium ${result.state.gain_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(result.state.gain_usd)} ({formatPercent(result.state.gain_pct)})
                </p>
              </div>
              <div>
                <p className="text-slate-400">Target Diff</p>
                <p className={`font-medium ${result.state.target_diff_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(result.state.target_diff_usd)}
                </p>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`rounded-lg p-4 mb-6 ${
            result.recommendation.action === 'BUY'
              ? 'bg-blue-900/50 border border-blue-700'
              : 'bg-orange-900/50 border border-orange-700'
          }`}>
            <p className="text-sm text-slate-300 mb-1">Next Recommended Action</p>
            <p className={`text-2xl font-bold ${
              result.recommendation.action === 'BUY' ? 'text-blue-400' : 'text-orange-400'
            }`}>
              {result.recommendation.action} {formatCurrency(result.recommendation.amount)}
            </p>
            <p className="text-xs text-slate-400 mt-2">{result.recommendation.explanation.reasoning}</p>
            {result.recommendation.insufficient_cash && (
              <p className="text-xs text-yellow-400 mt-1">Note: Insufficient cash available</p>
            )}
          </div>

          <button
            onClick={handleClose}
            className="w-full px-4 py-2 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg border border-slate-700">
        <h2 className="text-xl font-bold text-white mb-2">Add Entry</h2>
        <p className="text-slate-400 text-sm mb-4">Record a snapshot for {fundTicker.toUpperCase()}</p>

        {/* Current Recommendation Banner */}
        {currentRecommendation && (
          <div className={`rounded-lg p-3 mb-4 ${
            currentRecommendation.action === 'BUY'
              ? 'bg-blue-900/30 border border-blue-800'
              : 'bg-orange-900/30 border border-orange-800'
          }`}>
            <p className="text-xs text-slate-400">Current recommendation:</p>
            <p className={`font-semibold ${
              currentRecommendation.action === 'BUY' ? 'text-blue-400' : 'text-orange-400'
            }`}>
              {currentRecommendation.action} {formatCurrency(currentRecommendation.amount)}
            </p>
          </div>
        )}

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
              {loading ? 'Adding...' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
