import type { AggregateMetrics } from '../api/funds'

interface AggregatePanelProps {
  metrics: AggregateMetrics
}

export function AggregatePanel({ metrics }: AggregatePanelProps) {
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
      label: 'Liquid Gain',
      value: formatCurrency(metrics.totalGainUsd),
      subtext: formatPercent(metrics.totalGainPct),
      color: metrics.totalGainUsd >= 0 ? 'text-green-400' : 'text-red-400',
      tooltip: 'Unrealized gain: Current Value minus Cost Basis (what you paid)'
    },
    {
      label: 'Liquid APY',
      value: formatPercent(metrics.liquidAPY ?? 0),
      subtext: 'If liquidated now',
      color: (metrics.liquidAPY ?? 0) >= 0 ? 'text-mint-400' : 'text-red-400',
      tooltip: 'Annualized return if all positions were liquidated today'
    },
    {
      label: 'Realized Gains',
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
    <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ${cashFunds.length > 0 ? 'lg:grid-cols-8' : 'lg:grid-cols-7'} gap-2`}>
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-slate-800 rounded-lg p-2 md:p-3 border border-slate-700 cursor-help"
          title={card.tooltip}
        >
          <p className="text-xs text-slate-400">{card.label}</p>
          <p className={`text-base md:text-lg font-bold ${card.color}`}>{card.value}</p>
          <p className="text-xs text-slate-500">{card.subtext}</p>
        </div>
      ))}
    </div>
  )
}
