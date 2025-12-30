import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { addFundEntry, previewRecommendation, type FundEntry, type FundState, type Recommendation } from '../api/funds'

interface AddEntryModalProps {
  fundId: string
  fundTicker: string
  currentRecommendation?: Recommendation | null | undefined
  onClose: () => void
  onAdded: () => void
}

type ActionType = '' | 'BUY' | 'SELL' | 'HOLD'

export function AddEntryModal({ fundId, fundTicker, currentRecommendation, onClose, onAdded }: AddEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [result, setResult] = useState<{ state: FundState; recommendation: Recommendation } | null>(null)
  const [preview, setPreview] = useState<{ state: FundState; recommendation: Recommendation | null } | null>(null)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0] as string,
    value: '',
    action: '' as ActionType,
    amount: '',
    deposit: '',
    withdrawal: '',
    dividend: '',
    expense: '',
    cash_interest: '',
    notes: ''
  })

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

  // Debounced preview fetch
  const fetchPreview = useCallback(async (equityValue: number, date: string) => {
    if (isNaN(equityValue)) return

    setPreviewLoading(true)
    const response = await previewRecommendation(fundId, equityValue, date)
    setPreviewLoading(false)

    if (response.data) {
      setPreview(response.data)

      // Auto-fill action and amount from recommendation
      const rec = response.data.recommendation
      if (rec) {
        const newAction = rec.action as ActionType
        setFormData(prev => ({
          ...prev,
          action: newAction,
          amount: rec.amount.toFixed(2)
        }))
      } else {
        // No recommendation means HOLD
        setFormData(prev => ({
          ...prev,
          action: 'HOLD',
          amount: ''
        }))
      }
    }
  }, [fundId])

  // Fetch preview when equity value changes
  useEffect(() => {
    const value = parseFloat(formData.value)
    if (!isNaN(value) && value >= 0) {
      const timeoutId = setTimeout(() => {
        fetchPreview(value, formData.date)
      }, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [formData.value, formData.date, fetchPreview])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const entry: Partial<FundEntry> = {
      date: formData.date,
      value: parseFloat(formData.value) || 0
    }

    // Only add action/amount for BUY/SELL (not HOLD)
    if (formData.action && formData.action !== 'HOLD') {
      entry.action = formData.action
      entry.amount = parseFloat(formData.amount) || 0
    }

    // Handle deposit/withdrawal - store as DEPOSIT/WITHDRAW action if present
    // These affect cash pool but not equity
    const depositVal = parseFloat(formData.deposit)
    const withdrawalVal = parseFloat(formData.withdrawal)

    if (depositVal > 0) {
      // If we also have a BUY/SELL, we need to record both
      // For now, deposit/withdrawal are recorded via fund_size changes in the entry
      // This is a simplification - deposits add to available cash
      entry.notes = (entry.notes ?? '') + (entry.notes ? ' | ' : '') + `Deposit: $${depositVal}`
    }

    if (withdrawalVal > 0) {
      entry.notes = (entry.notes ?? '') + (entry.notes ? ' | ' : '') + `Withdrawal: $${withdrawalVal}`
    }

    if (formData.dividend) {
      entry.dividend = parseFloat(formData.dividend)
    }

    if (formData.expense) {
      entry.expense = parseFloat(formData.expense)
    }

    if (formData.cash_interest) {
      entry.cash_interest = parseFloat(formData.cash_interest)
    }

    if (formData.notes && !entry.notes?.includes(formData.notes)) {
      entry.notes = formData.notes + (entry.notes ? ' | ' + entry.notes : '')
    }

    const response = await addFundEntry(fundId, entry)

    if (response.error) {
      toast.error(response.error)
    } else if (response.data) {
      toast.success('Entry recorded')
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

  // Result view after submission
  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Action Recorded</h2>

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
                <p className="text-slate-400">Cash Available</p>
                <p className="text-white font-medium">{formatCurrency(result.state.cash_available_usd)}</p>
              </div>
            </div>
          </div>

          {/* Next Recommendation */}
          {result.recommendation && (
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
          )}

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

  // Determine recommendation to display
  const displayRec = preview?.recommendation ?? currentRecommendation
  const displayState = preview?.state

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2">Take Action</h2>
        <p className="text-slate-400 text-sm mb-4">Record activity for {fundTicker.toUpperCase()}</p>

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
                placeholder="Asset value now"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          {/* Live Recommendation Banner */}
          {formData.value && (
            <div className={`rounded-lg p-3 ${
              previewLoading
                ? 'bg-slate-700/50 border border-slate-600'
                : displayRec?.action === 'BUY'
                  ? 'bg-blue-900/30 border border-blue-800'
                  : displayRec?.action === 'SELL'
                    ? 'bg-orange-900/30 border border-orange-800'
                    : 'bg-slate-700/50 border border-slate-600'
            }`}>
              {previewLoading ? (
                <p className="text-slate-400 text-sm">Calculating recommendation...</p>
              ) : displayRec ? (
                <>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-slate-400">Recommended Action</p>
                      <p className={`font-semibold ${
                        displayRec.action === 'BUY' ? 'text-blue-400' : 'text-orange-400'
                      }`}>
                        {displayRec.action} {formatCurrency(displayRec.amount)}
                      </p>
                    </div>
                    {displayState && (
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Cash Available</p>
                        <p className="text-white text-sm">{formatCurrency(displayState.cash_available_usd)}</p>
                      </div>
                    )}
                  </div>
                  {displayRec.insufficient_cash && (
                    <p className="text-xs text-yellow-400 mt-1">Insufficient cash - amount limited</p>
                  )}
                </>
              ) : (
                <p className="text-slate-400 text-sm">HOLD - No action needed</p>
              )}
            </div>
          )}

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
              disabled={loading || !formData.action}
              className="flex-1 px-4 py-2 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Recording...' : 'Record Action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
