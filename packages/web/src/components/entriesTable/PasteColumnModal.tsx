import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { updateFundEntry, type FundEntry } from '../../api/funds'

// Columns that can be pasted
const PASTEABLE_COLUMNS = [
  { id: 'cash', label: 'Cash' },
  { id: 'value', label: 'Equity Value' },
  { id: 'amount', label: 'Amount' },
  { id: 'shares', label: 'Shares' },
  { id: 'price', label: 'Price' },
  { id: 'dividend', label: 'Dividend' },
  { id: 'expense', label: 'Expense' },
  { id: 'cash_interest', label: 'Cash Interest' },
  { id: 'fund_size', label: 'Fund Size' },
  { id: 'margin_available', label: 'Margin Available' },
  { id: 'margin_borrowed', label: 'Margin Borrowed' }
] as const

type PasteableColumn = typeof PASTEABLE_COLUMNS[number]['id']

interface PasteColumnModalProps {
  fundId: string
  entries: FundEntry[]
  onClose: () => void
  onUpdated: () => void
}

export function PasteColumnModal({ fundId, entries, onClose, onUpdated }: PasteColumnModalProps) {
  const [selectedColumn, setSelectedColumn] = useState<PasteableColumn>('cash')
  const [pasteData, setPasteData] = useState('')
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc' | 'auto'>('auto')
  const [applying, setApplying] = useState(false)

  // Parse pasted data into values
  const parsedValues = useMemo(() => {
    if (!pasteData.trim()) return []
    return pasteData
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove currency symbols, commas, and parse as number
        const cleaned = line.replace(/[$,]/g, '').trim()
        const num = parseFloat(cleaned)
        return isNaN(num) ? null : num
      })
  }, [pasteData])

  // Sort entries by date for matching
  const sortedEntries = useMemo(() => {
    return [...entries]
      .map((entry, originalIndex) => ({ entry, originalIndex }))
      .sort((a, b) => a.entry.date.localeCompare(b.entry.date))
  }, [entries])

  // Detect if pasted data appears to be descending (first value > last value)
  const detectedOrder = useMemo(() => {
    const validValues = parsedValues.filter((v): v is number => v !== null)
    if (validValues.length < 2) return 'asc'

    // For cash/fund_size, higher early values often mean desc (newer first with more cash)
    // Check if first half avg > second half avg
    const mid = Math.floor(validValues.length / 2)
    const firstHalf = validValues.slice(0, mid)
    const secondHalf = validValues.slice(mid)
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

    // If first half average is significantly larger, likely descending dates
    return firstAvg > secondAvg * 1.1 ? 'desc' : 'asc'
  }, [parsedValues])

  const effectiveOrder = dateOrder === 'auto' ? detectedOrder : dateOrder

  // Preview the mapping
  const preview = useMemo(() => {
    if (parsedValues.length === 0) return []

    // Match values to entries based on order
    const orderedEntries = effectiveOrder === 'desc'
      ? [...sortedEntries].reverse() // desc = newest first
      : sortedEntries // asc = oldest first

    return parsedValues.slice(0, Math.min(parsedValues.length, orderedEntries.length)).map((value, i) => ({
      date: orderedEntries[i]?.entry.date ?? '',
      originalIndex: orderedEntries[i]?.originalIndex ?? -1,
      currentValue: orderedEntries[i]?.entry[selectedColumn as keyof FundEntry] as number | undefined,
      newValue: value
    }))
  }, [parsedValues, sortedEntries, effectiveOrder, selectedColumn])

  const handleApply = async () => {
    if (preview.length === 0) {
      toast.error('No data to apply')
      return
    }

    setApplying(true)
    let successCount = 0
    let errorCount = 0

    for (const item of preview) {
      if (item.originalIndex < 0 || item.newValue === null) continue

      const entry = entries[item.originalIndex]
      if (!entry) continue

      const updatedEntry: FundEntry = {
        ...entry,
        [selectedColumn]: item.newValue
      }

      const result = await updateFundEntry(fundId, item.originalIndex, updatedEntry)
      if (result.error) {
        errorCount++
      } else {
        successCount++
      }
    }

    setApplying(false)

    if (errorCount > 0) {
      toast.error(`Updated ${successCount}, failed ${errorCount}`)
    } else {
      toast.success(`Updated ${successCount} entries`)
    }

    onUpdated()
    onClose()
  }

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '-'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-3xl border border-slate-700 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">Paste Column Data</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Column Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Target Column</label>
            <select
              value={selectedColumn}
              onChange={e => setSelectedColumn(e.target.value as PasteableColumn)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
            >
              {PASTEABLE_COLUMNS.map(col => (
                <option key={col.id} value={col.id}>{col.label}</option>
              ))}
            </select>
          </div>

          {/* Date Order */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Pasted Data Order</label>
            <select
              value={dateOrder}
              onChange={e => setDateOrder(e.target.value as 'asc' | 'desc' | 'auto')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
            >
              <option value="auto">Auto-detect ({detectedOrder === 'desc' ? 'Newest first' : 'Oldest first'})</option>
              <option value="asc">Oldest first (ascending dates)</option>
              <option value="desc">Newest first (descending dates)</option>
            </select>
          </div>
        </div>

        {/* Paste Area */}
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">
            Paste values (one per line, {parsedValues.length} values detected)
          </label>
          <textarea
            value={pasteData}
            onChange={e => setPasteData(e.target.value)}
            placeholder="Paste values here, one per line..."
            className="w-full h-32 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500 font-mono text-sm"
          />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-1">
              Preview ({preview.length} of {entries.length} entries)
            </label>
            <div className="max-h-48 overflow-y-auto bg-slate-900 rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="text-slate-400 text-xs">
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-right">Current</th>
                    <th className="px-2 py-1 text-center">→</th>
                    <th className="px-2 py-1 text-right">New</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((item, i) => (
                    <tr key={i} className="border-t border-slate-700/50">
                      <td className="px-2 py-1 text-white">{item.date}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{formatCurrency(item.currentValue)}</td>
                      <td className="px-2 py-1 text-center text-slate-500">→</td>
                      <td className={`px-2 py-1 text-right ${item.newValue !== item.currentValue ? 'text-mint-400' : 'text-slate-400'}`}>
                        {formatCurrency(item.newValue)}
                      </td>
                    </tr>
                  ))}
                  {preview.length > 20 && (
                    <tr className="border-t border-slate-700/50">
                      <td colSpan={4} className="px-2 py-1 text-center text-slate-500 text-xs">
                        ... and {preview.length - 20} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mismatch Warning */}
        {parsedValues.length > 0 && parsedValues.length !== entries.length && (
          <div className="mb-4 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-yellow-300 text-sm">
            Warning: {parsedValues.length} values pasted but {entries.length} entries exist.
            Only the first {Math.min(parsedValues.length, entries.length)} will be updated.
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || preview.length === 0}
            className="flex-1 px-4 py-2 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors disabled:opacity-50"
          >
            {applying ? 'Applying...' : `Apply to ${preview.length} entries`}
          </button>
        </div>
      </div>
    </div>
  )
}
