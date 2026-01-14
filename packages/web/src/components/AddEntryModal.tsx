import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { addFundEntry, previewRecommendation, type FundEntry, type FundState, type Recommendation, type FundType } from '../api/funds'
import { EntryForm, buildEntryFromForm, createEmptyFormData, detectDigitError, type EntryFormData, type ActionType } from './EntryForm'

export interface AddEntryModalProps {
  fundId: string
  fundTicker: string
  currentRecommendation?: Recommendation | null | undefined
  existingEntries?: FundEntry[]
  targetApy?: number
  minProfitUsd?: number
  manageCash?: boolean | undefined
  fundType?: FundType | undefined
  marginEnabled?: boolean | undefined
  platform?: string | undefined
  onClose: () => void
  onAdded: () => void
}

export function AddEntryModal({ fundId, fundTicker, currentRecommendation, existingEntries = [], targetApy, minProfitUsd, manageCash, fundType = 'stock', marginEnabled = false, platform, onClose, onAdded }: AddEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [result, setResult] = useState<{ state: FundState; recommendation: Recommendation; margin_available?: number; margin_borrowed?: number } | null>(null)
  const [preview, setPreview] = useState<{ state: FundState; recommendation: Recommendation | null; margin_available: number; fund_size: number } | null>(null)

  // Pre-populate form with latest entry values for continuity
  const getInitialFormData = (): EntryFormData => {
    const empty = createEmptyFormData()

    if (existingEntries.length === 0) return empty

    const sorted = [...existingEntries].sort((a, b) => a.date.localeCompare(b.date))
    const lastEntry = sorted[sorted.length - 1]
    if (!lastEntry) return empty

    // For cash funds: use cash balance as starting equity
    if (fundType === 'cash') {
      const lastCash = lastEntry.cash ?? lastEntry.value ?? 0
      empty.value = lastCash.toFixed(2)
      return empty
    }

    // For derivatives funds: value is always 0 (calculated), focus on cash
    // HOLD is the appropriate default because derivatives entries are typically
    // cash balance updates (scraped from exchange) rather than manual trades.
    // Manual BUY/SELL trades are usually imported via the transaction scraper.
    if (fundType === 'derivatives') {
      return {
        ...empty,
        value: '0',  // Derivatives equity is calculated, not entered
        action: 'HOLD',
        cash: lastEntry.cash?.toFixed(2) ?? '',
        margin_available: lastEntry.margin_available?.toFixed(2) ?? '',
        margin_borrowed: lastEntry.margin_borrowed?.toFixed(2) ?? ''
      }
    }

    // For trading funds: pre-fill from latest entry
    // Keep date as today (already set), action empty, amount empty, notes empty
    // But carry forward: value, cash, shares, margin fields
    return {
      ...empty,
      value: lastEntry.value.toFixed(2),
      cash: lastEntry.cash?.toFixed(2) ?? '',
      shares: lastEntry.shares?.toString() ?? '',
      margin_available: lastEntry.margin_available?.toFixed(2) ?? '',
      margin_borrowed: lastEntry.margin_borrowed?.toFixed(2) ?? ''
    }
  }
  const [formData, setFormData] = useState<EntryFormData>(getInitialFormData)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  const formatPercent = (value: number) => {
    if (!Number.isFinite(value) || Number.isNaN(value)) return '--'
    const clamped = Math.max(-9999, Math.min(9999, value))
    const pct = clamped * 100
    return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
  }

  // Get prior equity for digit error detection
  const priorEquity = existingEntries.length > 0
    ? [...existingEntries].sort((a, b) => a.date.localeCompare(b.date))[existingEntries.length - 1]?.value ?? null
    : null

  // Detect digit errors in equity input (computed on every render for reliability)
  const newEquityValue = parseFloat(formData.value)
  const digitErrorType = priorEquity !== null && !isNaN(newEquityValue) && newEquityValue > 0
    ? detectDigitError(newEquityValue, priorEquity)
    : null
  const digitErrorInfo = digitErrorType
    ? { type: digitErrorType, priorValue: priorEquity, newValue: newEquityValue }
    : null

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

  // Fetch preview when equity value changes (skip for cash funds - no recommendations)
  useEffect(() => {
    if (fundType === 'cash') return
    const value = parseFloat(formData.value)
    if (!isNaN(value) && value >= 0) {
      const timeoutId = setTimeout(() => {
        fetchPreview(value, formData.date)
      }, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [formData.value, formData.date, fetchPreview, fundType])

  // Auto-apply recommendation when preview updates
  useEffect(() => {
    if (fundType === 'cash') return
    if (!preview) return

    const rec = preview.recommendation
    if (rec) {
      setFormData(prev => ({
        ...prev,
        action: rec.action as ActionType,
        amount: rec.amount.toFixed(2)
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        action: 'HOLD',
        amount: ''
      }))
    }
  }, [preview, fundType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const entry = buildEntryFromForm(formData, fundType)
    const response = await addFundEntry(fundId, entry)

    if (response.error) {
      toast.error(response.error)
    } else if (response.data) {
      toast.success('Entry recorded')
      setResult({
        state: response.data.state,
        recommendation: response.data.recommendation
      })
      // Immediately notify parent to refresh entries table and header
      onAdded()
    }

    setLoading(false)
  }

  const handleClose = () => {
    onClose()
  }

  // Result view after submission
  if (result) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 rounded-lg p-4 sm:p-6 w-full max-w-md border border-slate-700">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Action Recorded</h2>

          {/* State Summary */}
          <div className="bg-slate-900 rounded-lg p-3 sm:p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                <p className={`font-medium ${result.state.cash_available_usd < 0 ? 'text-red-400' : 'text-white'}`}>{formatCurrency(result.state.cash_available_usd)}</p>
              </div>
              {result.margin_available !== undefined && (
                <div>
                  <p className="text-slate-400">Margin Available</p>
                  <p className="text-purple-400 font-medium">{formatCurrency(result.margin_available)}</p>
                </div>
              )}
              {result.margin_borrowed !== undefined && result.margin_borrowed > 0 && (
                <div>
                  <p className="text-slate-400">Margin Borrowed</p>
                  <p className="text-orange-400 font-medium">{formatCurrency(result.margin_borrowed)}</p>
                </div>
              )}
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
      <div role="dialog" data-testid="add-entry-modal" className="bg-slate-800 rounded-lg p-4 sm:p-6 w-full max-w-4xl border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2">Take Action</h2>
        <p className="text-slate-400 text-sm mb-4">Record activity for {fundTicker.toUpperCase()}</p>

        {/* Digit Error Warning Banner */}
        {digitErrorInfo && (
          <div className="rounded-lg p-3 mb-4 bg-amber-900/40 border border-amber-600">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-lg">⚠️</span>
              <div>
                <p className="text-amber-200 font-medium text-sm">
                  Possible {digitErrorInfo.type === 'extra' ? 'extra' : 'missing'} digit
                </p>
                <p className="text-amber-300/80 text-xs">
                  Prior equity: {formatCurrency(digitErrorInfo.priorValue)} → You entered: {formatCurrency(digitErrorInfo.newValue)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Live Recommendation Banner - not shown for cash funds */}
        {formData.value && fundType !== 'cash' && (
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
                  {manageCash !== false && displayState && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Cash Available</p>
                      <p className="text-white text-sm">{formatCurrency(displayState.cash_available_usd)}</p>
                    </div>
                  )}
                </div>
                {/* Performance Details */}
                {displayRec.explanation && (
                  <>
                    <div className="mt-2 pt-2 border-t border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Invested</p>
                        <p className="text-white">{formatCurrency(displayRec.explanation.start_input_usd)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Asset Gain</p>
                        <p className={displayRec.explanation.gain_usd >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatCurrency(displayRec.explanation.gain_usd)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Gain %</p>
                        <p className={displayRec.explanation.gain_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatPercent(displayRec.explanation.gain_pct)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Expected</p>
                        <p className="text-white">{formatCurrency(displayRec.explanation.expected_target_usd)}</p>
                      </div>
                    </div>
                    <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500">Target APY</p>
                        <p className="text-white">{targetApy !== undefined ? `${(targetApy * 100).toFixed(0)}%` : '-'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">vs Target</p>
                        <p className={displayRec.explanation.target_diff_usd >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {formatCurrency(displayRec.explanation.target_diff_usd)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Min Profit</p>
                        <p className="text-white">{minProfitUsd !== undefined ? formatCurrency(minProfitUsd) : '-'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Limit</p>
                        <p className="text-white">{formatCurrency(displayRec.explanation.limit_usd)}</p>
                      </div>
                    </div>
                  </>
                )}
                {displayRec.explanation?.reasoning && (
                  <p className="mt-2 text-xs text-slate-400 italic">{displayRec.explanation.reasoning}</p>
                )}
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
            fundType={fundType}
            manageCash={manageCash}
            marginEnabled={marginEnabled}
            platform={platform}
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
              disabled={loading || (!formData.action && fundType !== 'cash') || (fundType === 'cash' && !formData.amount && !formData.cash_interest && !formData.value)}
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
