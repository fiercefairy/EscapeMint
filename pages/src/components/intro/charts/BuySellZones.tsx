import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export function BuySellZones() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 600
    const height = 320
    const margin = { top: 30, right: 30, bottom: 40, left: 50 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Generate volatile price data with a target line
    const points = 60
    const priceData: { x: number; y: number }[] = []
    const targetData: { x: number; y: number }[] = []

    for (let i = 0; i <= points; i++) {
      const progress = i / points
      // Target grows steadily at 20% annually
      const targetValue = 100 * Math.pow(1.20, progress * 2)

      // Price oscillates around target with volatility
      const wave1 = Math.sin(progress * Math.PI * 4) * 25
      const wave2 = Math.sin(progress * Math.PI * 7) * 15
      const priceValue = targetValue + wave1 + wave2

      priceData.push({ x: i, y: priceValue })
      targetData.push({ x: i, y: targetValue })
    }

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const x = d3.scaleLinear()
      .domain([0, points])
      .range([0, innerWidth])

    const allValues = [...priceData.map(d => d.y), ...targetData.map(d => d.y)]
    const y = d3.scaleLinear()
      .domain([d3.min(allValues)! * 0.85, d3.max(allValues)! * 1.1])
      .range([innerHeight, 0])

    // Create clip path for areas
    const clipId = 'price-clip-' + Math.random().toString(36).substr(2, 9)
    svg.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', 0)
      .attr('height', innerHeight)
      .transition()
      .duration(2500)
      .attr('width', innerWidth)

    // Area generators for buy/sell zones
    const areaAbove = d3.area<{ x: number; y: number }>()
      .x(d => x(d.x))
      .y0((_d, i) => y(targetData[i].y))
      .y1(d => y(Math.max(d.y, targetData[priceData.indexOf(d)]?.y || d.y)))
      .curve(d3.curveMonotoneX)

    const areaBelow = d3.area<{ x: number; y: number }>()
      .x(d => x(d.x))
      .y0((_d, i) => y(targetData[i].y))
      .y1(d => y(Math.min(d.y, targetData[priceData.indexOf(d)]?.y || d.y)))
      .curve(d3.curveMonotoneX)

    // Draw sell zone (above target) - red
    g.append('path')
      .datum(priceData)
      .attr('fill', 'rgba(239, 68, 68, 0.3)')
      .attr('d', areaAbove)
      .attr('clip-path', `url(#${clipId})`)

    // Draw buy zone (below target) - green
    g.append('path')
      .datum(priceData)
      .attr('fill', 'rgba(34, 197, 94, 0.3)')
      .attr('d', areaBelow)
      .attr('clip-path', `url(#${clipId})`)

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

    // Draw target line - dashed orange
    const targetPath = g.append('path')
      .datum(targetData)
      .attr('fill', 'none')
      .attr('stroke', '#f97316')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('d', line)

    // Animate target line
    const targetLength = targetPath.node()?.getTotalLength() || 0
    targetPath
      .attr('stroke-dasharray', `${targetLength} ${targetLength}`)
      .attr('stroke-dashoffset', targetLength)
      .transition()
      .duration(1500)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)
      .on('end', function() {
        d3.select(this).attr('stroke-dasharray', '5,5')
      })

    // Draw price line - solid white
    const pricePath = g.append('path')
      .datum(priceData)
      .attr('fill', 'none')
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2.5)
      .attr('d', line)

    // Animate price line
    const priceLength = pricePath.node()?.getTotalLength() || 0
    pricePath
      .attr('stroke-dasharray', `${priceLength} ${priceLength}`)
      .attr('stroke-dashoffset', priceLength)
      .transition()
      .delay(500)
      .duration(2000)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)

    // Find local minima (for BUY - below target) and maxima (for SELL - above target)
    const badges: { x: number; type: 'buy' | 'sell' }[] = []

    for (let i = 3; i < points - 3; i++) {
      const price = priceData[i].y
      const target = targetData[i].y
      const prevPrice = priceData[i - 1].y
      const nextPrice = priceData[i + 1].y

      // Local minimum below target = BUY opportunity
      if (price < target && price < prevPrice && price < nextPrice) {
        // Check it's a significant dip (not just noise)
        if (target - price > 5) {
          badges.push({ x: i, type: 'buy' })
        }
      }

      // Local maximum above target = SELL opportunity
      if (price > target && price > prevPrice && price > nextPrice) {
        // Check it's a significant peak (not just noise)
        if (price - target > 5) {
          badges.push({ x: i, type: 'sell' })
        }
      }
    }

    // Limit to a reasonable number of badges (every other one if too many)
    const displayBadges = badges.length > 6
      ? badges.filter((_, i) => i % 2 === 0)
      : badges

    displayBadges.forEach((badge, i) => {
      const point = priceData[badge.x]
      const isBuy = badge.type === 'buy'

      const badgeG = g.append('g')
        .attr('transform', `translate(${x(point.x)},${y(point.y) + (isBuy ? 25 : -25)})`)
        .attr('opacity', 0)

      badgeG.append('rect')
        .attr('x', -25)
        .attr('y', -10)
        .attr('width', 50)
        .attr('height', 20)
        .attr('rx', 4)
        .attr('fill', isBuy ? '#22c55e' : '#ef4444')

      badgeG.append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 4)
        .attr('fill', 'white')
        .attr('font-size', '11px')
        .attr('font-weight', 'bold')
        .text(isBuy ? 'BUY' : 'SELL')

      badgeG.transition()
        .delay(1000 + i * 300)
        .duration(300)
        .attr('opacity', 1)
    })

    // Legend
    const legend = g.append('g')
      .attr('transform', `translate(10, 10)`)

    legend.append('rect')
      .attr('width', 15).attr('height', 15)
      .attr('fill', 'rgba(34, 197, 94, 0.5)')

    legend.append('text')
      .attr('x', 20).attr('y', 12)
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px')
      .text('Buy zone (below target)')

    legend.append('rect')
      .attr('y', 20)
      .attr('width', 15).attr('height', 15)
      .attr('fill', 'rgba(239, 68, 68, 0.5)')

    legend.append('text')
      .attr('x', 20).attr('y', 32)
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px')
      .text('Sell zone (above target)')

    // Title
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '14px')
      .text('Buy low, sell high - automatically')

  }, [])

  return (
    <div className="w-full flex justify-center">
      <svg ref={svgRef} className="w-full max-w-[600px] h-auto" />
    </div>
  )
}
