import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export function VolatilityComparison() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 600
    const height = 300
    const margin = { top: 30, right: 30, bottom: 40, left: 50 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Generate straight line data (10% annual)
    const points = 100
    const straightData: { x: number; y: number }[] = []
    const volatileData: { x: number; y: number }[] = []

    for (let i = 0; i <= points; i++) {
      const progress = i / points
      const straightValue = 100 * Math.pow(1.10, progress * 5) // 5 years at 10%

      // Volatile path with same endpoint
      const baseValue = straightValue
      const volatility = Math.sin(progress * Math.PI * 8) * 30 * Math.sin(progress * Math.PI)
      const noise = Math.sin(progress * Math.PI * 15) * 10
      const volatileValue = baseValue + volatility + noise

      straightData.push({ x: i, y: straightValue })
      volatileData.push({ x: i, y: volatileValue })
    }

    // Ensure same endpoint
    volatileData[points].y = straightData[points].y

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const x = d3.scaleLinear()
      .domain([0, points])
      .range([0, innerWidth])

    const allValues = [...straightData.map(d => d.y), ...volatileData.map(d => d.y)]
    const y = d3.scaleLinear()
      .domain([d3.min(allValues)! * 0.9, d3.max(allValues)! * 1.1])
      .range([innerHeight, 0])

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(() => ''))
      .attr('color', '#64748b')

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `$${d}`))
      .attr('color', '#64748b')

    // Line generators
    const line = d3.line<{ x: number; y: number }>()
      .x(d => x(d.x))
      .y(d => y(d.y))
      .curve(d3.curveMonotoneX)

    // Draw straight line (expected growth) - dashed gray
    const straightPath = g.append('path')
      .datum(straightData)
      .attr('fill', 'none')
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('d', line)

    // Animate straight line
    const straightLength = straightPath.node()?.getTotalLength() || 0
    straightPath
      .attr('stroke-dasharray', `${straightLength} ${straightLength}`)
      .attr('stroke-dashoffset', straightLength)
      .transition()
      .duration(1500)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)
      .on('end', function() {
        // Reset to dashed after animation
        d3.select(this).attr('stroke-dasharray', '5,5')
      })

    // Draw volatile line (reality) - solid green
    const volatilePath = g.append('path')
      .datum(volatileData)
      .attr('fill', 'none')
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2.5)
      .attr('d', line)

    // Animate volatile line after straight line
    const volatileLength = volatilePath.node()?.getTotalLength() || 0
    volatilePath
      .attr('stroke-dasharray', `${volatileLength} ${volatileLength}`)
      .attr('stroke-dashoffset', volatileLength)
      .transition()
      .delay(1500)
      .duration(2000)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)

    // Legend
    const legend = g.append('g')
      .attr('transform', `translate(${innerWidth - 150}, 10)`)

    legend.append('line')
      .attr('x1', 0).attr('x2', 30)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', '#64748b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')

    legend.append('text')
      .attr('x', 35).attr('y', 4)
      .attr('fill', '#94a3b8')
      .attr('font-size', '12px')
      .text('Expected (10%)')

    legend.append('line')
      .attr('x1', 0).attr('x2', 30)
      .attr('y1', 20).attr('y2', 20)
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2.5)

    legend.append('text')
      .attr('x', 35).attr('y', 24)
      .attr('fill', '#94a3b8')
      .attr('font-size', '12px')
      .text('Reality')

    // Title
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '14px')
      .text('Same destination, different journey')

  }, [])

  return (
    <div className="w-full flex justify-center">
      <svg ref={svgRef} className="w-full max-w-[600px] h-auto" />
    </div>
  )
}
