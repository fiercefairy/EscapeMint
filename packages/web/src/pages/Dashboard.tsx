import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FundCard } from '../components/FundCard'
import { AggregatePanel } from '../components/AggregatePanel'
import { PortfolioCharts } from '../components/PortfolioCharts'
import {
  fetchFunds,
  fetchAggregateMetrics,
  fetchHistory,
  type FundSummary,
  type AggregateMetrics,
  type HistoryResponse
} from '../api/funds'

export function Dashboard() {
  const [funds, setFunds] = useState<FundSummary[]>([])
  const [metrics, setMetrics] = useState<AggregateMetrics | null>(null)
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [showCharts, setShowCharts] = useState(true)

  const loadData = async () => {
    setLoading(true)

    const [fundsResult, metricsResult, historyResult] = await Promise.all([
      fetchFunds(),
      fetchAggregateMetrics(),
      fetchHistory()
    ])

    if (fundsResult.error) {
      toast.error(fundsResult.error)
    } else {
      setFunds(fundsResult.data ?? [])
    }

    if (metricsResult.error) {
      toast.error(metricsResult.error)
    } else {
      setMetrics(metricsResult.data ?? null)
    }

    if (historyResult.error) {
      toast.error(historyResult.error)
    } else {
      setHistory(historyResult.data ?? null)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Get unique platforms
  const platforms = [...new Set(funds.map(f => f.platform))]

  // Filter funds
  const filteredFunds = filterPlatform === 'all'
    ? funds
    : funds.filter(f => f.platform === filterPlatform)

  // Group by platform
  const fundsByPlatform = filteredFunds.reduce((acc, fund) => {
    const key = fund.platform
    if (!acc[key]) acc[key] = []
    acc[key].push(fund)
    return acc
  }, {} as Record<string, FundSummary[]>)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return (value * 100).toFixed(2) + '%'
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Portfolio Dashboard</h1>
          <p className="text-sm text-slate-400">
            {metrics?.activeFunds ?? 0} active funds • {metrics?.closedFunds ?? 0} closed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCharts(!showCharts)}
            className={`px-2 py-1 text-sm rounded ${showCharts ? 'bg-mint-600 text-white' : 'bg-slate-800 text-slate-400'}`}
          >
            Charts
          </button>
          <select
            value={filterPlatform}
            onChange={e => setFilterPlatform(e.target.value)}
            className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-white"
          >
            <option value="all">All Platforms</option>
            {platforms.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div className="flex bg-slate-800 rounded p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 text-sm rounded ${viewMode === 'grid' ? 'bg-mint-600 text-white' : 'text-slate-400'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 text-sm rounded ${viewMode === 'table' ? 'bg-mint-600 text-white' : 'text-slate-400'}`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-mint-400"></div>
        </div>
      ) : (
        <>
          {/* Aggregate Metrics Panel */}
          {metrics && <AggregatePanel metrics={metrics} />}

          {/* Portfolio Charts */}
          {showCharts && history && history.timeSeries.length > 0 && (
            <PortfolioCharts
              timeSeries={history.timeSeries}
              allocations={history.currentAllocations}
              totals={history.totals}
            />
          )}

          {/* Funds List/Grid */}
          {viewMode === 'table' ? (
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="px-3 py-2">Fund</th>
                    <th className="px-3 py-2 hidden sm:table-cell">Platform</th>
                    <th className="px-3 py-2 text-right hidden md:table-cell">Fund Size</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2 text-right hidden lg:table-cell">Target APY</th>
                    <th className="px-3 py-2 text-right hidden lg:table-cell">Interval</th>
                    <th className="px-3 py-2 text-right hidden sm:table-cell">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFunds.map(fund => (
                    <tr
                      key={fund.id}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                      onClick={() => window.location.href = `/fund/${fund.id}`}
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium text-white uppercase">{fund.ticker}</span>
                        <span className="sm:hidden text-slate-500 text-xs ml-1 capitalize">({fund.platform})</span>
                      </td>
                      <td className="px-3 py-2 text-slate-400 capitalize hidden sm:table-cell">{fund.platform}</td>
                      <td className="px-3 py-2 text-right text-white hidden md:table-cell">
                        {formatCurrency(fund.config.fund_size_usd)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={fund.latestEquity?.value ? 'text-mint-400' : 'text-slate-500'}>
                          {fund.latestEquity?.value ? formatCurrency(fund.latestEquity.value) : '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300 hidden lg:table-cell">
                        {formatPercent(fund.config.target_apy)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400 hidden lg:table-cell">
                        {fund.config.interval_days}d
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400 hidden sm:table-cell">
                        {fund.entryCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(fundsByPlatform).map(([platform, platformFunds]) => (
                <div key={platform}>
                  <h2 className="text-base font-semibold text-white mb-2 capitalize">{platform}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {platformFunds.map(fund => (
                      <Link key={fund.id} to={`/fund/${fund.id}`}>
                        <FundCard fund={fund} />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
