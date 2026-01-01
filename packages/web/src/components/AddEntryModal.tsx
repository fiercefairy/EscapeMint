import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { addFundEntry, previewRecommendation, type FundEntry, type FundState, type Recommendation } from '../api/funds'
import { EntryForm, buildEntryFromForm, createEmptyFormData, type EntryFormData, type ActionType } from './EntryForm'

interface AddEntryModalProps {
  fundId: string
  fundTicker: string
  currentRecommendation?: Recommendation | null | undefined
  existingEntries?: FundEntry[]
  onClose: () => void
  onAdded: () => void
}

export function AddEntryModal({ fundId, fundTicker, currentRecommendation, existingEntries = [], onClose, onAdded }: AddEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [result, setResult] = useState<{ state: FundState; recommendation: Recommendation } | null>(null)
  const [preview, setPreview] = useState<{ state: FundState; recommendation: Recommendation | null; margin_available: number; fund_size: number } | null>(null)
  const [formData, setFormData] = useState<EntryFormData>(createEmptyFormData)

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
    }
  }, [fundId])

  // Apply recommendation to form
  const useRecommendation = useCallback(() => {
    const rec = preview?.recommendation
    if (rec) {
      setFormData(prev => ({
        ...prev,
        action: rec.action as ActionType,
        amount: rec.amount.toFixed(2)
      }))
      toast.success(`Applied: ${rec.action} ${formatCurrency(rec.amount)}`)
    } else {
      setFormData(prev => ({
        ...prev,
        action: 'HOLD',
        amount: ''
      }))
      toast.success('Applied: HOLD')
    }
  }, [preview])

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

    const entry = buildEntryFromForm(formData)
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
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-4xl border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2">Take Action</h2>
        <p className="text-slate-400 text-sm mb-4">Record activity for {fundTicker.toUpperCase()}</p>

        {/* Live Recommendation Banner */}
        {formData.value && (
          <div className={`rounded-lg p-3 mb-4 ${
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
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-xs text-slate-400">Recommended Action</p>
                      <p className={`font-semibold ${
                        displayRec.action === 'BUY' ? 'text-blue-400' : 'text-orange-400'
                      }`}>
                        {displayRec.action} {formatCurrency(displayRec.amount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={useRecommendation}
                      className="px-2 py-1 text-xs bg-mint-600 hover:bg-mint-500 text-white rounded transition-colors"
                    >
                      Use
                    </button>
                  </div>
                  {displayState && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Cash Available</p>
                      <p className="text-white text-sm">{formatCurrency(displayState.cash_available_usd)}</p>
                    </div>
                  )}
                </div>
                {displayRec.insufficient_cash && displayRec.action === 'BUY' && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <p className="text-xs text-yellow-400 mb-2">
                      Insufficient cash ({formatCurrency(displayState?.cash_available_usd ?? 0)} available, need {formatCurrency(displayRec.explanation?.limit_usd ?? displayRec.amount)})
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const needed = (displayRec.explanation?.limit_usd ?? displayRec.amount) - (displayState?.cash_available_usd ?? 0)
                          setFormData(prev => ({ ...prev, deposit: Math.ceil(needed).toFixed(2) }))
                          toast.success(`Deposit of ${formatCurrency(Math.ceil(needed))} added`)
                        }}
                        className="px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
                      >
                        + Deposit {formatCurrency(Math.ceil((displayRec.explanation?.limit_usd ?? displayRec.amount) - (displayState?.cash_available_usd ?? 0)))}
                      </button>
                      {(preview?.margin_available ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const needed = (displayRec.explanation?.limit_usd ?? displayRec.amount) - (displayState?.cash_available_usd ?? 0)
                            const borrowAmount = Math.min(needed, preview?.margin_available ?? 0)
                            setFormData(prev => ({ ...prev, margin_borrowed: (parseFloat(prev.margin_borrowed || '0') + borrowAmount).toFixed(2) }))
                            toast.success(`Margin borrow of ${formatCurrency(borrowAmount)} added`)
                          }}
                          className="px-2 py-1 text-xs bg-purple-700 hover:bg-purple-600 text-white rounded transition-colors"
                        >
                          + Borrow from Margin ({formatCurrency(preview?.margin_available ?? 0)} available)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-slate-400 text-sm">HOLD - No action needed</p>
                <button
                  type="button"
                  onClick={useRecommendation}
                  className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
                >
                  Use
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <EntryForm
            formData={formData}
            setFormData={setFormData}
            existingEntries={existingEntries}
            cashAvailable={preview?.state.cash_available_usd}
            marginAvailable={preview?.margin_available}
            currentFundSize={preview?.fund_size}
          />

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
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
