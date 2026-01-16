import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { loadHistoricalData } from '../../../data/historical-loader'
import type { HistoricalData } from '../../../data/types'

interface ChartPoint {
  date: Date
  spy: number
  spxl: number
}

export function LeverageComparison() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [historicalData, setHistoricalData] = useState<Record<string, HistoricalData> | null>(null)
  const [loading, setLoading] = useState(true)

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

  // Transform data for chart - normalize both to start at 100
  const chartData = useMemo(() => {
    if (!historicalData?.SPY || !historicalData?.SPXL) return []

    const spyPrices = historicalData.SPY.prices
    const spxlPrices = historicalData.SPXL.prices

    // Find starting values for normalization
    const spyStart = spyPrices[0]?.value || 1
    const spxlStart = spxlPrices[0]?.value || 1

    // Build aligned data points
    const data: ChartPoint[] = []
    const spxlByDate = new Map(spxlPrices.map(p => [p.date, p.value]))

    for (const spyPoint of spyPrices) {
      const spxlValue = spxlByDate.get(spyPoint.date)
      if (spxlValue !== undefined) {
        data.push({
          date: new Date(spyPoint.date),
          spy: (spyPoint.value / spyStart) * 100,
          spxl: (spxlValue / spxlStart) * 100
        })
      }
    }

    return data
  }, [historicalData])

  useEffect(() => {
    if (!svgRef.current || chartData.length < 2) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 600
    const height = 300
    const margin = { top: 30, right: 30, bottom: 40, left: 50 }
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

    const allValues = [...chartData.map(d => d.spy), ...chartData.map(d => d.spxl)]
    const y = d3.scaleLinear()
      .domain([0, d3.max(allValues)! * 1.1])
      .nice()
      .range([innerHeight, 0])

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d3.timeFormat('%b \'%y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '10px')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${Math.round(Number(d))}`))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '10px')

    // Style axis lines
    g.selectAll('.domain').attr('stroke', '#475569')
    g.selectAll('.tick line').attr('stroke', '#475569')

    // Baseline at 100
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', y(100))
      .attr('y2', y(100))
      .attr('stroke', '#475569')
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.5)

    // Line generator
    const spyLine = d3.line<ChartPoint>()
      .x(d => x(d.date))
      .y(d => y(d.spy))
      .curve(d3.curveMonotoneX)

    const spxlLine = d3.line<ChartPoint>()
      .x(d => x(d.date))
      .y(d => y(d.spxl))
      .curve(d3.curveMonotoneX)

    // Draw SPY line - blue
    const spyPath = g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', spyLine)

    // Animate SPY line
    const spyLength = spyPath.node()?.getTotalLength() || 0
    spyPath
      .attr('stroke-dasharray', `${spyLength} ${spyLength}`)
      .attr('stroke-dashoffset', spyLength)
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

    // SPY end label
    g.append('text')
      .attr('x', innerWidth + 5)
      .attr('y', y(lastPoint.spy))
      .attr('fill', '#3b82f6')
      .attr('font-size', '11px')
      .attr('dominant-baseline', 'middle')
      .text(`${lastPoint.spy.toFixed(0)}`)
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
      .text(`${lastPoint.spxl.toFixed(0)}`)
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
      .text('SPY (S&P 500)')

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
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '14px')
      .text('SPY vs SPXL: Normalized to 100 at start')

  }, [chartData])

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center h-[300px]">
        <div className="text-slate-400 text-sm">Loading chart data...</div>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="w-full flex justify-center items-center h-[300px]">
        <div className="text-slate-400 text-sm">Unable to load historical data</div>
      </div>
    )
  }

  return (
    <div className="w-full flex justify-center">
      <svg ref={svgRef} className="w-full max-w-[600px] h-auto" />
    </div>
  )
}
