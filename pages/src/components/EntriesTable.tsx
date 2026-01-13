import type { TimeSeriesPoint } from '../engine/backtest'
import { formatCurrency } from '../utils/format'

interface Props {
  timeSeries: TimeSeriesPoint[]
}

export function EntriesTable({ timeSeries }: Props) {
  // Calculate running metrics for each row
  const entries = timeSeries.map((point, index) => {
    // Find cost basis (invested amount)
    const invested = point.invested
    const unrealized = point.equity - Math.max(0, invested)
    // Realized = Cash Interest + Dividends + Extracted from sells
    const realized = point.cumCashInterest + point.cumDividends + point.totalExtracted
    // Liquid P&L = realized + unrealized (total profit/loss if we liquidated now)
    const liquidPnL = realized + unrealized

    return {
      ...point,
      unrealized,
      realized,
      liquidPnL,
      index
    }
  })

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-800 z-30">
            <tr className="border-b border-slate-700 text-slate-400 text-xs">
              <th className="px-2 py-2 font-medium sticky left-0 bg-slate-800 z-40">Date</th>
              <th className="px-2 py-2 font-medium text-right">Fund Size</th>
              <th className="px-2 py-2 font-medium text-right">Equity</th>
              <th className="px-2 py-2 font-medium text-right">Cash</th>
              <th className="px-2 py-2 font-medium text-right">Interest</th>
              <th className="px-2 py-2 font-medium text-right">Σ Interest</th>
              <th className="px-2 py-2 font-medium text-right">Dividend</th>
              <th className="px-2 py-2 font-medium text-right">Σ Dividend</th>
              <th className="px-2 py-2 font-medium text-right">Action</th>
              <th className="px-2 py-2 font-medium text-right">Amount</th>
              <th className="px-2 py-2 font-medium text-right">Invested</th>
              <th className="px-2 py-2 font-medium text-right">Unrealized</th>
              <th className="px-2 py-2 font-medium text-right">Realized</th>
              <th className="px-2 py-2 font-medium text-right">Liquid P&L</th>
              <th className="px-2 py-2 font-medium text-right">Target</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.index}
                className={`border-b border-slate-700/50 text-xs hover:bg-slate-700/30 ${
                  entry.action === 'BUY' ? 'bg-green-900/10' :
                  entry.action === 'SELL' ? 'bg-red-900/10' :
                  ''
                }`}
              >
                <td className="px-2 py-1.5 text-white sticky left-0 bg-slate-800">
                  {entry.date}
                </td>
                <td className="px-2 py-1.5 text-right text-slate-300">
                  {formatCurrency(entry.fundSize)}
                </td>
                <td className="px-2 py-1.5 text-right text-mint-400">
                  {formatCurrency(entry.equity)}
                </td>
                <td className="px-2 py-1.5 text-right text-green-300">
                  {formatCurrency(entry.cash)}
                </td>
                <td className="px-2 py-1.5 text-right text-cyan-400">
                  {entry.cashInterest > 0.01 ? formatCurrency(entry.cashInterest) : '-'}
                </td>
                <td className="px-2 py-1.5 text-right text-cyan-300">
                  {formatCurrency(entry.cumCashInterest)}
                </td>
                <td className="px-2 py-1.5 text-right text-emerald-400">
                  {entry.dividend > 0.01 ? formatCurrency(entry.dividend) : '-'}
                </td>
                <td className="px-2 py-1.5 text-right text-emerald-300">
                  {formatCurrency(entry.cumDividends)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <span className={
                    entry.action === 'BUY' ? 'text-green-400' :
                    entry.action === 'SELL' ? 'text-orange-400' :
                    'text-slate-500'
                  }>
                    {entry.action}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {entry.amount > 0 ? (
                    <span className={entry.action === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                      {formatCurrency(entry.amount)}
                    </span>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right text-blue-400">
                  {formatCurrency(Math.max(0, entry.invested))}
                </td>
                <td className={`px-2 py-1.5 text-right ${
                  entry.unrealized >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(entry.unrealized)}
                </td>
                <td className={`px-2 py-1.5 text-right ${
                  entry.realized >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(entry.realized)}
                </td>
                <td className={`px-2 py-1.5 text-right ${
                  entry.liquidPnL >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(entry.liquidPnL)}
                </td>
                <td className="px-2 py-1.5 text-right text-cyan-400">
                  {formatCurrency(entry.expectedTarget)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 bg-slate-900 border-t border-slate-700 text-xs text-slate-400">
        {timeSeries.length} entries
      </div>
    </div>
  )
}
