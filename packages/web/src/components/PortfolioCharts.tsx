import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { TimeSeriesPoint, AllocationData } from '../api/funds'

interface PortfolioChartsProps {
  timeSeries: TimeSeriesPoint[]
  allocations: AllocationData[]
  totals: {
    totalCurrentValue: number
    totalCurrentCash: number
    totalCurrentMarginAccess: number
    totalCurrentMarginBorrowed: number
  }
}

// Colors for pie charts
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

// Pie Chart Component
function PieChart({ data, title, valueKey }: { data: AllocationData[]; title: string; valueKey: 'value' | 'cash' | 'fundSize' }) {
  const ref = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || data.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const width = 160
    const height = 160
    const radius = Math.min(width, height) / 2 - 10

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)

    const pieData = data
      .filter(d => d[valueKey] > 0)
      .map(d => ({ ...d, chartValue: d[valueKey] }))

    const total = d3.sum(pieData, d => d.chartValue)

    const pie = d3.pie<typeof pieData[0]>()
      .value(d => d.chartValue)
      .sort(null)

    const arc = d3.arc<d3.PieArcDatum<typeof pieData[0]>>()
      .innerRadius(0)
      .outerRadius(radius)

    const tooltip = d3.select(tooltipRef.current)

    const arcs = g.selectAll('arc')
      .data(pie(pieData))
      .enter()
      .append('g')

    arcs.append('path')
      .attr('d', arc)
      .attr('fill', (_, i) => COLORS[i % COLORS.length] ?? '#666')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1)
      .attr('cursor', 'pointer')
      .on('mouseover', function(_event, d) {
        const pct = (d.data.chartValue / total * 100).toFixed(1)
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.data.ticker}</strong><br/>${formatCurrency(d.data.chartValue)}<br/>${pct}%`)
        d3.select(this).attr('opacity', 0.8)
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', function() {
        tooltip.style('opacity', 0)
        d3.select(this).attr('opacity', 1)
      })

    // Add labels for larger slices
    arcs.each(function(d) {
      const pct = d.data.chartValue / total
      if (pct > 0.05) {
        const [x, y] = arc.centroid(d)
        d3.select(this)
          .append('text')
          .attr('transform', `translate(${x},${y})`)
          .attr('text-anchor', 'middle')
          .attr('fill', 'white')
          .attr('font-size', '8px')
          .attr('pointer-events', 'none')
          .text(`${d.data.ticker}`)
      }
    })

  }, [data, valueKey])

  return (
    <div className="bg-slate-800 rounded-lg p-2 border border-slate-700 relative">
      <h3 className="text-xs font-medium text-white mb-1">{title}</h3>
      <svg ref={ref} className="mx-auto" />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700"
        style={{ opacity: 0 }}
      />
      <div className="flex flex-wrap gap-1 mt-1 justify-center">
        {data.filter(d => d[valueKey] > 0).slice(0, 5).map((d, i) => (
          <span key={d.id} className="text-[9px] text-slate-400 flex items-center gap-0.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {d.ticker}
          </span>
        ))}
      </div>
    </div>
  )
}

// Area Chart Component
function AreaChart({ data, title, valueKey, color = '#10b981', formatValue = formatCurrency }: {
  data: TimeSeriesPoint[]
  title: string
  valueKey: keyof TimeSeriesPoint
  color?: string
  formatValue?: (v: number) => string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || data.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 20, left: 45 }
    const width = ref.current.clientWidth - margin.left - margin.right
    const height = 120 - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const values = data.map(d => ({
      date: new Date(d.date),
      value: d[valueKey] as number
    }))

    const x = d3.scaleTime()
      .domain(d3.extent(values, d => d.date) as [Date, Date])
      .range([0, width])

    const yExtent = d3.extent(values, d => d.value) as [number, number]
    const yMin = Math.min(0, yExtent[0])
    const yMax = yExtent[1]

    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .nice()
      .range([height, 0])

    const area = d3.area<typeof values[0]>()
      .x(d => x(d.date))
      .y0(y(Math.max(0, yMin)))
      .y1(d => y(d.value))
      .curve(d3.curveMonotoneX)

    const line = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX)

    const tooltip = d3.select(tooltipRef.current)

    g.append('path')
      .datum(values)
      .attr('fill', `${color}33`)
      .attr('d', area)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('d', line)

    // Invisible overlay for mouse tracking
    const bisect = d3.bisector<typeof values[0], Date>(d => d.date).left

    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair')
      .on('mouseover', () => tooltip.style('opacity', 1))
      .on('mousemove', function(event) {
        const [mx] = d3.pointer(event)
        const date = x.invert(mx)
        const i = bisect(values, date, 1)
        const d0 = values[i - 1]
        const d1 = values[i]
        if (!d0 || !d1) return
        const d = date.getTime() - d0.date.getTime() > d1.date.getTime() - date.getTime() ? d1 : d0
        tooltip
          .html(`<strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/>${formatValue(d.value)}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', () => tooltip.style('opacity', 0))

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(3).tickFormat(d => d3.timeFormat('%b %y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => formatValue(d as number)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

  }, [data, valueKey, color, formatValue])

  return (
    <div className="bg-slate-800 rounded-lg p-2 border border-slate-700 relative">
      <h3 className="text-xs font-medium text-white mb-1">{title}</h3>
      <svg ref={ref} className="w-full h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

// Stacked Area Chart for Cash vs Asset
function StackedAreaChart({ data }: { data: TimeSeriesPoint[] }) {
  const ref = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || data.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 20, left: 45 }
    const width = ref.current.clientWidth - margin.left - margin.right
    const height = 120 - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const values = data.map(d => {
      const total = d.totalValue + d.totalCash
      return {
        date: new Date(d.date),
        cashPct: total > 0 ? d.totalCash / total : 0,
        assetPct: total > 0 ? d.totalValue / total : 0,
        cash: d.totalCash,
        asset: d.totalValue
      }
    })

    const x = d3.scaleTime()
      .domain(d3.extent(values, d => d.date) as [Date, Date])
      .range([0, width])

    const y = d3.scaleLinear()
      .domain([0, 1])
      .range([height, 0])

    const stack = d3.stack<typeof values[0]>()
      .keys(['cashPct', 'assetPct'])

    const stackedData = stack(values)

    const area = d3.area<d3.SeriesPoint<typeof values[0]>>()
      .x(d => x(d.data.date))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX)

    const colors = ['#10b981', '#8b5cf6']

    g.selectAll('path.area')
      .data(stackedData)
      .enter()
      .append('path')
      .attr('class', 'area')
      .attr('fill', (_, i) => colors[i] ?? '#666')
      .attr('d', area)

    // Tooltip and mouse tracking
    const tooltip = d3.select(tooltipRef.current)
    const bisect = d3.bisector<typeof values[0], Date>(d => d.date).left

    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair')
      .on('mouseover', () => tooltip.style('opacity', 1))
      .on('mousemove', function(event) {
        const [mx] = d3.pointer(event)
        const date = x.invert(mx)
        const i = bisect(values, date, 1)
        const d0 = values[i - 1]
        const d1 = values[i]
        if (!d0 || !d1) return
        const d = date.getTime() - d0.date.getTime() > d1.date.getTime() - date.getTime() ? d1 : d0
        tooltip
          .html(`<strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/>Cash: ${(d.cashPct * 100).toFixed(1)}% (${formatCurrency(d.cash)})<br/>Asset: ${(d.assetPct * 100).toFixed(1)}% (${formatCurrency(d.asset)})`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', () => tooltip.style('opacity', 0))

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(3).tickFormat(d => d3.timeFormat('%b %y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => `${((d as number) * 100).toFixed(0)}%`))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

  }, [data])

  return (
    <div className="bg-slate-800 rounded-lg p-2 border border-slate-700 relative">
      <h3 className="text-xs font-medium text-white mb-1">Cash vs Asset</h3>
      <svg ref={ref} className="w-full h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700"
        style={{ opacity: 0 }}
      />
      <div className="flex gap-2 mt-1 justify-center text-[9px]">
        <span className="flex items-center gap-0.5 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />Cash
        </span>
        <span className="flex items-center gap-0.5 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-violet-500" />Asset
        </span>
      </div>
    </div>
  )
}

export function PortfolioCharts({ timeSeries, allocations, totals }: PortfolioChartsProps) {
  const hasMarginAccess = totals.totalCurrentMarginAccess > 0

  return (
    <div className="space-y-3">
      {/* Pie Charts Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <PieChart data={allocations} title="Current Fund Allocation" valueKey="fundSize" />
        <PieChart data={allocations} title="Asset Allocation" valueKey="value" />
        <PieChart data={allocations} title="Cash Allocation" valueKey="cash" />
        {hasMarginAccess && (
          <div className="bg-slate-800 rounded-lg p-2 border border-slate-700">
            <h3 className="text-xs font-medium text-white mb-1">Margin Access</h3>
            <div className="text-center py-4">
              <p className="text-lg font-bold text-mint-400">{formatCurrency(totals.totalCurrentMarginAccess)}</p>
              <p className="text-xs text-slate-400">Available</p>
              {totals.totalCurrentMarginBorrowed > 0 && (
                <>
                  <p className="text-sm font-medium text-red-400 mt-2">-{formatCurrency(totals.totalCurrentMarginBorrowed)}</p>
                  <p className="text-xs text-slate-400">Borrowed</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Time Series Charts - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <AreaChart
          data={timeSeries}
          title="All-time Fund APY"
          valueKey="realizedAPY"
          color="#10b981"
          formatValue={formatPercent}
        />
        <AreaChart
          data={timeSeries}
          title="DPI (Liquid)"
          valueKey="dpiLiquid"
          color="#3b82f6"
          formatValue={(v) => v.toFixed(2)}
        />
        <AreaChart
          data={timeSeries}
          title="DPI (Extracted)"
          valueKey="dpiExtracted"
          color="#8b5cf6"
          formatValue={(v) => v.toFixed(2)}
        />
      </div>

      {/* Time Series Charts - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <AreaChart
          data={timeSeries}
          title="Total Fund Size"
          valueKey="totalFundSize"
          color="#f59e0b"
        />
        <AreaChart
          data={timeSeries}
          title="Fund Liquid Value"
          valueKey="totalValue"
          color="#10b981"
        />
      </div>

      {/* Time Series Charts - Row 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <AreaChart
          data={timeSeries}
          title="Cash"
          valueKey="totalCash"
          color="#06b6d4"
        />
        {hasMarginAccess && (
          <AreaChart
            data={timeSeries}
            title="Margin Borrowed"
            valueKey="totalMarginBorrowed"
            color="#ef4444"
          />
        )}
        <StackedAreaChart data={timeSeries} />
      </div>
    </div>
  )
}
