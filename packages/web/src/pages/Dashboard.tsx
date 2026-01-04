import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FundCard } from '../components/FundCard'
import { AggregatePanel } from '../components/AggregatePanel'
import { PortfolioCharts } from '../components/PortfolioCharts'
import { CreateFundModal } from '../components/CreateFundModal'
import { ImportWizard } from '../components/ImportWizard'
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
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showTestData, setShowTestData] = useState(false)

  const loadData = async () => {
    setLoading(true)

    const [fundsResult, metricsResult, historyResult] = await Promise.all([
      fetchFunds(showTestData),
      fetchAggregateMetrics(showTestData),
      fetchHistory(showTestData)
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
  }, [showTestData])

  // Get unique platforms
  const platforms = [...new Set(funds.map(f => f.platform))]

  // Filter funds
  const filteredFunds = filterPlatform === 'all'
    ? funds
    : funds.filter(f => f.platform === filterPlatform)

  // Group by platform and sort cash funds to top within each group
  const fundsByPlatform = filteredFunds.reduce((acc, fund) => {
    const key = fund.platform
    if (!acc[key]) acc[key] = []
    acc[key].push(fund)
    return acc
  }, {} as Record<string, FundSummary[]>)

  // Sort each platform's funds: cash funds first, then by ticker
  for (const platform of Object.keys(fundsByPlatform)) {
    fundsByPlatform[platform]?.sort((a, b) => {
      const aIsCash = a.config.fund_type === 'cash'
      const bIsCash = b.config.fund_type === 'cash'
      if (aIsCash && !bIsCash) return -1
      if (!aIsCash && bIsCash) return 1
      return a.ticker.localeCompare(b.ticker)
    })
  }

  // Filter history data based on selected platform
  const filteredHistory = history && filterPlatform !== 'all' ? {
    ...history,
    currentAllocations: history.currentAllocations.filter(a => a.platform === filterPlatform),
    totals: {
      totalCurrentValue: history.currentAllocations
        .filter(a => a.platform === filterPlatform)
        .reduce((sum, a) => sum + a.value, 0),
      totalCurrentCash: history.currentAllocations
        .filter(a => a.platform === filterPlatform)
        .reduce((sum, a) => sum + a.cash, 0),
      totalCurrentMarginAccess: history.currentAllocations
        .filter(a => a.platform === filterPlatform)
        .reduce((sum, a) => sum + a.marginAccess, 0),
      totalCurrentMarginBorrowed: history.currentAllocations
        .filter(a => a.platform === filterPlatform)
        .reduce((sum, a) => sum + a.marginBorrowed, 0)
    }
  } : history

  // Calculate filtered metrics based on selected platform
  const filteredMetrics = metrics && filterPlatform !== 'all' ? (() => {
    // Filter the per-fund metrics by platform
    const filteredFundMetrics = metrics.funds.filter(f => f.platform === filterPlatform)

    // Recalculate all aggregate values from filtered funds
    const totalFundSize = filteredFundMetrics.reduce((sum, f) => sum + f.fundSize, 0)
    const totalValue = filteredFundMetrics.reduce((sum, f) => sum + f.currentValue, 0)
    const totalStartInput = filteredFundMetrics.reduce((sum, f) => sum + f.startInput, 0)
    const totalTimeWeightedFundSize = filteredFundMetrics.reduce((sum, f) => sum + f.timeWeightedFundSize, 0)
    const totalDaysActive = filteredFundMetrics.reduce((sum, f) => sum + f.daysActive, 0)
    const totalRealizedGains = filteredFundMetrics.reduce((sum, f) => sum + f.realizedGains, 0)
    const activeFunds = filteredFundMetrics.filter(f => f.status !== 'closed').length
    const closedFunds = filteredFundMetrics.filter(f => f.status === 'closed').length

    // Recalculate fund shares within the filtered subset
    const dollarsPerDay = totalTimeWeightedFundSize > 0 && totalDaysActive > 0
      ? totalTimeWeightedFundSize / totalDaysActive
      : 0

    let totalFundShares = 0
    const fundsWithShares = filteredFundMetrics.map(fund => {
      const fundShares = dollarsPerDay > 0 && fund.daysActive > 0
        ? (fund.timeWeightedFundSize / dollarsPerDay) * fund.daysActive
        : 0
      totalFundShares += fundShares
      return { ...fund, fundShares }
    })

    const fundsWithSharesPct = fundsWithShares.map(fund => ({
      ...fund,
      fundSharesPct: totalFundShares > 0 ? fund.fundShares / totalFundShares : 0
    }))

    // Recalculate realized APY using fund shares weighting
    let weightedRealizedAPY = 0
    for (const fund of fundsWithSharesPct) {
      weightedRealizedAPY += fund.realizedAPY * fund.fundSharesPct
    }

    // Sum projected annual returns from active funds
    const projectedAnnualReturn = fundsWithSharesPct
      .filter(f => f.currentValue > 0)
      .reduce((sum, f) => sum + f.projectedAnnualReturn, 0)

    const totalGainUsd = totalValue - totalStartInput
    const totalGainPct = totalStartInput > 0 ? (totalValue / totalStartInput - 1) : 0

    // Compute aggregate liquid APY directly from totals (not weighted average)
    const avgDaysActive = fundsWithSharesPct.length > 0 ? totalDaysActive / fundsWithSharesPct.length : 1
    const aggregateLiquidAPY = totalTimeWeightedFundSize > 0 && avgDaysActive > 0
      ? (totalGainUsd / totalTimeWeightedFundSize) * (365 / avgDaysActive)
      : 0

    return {
      ...metrics,
      totalFundSize,
      totalValue,
      totalStartInput,
      totalTimeWeightedFundSize,
      totalDaysActive,
      totalRealizedGains,
      realizedAPY: weightedRealizedAPY,
      liquidAPY: aggregateLiquidAPY,
      projectedAnnualReturn,
      totalGainUsd,
      totalGainPct,
      activeFunds,
      closedFunds,
      funds: fundsWithSharesPct
    }
  })() : metrics

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
          <h1 className="text-xl font-bold text-white">
            Portfolio Dashboard
            {showTestData && <span className="ml-2 text-amber-400 text-sm font-normal">(Test Mode)</span>}
          </h1>
          <p className="text-sm text-slate-400">
            {filteredMetrics?.activeFunds ?? 0} active funds • {filteredMetrics?.closedFunds ?? 0} closed
            {filterPlatform !== 'all' && <span className="ml-1 text-mint-400">({filterPlatform})</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-2 py-1 text-sm bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors font-medium"
          >
            + Add Fund
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-2 py-1 text-sm bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors font-medium"
          >
            Import
          </button>
          <button
            onClick={() => setShowTestData(!showTestData)}
            className={`px-2 py-1 text-sm rounded ${showTestData ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            title={showTestData ? 'Showing test funds only' : 'Click to show test funds'}
          >
            Test Data
          </button>
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
          {filteredMetrics && <AggregatePanel metrics={filteredMetrics} />}

          {/* Portfolio Charts */}
          {showCharts && filteredHistory && filteredHistory.currentAllocations.length > 0 && (
            <PortfolioCharts
              timeSeries={filteredHistory.timeSeries}
              allocations={filteredHistory.currentAllocations}
              totals={filteredHistory.totals}
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
                  <Link
                    to={`/platform/${platform}`}
                    className="text-base font-semibold text-white mb-2 capitalize hover:text-mint-400 transition-colors inline-block"
                  >
                    {platform} →
                  </Link>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {platformFunds.map(fund => {
                      const fundMetrics = filteredMetrics?.funds.find(f => f.id === fund.id)
                      return (
                        <Link key={fund.id} to={`/fund/${fund.id}`}>
                          <FundCard fund={fund} impactPct={fundMetrics?.fundSharesPct} />
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Fund Modal */}
      {showCreateModal && (
        <CreateFundModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
        />
      )}

      {/* Import Wizard */}
      {showImportModal && (
        <ImportWizard
          onClose={() => setShowImportModal(false)}
          onImported={loadData}
        />
      )}
    </div>
  )
}
