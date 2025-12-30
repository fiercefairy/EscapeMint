import { useRef, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import type { FundSummary } from '../api/funds'

interface FundChartProps {
  funds: FundSummary[]
}

export function FundChart({ funds }: FundChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Prepare data for chart - fund sizes by platform
  const chartData = useMemo(() => {
    const byPlatform = funds.reduce((acc, fund) => {
      const platform = fund.platform
      if (!acc[platform]) {
        acc[platform] = { platform, fundSize: 0, currentValue: 0, count: 0 }
      }
      acc[platform].fundSize += fund.config.fund_size_usd
      acc[platform].currentValue += fund.latestEquity?.value ?? 0
      acc[platform].count++
      return acc
    }, {} as Record<string, { platform: string; fundSize: number; currentValue: number; count: number }>)

    return Object.values(byPlatform)
      .filter(d => d.fundSize > 0)
      .sort((a, b) => b.fundSize - a.fundSize)
  }, [funds])

  useEffect(() => {
    if (!svgRef.current || chartData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 20, right: 30, bottom: 40, left: 100 }
    const width = svgRef.current.clientWidth - margin.left - margin.right
    const height = 300 - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const y = d3.scaleBand()
      .domain(chartData.map(d => d.platform))
      .range([0, height])
      .padding(0.3)

    const x = d3.scaleLinear()
      .domain([0, d3.max(chartData, d => Math.max(d.fundSize, d.currentValue)) ?? 0])
      .nice()
      .range([0, width])

    // Axes
    g.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .style('text-transform', 'capitalize')

    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `$${d3.format('.2s')(d as number)}`))
      .selectAll('text')
      .attr('fill', '#94a3b8')

    // Style axes
    svg.selectAll('.domain').attr('stroke', '#475569')
    svg.selectAll('.tick line').attr('stroke', '#475569')

    // Fund Size bars (background)
    g.selectAll('.bar-fund-size')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('class', 'bar-fund-size')
      .attr('y', d => y(d.platform) ?? 0)
      .attr('x', 0)
      .attr('height', y.bandwidth())
      .attr('width', d => x(d.fundSize))
      .attr('fill', '#334155')
      .attr('rx', 4)

    // Current Value bars (foreground)
    g.selectAll('.bar-current-value')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('class', 'bar-current-value')
      .attr('y', d => y(d.platform) ?? 0)
      .attr('x', 0)
      .attr('height', y.bandwidth())
      .attr('width', d => x(d.currentValue))
      .attr('fill', '#10b981')
      .attr('rx', 4)

    // Value labels
    g.selectAll('.label')
      .data(chartData)
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('y', d => (y(d.platform) ?? 0) + y.bandwidth() / 2)
      .attr('x', d => x(d.fundSize) + 10)
      .attr('dy', '0.35em')
      .attr('fill', '#94a3b8')
      .attr('font-size', '12px')
      .text(d => {
        const pct = d.fundSize > 0 ? ((d.currentValue / d.fundSize - 1) * 100).toFixed(1) : '0'
        return `${pct}%`
      })

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + 10}, ${margin.top - 5})`)

    legend.append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', '#334155')
      .attr('rx', 2)

    legend.append('text')
      .attr('x', 18)
      .attr('y', 10)
      .attr('fill', '#94a3b8')
      .attr('font-size', '12px')
      .text('Fund Size')

    legend.append('rect')
      .attr('x', 100)
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', '#10b981')
      .attr('rx', 2)

    legend.append('text')
      .attr('x', 118)
      .attr('y', 10)
      .attr('fill', '#94a3b8')
      .attr('font-size', '12px')
      .text('Current Value')

  }, [chartData])

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-slate-400">
        No fund data available
      </div>
    )
  }

  return (
    <svg
      ref={svgRef}
      className="w-full h-[300px]"
      style={{ overflow: 'visible' }}
    />
  )
}
