import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { TimeSeriesPoint, AllocationData } from '../api/funds'
import { formatCurrencyCompact, formatPercentSimple } from '../utils/format'

interface PortfolioChartsProps {
  timeSeries: TimeSeriesPoint[]
  allocations: AllocationData[]
  totals: {
    totalCurrentValue: number
    totalCurrentCash: number
    totalCurrentMarginAccess: number
    totalCurrentMarginBorrowed: number
  }
  aggregateTotals?: {
    totalGainUsd: number
    totalRealizedGains: number
    totalValue: number
    totalStartInput: number
  }
}

// Colors for pie charts
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

// Pie Chart Component with side-by-side legend
function PieChart({ data, title, valueKey }: { data: AllocationData[]; title: string; valueKey: 'value' | 'cash' | 'fundSize' }) {
  const ref = useRef<SVGSVGElement>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Sort data by value descending, take top 5 for legend
  const sortedData = [...data]
    .filter(d => d[valueKey] > 0)
    .sort((a, b) => b[valueKey] - a[valueKey])

  const legendData = sortedData.slice(0, 5)
  const total = sortedData.reduce((sum, d) => sum + d[valueKey], 0)
  const maxValue = legendData[0]?.[valueKey] ?? 1

  useEffect(() => {
    if (!ref.current || !chartContainerRef.current || sortedData.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    // Fixed size for pie chart in two-column layout
    const size = 100
    const width = size
    const height = size
    const radius = Math.min(width, height) / 2 - 5

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)

    const pieData = sortedData.map(d => ({ ...d, chartValue: d[valueKey] }))

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
          .html(`<strong>${d.data.ticker}</strong><br/>${formatCurrencyCompact(d.data.chartValue)}<br/>${pct}%`)
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

  }, [sortedData, valueKey, total])

  return (
    <div className="bg-slate-800 rounded-lg p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation snap-start">
      <h3 className="text-[9px] sm:text-[10px] md:text-xs font-medium text-white mb-1 truncate">{title}</h3>
      {/* Two-column layout: pie chart | legend */}
      <div className="flex items-start gap-2">
        {/* Pie chart */}
        <div ref={chartContainerRef} className="flex-shrink-0">
          <svg ref={ref} />
        </div>
        {/* Legend with filled bars */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          {legendData.map((d, i) => {
            const pct = (d[valueKey] / total * 100)
            const barWidth = (d[valueKey] / maxValue * 100)
            const label = `${d.platform}-${d.ticker}`
            return (
              <div key={d.id} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[8px] sm:text-[9px]">
                  <span className="text-slate-300 truncate" title={label}>{label}</span>
                  <span className="text-slate-400 font-mono ml-1 flex-shrink-0">{formatCurrencyCompact(d[valueKey])}</span>
                </div>
                {/* Filled bar indicator */}
                <div className="h-1.5 sm:h-2 bg-slate-700 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: COLORS[i % COLORS.length]
                    }}
                  />
                </div>
                <span className="text-[7px] sm:text-[8px] text-slate-500">{pct.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </div>
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[180px]"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

// Platform Pie Chart Component (shows just platform name in legend)
function PlatformPieChart({ data, title, valueKey }: { data: AllocationData[]; title: string; valueKey: 'value' | 'cash' | 'fundSize' }) {
  const ref = useRef<SVGSVGElement>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Sort data by value descending, take top 5 for legend
  const sortedData = [...data]
    .filter(d => d[valueKey] > 0)
    .sort((a, b) => b[valueKey] - a[valueKey])

  const legendData = sortedData.slice(0, 5)
  const total = sortedData.reduce((sum, d) => sum + d[valueKey], 0)
  const maxValue = legendData[0]?.[valueKey] ?? 1

  useEffect(() => {
    if (!ref.current || !chartContainerRef.current || sortedData.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const size = 100
    const width = size
    const height = size
    const radius = Math.min(width, height) / 2 - 5

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)

    const pieData = sortedData.map(d => ({ ...d, chartValue: d[valueKey] }))

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
          .html(`<strong>${d.data.platform}</strong><br/>${formatCurrencyCompact(d.data.chartValue)}<br/>${pct}%`)
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

  }, [sortedData, valueKey, total])

  return (
    <div className="bg-slate-800 rounded-lg p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation snap-start">
      <h3 className="text-[9px] sm:text-[10px] md:text-xs font-medium text-white mb-1 truncate">{title}</h3>
      <div className="flex items-start gap-2">
        <div ref={chartContainerRef} className="flex-shrink-0">
          <svg ref={ref} />
        </div>
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          {legendData.map((d, i) => {
            const pct = (d[valueKey] / total * 100)
            const barWidth = (d[valueKey] / maxValue * 100)
            return (
              <div key={d.id} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[8px] sm:text-[9px]">
                  <span className="text-slate-300 truncate">{d.platform}</span>
                  <span className="text-slate-400 font-mono ml-1 flex-shrink-0">{formatCurrencyCompact(d[valueKey])}</span>
                </div>
                <div className="h-1.5 sm:h-2 bg-slate-700 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: COLORS[i % COLORS.length]
                    }}
                  />
                </div>
                <span className="text-[7px] sm:text-[8px] text-slate-500">{pct.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </div>
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[180px]"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

// Area Chart Component
function AreaChart({ data, title, valueKey, color = '#10b981', formatValue = formatCurrencyCompact, resize }: {
  data: TimeSeriesPoint[]
  title: string
  valueKey: keyof TimeSeriesPoint
  color?: string
  formatValue?: (v: number) => string
  resize?: number
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

  }, [data, valueKey, color, formatValue, resize])

  return (
    <div className="bg-slate-800 rounded-lg p-1 xs:p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation active:bg-slate-700/30">
      <h3 className="text-[8px] xs:text-[9px] sm:text-[10px] md:text-xs font-medium text-white mb-0.5">{title}</h3>
      <svg ref={ref} className="w-full h-[70px] xs:h-[80px] sm:h-[100px] md:h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1 xs:px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[180px]"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

// Stacked Area Chart for Cash vs Asset
function StackedAreaChart({ data, resize }: { data: TimeSeriesPoint[]; resize?: number }) {
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
          .html(`<strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/>Cash: ${(d.cashPct * 100).toFixed(1)}% (${formatCurrencyCompact(d.cash)})<br/>Asset: ${(d.assetPct * 100).toFixed(1)}% (${formatCurrencyCompact(d.asset)})`)
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

  }, [data, resize])

  return (
    <div className="bg-slate-800 rounded-lg p-1 xs:p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation active:bg-slate-700/30">
      <h3 className="text-[8px] xs:text-[9px] sm:text-[10px] md:text-xs font-medium text-white mb-0.5">Cash vs Asset</h3>
      <svg ref={ref} className="w-full h-[70px] xs:h-[80px] sm:h-[100px] md:h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1 xs:px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[200px]"
        style={{ opacity: 0 }}
      />
      <div className="flex gap-1 xs:gap-1.5 sm:gap-2 mt-0.5 justify-center text-[6px] xs:text-[7px] sm:text-[8px] md:text-[9px]">
        <span className="flex items-center gap-0.5 text-slate-400">
          <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500" />Cash
        </span>
        <span className="flex items-center gap-0.5 text-slate-400">
          <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-violet-500" />Asset
        </span>
      </div>
    </div>
  )
}

// Stacked Area Chart showing individual fund contributions to Total Fund Size
function FundsStackedAreaChart({ data, allocations, resize }: {
  data: TimeSeriesPoint[]
  allocations: AllocationData[]
  resize?: number
}) {
  const ref = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Get fund IDs from allocations (sorted by fundSize descending for consistent stacking)
  const sortedAllocations = [...allocations].sort((a, b) => b.fundSize - a.fundSize)
  const fundIds = sortedAllocations.map(a => a.id)
  const fundLabels = sortedAllocations.reduce((acc, a) => {
    acc[a.id] = `${a.platform}-${a.ticker}`
    return acc
  }, {} as Record<string, string>)

  useEffect(() => {
    if (!ref.current || data.length === 0 || fundIds.length === 0) return

    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 20, left: 45 }
    const width = ref.current.clientWidth - margin.left - margin.right
    const height = 120 - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Transform data for D3 stack
    const stackData = data.map(d => ({
      date: new Date(d.date),
      ...d.fundBreakdown
    }))

    const x = d3.scaleTime()
      .domain(d3.extent(stackData, d => d.date) as [Date, Date])
      .range([0, width])

    // Create stack generator
    const stack = d3.stack<typeof stackData[0]>()
      .keys(fundIds)
      .value((d, key) => (d[key] as number) ?? 0)

    const stackedData = stack(stackData)

    const yMax = d3.max(stackedData, layer => d3.max(layer, d => d[1])) ?? 0

    const y = d3.scaleLinear()
      .domain([0, yMax * 1.05])
      .range([height, 0])

    const area = d3.area<d3.SeriesPoint<typeof stackData[0]>>()
      .x(d => x(d.data.date))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX)

    // Draw stacked areas
    g.selectAll('path.fund-area')
      .data(stackedData)
      .enter()
      .append('path')
      .attr('class', 'fund-area')
      .attr('fill', (_, i) => COLORS[i % COLORS.length] ?? '#666')
      .attr('d', area)

    // Tooltip and mouse tracking
    const tooltip = d3.select(tooltipRef.current)
    const bisect = d3.bisector<typeof stackData[0], Date>(d => d.date).left

    g.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair')
      .on('mouseover', () => tooltip.style('opacity', 1))
      .on('mousemove', function(event) {
        const [mx] = d3.pointer(event)
        const date = x.invert(mx)
        const i = bisect(stackData, date, 1)
        const d0 = stackData[i - 1]
        const d1 = stackData[i]
        if (!d0 || !d1) return
        const d = date.getTime() - d0.date.getTime() > d1.date.getTime() - date.getTime() ? d1 : d0

        // Build tooltip with all fund values
        const total = fundIds.reduce((sum, id) => sum + ((d[id] as number) ?? 0), 0)
        const lines = fundIds
          .map((id, idx) => {
            const val = (d[id] as number) ?? 0
            if (val === 0) return null
            const color = COLORS[idx % COLORS.length]
            return `<span style="color:${color}">${fundLabels[id]}: ${formatCurrencyCompact(val)}</span>`
          })
          .filter(Boolean)
          .join('<br/>')

        tooltip
          .html(`<strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/>${lines}<br/><strong>Total: ${formatCurrencyCompact(total)}</strong>`)
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
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => formatCurrencyCompact(d as number)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

  }, [data, fundIds, fundLabels, resize])

  // Show top 5 funds in legend
  const legendFunds = sortedAllocations.slice(0, 5)

  return (
    <div className="bg-slate-800 rounded-lg p-1 xs:p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation active:bg-slate-700/30">
      <h3 className="text-[8px] xs:text-[9px] sm:text-[10px] md:text-xs font-medium text-white mb-0.5">Total Fund Size</h3>
      <svg ref={ref} className="w-full h-[70px] xs:h-[80px] sm:h-[100px] md:h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1 xs:px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[250px]"
        style={{ opacity: 0 }}
      />
      <div className="flex flex-wrap gap-1 xs:gap-1.5 sm:gap-2 mt-0.5 justify-center text-[6px] xs:text-[7px] sm:text-[8px] md:text-[9px]">
        {legendFunds.map((fund, i) => (
          <span key={fund.id} className="flex items-center gap-0.5 text-slate-400">
            <span
              className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {fund.platform}-{fund.ticker}
          </span>
        ))}
        {allocations.length > 5 && (
          <span className="text-slate-500">+{allocations.length - 5} more</span>
        )}
      </div>
    </div>
  )
}

// Combined Realized + Liquid Gains Chart
function GainsChart({ data, currentRealized, currentLiquid, resize }: {
  data: TimeSeriesPoint[]
  currentRealized: number
  currentLiquid: number
  resize?: number
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
      realized: d.totalRealizedGain,
      liquid: d.totalGainUsd
    }))

    const x = d3.scaleTime()
      .domain(d3.extent(values, d => d.date) as [Date, Date])
      .range([0, width])

    const yMin = Math.min(
      d3.min(values, d => Math.min(d.realized, d.liquid)) ?? 0,
      0
    )
    const yMax = Math.max(
      d3.max(values, d => Math.max(d.realized, d.liquid)) ?? 0,
      0
    )

    const y = d3.scaleLinear()
      .domain([yMin * 1.1, yMax * 1.1])
      .nice()
      .range([height, 0])

    const tooltip = d3.select(tooltipRef.current)

    // Zero line if gains cross zero
    if (yMin < 0 && yMax > 0) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(0))
        .attr('y2', y(0))
        .attr('stroke', '#475569')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
    }

    // Area fill for liquid gain (light blue)
    const liquidArea = d3.area<typeof values[0]>()
      .x(d => x(d.date))
      .y0(y(Math.max(0, yMin)))
      .y1(d => y(d.liquid))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', '#3b82f633')
      .attr('d', liquidArea)

    // Line for realized gain (green)
    const realizedLine = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(d.realized))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('d', realizedLine)

    // Line for liquid gain (blue)
    const liquidLine = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(d.liquid))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', liquidLine)

    // Add current value dots at the end
    const lastDataPoint = values[values.length - 1]
    if (lastDataPoint) {
      // Realized dot
      g.append('circle')
        .attr('cx', x(lastDataPoint.date))
        .attr('cy', y(lastDataPoint.realized))
        .attr('r', 4)
        .attr('fill', '#10b981')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)

      // Liquid dot
      g.append('circle')
        .attr('cx', x(lastDataPoint.date))
        .attr('cy', y(lastDataPoint.liquid))
        .attr('r', 4)
        .attr('fill', '#3b82f6')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
    }

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
          .html(`<strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/><span style="color:#10b981">Realized: ${formatCurrencyCompact(d.realized)}</span><br/><span style="color:#3b82f6">Liquid: ${formatCurrencyCompact(d.liquid)}</span>`)
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
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => formatCurrencyCompact(d as number)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

  }, [data, resize])

  return (
    <div className="bg-slate-800 rounded-lg p-1 xs:p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation active:bg-slate-700/30">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="text-[8px] xs:text-[9px] sm:text-[10px] md:text-xs font-medium text-white">Gain ($)</h3>
        <div className="flex gap-1 xs:gap-1.5 sm:gap-2 text-[6px] xs:text-[7px] sm:text-[8px] md:text-[9px]">
          <span className="flex items-center gap-0.5 text-emerald-400">
            <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500" />
            {formatCurrencyCompact(currentRealized)}
          </span>
          <span className="flex items-center gap-0.5 text-blue-400">
            <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500" />
            {formatCurrencyCompact(currentLiquid)}
          </span>
        </div>
      </div>
      <svg ref={ref} className="w-full h-[70px] xs:h-[80px] sm:h-[100px] md:h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1 xs:px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[200px]"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

// Combined Realized + Liquid APY Chart
function APYChart({ data, currentRealizedAPY, currentLiquidAPY, resize }: {
  data: TimeSeriesPoint[]
  currentRealizedAPY: number
  currentLiquidAPY: number
  resize?: number
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
      realized: d.realizedAPY,
      liquid: d.liquidAPY
    }))

    const x = d3.scaleTime()
      .domain(d3.extent(values, d => d.date) as [Date, Date])
      .range([0, width])

    const yMin = Math.min(
      d3.min(values, d => Math.min(d.realized, d.liquid)) ?? 0,
      0
    )
    const yMax = Math.max(
      d3.max(values, d => Math.max(d.realized, d.liquid)) ?? 0,
      0
    )

    const y = d3.scaleLinear()
      .domain([yMin * 1.1, yMax * 1.1])
      .nice()
      .range([height, 0])

    const tooltip = d3.select(tooltipRef.current)

    // Zero line if APY crosses zero
    if (yMin < 0 && yMax > 0) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(0))
        .attr('y2', y(0))
        .attr('stroke', '#475569')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
    }

    // Area fill for liquid APY (light blue)
    const liquidArea = d3.area<typeof values[0]>()
      .x(d => x(d.date))
      .y0(y(Math.max(0, yMin)))
      .y1(d => y(d.liquid))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', '#3b82f633')
      .attr('d', liquidArea)

    // Line for realized APY (green)
    const realizedLine = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(d.realized))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('d', realizedLine)

    // Line for liquid APY (blue)
    const liquidLine = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(d.liquid))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', liquidLine)

    // Add current value dots at the end
    const lastDataPoint = values[values.length - 1]
    if (lastDataPoint) {
      g.append('circle')
        .attr('cx', x(lastDataPoint.date))
        .attr('cy', y(lastDataPoint.realized))
        .attr('r', 4)
        .attr('fill', '#10b981')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)

      g.append('circle')
        .attr('cx', x(lastDataPoint.date))
        .attr('cy', y(lastDataPoint.liquid))
        .attr('r', 4)
        .attr('fill', '#3b82f6')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
    }

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
          .html(`<strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/><span style="color:#10b981">Realized: ${formatPercentSimple(d.realized)}</span><br/><span style="color:#3b82f6">Liquid: ${formatPercentSimple(d.liquid)}</span>`)
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
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => formatPercentSimple(d as number)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

  }, [data, resize])

  return (
    <div className="bg-slate-800 rounded-lg p-1 xs:p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation active:bg-slate-700/30">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="text-[8px] xs:text-[9px] sm:text-[10px] md:text-xs font-medium text-white">APY</h3>
        <div className="flex gap-1 xs:gap-1.5 sm:gap-2 text-[6px] xs:text-[7px] sm:text-[8px] md:text-[9px]">
          <span className="flex items-center gap-0.5 text-emerald-400">
            <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500" />
            {formatPercentSimple(currentRealizedAPY)}
          </span>
          <span className="flex items-center gap-0.5 text-blue-400">
            <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500" />
            {formatPercentSimple(currentLiquidAPY)}
          </span>
        </div>
      </div>
      <svg ref={ref} className="w-full h-[70px] xs:h-[80px] sm:h-[100px] md:h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1 xs:px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[200px]"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

// Combined Margin Access + Borrowed Chart
function MarginChart({ data, currentAccess, currentBorrowed, resize }: {
  data: TimeSeriesPoint[]
  currentAccess: number
  currentBorrowed: number
  resize?: number
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
      access: d.totalMarginAccess,
      borrowed: d.totalMarginBorrowed
    }))

    const x = d3.scaleTime()
      .domain(d3.extent(values, d => d.date) as [Date, Date])
      .range([0, width])

    const yMax = Math.max(
      d3.max(values, d => d.access) ?? 0,
      d3.max(values, d => d.borrowed) ?? 0
    )

    const y = d3.scaleLinear()
      .domain([0, yMax * 1.1])
      .nice()
      .range([height, 0])

    const tooltip = d3.select(tooltipRef.current)

    // Area fill for margin access (light green)
    const accessArea = d3.area<typeof values[0]>()
      .x(d => x(d.date))
      .y0(height)
      .y1(d => y(d.access))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', '#10b98133')
      .attr('d', accessArea)

    // Area fill for margin borrowed (light red)
    const borrowedArea = d3.area<typeof values[0]>()
      .x(d => x(d.date))
      .y0(height)
      .y1(d => y(d.borrowed))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', '#ef444433')
      .attr('d', borrowedArea)

    // Line for margin access
    const accessLine = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(d.access))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('d', accessLine)

    // Line for margin borrowed
    const borrowedLine = d3.line<typeof values[0]>()
      .x(d => x(d.date))
      .y(d => y(d.borrowed))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('d', borrowedLine)

    // Add current value dots at the end
    const lastPoint = values[values.length - 1]
    if (lastPoint) {
      // Access dot
      g.append('circle')
        .attr('cx', x(lastPoint.date))
        .attr('cy', y(lastPoint.access))
        .attr('r', 4)
        .attr('fill', '#10b981')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)

      // Borrowed dot
      g.append('circle')
        .attr('cx', x(lastPoint.date))
        .attr('cy', y(lastPoint.borrowed))
        .attr('r', 4)
        .attr('fill', '#ef4444')
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5)
    }

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
          .html(`<strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/><span style="color:#10b981">Access: ${formatCurrencyCompact(d.access)}</span><br/><span style="color:#ef4444">Borrowed: ${formatCurrencyCompact(d.borrowed)}</span>`)
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
      .call(d3.axisLeft(y).ticks(3).tickFormat(d => formatCurrencyCompact(d as number)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '8px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

  }, [data, resize])

  return (
    <div className="bg-slate-800 rounded-lg p-1 xs:p-1.5 sm:p-2 border border-slate-700 relative touch-manipulation active:bg-slate-700/30">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="text-[8px] xs:text-[9px] sm:text-[10px] md:text-xs font-medium text-white">Margin</h3>
        <div className="flex gap-1 xs:gap-1.5 sm:gap-2 text-[6px] xs:text-[7px] sm:text-[8px] md:text-[9px]">
          <span className="flex items-center gap-0.5 text-emerald-400">
            <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500" />
            {formatCurrencyCompact(currentAccess)}
          </span>
          <span className="flex items-center gap-0.5 text-red-400">
            <span className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 rounded-full bg-red-500" />
            {currentBorrowed > 0 ? '-' : ''}{formatCurrencyCompact(currentBorrowed)}
          </span>
        </div>
      </div>
      <svg ref={ref} className="w-full h-[70px] xs:h-[80px] sm:h-[100px] md:h-[120px]" style={{ overflow: 'visible' }} />
      <div
        ref={tooltipRef}
        className="fixed bg-slate-900 text-white text-[9px] xs:text-[10px] sm:text-xs px-1 xs:px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shadow-lg pointer-events-none z-50 border border-slate-700 max-w-[200px]"
        style={{ opacity: 0 }}
      />
    </div>
  )
}

