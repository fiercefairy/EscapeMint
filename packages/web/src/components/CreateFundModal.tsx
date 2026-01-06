import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { createFund, notifyFundsChanged, type FundConfig, type FundType } from '../api/funds'
import { fetchPlatforms, type Platform } from '../api/platforms'

interface CreateFundModalProps {
  onClose: () => void
  onCreated?: () => void
}

const round = (value: number, decimals: number = 2): number => {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export function CreateFundModal({ onClose, onCreated }: CreateFundModalProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [selectedPlatform, setSelectedPlatform] = useState('')
  const [ticker, setTicker] = useState('')
  const [fundType, setFundType] = useState<FundType>('stock')
  const [formData, setFormData] = useState({
    fund_size_usd: 10000,
    target_apy: 25, // Display as percentage
    interval_days: 7,
    input_min_usd: 100,
    input_mid_usd: 200,
    input_max_usd: 500,
    max_at_pct: -25, // Display as percentage
    min_profit_usd: 100,
    cash_apy: 4, // Display as percentage
    margin_apr: 7, // Display as percentage
    margin_access_usd: 0,
    accumulate: true,
    manage_cash: true,
    margin_enabled: false,
    start_date: new Date().toISOString().slice(0, 10)
  })

  const isCashFund = fundType === 'cash'

  useEffect(() => {
    fetchPlatforms().then(result => {
      if (result.data) {
        setPlatforms(result.data)
        if (result.data.length > 0 && result.data[0]) {
          setSelectedPlatform(result.data[0].id)
        }
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlatform || !ticker) {
      toast.error('Platform and ticker are required')
      return
    }
    setLoading(true)

    const config: Partial<FundConfig> = {
      status: 'active',
      fund_type: fundType,
      fund_size_usd: formData.fund_size_usd,
      target_apy: isCashFund ? 0 : round(formData.target_apy / 100, 4),
      interval_days: isCashFund ? 1 : formData.interval_days,
      input_min_usd: isCashFund ? 0 : formData.input_min_usd,
      input_mid_usd: isCashFund ? 0 : formData.input_mid_usd,
      input_max_usd: isCashFund ? 0 : formData.input_max_usd,
      max_at_pct: isCashFund ? 0 : round(formData.max_at_pct / 100, 4),
      min_profit_usd: isCashFund ? 0 : formData.min_profit_usd,
      cash_apy: round(formData.cash_apy / 100, 4),
      margin_apr: round(formData.margin_apr / 100, 4),
      margin_access_usd: formData.margin_access_usd,
      accumulate: isCashFund ? true : formData.accumulate,
      manage_cash: isCashFund ? true : formData.manage_cash,
      margin_enabled: isCashFund ? false : formData.margin_enabled,
      start_date: formData.start_date || new Date().toISOString().slice(0, 10)
    }

    const result = await createFund({
      platform: selectedPlatform,
      ticker: ticker.toLowerCase(),
      config
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Created ${ticker.toUpperCase()} fund`)
      notifyFundsChanged()
      onClose()
      onCreated?.()
      if (result.data) {
        navigate(`/fund/${result.data.id}`)
      }
    }

    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-2">Create New Fund</h2>
        <p className="text-slate-400 text-sm mb-4">Set up a new investment tracking fund</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fund Type Selection */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Fund Type</label>
            <div className="flex gap-2">
              {(['stock', 'crypto', 'cash', 'derivatives'] as FundType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFundType(type)}
                  className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    fundType === type
                      ? type === 'cash'
                        ? 'bg-blue-600 text-white'
                        : type === 'crypto'
                        ? 'bg-yellow-600 text-white'
                        : type === 'derivatives'
                        ? 'bg-orange-600 text-white'
                        : 'bg-green-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {type === 'stock' ? 'Stock' : type === 'crypto' ? 'Crypto' : type === 'derivatives' ? 'Futures' : 'Cash'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {fundType === 'cash'
                ? 'Cash funds track deposits/withdrawals and earn interest'
                : fundType === 'crypto'
                ? 'Crypto funds track buy/sell without dividends'
                : fundType === 'derivatives'
                ? 'Futures funds track perpetual contracts with FIFO cost basis'
                : 'Stock funds support full trading, dividends, and DCA strategies'}
            </p>
          </div>

          {/* Platform & Ticker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Platform</label>
              <select
                value={selectedPlatform}
                onChange={e => setSelectedPlatform(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                required
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
                placeholder={isCashFund ? 'e.g., cash, savings' : 'e.g., SPY, AAPL'}
                required
              />
            </div>
          </div>

          {/* Fund Size and Start Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{isCashFund ? 'Initial Balance ($)' : 'Fund Size ($)'}</label>
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

          {/* Trading Fund: Target APY and Interval */}
          {!isCashFund && (
            <>
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
                    <label className="block text-[10px] text-slate-500 mb-1">Min</label>
                    <input
                      type="number"
                      value={formData.input_min_usd}
                      onChange={e => setFormData({ ...formData, input_min_usd: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                      step="10"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Mid</label>
                    <input
                      type="number"
                      value={formData.input_mid_usd}
                      onChange={e => setFormData({ ...formData, input_mid_usd: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                      step="10"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Max</label>
                    <input
                      type="number"
                      value={formData.input_max_usd}
                      onChange={e => setFormData({ ...formData, input_max_usd: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                      step="10"
                      min="0"
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
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Min Profit ($)</label>
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

              {/* Toggles */}
              <div className="space-y-2">
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
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="manage_cash"
                    checked={formData.manage_cash}
                    onChange={e => setFormData({ ...formData, manage_cash: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-mint-500 focus:ring-mint-500"
                  />
                  <label htmlFor="manage_cash" className="text-sm text-white">
                    Manage Cash
                    <span className="text-slate-400 text-xs ml-2">(maintain cash pile)</span>
                  </label>
                </div>
              </div>

            </>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Fund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
