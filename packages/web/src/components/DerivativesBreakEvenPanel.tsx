import { useMemo, useState } from 'react'
import type { FundEntry } from '../api/funds'
import type { ComputedEntry } from './entriesTable'
import { formatCurrency, formatPercent } from '../utils/format'

interface DerivativesBreakEvenPanelProps {
  entries: FundEntry[]
  computedEntries: ComputedEntry[]
  contractMultiplier: number
}

export function DerivativesBreakEvenPanel({
  entries,
  computedEntries,
  contractMultiplier
}: DerivativesBreakEvenPanelProps) {
  const [targetPrice, setTargetPrice] = useState('')

  const latestEntry = useMemo(() => {
    if (computedEntries.length === 0) return null
    return computedEntries[computedEntries.length - 1]
  }, [computedEntries])

  const totalDeposits = useMemo(() => {
    let sum = 0
    for (const e of entries) {
      if (e.action === 'DEPOSIT') sum += Math.abs(e.amount ?? 0)
      else if (e.action === 'WITHDRAW') sum -= Math.abs(e.amount ?? 0)
    }
    return sum
  }, [entries])

  const metrics = useMemo(() => {
    if (!latestEntry) return null
    const position = latestEntry.derivPosition ?? 0
    if (position === 0) return null

    const avgEntry = latestEntry.derivAvgEntry ?? 0
    const effectiveCash = latestEntry.cash ?? latestEntry.derivMarginBalance ?? 0
    const costBasis = latestEntry.derivCostBasis ?? 0

    // derivEquity already includes unrealized P&L at the latest known price
    // (computed by engine as: effectiveCash + unrealizedPnl)
    const currentEquity = latestEntry.derivEquity ?? effectiveCash

    // Net break-even: price where equity = totalDeposits
    // equityAtPrice(P) = effectiveCash + position * contractMultiplier * P - costBasis
    // Solve for P when equity = totalDeposits:
    // netBE = (totalDeposits - effectiveCash + costBasis) / (position * contractMultiplier)
    const positionNotional = position * contractMultiplier
    const netBreakEven = positionNotional !== 0
      ? (totalDeposits - effectiveCash + costBasis) / positionNotional
      : 0

    return {
      positionBreakEven: avgEntry,
      netBreakEven,
      currentEquity,
      position,
      effectiveCash,
      costBasis
    }
  }, [latestEntry, totalDeposits, contractMultiplier])

  const scenario = useMemo(() => {
    if (!metrics) return null
    const price = parseFloat(targetPrice)
    if (!price || price <= 0) return null

    const positionNotional = metrics.position * contractMultiplier
    const equityAtPrice = metrics.effectiveCash + (positionNotional * price) - metrics.costBasis
    const profitAtPrice = equityAtPrice - totalDeposits
    const profitPct = totalDeposits !== 0 ? profitAtPrice / totalDeposits : 0

    return { equityAtPrice, profitAtPrice, profitPct }
  }, [targetPrice, metrics, contractMultiplier, totalDeposits])

  if (!latestEntry || !metrics) return null

  const profitColor = (val: number) =>
    val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-slate-300'

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex flex-col h-[200px]">
      <h3 className="text-sm font-medium text-slate-400 mb-2">Break-Even & Scenario</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm flex-1">
        <div>
          <span className="text-slate-500 text-xs">Position B/E</span>
          <div className="text-slate-200 font-mono">
            {formatCurrency(metrics.positionBreakEven)}
          </div>
        </div>
        <div>
          <span className="text-slate-500 text-xs">Net B/E (all-in)</span>
          <div className="text-slate-200 font-mono">
            {formatCurrency(metrics.netBreakEven)}
          </div>
        </div>
        <div>
          <span className="text-slate-500 text-xs">Total Deposits</span>
          <div className="text-slate-200 font-mono">
            {formatCurrency(totalDeposits)}
          </div>
        </div>
        <div>
          <span className="text-slate-500 text-xs">Current Equity</span>
          <div className="text-slate-200 font-mono">
            {formatCurrency(metrics.currentEquity)}
          </div>
        </div>
        <div>
          <span className="text-slate-500 text-xs">Target Price</span>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="e.g. 120000"
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-slate-200 font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <span className="text-slate-500 text-xs">Modeled P&L</span>
          {scenario ? (
            <div className={`font-mono ${profitColor(scenario.profitAtPrice)}`}>
              {formatCurrency(scenario.profitAtPrice)} ({formatPercent(scenario.profitPct)})
            </div>
          ) : (
            <div className="text-slate-500 font-mono">--</div>
          )}
        </div>
      </div>
    </div>
  )
}
