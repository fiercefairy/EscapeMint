import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export function MarketGrowthChart() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 600
    const height = 300
    const margin = { top: 20, right: 60, bottom: 40, left: 50 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Generate sample growth data (10% annual over 20 years)
    const years = 20
    const data: { year: number; value: number }[] = []
    let value = 100
    for (let i = 0; i <= years; i++) {
      data.push({ year: 2005 + i, value })
      value *= 1.10 // 10% growth
    }

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const x = d3.scaleLinear()
      .domain([2005, 2025])
      .range([0, innerWidth])

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value)! * 1.1])
      .range([innerHeight, 0])

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d => String(d)))
      .attr('color', '#64748b')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `$${d}`))
      .attr('color', '#64748b')

    // Line generator
    const line = d3.line<{ year: number; value: number }>()
      .x(d => x(d.year))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX)

    // Draw the line with animation
    const path = g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 3)
      .attr('d', line)

    // Animate the line
    const totalLength = path.node()?.getTotalLength() || 0
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(2000)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)

    // Add end value label
    const lastPoint = data[data.length - 1]
    g.append('text')
      .attr('x', x(lastPoint.year) + 5)
      .attr('y', y(lastPoint.value))
      .attr('fill', '#22c55e')
      .attr('font-size', '12px')
      .attr('opacity', 0)
      .text(`$${Math.round(lastPoint.value)}`)
      .transition()
      .delay(2000)
      .duration(500)
      .attr('opacity', 1)

    // Title
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', -5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '14px')
      .text('$100 invested growing at 10% annually')

  }, [])

  return (
    <div className="w-full flex justify-center">
      <svg ref={svgRef} className="w-full max-w-[600px] h-auto" />
    </div>
  )
}
