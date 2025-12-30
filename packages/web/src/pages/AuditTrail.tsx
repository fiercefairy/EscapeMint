import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { fetchAllEntries, type AuditEntry } from '../api/funds'

export function AuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [filterAction, setFilterAction] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [searchTicker, setSearchTicker] = useState<string>('')

  useEffect(() => {
    const loadEntries = async () => {
      setLoading(true)
      const result = await fetchAllEntries()
      if (result.error) {
        toast.error(result.error)
      } else {
        setEntries(result.data ?? [])
      }
      setLoading(false)
    }
    loadEntries()
  }, [])

  // Get unique platforms and actions for filters
  const platforms = useMemo(() => [...new Set(entries.map(e => e.platform))], [entries])

  // Apply filters
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (filterPlatform !== 'all' && entry.platform !== filterPlatform) return false
      if (filterAction !== 'all') {
        if (filterAction === 'action' && !entry.action) return false
        if (filterAction === 'dividend' && !entry.dividend) return false
        if (filterAction === 'expense' && !entry.expense) return false
        if (filterAction === 'BUY' && entry.action !== 'BUY') return false
        if (filterAction === 'SELL' && entry.action !== 'SELL') return false
      }
      if (filterDateFrom && entry.date < filterDateFrom) return false
      if (filterDateTo && entry.date > filterDateTo) return false
      if (searchTicker && !entry.ticker.toLowerCase().includes(searchTicker.toLowerCase())) return false
      return true
    })
  }, [entries, filterPlatform, filterAction, filterDateFrom, filterDateTo, searchTicker])

  // Aggregate stats for filtered entries
  const stats = useMemo(() => {
    let totalBuys = 0
    let totalSells = 0
    let totalDividends = 0
    let totalExpenses = 0
    let buyCount = 0
    let sellCount = 0

    for (const entry of filteredEntries) {
      if (entry.action === 'BUY' && entry.amount) {
        totalBuys += entry.amount
        buyCount++
      }
      if (entry.action === 'SELL' && entry.amount) {
        totalSells += entry.amount
        sellCount++
      }
      if (entry.dividend) totalDividends += entry.dividend
      if (entry.expense) totalExpenses += entry.expense
    }

    return { totalBuys, totalSells, totalDividends, totalExpenses, buyCount, sellCount }
  }, [filteredEntries])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Audit Trail</h1>
        <p className="text-sm text-slate-400">All entries, actions, and transactions across funds.</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Platform</label>
            <select
              value={filterPlatform}
              onChange={e => setFilterPlatform(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            >
              <option value="all">All</option>
              {platforms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Action</label>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            >
              <option value="all">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="dividend">Dividend</option>
              <option value="expense">Expense</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Ticker</label>
            <input
              type="text"
              value={searchTicker}
              onChange={e => setSearchTicker(e.target.value)}
              placeholder="BTC"
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setFilterPlatform('all')
                setFilterAction('all')
                setFilterDateFrom('')
                setFilterDateTo('')
                setSearchTicker('')
              }}
              className="w-full px-2 py-1.5 bg-slate-600 text-white rounded hover:bg-slate-500 transition-colors text-sm"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
          <p className="text-xs text-slate-400">Entries</p>
          <p className="text-base font-bold text-white">{filteredEntries.length}</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
          <p className="text-xs text-slate-400">Buys ({stats.buyCount})</p>
          <p className="text-base font-bold text-blue-400">{formatCurrency(stats.totalBuys)}</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
          <p className="text-xs text-slate-400">Sells ({stats.sellCount})</p>
          <p className="text-base font-bold text-orange-400">{formatCurrency(stats.totalSells)}</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
          <p className="text-xs text-slate-400">Net Flow</p>
          <p className={`text-base font-bold ${stats.totalBuys - stats.totalSells >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(stats.totalBuys - stats.totalSells)}
          </p>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
          <p className="text-xs text-slate-400">Dividends</p>
          <p className="text-base font-bold text-green-400">{formatCurrency(stats.totalDividends)}</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
          <p className="text-xs text-slate-400">Expenses</p>
          <p className="text-base font-bold text-red-400">{formatCurrency(stats.totalExpenses)}</p>
        </div>
      </div>

      {/* Entries Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-mint-400"></div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Fund</th>
                <th className="px-3 py-2 hidden sm:table-cell">Platform</th>
                <th className="px-3 py-2 text-right hidden md:table-cell">Value</th>
                <th className="px-3 py-2 text-center">Action</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right hidden lg:table-cell">Dividend</th>
                <th className="px-3 py-2 text-right hidden lg:table-cell">Expense</th>
                <th className="px-3 py-2 hidden xl:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.slice(0, 500).map((entry, i) => (
                <tr key={`${entry.fundId}-${entry.date}-${i}`} className="border-b border-slate-700/50 hover:bg-slate-700/30 text-xs">
                  <td className="px-3 py-1.5 text-white font-mono">{entry.date}</td>
                  <td className="px-3 py-1.5">
                    <Link
                      to={`/fund/${entry.fundId}`}
                      className="text-mint-400 hover:underline uppercase font-medium"
                    >
                      {entry.ticker}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-slate-400 capitalize hidden sm:table-cell">{entry.platform}</td>
                  <td className="px-3 py-1.5 text-right text-white hidden md:table-cell">{formatCurrency(entry.value)}</td>
                  <td className="px-3 py-1.5 text-center">
                    {entry.action && (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        entry.action === 'BUY'
                          ? 'bg-blue-900/50 text-blue-400'
                          : 'bg-orange-900/50 text-orange-400'
                      }`}>
                        {entry.action}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-white">
                    {entry.amount ? formatCurrency(entry.amount) : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-green-400 hidden lg:table-cell">
                    {entry.dividend ? formatCurrency(entry.dividend) : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-red-400 hidden lg:table-cell">
                    {entry.expense ? formatCurrency(entry.expense) : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400 max-w-xs truncate hidden xl:table-cell" title={entry.notes}>
                    {entry.notes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredEntries.length > 500 && (
            <p className="px-3 py-1.5 text-slate-500 text-xs">
              Showing first 500 of {filteredEntries.length} entries
            </p>
          )}
          {filteredEntries.length === 0 && (
            <div className="px-3 py-6 text-center text-slate-400 text-sm">
              No entries match your filters.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
