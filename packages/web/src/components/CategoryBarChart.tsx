import { memo } from 'react'
import { formatCurrencyCompact, formatPercentSimple } from '../utils/format'

export interface CategoryChartData {
  category: string
  label: string
  value: number
  percentage: number
  color: string
}

export interface MarginInfo {
  available: number
  borrowed: number
}

interface CategoryBarChartProps {
  data: CategoryChartData[]
  margin?: MarginInfo
  title?: string
}

/**
 * Horizontal bar chart showing portfolio allocation across fund categories.
 * Includes optional margin availability indicator.
 */
export const CategoryBarChart = memo(function CategoryBarChart({
  data,
  margin,
  title = 'Portfolio Allocation'
}: CategoryBarChartProps) {
  const hasData = data.some(d => d.value > 0)
  const maxPercentage = Math.max(...data.map(d => d.percentage), 1)
  const hasMargin = margin && margin.available > 0

  return (
    <div className="bg-slate-800 rounded-lg p-2 sm:p-3 border border-slate-700">
      <h3 className="text-[10px] sm:text-xs font-medium text-white mb-3">{title}</h3>

      {hasData ? (
        <div className="space-y-2">
          {/* Category bars */}
          {data.map(cat => {
            const barWidth = maxPercentage > 0 ? (cat.percentage / maxPercentage) * 100 : 0
            return (
              <div key={cat.category} className="space-y-0.5">
                <div className="flex items-center justify-between text-[9px] sm:text-xs">
                  <span className="text-slate-300 font-medium">{cat.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono">{formatCurrencyCompact(cat.value)}</span>
                    <span className="text-slate-500 w-10 text-right">{formatPercentSimple(cat.percentage / 100)}</span>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-700 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all duration-300"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: cat.color
                    }}
                  />
                </div>
              </div>
            )
          })}

          {/* Margin indicator */}
          {hasMargin && (
            <div className="mt-4 pt-3 border-t border-slate-700">
              <div className="flex items-center justify-between text-[9px] sm:text-xs mb-1.5">
                <span className="text-purple-400 font-medium">Margin Capacity</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-mono">{formatCurrencyCompact(margin.available)}</span>
                  {margin.borrowed > 0 && (
                    <span className="text-orange-400 text-[8px] sm:text-[10px]">
                      ({formatCurrencyCompact(margin.borrowed)} used)
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-slate-700 rounded-sm overflow-hidden relative">
                {/* Available margin (full bar, dashed) */}
                <div
                  className="absolute inset-0 rounded-sm"
                  style={{
                    background: 'repeating-linear-gradient(90deg, #8b5cf620 0px, #8b5cf620 4px, transparent 4px, transparent 8px)',
                    border: '1px dashed #8b5cf6'
                  }}
                />
                {/* Borrowed margin (solid fill) */}
                {margin.borrowed > 0 && (
                  <div
                    className="h-full rounded-sm bg-orange-500/60"
                    style={{
                      width: `${Math.min((margin.borrowed / margin.available) * 100, 100)}%`
                    }}
                  />
                )}
              </div>
              <p className="text-[8px] sm:text-[9px] text-slate-500 mt-1">
                Borrowing capacity from holdings (not an allocation)
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-[120px] text-slate-500 text-sm">
          No category data available
        </div>
      )}
    </div>
  )
})

export default CategoryBarChart
