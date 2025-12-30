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
    const pct = value * 100
    return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
  }

  const cards = [
    {
      label: 'Total Fund Size',
      value: formatCurrency(metrics.totalFundSize),
      subtext: `${metrics.activeFunds + metrics.closedFunds} funds`,
      color: 'text-white'
    },
    {
      label: 'Current Value',
      value: formatCurrency(metrics.totalValue),
      subtext: `${metrics.activeFunds} active`,
      color: 'text-mint-400'
    },
    {
      label: 'Realized Gains',
      value: formatCurrency(metrics.totalRealizedGains ?? 0),
      subtext: formatPercent(metrics.totalGainPct),
      color: (metrics.totalRealizedGains ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
    },
    {
      label: 'Realized APY',
      value: formatPercent(metrics.realizedAPY),
      subtext: `TWF: ${formatCurrency(metrics.totalTimeWeightedFundSize ?? 0)}`,
      color: metrics.realizedAPY >= 0 ? 'text-mint-400' : 'text-red-400'
    },
    {
      label: 'Projected Annual',
      value: formatCurrency(metrics.projectedAnnualReturn),
      subtext: 'Based on realized APY',
      color: 'text-slate-300'
    }
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-slate-800 rounded-lg p-2 md:p-3 border border-slate-700"
        >
          <p className="text-xs text-slate-400">{card.label}</p>
          <p className={`text-base md:text-lg font-bold ${card.color}`}>{card.value}</p>
          <p className="text-xs text-slate-500">{card.subtext}</p>
        </div>
      ))}
    </div>
  )
}
