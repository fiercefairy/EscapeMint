import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { updateFund, deleteFund, notifyFundsChanged, type FundConfig, type FundStatus } from '../api/funds'
import { fetchPlatforms, type Platform } from '../api/platforms'

interface EditFundPanelProps {
  fundId: string
  fundPlatform: string
  fundTicker: string
  config: FundConfig
  onUpdated: () => void
}

// Round to avoid floating point precision issues
const round = (value: number, decimals: number = 2): number => {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export function EditFundPanel({ fundId, fundPlatform, fundTicker, config, onUpdated }: EditFundPanelProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [selectedPlatform, setSelectedPlatform] = useState(fundPlatform.toLowerCase())
  const [ticker, setTicker] = useState(fundTicker.toLowerCase())
  const [formData, setFormData] = useState({
    status: config.status ?? 'active' as FundStatus,
    fund_size_usd: config.fund_size_usd,
    target_apy: round(config.target_apy * 100),
    interval_days: config.interval_days,
    input_min_usd: config.input_min_usd,
    input_mid_usd: config.input_mid_usd,
    input_max_usd: config.input_max_usd,
    max_at_pct: round(config.max_at_pct * 100),
    min_profit_usd: config.min_profit_usd,
    cash_apy: round(config.cash_apy * 100),
    margin_apr: round(config.margin_apr * 100),
    margin_access_usd: config.margin_access_usd,
    accumulate: config.accumulate,
    start_date: config.start_date
  })

  useEffect(() => {
    fetchPlatforms().then(result => {
      if (result.data) {
        setPlatforms(result.data)
      }
    })
  }, [])

  const handleClose = () => {
    navigate(`/fund/${fundId}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const updatedConfig: Partial<FundConfig> = {
      status: formData.status,
      fund_size_usd: formData.fund_size_usd,
      target_apy: round(formData.target_apy / 100, 4),
      interval_days: formData.interval_days,
      input_min_usd: formData.input_min_usd,
      input_mid_usd: formData.input_mid_usd,
      input_max_usd: formData.input_max_usd,
      max_at_pct: round(formData.max_at_pct / 100, 4),
      min_profit_usd: formData.min_profit_usd,
      cash_apy: round(formData.cash_apy / 100, 4),
      margin_apr: round(formData.margin_apr / 100, 4),
      margin_access_usd: formData.margin_access_usd,
      accumulate: formData.accumulate,
      start_date: formData.start_date
    }

    const platformChanged = selectedPlatform !== fundPlatform.toLowerCase()
    const tickerChanged = ticker.toLowerCase() !== fundTicker.toLowerCase()
    const updatePayload: { config: Partial<FundConfig>; platform?: string; ticker?: string } = { config: updatedConfig }
    if (platformChanged) {
      updatePayload.platform = selectedPlatform
    }
    if (tickerChanged) {
      updatePayload.ticker = ticker.toLowerCase()
    }
    const result = await updateFund(fundId, updatePayload)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Fund configuration updated')
      notifyFundsChanged()
      if ((platformChanged || tickerChanged) && result.data) {
        navigate(`/fund/${result.data.id}`)
      } else {
        onUpdated()
        navigate(`/fund/${fundId}`)
      }
    }

    setLoading(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const result = await deleteFund(fundId)

    if (result.error) {
      toast.error(result.error)
      setDeleting(false)
    } else {
      toast.success(`Deleted ${fundTicker.toUpperCase()}`)
      notifyFundsChanged()
      navigate('/')
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-slate-800 border-l border-slate-700 z-50 flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Edit {fundTicker.toUpperCase()}</h2>
            <p className="text-slate-400 text-xs">Update fund configuration</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Platform & Ticker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Platform</label>
              <select
                value={selectedPlatform}
                onChange={e => setSelectedPlatform(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
              >
                {platforms.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={e => setTicker(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white uppercase focus:outline-none focus:border-mint-500"
                required
              />
            </div>
          </div>
          {(selectedPlatform !== fundPlatform.toLowerCase() || ticker !== fundTicker.toLowerCase()) && (
            <p className="text-xs text-amber-400 -mt-3">
              Fund will be renamed from {fundId} to {selectedPlatform}-{ticker.toLowerCase()}
            </p>
          )}

          {/* Status, Fund Size, Start Date */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={e => {
                  const newStatus = e.target.value as FundStatus
                  if (newStatus === 'closed' && formData.fund_size_usd > 0) {
                    setFormData({ ...formData, status: newStatus, fund_size_usd: 0 })
                  } else {
                    setFormData({ ...formData, status: newStatus })
                  }
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
              >
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fund Size ($)</label>
              <input
                type="number"
                value={formData.fund_size_usd}
                onChange={e => setFormData({ ...formData, fund_size_usd: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="100"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Start Date</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                required
              />
            </div>
          </div>
          {formData.status === 'closed' && formData.fund_size_usd > 0 && (
            <p className="text-xs text-amber-400 -mt-3">
              Closed funds should have a fund size of $0
            </p>
          )}

          {/* Target APY and Interval */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Target APY (%)</label>
              <input
                type="number"
                value={formData.target_apy}
                onChange={e => setFormData({ ...formData, target_apy: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="1"
                min="0"
                max="500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Interval (days)</label>
              <input
                type="number"
                value={formData.interval_days}
                onChange={e => setFormData({ ...formData, interval_days: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                min="1"
                required
              />
            </div>
          </div>

          {/* DCA Amounts */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">DCA Amounts ($)</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Min (on target)</label>
                <input
                  type="number"
                  value={formData.input_min_usd}
                  onChange={e => setFormData({ ...formData, input_min_usd: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                  step="10"
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Mid (below)</label>
                <input
                  type="number"
                  value={formData.input_mid_usd}
                  onChange={e => setFormData({ ...formData, input_mid_usd: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                  step="10"
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Max (loss)</label>
                <input
                  type="number"
                  value={formData.input_max_usd}
                  onChange={e => setFormData({ ...formData, input_max_usd: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                  step="10"
                  min="0"
                  required
                />
              </div>
            </div>
          </div>

          {/* Max At % and Min Profit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max DCA Threshold (%)</label>
              <input
                type="number"
                value={formData.max_at_pct}
                onChange={e => setFormData({ ...formData, max_at_pct: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="1"
                placeholder="e.g., -25"
              />
              <p className="text-[10px] text-slate-500 mt-1">Use max DCA when loss exceeds this %</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Min Profit to Sell ($)</label>
              <input
                type="number"
                value={formData.min_profit_usd}
                onChange={e => setFormData({ ...formData, min_profit_usd: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="10"
                min="0"
              />
            </div>
          </div>

          {/* Cash APY and Margin Settings */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cash APY (%)</label>
              <input
                type="number"
                value={formData.cash_apy}
                onChange={e => setFormData({ ...formData, cash_apy: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Margin APR (%)</label>
              <input
                type="number"
                value={formData.margin_apr}
                onChange={e => setFormData({ ...formData, margin_apr: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Margin Access ($)</label>
              <input
                type="number"
                value={formData.margin_access_usd}
                onChange={e => setFormData({ ...formData, margin_access_usd: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="100"
                min="0"
              />
            </div>
          </div>

          {/* Accumulate Toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="accumulate"
              checked={formData.accumulate}
              onChange={e => setFormData({ ...formData, accumulate: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-mint-500 focus:ring-mint-500"
            />
            <label htmlFor="accumulate" className="text-sm text-white">
              Accumulate Mode
              <span className="text-slate-400 text-xs ml-2">(sell only DCA amount)</span>
            </label>
          </div>

          {/* Delete Section */}
          <div className="border-t border-slate-700 pt-4">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Delete this fund...
              </button>
            ) : (
              <div className="bg-red-900/20 border border-red-800 rounded p-3">
                <p className="text-red-400 text-sm mb-3">
                  Delete <strong>{fundTicker.toUpperCase()}</strong>? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="px-3 py-1.5 text-sm bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-slate-700 flex-shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || deleting}
            className="flex-1 px-4 py-2 bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}
