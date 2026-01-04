import type { FundSummary } from '../api/funds'

interface FundCardProps {
  fund: FundSummary
  impactPct?: number
}

export function FundCard({ fund, impactPct }: FundCardProps) {
  const hasValue = fund.latestEquity && fund.latestEquity.value > 0
  // Use explicit status if set, otherwise fall back to legacy check (undefined status + zero fund size)
  const isClosed = fund.config.status === 'closed' || (fund.config.status === undefined && fund.config.fund_size_usd === 0)
  const isCashFund = fund.config.fund_type === 'cash'

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

  // Cash funds have a blue color scheme
  const borderHoverClass = isCashFund ? 'hover:border-blue-500' : 'hover:border-mint-600'
  const valueColorClass = isCashFund ? 'text-blue-400 font-medium' : 'text-mint-400 font-medium'

  return (
    <div className={`bg-slate-800 rounded-lg p-3 border transition-all ${borderHoverClass} ${
      isClosed ? 'border-slate-700 opacity-60' : 'border-slate-700'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-base font-bold text-white uppercase">{fund.ticker}</h3>
          <p className="text-xs text-slate-400 capitalize">{fund.platform}</p>
        </div>
        <div className="flex items-center gap-1">
          {impactPct !== undefined && impactPct > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded" title="Portfolio Impact %">
              {(impactPct * 100).toFixed(1)}%
            </span>
          )}
          {fund.config.audited && (
            <span className="px-1.5 py-0.5 text-xs bg-green-900/50 text-green-400 rounded" title={`Audited ${fund.config.audited}`}>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          {isCashFund && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-900 text-blue-400 rounded">Cash</span>
          )}
          {isClosed && (
            <span className="px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Closed</span>
          )}
          {!isClosed && !isCashFund && fund.config.accumulate && (
            <span className="px-1.5 py-0.5 text-xs bg-mint-900 text-mint-400 rounded">Acc</span>
          )}
        </div>
      </div>

      <div className="space-y-1 text-xs">
        {isCashFund ? (
          // Cash fund display - show balance and APY
          <>
            <div className="flex justify-between">
              <span className="text-slate-400">Cash Balance</span>
              <span className={hasValue ? valueColorClass : 'text-slate-500'}>
                {hasValue ? formatCurrency(fund.latestEquity!.value) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cash APY</span>
              <span className="text-purple-400">{formatPercent(fund.config.cash_apy)}</span>
            </div>
          </>
        ) : (
          // Trading fund display
          <>
            <div className="flex justify-between">
              <span className="text-slate-400">Fund Size</span>
              <span className="text-white font-medium">{formatCurrency(fund.config.fund_size_usd)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">Value</span>
              <span className={hasValue ? valueColorClass : 'text-slate-500'}>
                {hasValue ? formatCurrency(fund.latestEquity!.value) : '-'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">APY / Int</span>
              <span className="text-slate-300">{formatPercent(fund.config.target_apy)} / {fund.config.interval_days}d</span>
            </div>
          </>
        )}
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
