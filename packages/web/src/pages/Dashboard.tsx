import { useEffect, useState, useCallback } from 'react'
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

  const loadData = useCallback(async () => {
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
  }, [showTestData])

  useEffect(() => {
    loadData()
  }, [loadData])

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
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 xs:gap-2.5 sm:gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-white leading-tight">
              Dashboard
              {showTestData && <span className="ml-1.5 xs:ml-2 text-amber-400 text-[10px] xs:text-xs sm:text-sm font-normal">(Test)</span>}
            </h1>
            <p className="text-[10px] xs:text-[11px] sm:text-sm text-slate-400 mt-0.5 leading-tight">
              {filteredMetrics?.activeFunds ?? 0} active • {filteredMetrics?.closedFunds ?? 0} closed
              {filterPlatform !== 'all' && <span className="ml-1 text-mint-400 capitalize">({filterPlatform})</span>}
            </p>
          </div>
          {/* Primary Actions - Always visible */}
          <div className="flex items-center gap-1.5 xs:gap-2 flex-shrink-0">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-2.5 xs:px-3 sm:px-4 py-1.5 xs:py-2 text-[11px] xs:text-xs sm:text-sm bg-mint-600 text-white rounded-lg hover:bg-mint-700 active:bg-mint-800 transition-colors font-medium whitespace-nowrap touch-manipulation min-h-[36px] xs:min-h-[40px] sm:min-h-[44px]"
            >
              + Add
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-2.5 xs:px-3 sm:px-4 py-1.5 xs:py-2 text-[11px] xs:text-xs sm:text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-600 active:bg-slate-500 transition-colors font-medium touch-manipulation min-h-[36px] xs:min-h-[40px] sm:min-h-[44px]"
            >
              Import
            </button>
          </div>
        </div>
        {/* Secondary Controls - Improved mobile responsive layout */}
        <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-2.5 overflow-x-auto scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0 sm:overflow-visible pb-1 sm:pb-0">
          <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-2.5 flex-shrink-0">
            <button
              onClick={() => setShowTestData(!showTestData)}
              className={`px-2 xs:px-2.5 sm:px-3 py-1.5 text-[10px] xs:text-[11px] sm:text-sm rounded-lg touch-manipulation min-h-[32px] xs:min-h-[36px] sm:min-h-[40px] whitespace-nowrap ${showTestData ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 active:bg-slate-600'}`}
              title={showTestData ? 'Showing test funds only' : 'Click to show test funds'}
            >
              Test
            </button>
            <button
              onClick={() => setShowCharts(!showCharts)}
              className={`px-2 xs:px-2.5 sm:px-3 py-1.5 text-[10px] xs:text-[11px] sm:text-sm rounded-lg touch-manipulation min-h-[32px] xs:min-h-[36px] sm:min-h-[40px] whitespace-nowrap ${showCharts ? 'bg-mint-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 active:bg-slate-600'}`}
            >
              Charts
            </button>
            <select
              value={filterPlatform}
              onChange={e => setFilterPlatform(e.target.value)}
              className="px-2 xs:px-2.5 sm:px-3 py-1.5 text-[10px] xs:text-[11px] sm:text-sm bg-slate-800 border border-slate-700 rounded-lg text-white min-w-[80px] xs:min-w-[100px] sm:min-w-[140px] touch-manipulation min-h-[32px] xs:min-h-[36px] sm:min-h-[40px]"
            >
              <option value="all">All Platforms</option>
              {platforms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex bg-slate-800 rounded-lg p-0.5 ml-auto flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 xs:px-2.5 sm:px-3 py-1.5 text-[10px] xs:text-[11px] sm:text-sm rounded-md touch-manipulation min-h-[28px] xs:min-h-[32px] sm:min-h-[36px] ${viewMode === 'grid' ? 'bg-mint-600 text-white' : 'text-slate-400 hover:text-slate-300 active:text-slate-200'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 xs:px-2.5 sm:px-3 py-1.5 text-[10px] xs:text-[11px] sm:text-sm rounded-md touch-manipulation min-h-[28px] xs:min-h-[32px] sm:min-h-[36px] ${viewMode === 'table' ? 'bg-mint-600 text-white' : 'text-slate-400 hover:text-slate-300 active:text-slate-200'}`}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 xs:py-16 sm:py-20">
          <div className="animate-spin rounded-full h-8 w-8 xs:h-10 xs:w-10 sm:h-12 sm:w-12 border-b-2 border-mint-400"></div>
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
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 scrollbar-thin scroll-fade-right">
              <table className="w-full text-left text-[10px] xs:text-xs sm:text-sm min-w-[260px]">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 font-medium">Fund</th>
                    <th className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 font-medium hidden sm:table-cell">Platform</th>
                    <th className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 font-medium text-right hidden md:table-cell">Fund Size</th>
                    <th className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 font-medium text-right">Value</th>
                    <th className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 font-medium text-right hidden lg:table-cell">Target APY</th>
                    <th className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 font-medium text-right hidden lg:table-cell">Interval</th>
                    <th className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 font-medium text-right hidden xs:table-cell">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFunds.map(fund => (
                    <tr
                      key={fund.id}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 active:bg-slate-700/50 cursor-pointer touch-manipulation"
                      onClick={() => window.location.href = `/fund/${fund.id}`}
                    >
                      <td className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3">
                        <span className="font-medium text-white uppercase text-[10px] xs:text-xs sm:text-sm">{fund.ticker}</span>
                        <span className="sm:hidden text-slate-500 text-[9px] xs:text-[10px] capitalize block mt-0.5">{fund.platform}</span>
                      </td>
                      <td className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 text-slate-400 capitalize hidden sm:table-cell">{fund.platform}</td>
                      <td className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 text-right text-white hidden md:table-cell">
                        {formatCurrency(fund.config.fund_size_usd)}
                      </td>
                      <td className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 text-right">
                        <span className={fund.latestEquity?.value ? 'text-mint-400 font-medium' : 'text-slate-500'}>
                          {fund.latestEquity?.value ? formatCurrency(fund.latestEquity.value) : '-'}
                        </span>
                      </td>
                      <td className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 text-right text-slate-300 hidden lg:table-cell">
                        {formatPercent(fund.config.target_apy)}
                      </td>
                      <td className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 text-right text-slate-400 hidden lg:table-cell">
                        {fund.config.interval_days}d
                      </td>
                      <td className="px-2 xs:px-2.5 sm:px-3 py-2 xs:py-2.5 sm:py-3 text-right text-slate-400 hidden xs:table-cell">
                        {fund.entryCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3 xs:space-y-4 sm:space-y-5">
              {Object.entries(fundsByPlatform).map(([platform, platformFunds]) => (
                <div key={platform}>
                  <Link
                    to={`/platform/${platform}`}
                    className="text-xs xs:text-sm sm:text-base font-semibold text-white mb-1.5 xs:mb-2 sm:mb-3 capitalize hover:text-mint-400 active:text-mint-500 transition-colors inline-block touch-manipulation"
                  >
                    {platform} →
                  </Link>
                  <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 xs:gap-2 sm:gap-3">
                    {platformFunds.map(fund => {
                      const fundMetrics = filteredMetrics?.funds.find(f => f.id === fund.id)
                      const fundPath = fund.config.fund_type === 'derivatives'
                        ? `/derivatives/${fund.id}`
                        : `/fund/${fund.id}`
                      return (
                        <Link key={fund.id} to={fundPath} className="touch-manipulation">
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
