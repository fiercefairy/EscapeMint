import type { SubFund } from '../api/types'

interface SubFundCardProps {
  subfund: SubFund
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function SubFundCard({ subfund }: SubFundCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-mint-500 transition-colors cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{subfund.name}</h3>
        <span className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 capitalize">
          {subfund.period}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Starting Size</span>
          <span className="text-white">{formatCurrency(subfund.starting_fund_size_usd)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Target APY</span>
          <span className="text-mint-400">{formatPercent(subfund.target_growth_apy)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Action Amount</span>
          <span className="text-white">{formatCurrency(subfund.action_amount_usd)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Tolerance</span>
          <span className="text-slate-300">{formatPercent(subfund.tolerance_pct)}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700">
        <span className="text-xs text-slate-500">
          Started: {new Date(subfund.start_date).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}
