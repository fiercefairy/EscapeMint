import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import * as d3 from 'd3'
import type { FundEntry, FundConfig, ChartBounds } from '../api/funds'
import { updateFundConfig } from '../api/funds'

interface FundChartsProps {
  entries: FundEntry[]
  config: FundConfig
  fundId: string
}

interface TimeSeriesPoint {
  date: Date
  value: number
  startInput: number
  fundSize: number
  cashAvailable: number
  cumulativeDividends: number
  cumulativeExpenses: number
  realizedGains: number
  cashInterest: number
  unrealizedGain: number
  capturedProfit: number
  cashPct: number
  assetPct: number
  apy: number
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}

// Compute time series data from entries
function computeTimeSeries(entries: FundEntry[], config: FundConfig): TimeSeriesPoint[] {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const startDate = new Date(config.start_date)
  const result: TimeSeriesPoint[] = []

  let startInput = 0
  let costBasis = 0
  let cumulativeDividends = 0
  let cumulativeExpenses = 0
  let cumulativeCashInterest = 0
  let cumulativeDeposits = 0
  let cumulativeWithdrawals = 0
  let realizedGains = 0

  for (const entry of sorted) {
    const date = new Date(entry.date)

    // Track DEPOSIT/WITHDRAW for fund_size calculation
    if (entry.action === 'DEPOSIT' && entry.amount) {
      cumulativeDeposits += entry.amount
    } else if (entry.action === 'WITHDRAW' && entry.amount) {
      cumulativeWithdrawals += entry.amount
    }
    // Track buys and sells for investment tracking
    else if (entry.action === 'BUY' && entry.amount) {
      startInput += entry.amount
      costBasis += entry.amount
    } else if (entry.action === 'SELL' && entry.amount) {
      startInput -= entry.amount
      // Calculate extracted profit using proper cost basis
      let extracted = 0
      if (entry.value === 0 || entry.value <= entry.amount) {
        // Full liquidation - extract remaining profit
        extracted = entry.amount - costBasis
        costBasis = 0
      } else {
        // Partial sell - proportional cost basis
        const sellProportion = entry.amount / (entry.value + entry.amount)
        const costBasisReturned = costBasis * sellProportion
        extracted = entry.amount - costBasisReturned
        costBasis -= costBasisReturned
      }
      realizedGains += extracted
    }

    // Track dividends, expenses, and cash_interest
    if (entry.dividend) cumulativeDividends += entry.dividend
    if (entry.expense) cumulativeExpenses += entry.expense
    if (entry.cash_interest) cumulativeCashInterest += entry.cash_interest

    // Calculate fund_size: use manual override if set, otherwise calculate dynamically
    const calculatedFundSize = config.fund_size_usd
      + cumulativeDeposits - cumulativeWithdrawals
      + cumulativeDividends + cumulativeCashInterest - cumulativeExpenses
    const fundSize = entry.fund_size ?? calculatedFundSize

    // Calculate cash interest for APY (simplified: cash * apy * time_fraction)
    const daysElapsed = Math.max(0, (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const cashAvailable = Math.max(0, fundSize - startInput)
    const cashInterest = cashAvailable * config.cash_apy * (daysElapsed / 365)

    // Post-action equity value (entry.value is pre-action)
    let postActionValue = entry.value
    if (entry.action === 'BUY' && entry.amount) {
      postActionValue = entry.value + entry.amount
    } else if (entry.action === 'SELL' && entry.amount) {
      postActionValue = Math.max(0, entry.value - entry.amount)
    }

    // Unrealized gain = post-action value - post-action investment
    const unrealizedGain = postActionValue - startInput

    // Captured profit = realized gains + dividends - expenses + cash interest
    const capturedProfit = realizedGains + cumulativeDividends - cumulativeExpenses + cashInterest

    // Cash vs Asset percentages
    const total = fundSize
    const cashPct = total > 0 ? cashAvailable / total : 0
    const assetPct = total > 0 ? Math.min(1, startInput / total) : 0

    // APY calculation (simplified time-weighted)
    const yearsElapsed = daysElapsed / 365
    const totalReturn = postActionValue + cumulativeDividends - cumulativeExpenses + cashInterest - startInput
    const apy = yearsElapsed > 0 && startInput > 0
      ? totalReturn / startInput / yearsElapsed
      : 0

    result.push({
      date,
      value: entry.value,
      startInput,
      fundSize,
      cashAvailable,
      cumulativeDividends,
      cumulativeExpenses,
      realizedGains,
      cashInterest,
      unrealizedGain,
      capturedProfit,
      cashPct,
      assetPct,
      apy
    })
  }

  return result
}

// Stacked Area Chart Component with hover tooltips
function StackedAreaChart({
  data,
  title,
  series,
  resize
}: {
  data: TimeSeriesPoint[]
  title: string
  series: { key: keyof TimeSeriesPoint; label: string; color: string }[]
  resize?: number
}) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || data.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 25, left: 50 }
    const width = ref.current.clientWidth - margin.left - margin.right
    const height = ref.current.clientHeight - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date) as [Date, Date])
      .range([0, width])

    // Compute stacked values
    const stackedData = data.map(d => {
      let y0 = 0
      return series.map(s => {
        const y1 = y0 + Math.max(0, d[s.key] as number)
        const result = { y0, y1, data: d, value: d[s.key] as number }
        y0 = y1
        return result
      })
    })

    let yMax = d3.max(stackedData, d => d[d.length - 1]?.y1 ?? 0) ?? 0

    // Ensure a minimum range to avoid collapsed scale when all values are zero
    if (yMax === 0) {
      yMax = 1
    }

    const y = d3.scaleLinear()
      .domain([0, yMax])
      .nice()
      .range([height, 0])

    // Draw areas
    series.forEach((s, i) => {
      const area = d3.area<typeof stackedData[0][0]>()
        .x((_, j) => x(data[j]!.date))
        .y0(d => y(d.y0))
        .y1(d => y(d.y1))
        .curve(d3.curveMonotoneX)

      const seriesData = stackedData.map(d => d[i]!)

      g.append('path')
        .datum(seriesData)
        .attr('fill', s.color)
        .attr('d', area)
    })

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d => d3.timeFormat('%b %y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => formatCurrency(d as number)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

    // Hover tooltip elements
    const focus = g.append('g').style('display', 'none')

    focus.append('line')
      .attr('class', 'hover-line')
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')

    const tooltip = focus.append('g').attr('class', 'tooltip-group')

    tooltip.append('rect')
      .attr('class', 'tooltip-bg')
      .attr('fill', '#1e293b')
      .attr('stroke', '#475569')
      .attr('rx', 4)
      .attr('ry', 4)

    tooltip.append('text')
      .attr('class', 'tooltip-date')
      .attr('fill', '#94a3b8')
      .attr('font-size', '9px')
      .attr('text-anchor', 'middle')

    // Add text elements for each series
    series.forEach((s, i) => {
      tooltip.append('text')
        .attr('class', `tooltip-value-${i}`)
        .attr('fill', s.color)
        .attr('font-size', '10px')
        .attr('text-anchor', 'middle')
    })

    const bisect = d3.bisector<TimeSeriesPoint, Date>(d => d.date).left

    g.append('rect')
      .attr('class', 'overlay')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mouseover', () => focus.style('display', null))
      .on('mouseout', () => focus.style('display', 'none'))
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event)
        const x0 = x.invert(mouseX)
        const i = bisect(data, x0, 1)
        const d0 = data[i - 1]
        const d1 = data[i]
        if (!d0) return

        const d = d1 && (x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime()) ? d1 : d0
        const xPos = x(d.date)

        focus.select('.hover-line').attr('x1', xPos).attr('x2', xPos)

        const dateStr = d3.timeFormat('%b %d, %Y')(d.date)
        const tooltipGroup = focus.select('.tooltip-group')
        tooltipGroup.select('.tooltip-date').text(dateStr)

        let maxWidth = 0
        series.forEach((s, idx) => {
          const value = d[s.key] as number
          const text = `${s.label}: ${formatCurrency(value)}`
          const textEl = tooltipGroup.select(`.tooltip-value-${idx}`).text(text)
          const bbox = (textEl.node() as SVGTextElement).getBBox()
          maxWidth = Math.max(maxWidth, bbox.width)
        })

        const tooltipWidth = maxWidth + 16
        const tooltipHeight = 16 + series.length * 14
        const tooltipY = 10

        let tooltipX = xPos
        if (xPos + tooltipWidth / 2 > width) {
          tooltipX = width - tooltipWidth / 2
        } else if (xPos - tooltipWidth / 2 < 0) {
          tooltipX = tooltipWidth / 2
        }

        tooltipGroup.attr('transform', `translate(${tooltipX}, ${tooltipY})`)

        tooltipGroup.select('.tooltip-bg')
          .attr('x', -tooltipWidth / 2)
          .attr('y', 0)
          .attr('width', tooltipWidth)
          .attr('height', tooltipHeight)

        tooltipGroup.select('.tooltip-date')
          .attr('x', 0)
          .attr('y', 11)

        series.forEach((_, idx) => {
          tooltipGroup.select(`.tooltip-value-${idx}`)
            .attr('x', 0)
            .attr('y', 24 + idx * 14)
        })
      })

  }, [data, series, resize])

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex flex-col h-[200px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <div className="flex gap-2">
          {series.map(s => (
            <span key={s.key} className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <svg ref={ref} className="w-full flex-1 min-h-[100px]" style={{ overflow: 'visible' }} />
    </div>
  )
}

// Chart Settings Dropdown Component
function ChartSettings({
  bounds,
  onChange,
  isPercent = false
}: {
  bounds: ChartBounds
  onChange: (bounds: ChartBounds) => void
  isPercent?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  // Convert from decimal to percent for display if isPercent
  const toDisplay = (val: number | undefined) => {
    if (val === undefined) return ''
    return isPercent ? (val * 100).toString() : val.toString()
  }
  const [localMin, setLocalMin] = useState(() => toDisplay(bounds.yMin))
  const [localMax, setLocalMax] = useState(() => toDisplay(bounds.yMax))
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalMin(toDisplay(bounds.yMin))
    setLocalMax(toDisplay(bounds.yMax))
  }, [bounds, isPercent])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleApply = () => {
    const newBounds: ChartBounds = {}
    if (localMin !== '') {
      newBounds.yMin = isPercent ? parseFloat(localMin) / 100 : parseFloat(localMin)
    }
    if (localMax !== '') {
      newBounds.yMax = isPercent ? parseFloat(localMax) / 100 : parseFloat(localMax)
    }
    onChange(newBounds)
    setIsOpen(false)
  }

  const handleClear = () => {
    setLocalMin('')
    setLocalMax('')
    onChange({})
    setIsOpen(false)
  }

  const hasBounds = bounds.yMin !== undefined || bounds.yMax !== undefined

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded hover:bg-slate-700 transition-colors ${hasBounds ? 'text-mint-400' : 'text-slate-500'}`}
        title="Configure Y-axis bounds"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-6 z-50 bg-slate-700 rounded-lg shadow-lg border border-slate-600 p-2 min-w-[160px]">
          <div className="text-[10px] text-slate-400 mb-1.5">Y-Axis Bounds</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-slate-400 w-8">Min:</label>
              <input
                type="number"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                placeholder="Auto"
                className="flex-1 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-600 rounded text-white w-16"
              />
              {isPercent && <span className="text-[10px] text-slate-400">%</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-slate-400 w-8">Max:</label>
              <input
                type="number"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                placeholder="Auto"
                className="flex-1 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-600 rounded text-white w-16"
              />
              {isPercent && <span className="text-[10px] text-slate-400">%</span>}
            </div>
          </div>
          <div className="flex gap-1.5 mt-2">
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 px-2 py-1 text-[10px] bg-slate-600 text-white rounded hover:bg-slate-500"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 px-2 py-1 text-[10px] bg-mint-600 text-white rounded hover:bg-mint-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Line/Area Chart Component with hover tooltips
function AreaChart({
  data,
  title,
  valueKey,
  color = '#10b981',
  formatValue = formatCurrency,
  allowNegative = false,
  bounds = {},
  onBoundsChange,
  isPercent = false,
  resize
}: {
  data: TimeSeriesPoint[]
  title: string
  valueKey: keyof TimeSeriesPoint
  color?: string
  formatValue?: (v: number) => string
  allowNegative?: boolean
  bounds?: ChartBounds
  onBoundsChange?: (bounds: ChartBounds) => void
  isPercent?: boolean
  resize?: number
}) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || data.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 25, left: 50 }
    const width = ref.current.clientWidth - margin.left - margin.right
    const height = ref.current.clientHeight - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const values = data.map(d => ({ date: d.date, value: d[valueKey] as number }))

    const x = d3.scaleTime()
      .domain(d3.extent(values, d => d.date) as [Date, Date])
      .range([0, width])

    const yExtent = d3.extent(values, d => d.value) as [number, number]
    // Use custom bounds if provided, otherwise use data extent
    let yMin = bounds.yMin !== undefined ? bounds.yMin : (allowNegative ? yExtent[0] : Math.min(0, yExtent[0]))
    let yMax = bounds.yMax !== undefined ? bounds.yMax : yExtent[1]

    // Ensure a minimum range to avoid collapsed scale when all values are the same
    if (yMin === yMax) {
      const padding = Math.abs(yMin) * 0.1 || 1
      yMin = yMin - padding
      yMax = yMax + padding
    }

    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .nice()
      .range([height, 0])

    // Clip path to prevent drawing outside bounds
    // Coordinates are relative to the g element (already translated by margins)
    const clipId = `clip-${title.replace(/\s+/g, '-')}-${Date.now()}`
    g.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)

    const baseline = y(Math.max(yMin, Math.min(yMax, 0)))

    const area = d3.area<typeof values[0]>()
      .x(d => x(d.date))
      .y0(baseline)
      .y1(d => y(Math.max(yMin, Math.min(yMax, d.value))))
      .curve(d3.curveMonotoneX)

    const line = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(Math.max(yMin, Math.min(yMax, d.value))))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', `${color}33`)
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', area)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', line)

    // Zero line if needed
    if (allowNegative && yMin < 0 && yMax > 0) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(0))
        .attr('y2', y(0))
        .attr('stroke', '#64748b')
        .attr('stroke-dasharray', '3,3')
    }

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d => d3.timeFormat('%b %y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => formatValue(d as number)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

    // Hover tooltip elements
    const focus = g.append('g').style('display', 'none')

    // Vertical line
    focus.append('line')
      .attr('class', 'hover-line')
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')

    // Circle on the line
    focus.append('circle')
      .attr('class', 'hover-circle')
      .attr('r', 4)
      .attr('fill', color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Tooltip background
    const tooltip = focus.append('g').attr('class', 'tooltip-group')

    tooltip.append('rect')
      .attr('class', 'tooltip-bg')
      .attr('fill', '#1e293b')
      .attr('stroke', '#475569')
      .attr('rx', 4)
      .attr('ry', 4)

    tooltip.append('text')
      .attr('class', 'tooltip-date')
      .attr('fill', '#94a3b8')
      .attr('font-size', '9px')
      .attr('text-anchor', 'middle')

    tooltip.append('text')
      .attr('class', 'tooltip-value')
      .attr('fill', '#fff')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle')

    // Overlay for mouse events
    const bisect = d3.bisector<typeof values[0], Date>(d => d.date).left

    g.append('rect')
      .attr('class', 'overlay')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mouseover', () => focus.style('display', null))
      .on('mouseout', () => focus.style('display', 'none'))
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event)
        const x0 = x.invert(mouseX)
        const i = bisect(values, x0, 1)
        const d0 = values[i - 1]
        const d1 = values[i]
        if (!d0) return

        const d = d1 && (x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime()) ? d1 : d0
        const xPos = x(d.date)
        const yPos = y(Math.max(yMin, Math.min(yMax, d.value)))

        focus.select('.hover-line').attr('x1', xPos).attr('x2', xPos)
        focus.select('.hover-circle').attr('cx', xPos).attr('cy', yPos)

        const dateStr = d3.timeFormat('%b %d, %Y')(d.date)
        const valueStr = formatValue(d.value)

        const tooltipGroup = focus.select('.tooltip-group')
        const dateText = tooltipGroup.select('.tooltip-date').text(dateStr)
        const valueText = tooltipGroup.select('.tooltip-value').text(valueStr)

        // Calculate tooltip dimensions
        const dateBBox = (dateText.node() as SVGTextElement).getBBox()
        const valueBBox = (valueText.node() as SVGTextElement).getBBox()
        const tooltipWidth = Math.max(dateBBox.width, valueBBox.width) + 16
        const tooltipHeight = 32

        // Position tooltip (flip if near edge)
        let tooltipX = xPos
        const tooltipY = yPos - tooltipHeight - 10

        if (xPos + tooltipWidth / 2 > width) {
          tooltipX = width - tooltipWidth / 2
        } else if (xPos - tooltipWidth / 2 < 0) {
          tooltipX = tooltipWidth / 2
        }

        tooltipGroup.attr('transform', `translate(${tooltipX}, ${Math.max(0, tooltipY)})`)

        tooltipGroup.select('.tooltip-bg')
          .attr('x', -tooltipWidth / 2)
          .attr('y', 0)
          .attr('width', tooltipWidth)
          .attr('height', tooltipHeight)

        tooltipGroup.select('.tooltip-date')
          .attr('x', 0)
          .attr('y', 11)

        tooltipGroup.select('.tooltip-value')
          .attr('x', 0)
          .attr('y', 26)
      })

  }, [data, valueKey, color, formatValue, allowNegative, bounds, title, resize])

  return (
    <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex flex-col h-[200px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        {onBoundsChange && (
          <ChartSettings bounds={bounds} onChange={onBoundsChange} isPercent={isPercent} />
        )}
      </div>
      <svg ref={ref} className="w-full flex-1 min-h-[100px]" style={{ overflow: 'visible' }} />
    </div>
  )
}
type ChartKey = 'value'

interface ChartBoundsState {
  value: ChartBounds
}

export function FundCharts({ entries, config, fundId }: FundChartsProps) {
  const timeSeries = useMemo(() => computeTimeSeries(entries, config), [entries, config])
  const [chartResize, setChartResize] = useState(0)

  // Resize handler for charts
  useEffect(() => {
    const handleResize = () => setChartResize(n => n + 1)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Initialize state from config.chart_bounds
  const [chartBounds, setChartBounds] = useState<ChartBoundsState>(() => ({
    value: config.chart_bounds?.value ?? {}
  }))

  // Sync with config when it changes externally
  useEffect(() => {
    setChartBounds({
      value: config.chart_bounds?.value ?? {}
    })
  }, [config.chart_bounds])

  const updateBounds = useCallback((chart: ChartKey) => async (bounds: ChartBounds) => {
    // Update local state immediately
    setChartBounds(prev => ({ ...prev, [chart]: bounds }))

    // Build new chart_bounds object
    const newChartBounds: Record<string, ChartBounds> = {
      ...config.chart_bounds,
      [chart]: bounds
    }

    // Remove empty bounds entries
    for (const key of Object.keys(newChartBounds)) {
      const b = newChartBounds[key]
      if (b && b.yMin === undefined && b.yMax === undefined) {
        delete newChartBounds[key]
      }
    }

    // Save to API - only include chart_bounds if there are values
    const configUpdate: Partial<FundConfig> = {}
    if (Object.keys(newChartBounds).length > 0) {
      configUpdate.chart_bounds = newChartBounds
    }
    await updateFundConfig(fundId, configUpdate)
    // Don't call onConfigUpdate - local state is already correct and we don't want to trigger a full reload
  }, [fundId, config.chart_bounds])

  if (timeSeries.length < 2) {
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {/* Value Over Time */}
      <AreaChart
        data={timeSeries}
        title="Value Over Time"
        valueKey="value"
        color="#f59e0b"
        bounds={chartBounds.value}
        onBoundsChange={updateBounds('value')}
        resize={chartResize}
      />

      {/* Captured Profit */}
      <StackedAreaChart
        data={timeSeries}
        title="Captured Profit"
        series={[
          { key: 'cumulativeDividends', label: 'Dividends', color: '#fbbf24' },
          { key: 'cashInterest', label: 'Cash Int', color: '#86efac' },
          { key: 'realizedGains', label: 'Extracted', color: '#3b82f6' }
        ]}
        resize={chartResize}
      />

      {/* Fund Size Over Time (showing cash vs invested allocation) */}
      <StackedAreaChart
        data={timeSeries}
        title="Fund Size"
        series={[
          { key: 'startInput', label: 'Invested', color: '#8b5cf6' },
          { key: 'cashAvailable', label: 'Cash', color: '#22c55e' }
        ]}
        resize={chartResize}
      />

    </div>
  )
}