export function PortfolioCharts({ timeSeries, allocations, totals, aggregateTotals }: PortfolioChartsProps) {
  const hasMarginAccess = totals.totalCurrentMarginAccess > 0
  const [resize, setResize] = useState(0)

  // Resize handler for charts
  useEffect(() => {
    const handleResize = () => setResize(n => n + 1)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Use aggregate totals for current gain values (consistent with header metrics)
  const currentLiquidGain = aggregateTotals?.totalGainUsd ?? timeSeries[timeSeries.length - 1]?.totalGainUsd ?? 0
  const currentRealizedGains = aggregateTotals?.totalRealizedGains ?? timeSeries[timeSeries.length - 1]?.totalRealizedGain ?? 0

  // Get current APY values from time series
  const lastTimeSeriesPoint = timeSeries[timeSeries.length - 1]
  const currentRealizedAPY = lastTimeSeriesPoint?.realizedAPY ?? 0
  const currentLiquidAPY = lastTimeSeriesPoint?.liquidAPY ?? 0

  // Aggregate allocations by platform for Platform Allocation chart
  const platformAllocations: AllocationData[] = Object.values(
    allocations.reduce((acc, alloc) => {
      const platform = alloc.platform
      if (!acc[platform]) {
        acc[platform] = {
          id: platform,
          ticker: platform,
          platform: platform,
          value: 0,
          cash: 0,
          fundSize: 0,
          marginAccess: 0,
          marginBorrowed: 0
        }
      }
      acc[platform].value += alloc.value
      acc[platform].cash += alloc.cash
      acc[platform].fundSize += alloc.fundSize
      acc[platform].marginAccess += alloc.marginAccess
      acc[platform].marginBorrowed += alloc.marginBorrowed
      return acc
    }, {} as Record<string, AllocationData>)
  )

  return (
    <div className="space-y-1.5 xs:space-y-2 sm:space-y-3">
      {/* Pie Charts Row - Scrollable on mobile with fade indicator */}
      <div className="relative">
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none z-10 sm:hidden" />
        <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 sm:overflow-x-visible pb-1 sm:pb-0 scroll-smooth scrollbar-thin snap-x snap-mandatory">
          <div className="grid grid-cols-3 gap-1 xs:gap-1.5 sm:gap-2 min-w-[400px] sm:min-w-0">
            <PieChart data={allocations} title="Fund Allocation" valueKey="fundSize" />
            <PieChart data={allocations} title="Asset Allocation" valueKey="value" />
            <PlatformPieChart data={platformAllocations} title="Platform Allocation" valueKey="value" />
          </div>
        </div>
      </div>

      {/* Time Series Charts - Row 1: Key metrics */}
      <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 gap-1 xs:gap-1.5 sm:gap-2">
        <APYChart
          data={timeSeries}
          currentRealizedAPY={currentRealizedAPY}
          currentLiquidAPY={currentLiquidAPY}
          resize={resize}
        />
        <GainsChart
          data={timeSeries}
          currentRealized={currentRealizedGains}
          currentLiquid={currentLiquidGain}
          resize={resize}
        />
        <AreaChart
          data={timeSeries}
          title="Total Gain (%)"
          valueKey="totalGainPct"
          color="#8b5cf6"
          formatValue={formatPercentSimple}
          resize={resize}
        />
      </div>

      {/* Time Series Charts - Row 2: Fund totals */}
      <div className="grid grid-cols-2 gap-1 xs:gap-1.5 sm:gap-2">
        <FundsStackedAreaChart
          data={timeSeries}
          allocations={allocations}
          resize={resize}
        />
        <AreaChart
          data={timeSeries}
          title="Fund Liquid Value"
          valueKey="totalValue"
          color="#10b981"
          resize={resize}
        />
      </div>

      {/* Time Series Charts - Row 3: Cash and allocation */}
      <div className={`grid ${hasMarginAccess ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-1 xs:gap-1.5 sm:gap-2`}>
        <AreaChart
          data={timeSeries}
          title="Cash"
          valueKey="totalCash"
          color="#06b6d4"
          resize={resize}
        />
        {hasMarginAccess && (
          <MarginChart
            data={timeSeries}
            currentAccess={totals.totalCurrentMarginAccess}
            currentBorrowed={totals.totalCurrentMarginBorrowed}
            resize={resize}
          />
        )}
        <StackedAreaChart data={timeSeries} resize={resize} />
      </div>
    </div>
  )
}
