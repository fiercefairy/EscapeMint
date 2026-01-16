import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { loadHistoricalData } from '../../../data/historical-loader'
import type { HistoricalData } from '../../../data/types'

interface ChartPoint {
  date: Date
  brgnx: number
  spxl: number
}

type ViewMode = 'price' | 'dca'

export function LeverageComparison() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [historicalData, setHistoricalData] = useState<Record<string, HistoricalData> | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('price')

  useEffect(() => {
    loadHistoricalData()
      .then(data => {
        setHistoricalData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load historical data:', err)
        setLoading(false)
      })
  }, [])

  // Calculate both price-normalized and DCA data
  const { priceData, dcaData } = useMemo(() => {
    if (!historicalData?.BRGNX || !historicalData?.SPXL) {
      return { priceData: [], dcaData: [] }
    }

    const brgnxPrices = historicalData.BRGNX.prices
    const spxlPrices = historicalData.SPXL.prices

    // Find starting values for normalization
    const brgnxStart = brgnxPrices[0]?.value || 1
    const spxlStart = spxlPrices[0]?.value || 1

    // Build aligned data points
    const priceData: ChartPoint[] = []
    const dcaData: ChartPoint[] = []
    const spxlByDate = new Map(spxlPrices.map(p => [p.date, p.value]))

    // DCA tracking
    let brgnxShares = 0
    let spxlShares = 0
    const weeklyInvestment = 100

    for (const brgnxPoint of brgnxPrices) {
      const spxlValue = spxlByDate.get(brgnxPoint.date)
      if (spxlValue !== undefined) {
        // Price normalized data
        priceData.push({
          date: new Date(brgnxPoint.date),
          brgnx: (brgnxPoint.value / brgnxStart) * 100,
          spxl: (spxlValue / spxlStart) * 100
        })

        // DCA simulation: buy $100 worth each week
        brgnxShares += weeklyInvestment / brgnxPoint.value
        spxlShares += weeklyInvestment / spxlValue

        // Calculate current equity value
        dcaData.push({
          date: new Date(brgnxPoint.date),
          brgnx: brgnxShares * brgnxPoint.value,
          spxl: spxlShares * spxlValue
        })
      }
    }

    return { priceData, dcaData }
  }, [historicalData])

  const chartData = viewMode === 'price' ? priceData : dcaData

  useEffect(() => {
    if (!svgRef.current || chartData.length < 2) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 600
    const height = 300
    const margin = { top: 30, right: 45, bottom: 40, left: 55 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(chartData, d => d.date) as [Date, Date])
      .range([0, innerWidth])

    const allValues = [...chartData.map(d => d.brgnx), ...chartData.map(d => d.spxl)]
    const yMin = viewMode === 'price' ? 0 : d3.min(allValues)! * 0.9
    const y = d3.scaleLinear()
      .domain([yMin, d3.max(allValues)! * 1.1])
      .nice()
      .range([innerHeight, 0])

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d3.timeFormat('%b \'%y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '10px')

    // Y axis - format based on mode
    const yAxisFormat = viewMode === 'dca'
      ? (d: d3.NumberValue) => `$${(Number(d) / 1000).toFixed(0)}K`
      : (d: d3.NumberValue) => `${Math.round(Number(d))}`

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(yAxisFormat))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '10px')

    // Style axis lines
    g.selectAll('.domain').attr('stroke', '#475569')
    g.selectAll('.tick line').attr('stroke', '#475569')

    // Baseline at 100 (only for price mode)
    if (viewMode === 'price') {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', y(100))
        .attr('y2', y(100))
        .attr('stroke', '#475569')
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.5)
    }

    // Line generator
    const brgnxLine = d3.line<ChartPoint>()
      .x(d => x(d.date))
      .y(d => y(d.brgnx))
      .curve(d3.curveMonotoneX)

    const spxlLine = d3.line<ChartPoint>()
      .x(d => x(d.date))
      .y(d => y(d.spxl))
      .curve(d3.curveMonotoneX)

    // Draw BRGNX line - blue (Russell 1000 baseline)
    const brgnxPath = g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', brgnxLine)

    // Animate BRGNX line
    const brgnxLength = brgnxPath.node()?.getTotalLength() || 0
    brgnxPath
      .attr('stroke-dasharray', `${brgnxLength} ${brgnxLength}`)
      .attr('stroke-dashoffset', brgnxLength)
      .transition()
      .duration(2000)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)

    // Draw SPXL line - green (more volatile)
    const spxlPath = g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2)
      .attr('d', spxlLine)

    // Animate SPXL line in parallel
    const spxlPathLength = spxlPath.node()?.getTotalLength() || 0
    spxlPath
      .attr('stroke-dasharray', `${spxlPathLength} ${spxlPathLength}`)
      .attr('stroke-dashoffset', spxlPathLength)
      .transition()
      .duration(2000)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)

    // End values
    const lastPoint = chartData[chartData.length - 1]

    // Format end labels based on mode
    const formatEndLabel = (val: number) =>
      viewMode === 'dca' ? `$${(val / 1000).toFixed(0)}K` : `${val.toFixed(0)}`

    // BRGNX end label
    g.append('text')
      .attr('x', innerWidth + 5)
      .attr('y', y(lastPoint.brgnx))
      .attr('fill', '#3b82f6')
      .attr('font-size', '11px')
      .attr('dominant-baseline', 'middle')
      .text(formatEndLabel(lastPoint.brgnx))
      .attr('opacity', 0)
      .transition()
      .delay(2000)
      .duration(300)
      .attr('opacity', 1)

    // SPXL end label
    g.append('text')
      .attr('x', innerWidth + 5)
      .attr('y', y(lastPoint.spxl))
      .attr('fill', '#22c55e')
      .attr('font-size', '11px')
      .attr('dominant-baseline', 'middle')
      .text(formatEndLabel(lastPoint.spxl))
      .attr('opacity', 0)
      .transition()
      .delay(2000)
      .duration(300)
      .attr('opacity', 1)

    // Legend
    const legend = g.append('g')
      .attr('transform', `translate(10, 10)`)

    legend.append('line')
      .attr('x1', 0).attr('x2', 25)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)

    legend.append('text')
      .attr('x', 30).attr('y', 4)
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px')
      .text('BRGNX (Russell 1000)')

    legend.append('line')
      .attr('x1', 0).attr('x2', 25)
      .attr('y1', 18).attr('y2', 18)
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2)

    legend.append('text')
      .attr('x', 30).attr('y', 22)
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px')
      .text('SPXL (3x leveraged)')

    // Title
    const title = viewMode === 'price'
      ? 'Price: Normalized to 100 at start'
      : 'DCA: $100/week invested'

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '14px')
      .text(title)

  }, [chartData, viewMode])

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center h-[300px]">
        <div className="text-slate-400 text-sm">Loading chart data...</div>
      </div>
    )
  }

  if (priceData.length === 0) {
    return (
      <div className="w-full flex justify-center items-center h-[300px]">
        <div className="text-slate-400 text-sm">Unable to load historical data</div>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
        <button
          onClick={() => setViewMode('price')}
          className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer ${
            viewMode === 'price'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Price
        </button>
        <button
          onClick={() => setViewMode('dca')}
          className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer ${
            viewMode === 'dca'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          $100/wk DCA
        </button>
      </div>

      <svg ref={svgRef} className="w-full max-w-[600px] h-auto" />

      {viewMode === 'dca' && (
        <p className="text-xs text-slate-500 text-center max-w-md">
          Simulates investing $100/week in each fund. Total invested: ${(priceData.length * 100).toLocaleString()}
        </p>
      )}
    </div>
  )
}
