import { useState, useEffect } from 'react'
import type { ApyHistoryEntry } from '../api/platforms'

interface ApyEntryModalProps {
  onClose: () => void
  onSave: (entry: { date: string; rate: number; notes?: string }) => Promise<void>
  existingEntry?: ApyHistoryEntry
}

export function ApyEntryModal({ onClose, onSave, existingEntry }: ApyEntryModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    date: existingEntry?.date ?? new Date().toISOString().slice(0, 10),
    rate: existingEntry ? existingEntry.rate * 100 : 0,
    notes: existingEntry?.notes ?? ''
  })

  useEffect(() => {
    if (existingEntry) {
      setFormData({
        date: existingEntry.date,
        rate: existingEntry.rate * 100,
        notes: existingEntry.notes ?? ''
      })
    }
  }, [existingEntry])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    await onSave({
      date: formData.date,
      rate: formData.rate / 100,
      ...(formData.notes && { notes: formData.notes })
    })

    setLoading(false)
  }

  const isEditing = !!existingEntry

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
        <h2 className="text-xl font-bold text-white mb-2">
          {isEditing ? 'Edit APY Entry' : 'Add APY Entry'}
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          {isEditing ? 'Update the APY rate for this date' : 'Record a historical APY rate'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                disabled={isEditing}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500 disabled:opacity-50 disabled:cursor-not-allowed"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">APY (%)</label>
              <input
                type="number"
                value={formData.rate}
                onChange={e => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500"
                step="0.01"
                min="0"
                max="100"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-mint-500 resize-none"
              rows={2}
              placeholder="e.g., Rate drop due to Fed cuts"
            />
          </div>

          <div className="flex gap-3 pt-2">
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
              {loading ? 'Saving...' : isEditing ? 'Update' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
