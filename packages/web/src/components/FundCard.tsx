import type { FundSummary } from '../api/funds'

interface FundCardProps {
  fund: FundSummary
}

export function FundCard({ fund }: FundCardProps) {
  const hasValue = fund.latestEquity && fund.latestEquity.value > 0
  const isClosed = fund.platform === 'closed' || !hasValue

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return (value * 100).toFixed(1) + '%'
  }

  return (
    <div className={`bg-slate-800 rounded-lg p-3 border transition-all hover:border-mint-600 ${
      isClosed ? 'border-slate-700 opacity-60' : 'border-slate-700'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-bold text-white uppercase">{fund.ticker}</h3>
          <p className="text-xs text-slate-400 capitalize">{fund.platform}</p>
        </div>
        {isClosed && (
          <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Closed</span>
        )}
        {!isClosed && fund.config.accumulate && (
          <span className="px-1.5 py-0.5 text-xs bg-mint-900 text-mint-400 rounded">Acc</span>
        )}
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Fund Size</span>
          <span className="text-white font-medium">{formatCurrency(fund.config.fund_size_usd)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Value</span>
          <span className={hasValue ? 'text-mint-400 font-medium' : 'text-slate-500'}>
            {hasValue ? formatCurrency(fund.latestEquity!.value) : '-'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">APY / Int</span>
          <span className="text-slate-300">{formatPercent(fund.config.target_apy)} / {fund.config.interval_days}d</span>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-slate-700">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">{fund.entryCount} entries</span>
          {fund.latestEquity && (
            <span className="text-slate-500">{fund.latestEquity.date}</span>
          )}
        </div>
      </div>
    </div>
  )
}
