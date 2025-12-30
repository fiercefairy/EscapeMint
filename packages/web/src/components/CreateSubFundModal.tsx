import { useState } from 'react'
import { toast } from 'sonner'
import { createSubFund } from '../api/subfunds'
import { notifyFundsChanged } from '../api/funds'

interface CreateSubFundModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateSubFundModal({ onClose, onCreated }: CreateSubFundModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    period: 'weekly' as 'daily' | 'weekly' | 'monthly' | 'custom',
    action_amount_usd: 100,
    starting_fund_size_usd: 1000,
    target_growth_apy: 0.3,
    start_date: new Date().toISOString().split('T')[0] as string,
    tolerance_pct: 0.02
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const result = await createSubFund(formData)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('SubFund created successfully')
      notifyFundsChanged()
      onCreated()
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
        <h2 className="text-xl font-bold text-white mb-4">Create SubFund</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              placeholder="e.g., Robinhood, Coinbase"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Period</label>
            <select
              value={formData.period}
              onChange={e => setFormData({ ...formData, period: e.target.value as 'daily' | 'weekly' | 'monthly' })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Starting Size ($)</label>
              <input
                type="number"
                value={formData.starting_fund_size_usd}
                onChange={e => setFormData({ ...formData, starting_fund_size_usd: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                min="0"
                step="100"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Action Amount ($)</label>
              <input
                type="number"
                value={formData.action_amount_usd}
                onChange={e => setFormData({ ...formData, action_amount_usd: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                min="1"
                step="10"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Target APY (%)</label>
              <input
                type="number"
                value={formData.target_growth_apy * 100}
                onChange={e => setFormData({ ...formData, target_growth_apy: parseFloat(e.target.value) / 100 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                min="0"
                max="200"
                step="1"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Tolerance (%)</label>
              <input
                type="number"
                value={formData.tolerance_pct * 100}
                onChange={e => setFormData({ ...formData, tolerance_pct: parseFloat(e.target.value) / 100 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                min="0"
                max="50"
                step="0.5"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Start Date</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={e => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
              required
            />
          </div>

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
              disabled={loading}
              className="flex-1 px-4 py-2 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
