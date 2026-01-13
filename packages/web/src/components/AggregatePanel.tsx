import { memo } from 'react'
import type { AggregateMetrics } from '../api/funds'

interface AggregatePanelProps {
  metrics: AggregateMetrics
}

export const AggregatePanel = memo(function AggregatePanel({ metrics }: AggregatePanelProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercent = (value: number) => {
    if (!Number.isFinite(value) || Number.isNaN(value)) return '--'
    const clamped = Math.max(-9999, Math.min(9999, value))
    const pct = clamped * 100
    return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
  }

  const avgDaysActive = metrics.funds.length > 0
    ? Math.round(metrics.totalDaysActive / metrics.funds.length)
    : 0

  // Calculate cash fund totals
  const cashFunds = metrics.funds.filter(f => f.fundType === 'cash')
  const totalCashBalance = cashFunds.reduce((sum, f) => sum + f.currentValue, 0)
  const totalCashInterest = cashFunds.reduce((sum, f) => sum + f.realizedGains, 0)

  const cards = [
    {
      label: 'Total Fund Size',
      value: formatCurrency(metrics.totalFundSize),
      subtext: `${metrics.activeFunds + metrics.closedFunds} funds`,
      color: 'text-white',
      tooltip: 'Total capital allocated across all funds'
    },
    {
      label: 'Current Value',
      value: formatCurrency(metrics.totalValue),
      subtext: `${metrics.activeFunds} active`,
      color: 'text-mint-400',
      tooltip: 'Current market value of all positions'
    },
    {
      label: 'Realized Gain',
      value: formatCurrency(metrics.totalRealizedGains ?? 0),
      subtext: 'Divs + Interest + Sells',
      color: (metrics.totalRealizedGains ?? 0) >= 0 ? 'text-green-400' : 'text-red-400',
      tooltip: 'Profits already extracted: dividends, interest, and sell profits minus expenses'
    },
    {
      label: 'Realized APY',
      value: formatPercent(metrics.realizedAPY),
      subtext: `${avgDaysActive} avg days`,
      color: metrics.realizedAPY >= 0 ? 'text-mint-400' : 'text-red-400',
      tooltip: `Annualized realized return. Time-Weighted Fund Size: ${formatCurrency(metrics.totalTimeWeightedFundSize ?? 0)}`
    },
    {
      label: 'Unrealized Gain',
      value: formatCurrency(metrics.totalUnrealizedGains ?? 0),
      subtext: formatPercent(metrics.unrealizedGainPct ?? 0),
      color: (metrics.totalUnrealizedGains ?? 0) >= 0 ? 'text-yellow-400' : 'text-red-400',
      tooltip: 'Paper gains: Current Value minus Cost Basis (not yet realized)'
    },
    {
      label: 'Liquid Gain',
      value: formatCurrency(metrics.totalGainUsd),
      subtext: formatPercent(metrics.totalGainPct),
      color: metrics.totalGainUsd >= 0 ? 'text-green-400' : 'text-red-400',
      tooltip: 'Total lifetime gain: Unrealized + Realized (if liquidated now)'
    },
    {
      label: 'Liquid APY',
      value: formatPercent(metrics.liquidAPY ?? 0),
      subtext: 'If liquidated now',
      color: (metrics.liquidAPY ?? 0) >= 0 ? 'text-mint-400' : 'text-red-400',
      tooltip: 'Annualized return based on total liquid gain'
    },
    {
      label: 'Projected Annual',
      value: formatCurrency(metrics.projectedAnnualReturn),
      subtext: 'Based on realized APY',
      color: 'text-slate-300',
      tooltip: 'Expected annual return if current realized APY continues'
    },
    ...(cashFunds.length > 0 ? [{
      label: 'Cash Balance',
      value: formatCurrency(totalCashBalance),
      subtext: `Interest: ${formatCurrency(totalCashInterest)}`,
      color: 'text-blue-400',
      tooltip: `Total cash across ${cashFunds.length} platform cash fund${cashFunds.length > 1 ? 's' : ''}`
    }] : [])
  ]

  return (
    <div className="relative">
      {/* Scroll fade indicator for mobile */}
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none z-10 sm:hidden" />
      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 sm:overflow-x-visible pb-1.5 sm:pb-0 scrollbar-thin scroll-smooth snap-x snap-mandatory">
        <div className={`grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 ${cashFunds.length > 0 ? 'xl:grid-cols-9' : 'xl:grid-cols-8'} gap-1.5 xs:gap-2 sm:gap-2.5 min-w-[280px] sm:min-w-0`}>
          {cards.map((card, i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-lg p-2 xs:p-2.5 sm:p-3 border border-slate-700 cursor-help min-w-0 touch-manipulation active:bg-slate-700/50 transition-colors snap-start"
              title={card.tooltip}
            >
              <p className="text-[9px] xs:text-[10px] sm:text-xs text-slate-400 truncate leading-tight">{card.label}</p>
              <p className={`text-[11px] xs:text-sm sm:text-base xl:text-lg font-bold ${card.color} truncate leading-tight mt-0.5`}>{card.value}</p>
              <p className="text-[8px] xs:text-[9px] sm:text-xs text-slate-500 truncate leading-tight mt-0.5">{card.subtext}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
