import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { FundCard } from '../components/FundCard'
import { AggregatePanel } from '../components/AggregatePanel'
import { PortfolioCharts } from '../components/PortfolioCharts'
import { CreateFundModal } from '../components/CreateFundModal'
import { ImportWizard } from '../components/ImportWizard'
import { WelcomePanel } from '../components/WelcomePanel'
import { useDashboard } from '../contexts/DashboardContext'
import type { FundSummary, AggregateMetrics } from '../api/funds'

// Skeleton for metrics panel
function MetricsPanelSkeleton() {
  return (
    <div className="bg-slate-800 rounded-lg p-3 sm:p-4 border border-slate-700 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 bg-slate-700 rounded" />
            <div className="h-6 w-24 bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Skeleton for fund cards
function FundCardsSkeleton() {
  return (
    <div className="space-y-3 xs:space-y-4 sm:space-y-5">
      <div>
        <div className="h-4 w-24 bg-slate-700 rounded mb-2" />
        <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 xs:gap-2 sm:gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-slate-800 rounded-lg p-2 sm:p-3 border border-slate-700 animate-pulse">
              <div className="h-4 w-16 bg-slate-700 rounded mb-2" />
              <div className="h-6 w-20 bg-slate-700 rounded mb-1" />
              <div className="h-3 w-12 bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Dashboard() {
  const { platform: urlPlatform } = useParams<{ platform?: string }>()
  const navigate = useNavigate()

  const {
    funds,
    metrics,
    history,
    fundsLoading,
    metricsLoading,
    historyLoading,
    refresh,
    connected
  } = useDashboard()

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  // Platform filter is driven by URL param
  const filterPlatform = urlPlatform ?? 'all'

  const handlePlatformChange = (platform: string) => {
    if (platform === 'all') {
      navigate('/')
    } else {
      navigate(`/dashboard/${platform}`)
    }
  }
  const [showCharts, setShowCharts] = useState(() => {
    const saved = localStorage.getItem('dashboard-showCharts')
    return saved !== null ? saved === 'true' : true
  })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // Persist showCharts preference to localStorage
  useEffect(() => {
    localStorage.setItem('dashboard-showCharts', String(showCharts))
  }, [showCharts])

  // Get unique platforms
  const platforms = useMemo(() => {
    if (!funds) return []
    return [...new Set(funds.map(f => f.platform))]
  }, [funds])

  // Filter funds
  const filteredFunds = useMemo(() => {
    if (!funds) return []
    return filterPlatform === 'all'
      ? funds
      : funds.filter(f => f.platform === filterPlatform)
  }, [funds, filterPlatform])

  // Group by platform and sort cash funds to top within each group
  const fundsByPlatform = useMemo(() => {
    const grouped = filteredFunds.reduce((acc, fund) => {
      const key = fund.platform
      if (!acc[key]) acc[key] = []
      acc[key].push(fund)
      return acc
    }, {} as Record<string, FundSummary[]>)

    // Sort each platform's funds: cash funds first, then by ticker
    for (const platform of Object.keys(grouped)) {
      grouped[platform]?.sort((a, b) => {
        const aIsCash = a.config.fund_type === 'cash'
        const bIsCash = b.config.fund_type === 'cash'
        if (aIsCash && !bIsCash) return -1
        if (!aIsCash && bIsCash) return 1
        return a.ticker.localeCompare(b.ticker)
      })
    }

    return grouped
  }, [filteredFunds])

  // Filter history data based on selected platform
  const filteredHistory = useMemo(() => {
    if (!history) return null
    if (filterPlatform === 'all') return history

    // Get fund IDs for the selected platform
    const platformFundIds = new Set(
      funds?.filter(f => f.platform === filterPlatform).map(f => f.id) ?? []
    )

    const filteredAllocations = history.currentAllocations.filter(a => a.platform === filterPlatform)

    // Filter time series - fundBreakdown contains per-fund values which we can filter
    // First pass: filter and scale values, excluding points with no platform data
    const rawFilteredTimeSeries = history.timeSeries
      .map(point => {
        // Filter fundBreakdown to only include funds from selected platform
        const filteredBreakdown: Record<string, number> = {}
        let filteredTotalValue = 0

        for (const [fundId, value] of Object.entries(point.fundBreakdown)) {
          if (platformFundIds.has(fundId)) {
            filteredBreakdown[fundId] = value
            filteredTotalValue += value
          }
        }

        // Skip points where the platform has no data
        if (Object.keys(filteredBreakdown).length === 0) {
          return null
        }

        // Calculate scaling ratio using server's totalValue as base
        const rawRatio = point.totalValue > 0 ? filteredTotalValue / point.totalValue : 0
        const ratio = Math.max(0, Math.min(1, rawRatio))

        // Scale monetary values by ratio
        const scaledStartInput = point.totalStartInput * ratio
        const scaledRealizedGain = point.totalRealizedGain * ratio
        const scaledGainUsd = point.totalGainUsd * ratio

        return {
          ...point,
          fundBreakdown: filteredBreakdown,
          totalValue: filteredTotalValue,
          totalFundSize: point.totalFundSize * ratio,
          totalCash: point.totalCash * ratio,
          totalMarginBorrowed: point.totalMarginBorrowed * ratio,
          totalMarginAccess: point.totalMarginAccess * ratio,
          totalStartInput: scaledStartInput,
          totalDividends: point.totalDividends * ratio,
          totalExpenses: point.totalExpenses * ratio,
          totalCashInterest: point.totalCashInterest * ratio,
          totalRealizedGain: scaledRealizedGain,
          totalGainUsd: scaledGainUsd,
          totalGainPct: scaledStartInput > 0 ? scaledGainUsd / scaledStartInput : 0,
          // APY will be calculated in second pass
          realizedAPY: 0,
          liquidAPY: 0
        }
      })
      .filter((point): point is NonNullable<typeof point> => point !== null)

    // Second pass: calculate APY using the filtered series' first date
    const firstFilteredDate = rawFilteredTimeSeries[0]?.date ? new Date(rawFilteredTimeSeries[0].date) : null

    const filteredTimeSeries = rawFilteredTimeSeries.map(point => {
      const pointDate = new Date(point.date)
      const daysElapsed = firstFilteredDate
        ? Math.max(1, (pointDate.getTime() - firstFilteredDate.getTime()) / (1000 * 60 * 60 * 24))
        : 1
      const realizedAPY = point.totalStartInput > 0
        ? (point.totalRealizedGain / point.totalStartInput) * (365 / daysElapsed)
        : 0
      const liquidAPY = point.totalStartInput > 0
        ? (point.totalGainUsd / point.totalStartInput) * (365 / daysElapsed)
        : 0

      return { ...point, realizedAPY, liquidAPY }
    })

    // Calculate filtered aggregate totals
    // Note: APY values will be added from filteredMetrics when rendering
    const lastFilteredPoint = filteredTimeSeries[filteredTimeSeries.length - 1]
    const filteredAggregateTotals = {
      totalGainUsd: lastFilteredPoint?.totalGainUsd ?? 0,
      totalRealizedGains: lastFilteredPoint?.totalRealizedGain ?? 0,
      totalValue: filteredAllocations.reduce((sum, a) => sum + a.value, 0),
      totalStartInput: lastFilteredPoint?.totalStartInput ?? 0,
      realizedAPY: 0, // Will be overridden with correct value when rendering
      liquidAPY: 0    // Will be overridden with correct value when rendering
    }

    return {
      timeSeries: filteredTimeSeries,
      currentAllocations: filteredAllocations,
      totals: {
        totalCurrentValue: filteredAllocations.reduce((sum, a) => sum + a.value, 0),
        totalCurrentCash: filteredAllocations.reduce((sum, a) => sum + a.cash, 0),
        totalCurrentMarginAccess: filteredAllocations.reduce((sum, a) => sum + a.marginAccess, 0),
        totalCurrentMarginBorrowed: filteredAllocations.reduce((sum, a) => sum + a.marginBorrowed, 0)
      },
      aggregateTotals: filteredAggregateTotals
    }
  }, [history, filterPlatform, funds])

  // Calculate filtered metrics based on selected platform
  const filteredMetrics = useMemo((): AggregateMetrics | null => {
    if (!metrics) return null
    if (filterPlatform === 'all') return metrics

    const filteredFundMetrics = metrics.funds.filter(f => f.platform === filterPlatform)

    const totalFundSize = filteredFundMetrics.reduce((sum, f) => sum + f.fundSize, 0)
    const totalValue = filteredFundMetrics.reduce((sum, f) => sum + f.currentValue, 0)
    const totalStartInput = filteredFundMetrics.reduce((sum, f) => sum + f.startInput, 0)
    const totalTimeWeightedFundSize = filteredFundMetrics.reduce((sum, f) => sum + f.timeWeightedFundSize, 0)
    const totalDaysActive = filteredFundMetrics.reduce((sum, f) => sum + f.daysActive, 0)
    const totalRealizedGains = filteredFundMetrics.reduce((sum, f) => sum + f.realizedGains, 0)
    const totalUnrealizedGains = filteredFundMetrics.reduce((sum, f) => sum + f.unrealizedGains, 0)
    const activeFunds = filteredFundMetrics.filter(f => f.status !== 'closed').length
    const closedFunds = filteredFundMetrics.filter(f => f.status === 'closed').length

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

    let weightedRealizedAPY = 0
    for (const fund of fundsWithSharesPct) {
      weightedRealizedAPY += fund.realizedAPY * fund.fundSharesPct
    }

    const projectedAnnualReturn = fundsWithSharesPct
      .filter(f => f.currentValue > 0)
      .reduce((sum, f) => sum + f.projectedAnnualReturn, 0)

    const totalGainUsd = totalValue - totalStartInput
    const totalGainPct = totalStartInput > 0 ? (totalValue / totalStartInput - 1) : 0
    const unrealizedGainPct = totalStartInput > 0 ? totalUnrealizedGains / totalStartInput : 0

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
      totalUnrealizedGains,
      unrealizedGainPct,
      realizedAPY: weightedRealizedAPY,
      liquidAPY: aggregateLiquidAPY,
      projectedAnnualReturn,
      totalGainUsd,
      totalGainPct,
      activeFunds,
      closedFunds,
      funds: fundsWithSharesPct
    }
  }, [metrics, filterPlatform])

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

  // Show welcome panel if no funds and not loading
  const showWelcome = !fundsLoading && funds && funds.length === 0

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-white leading-tight">
            Dashboard
            {!connected && <span className="ml-1.5 xs:ml-2 text-red-400 text-[10px] xs:text-xs sm:text-sm font-normal">(Offline)</span>}
          </h1>
          <p className="text-[10px] xs:text-[11px] sm:text-sm text-slate-400 mt-0.5 leading-tight">
            {filteredMetrics?.activeFunds ?? 0} active • {filteredMetrics?.closedFunds ?? 0} closed
            {filterPlatform !== 'all' && <span className="ml-1 text-mint-400 capitalize">({filterPlatform})</span>}
          </p>
        </div>
        {/* Controls - Charts, Platform filter, Add, Import */}
        <div className="flex items-center gap-1.5 xs:gap-2 flex-shrink-0">
          <label className="flex items-center gap-1.5 xs:gap-2 cursor-pointer touch-manipulation">
            <span className="text-[10px] xs:text-[11px] sm:text-sm text-slate-400">Charts</span>
            <button
              type="button"
              role="switch"
              aria-checked={showCharts}
              onClick={() => setShowCharts(!showCharts)}
              className={`relative inline-flex h-5 xs:h-6 w-9 xs:w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${showCharts ? 'bg-mint-600' : 'bg-slate-700'}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 xs:h-5 w-4 xs:w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${showCharts ? 'translate-x-4 xs:translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </label>
          <select
            value={filterPlatform}
            onChange={e => handlePlatformChange(e.target.value)}
            className="px-2 xs:px-2.5 sm:px-3 py-1.5 xs:py-2 text-[10px] xs:text-[11px] sm:text-sm bg-slate-800 border border-slate-700 rounded-lg text-white min-w-[80px] xs:min-w-[100px] sm:min-w-[140px] touch-manipulation min-h-[36px] xs:min-h-[40px] sm:min-h-[44px]"
          >
            <option value="all">All Platforms</option>
            {platforms.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
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

      {showWelcome ? (
        <WelcomePanel
          onCreateFund={() => setShowCreateModal(true)}
          onImport={() => setShowImportModal(true)}
        />
      ) : (
        <>
          {/* Aggregate Metrics Panel - shows skeleton while loading */}
          {metricsLoading ? (
            <MetricsPanelSkeleton />
          ) : filteredMetrics ? (
            <AggregatePanel metrics={filteredMetrics} />
          ) : null}

          {/* Portfolio Charts - shows data as it arrives via WebSocket */}
          {showCharts && (
            historyLoading ? (
              <ChartsSkeleton />
            ) : filteredHistory && filteredHistory.currentAllocations.length > 0 ? (
              <PortfolioCharts
                timeSeries={filteredHistory.timeSeries}
                allocations={filteredHistory.currentAllocations}
                totals={filteredHistory.totals}
                aggregateTotals={{
                  ...filteredHistory.aggregateTotals,
                  realizedAPY: filteredMetrics?.realizedAPY ?? 0,
                  liquidAPY: filteredMetrics?.liquidAPY ?? 0
                }}
              />
            ) : null
          )}

          {/* View Mode Toggle */}
          <div className="flex justify-end">
            <div className="flex bg-slate-800 rounded-lg p-0.5">
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

          {/* Funds List/Grid - shows skeleton while loading */}
          {fundsLoading ? (
            <FundCardsSkeleton />
          ) : viewMode === 'table' ? (
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
                          <FundCard
                            fund={fund}
                            impactPct={fundMetrics?.fundSharesPct}
                            realizedAPY={fundMetrics?.realizedAPY}
                            liquidAPY={fundMetrics?.liquidAPY}
                            realizedGains={fundMetrics?.realizedGains}
                          />
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
          onCreated={refresh}
        />
      )}

      {/* Import Wizard */}
      {showImportModal && (
        <ImportWizard
          onClose={() => setShowImportModal(false)}
          onImported={refresh}
        />
      )}
    </div>
  )
}

// Charts skeleton component
function ChartsSkeleton() {
  return (
    <div className="space-y-1.5 xs:space-y-2 sm:space-y-3">
      {/* Pie Charts Row */}
      <div className="relative">
        <div className="grid grid-cols-3 gap-1 xs:gap-1.5 sm:gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-800 rounded-lg p-1.5 sm:p-2 border border-slate-700 animate-pulse">
              <div className="h-2 w-24 bg-slate-700 rounded mb-1" />
              <div className="flex items-start gap-2">
                <div className="w-[100px] h-[100px] bg-slate-700/50 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  {[1, 2, 3].map(j => (
                    <div key={j} className="h-4 bg-slate-700 rounded" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time Series Rows */}
      {[1, 2, 3].map(row => (
        <div key={row} className="grid grid-cols-2 sm:grid-cols-3 gap-1 xs:gap-1.5 sm:gap-2">
          {[1, 2, 3].slice(0, row === 1 ? 3 : 2).map(i => (
            <div key={i} className="bg-slate-800 rounded-lg p-1 xs:p-1.5 sm:p-2 border border-slate-700 animate-pulse">
              <div className="h-2 w-20 bg-slate-700 rounded mb-1" />
              <div className="h-[80px] sm:h-[100px] bg-slate-700/50 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
