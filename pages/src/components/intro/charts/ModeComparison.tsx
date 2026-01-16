import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { loadHistoricalData } from '../../../data/historical-loader'
import type { HistoricalData, DateRange } from '../../../data/types'
import { runBacktest, type ScenarioConfig, type TimeSeriesPoint } from '../../../engine/backtest'

// Chart data point type matching the backtest output
interface ChartPoint {
  date: Date
  value: number
  invested: number
  cash: number
  target: number
  fundSize: number
}

// Transform backtest time series to chart format
function toChartData(timeSeries: TimeSeriesPoint[]): ChartPoint[] {
  return timeSeries.map(point => ({
    date: new Date(point.date),
    value: point.equity,
    invested: point.invested,
    cash: point.cash,
    target: point.expectedTarget,
    fundSize: point.fundSize
  }))
}

// Create configs for TQQQ in each mode
function getHarvestConfig(): ScenarioConfig {
  return {
    id: 'harvest-demo',
    name: 'Harvest Demo',
    spxlPct: 0,
    brgnxPct: 0,
    tqqqPct: 100,
    btcPct: 0,
    initialCash: 10000,
    weeklyDCA: 100,
    targetAPY: 0.52,
    minProfitUSD: 1000,
    accumulate: false,
    inputMin: 100,
    inputMid: 100,
    inputMax: 350,
    maxAtPct: -0.25,
    marginAccessUSD: 0,
    marginAPR: 0.05,
    cashAPY: 0.04
  }
}

function getAccumulateConfig(): ScenarioConfig {
  return {
    id: 'accumulate-demo',
    name: 'Accumulate Demo',
    spxlPct: 0,
    brgnxPct: 0,
    tqqqPct: 100,
    btcPct: 0,
    initialCash: 10000,
    weeklyDCA: 100,
    targetAPY: 0.20,
    minProfitUSD: 1000,
    accumulate: true,
    inputMin: 100,
    inputMid: 100,
    inputMax: 100,
    maxAtPct: -0.25,
    marginAccessUSD: 0,
    marginAPR: 0.05,
    cashAPY: 0.04
  }
}

function ModeChart({ data, title, color }: { data: ChartPoint[]; title: string; color: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length < 2) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth
    const margin = { top: 25, right: 10, bottom: 25, left: 45 }
    const width = containerWidth - margin.left - margin.right
    const height = 180 - margin.top - margin.bottom

    const g = svg
      .attr('viewBox', `0 0 ${containerWidth} 180`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Title
    g.append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', color)
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(title)

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date) as [Date, Date])
      .range([0, width])

    const yMax = d3.max(data, d => Math.max(d.value, d.invested + d.cash, d.target)) ?? 1
    const y = d3.scaleLinear()
      .domain([0, yMax * 1.1])
      .nice()
      .range([height, 0])

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d => d3.timeFormat('%b \'%y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => `$${(Number(d) / 1000).toFixed(0)}K`))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    // Style axis lines
    g.selectAll('.domain').attr('stroke', '#475569')
    g.selectAll('.tick line').attr('stroke', '#475569')

    // Invested area (purple) - from bottom
    const investedArea = d3.area<ChartPoint>()
      .x(d => x(d.date))
      .y0(height)
      .y1(d => y(d.invested))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'rgba(139, 92, 246, 0.4)')
      .attr('d', investedArea)

    // Cash area (green) - stacked on top of invested
    const cashArea = d3.area<ChartPoint>()
      .x(d => x(d.date))
      .y0(d => y(d.invested))
      .y1(d => y(d.invested + d.cash))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'rgba(34, 197, 94, 0.4)')
      .attr('d', cashArea)

    // Target line (cyan dashed)
    const targetLine = d3.line<ChartPoint>()
      .x(d => x(d.date))
      .y(d => y(d.target))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#06b6d4')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3')
      .attr('d', targetLine)

    // Value line (orange)
    const valueLine = d3.line<ChartPoint>()
      .x(d => x(d.date))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2)
      .attr('d', valueLine)

  }, [data, title, color])

  return (
    <div ref={containerRef} className="flex-1 min-w-0">
      <svg ref={svgRef} className="w-full h-[180px]" />
    </div>
  )
}

export function ModeComparison() {
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

  // Run backtests when data is loaded
  const { harvestData, accumulateData } = useMemo(() => {
    if (!historicalData) return { harvestData: [], accumulateData: [] }

    // Calculate date range (overlap of all assets)
    const startDates = Object.values(historicalData).map(d => d.startDate)
    const endDates = Object.values(historicalData).map(d => d.endDate)
    const dateRange: DateRange = {
      start: startDates.sort()[startDates.length - 1],
      end: endDates.sort()[0]
    }

    // Run both backtests
    const harvestResult = runBacktest(getHarvestConfig(), historicalData, dateRange)
    const accumulateResult = runBacktest(getAccumulateConfig(), historicalData, dateRange)

    return {
      harvestData: toChartData(harvestResult.timeSeries),
      accumulateData: toChartData(accumulateResult.timeSeries)
    }
  }, [historicalData])

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center h-[220px]">
        <div className="text-slate-400 text-sm">Loading chart data...</div>
      </div>
    )
  }

  if (harvestData.length === 0 || accumulateData.length === 0) {
    return (
      <div className="w-full flex justify-center items-center h-[220px]">
        <div className="text-slate-400 text-sm">Unable to load historical data</div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex gap-4">
        <ModeChart data={harvestData} title="Harvest Mode (TQQQ)" color="#22c55e" />
        <ModeChart data={accumulateData} title="Accumulate Mode (TQQQ)" color="#3b82f6" />
      </div>
      {/* Legend */}
      <div className="flex justify-center gap-4 mt-2">
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <span className="w-3 h-0.5 bg-amber-500 rounded" />
          Value
        </span>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'rgba(139, 92, 246, 0.6)' }} />
          Invested
        </span>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} />
          Cash
        </span>
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <span className="w-3 h-0.5 bg-cyan-400 rounded" style={{ borderTop: '1px dashed #06b6d4' }} />
          Target
        </span>
      </div>
    </div>
  )
}
