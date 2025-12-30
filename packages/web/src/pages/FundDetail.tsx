import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { toast } from 'sonner'
import * as d3 from 'd3'
import { fetchFund, fetchFundState, updateFundConfig, type FundDetail as FundDetailType, type FundStateResponse, type FundEntry, type ChartBounds } from '../api/funds'

// Chart data point for P&L and APY charts
interface ChartDataPoint {
  date: Date
  pnl: number
  apy: number
}
import { AddEntryModal } from '../components/AddEntryModal'
import { EditEntryModal } from '../components/EditEntryModal'
import { EditFundPanel } from '../components/EditFundPanel'
import { FundCharts } from '../components/FundCharts'

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

// Column definitions with default visibility
// Default order: Date, Equity, Cash first, then the rest
const ALL_COLUMNS = [
  { id: 'date', label: 'Date', defaultVisible: true },
  { id: 'equity', label: 'Equity', defaultVisible: true },
  { id: 'cash', label: 'Cash', defaultVisible: true },
  { id: 'action', label: 'Action', defaultVisible: true },
  { id: 'amount', label: 'Amount', defaultVisible: true },
  { id: 'invested', label: 'Invested', defaultVisible: true },
  { id: 'dividend', label: 'Dividend', defaultVisible: true },
  { id: 'expense', label: 'Expense', defaultVisible: true },
  { id: 'extracted', label: 'Extracted', defaultVisible: true },
  { id: 'cashInt', label: 'Cash Int', defaultVisible: true },
  { id: 'unrealized', label: 'Unrealized', defaultVisible: true },
  { id: 'pnl', label: 'P&L', defaultVisible: true },
  { id: 'apy', label: 'APY', defaultVisible: true },
  { id: 'cumExpense', label: 'Σ Exp', defaultVisible: true },
  { id: 'cumDividends', label: 'Σ Div', defaultVisible: true },
  { id: 'cumExtracted', label: 'Σ Extracted', defaultVisible: true },
  { id: 'cumCashInt', label: 'Σ Int', defaultVisible: true },
  { id: 'marginAvail', label: 'Margin Avail', defaultVisible: false },
  { id: 'fundSize', label: 'Fund Size', defaultVisible: true },
  { id: 'notes', label: 'Notes', defaultVisible: true },
  { id: 'edit', label: 'Edit', defaultVisible: true }
] as const

type ColumnId = typeof ALL_COLUMNS[number]['id']

const getDefaultColumns = (): Set<ColumnId> => {
  return new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id))
}

const getDefaultColumnOrder = (): ColumnId[] => {
  return ALL_COLUMNS.map(c => c.id)
}

export function FundDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const isEditing = location.pathname.endsWith('/edit')

  const [fund, setFund] = useState<FundDetailType | null>(null)
  const [state, setState] = useState<FundStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [editingEntry, setEditingEntry] = useState<{ index: number; entry: FundEntry } | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(getDefaultColumns)
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(getDefaultColumnOrder)
  const [draggedColumn, setDraggedColumn] = useState<ColumnId | null>(null)
  const apyChartRef = useRef<SVGSVGElement>(null)
  const pnlChartRef = useRef<SVGSVGElement>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const [chartResize, setChartResize] = useState(0)
  const [apyBounds, setApyBounds] = useState<ChartBounds>({})
  const [pnlBounds, setPnlBounds] = useState<ChartBounds>({})

  // Resize handler for charts
  useEffect(() => {
    const handleResize = () => setChartResize(n => n + 1)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Sync chart bounds from fund config when fund loads
  useEffect(() => {
    if (!fund) return
    setApyBounds(fund.config.chart_bounds?.apy ?? {})
    setPnlBounds(fund.config.chart_bounds?.pnl ?? {})
  }, [fund?.id])

  // Sync column preferences from fund config when fund loads
  useEffect(() => {
    if (!fund) return

    // Load column order from fund config, or reset to defaults
    if (fund.config.entries_column_order && fund.config.entries_column_order.length > 0) {
      const saved = fund.config.entries_column_order as ColumnId[]
      const defaultOrder = getDefaultColumnOrder()
      const savedSet = new Set(saved)
      const missing = defaultOrder.filter(id => !savedSet.has(id))
      setColumnOrder([...saved, ...missing])
    } else {
      setColumnOrder(getDefaultColumnOrder())
    }

    // Load visible columns from fund config, or reset to defaults
    if (fund.config.entries_visible_columns && fund.config.entries_visible_columns.length > 0) {
      setVisibleColumns(new Set(fund.config.entries_visible_columns as ColumnId[]))
    } else {
      setVisibleColumns(getDefaultColumns())
    }
  }, [fund?.id]) // Only run when fund id changes, not on every fund update

  // Close column menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false)
      }
    }
    if (showColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnMenu])

  // Save column preferences to fund config
  const saveColumnPrefs = useCallback(async (order: ColumnId[], visible: Set<ColumnId>) => {
    if (!id) return
    await updateFundConfig(id, {
      entries_column_order: order,
      entries_visible_columns: [...visible]
    })
  }, [id])

  // Update APY chart bounds
  const updateApyBounds = useCallback(async (bounds: ChartBounds) => {
    setApyBounds(bounds)
    if (!id || !fund) return
    const newChartBounds: Record<string, ChartBounds> = { ...fund.config.chart_bounds, apy: bounds }
    if (bounds.yMin === undefined && bounds.yMax === undefined) {
      delete newChartBounds.apy
    }
    if (Object.keys(newChartBounds).length > 0) {
      await updateFundConfig(id, { chart_bounds: newChartBounds })
    } else {
      await updateFundConfig(id, { chart_bounds: {} })
    }
  }, [id, fund])

  // Update P&L chart bounds
  const updatePnlBounds = useCallback(async (bounds: ChartBounds) => {
    setPnlBounds(bounds)
    if (!id || !fund) return
    const newChartBounds: Record<string, ChartBounds> = { ...fund.config.chart_bounds, pnl: bounds }
    if (bounds.yMin === undefined && bounds.yMax === undefined) {
      delete newChartBounds.pnl
    }
    if (Object.keys(newChartBounds).length > 0) {
      await updateFundConfig(id, { chart_bounds: newChartBounds })
    } else {
      await updateFundConfig(id, { chart_bounds: {} })
    }
  }, [id, fund])

  const toggleColumn = (columnId: ColumnId) => {
    setVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(columnId)) {
        next.delete(columnId)
      } else {
        next.add(columnId)
      }
      // Save to fund config
      saveColumnPrefs(columnOrder, next)
      return next
    })
  }

  const isColumnVisible = (columnId: ColumnId) => visibleColumns.has(columnId)

  // Drag handlers for column reordering
  const handleDragStart = (columnId: ColumnId) => {
    setDraggedColumn(columnId)
  }

  const handleDragOver = (e: React.DragEvent, targetColumnId: ColumnId) => {
    e.preventDefault()
    if (!draggedColumn || draggedColumn === targetColumnId) return

    setColumnOrder(prev => {
      const newOrder = [...prev]
      const draggedIndex = newOrder.indexOf(draggedColumn)
      const targetIndex = newOrder.indexOf(targetColumnId)
      if (draggedIndex === -1 || targetIndex === -1) return prev
      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedColumn)
      return newOrder
    })
  }

  const handleDragEnd = () => {
    setDraggedColumn(null)
    // Save the new order to fund config (use functional update to get latest value)
    setColumnOrder(currentOrder => {
      saveColumnPrefs(currentOrder, visibleColumns)
      return currentOrder
    })
  }

  // Get columns in user-defined order
  const orderedColumns = useMemo(() => {
    return columnOrder.map(id => ALL_COLUMNS.find(c => c.id === id)!).filter(Boolean)
  }, [columnOrder])

  // Get visible columns in user-defined order
  const visibleOrderedColumns = useMemo(() => {
    return orderedColumns.filter(col => visibleColumns.has(col.id))
  }, [orderedColumns, visibleColumns])

  const loadData = useCallback(async () => {
    if (!id) return

    setLoading(true)

    const [fundResult, stateResult] = await Promise.all([
      fetchFund(id),
      fetchFundState(id)
    ])

    if (fundResult.error) {
      toast.error(fundResult.error)
    } else {
      setFund(fundResult.data ?? null)
    }

    if (stateResult.data) {
      setState(stateResult.data)
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Compute chart data (P&L and APY) for both charts
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!fund || fund.entries.length === 0) return []

    const startDate = new Date(fund.config.start_date)
    const sorted = [...fund.entries].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    let totalBuys = 0
    let totalSells = 0
    let cumDividends = 0
    let cumExpenses = 0
    let cumCashInterest = 0
    let costBasis = 0
    let previousCyclesGain = 0

    return sorted.map((entry, index) => {
      const entryDate = new Date(entry.date)

      // Track dividends, expenses, cash interest FIRST
      if (entry.dividend) cumDividends += entry.dividend
      if (entry.expense) cumExpenses += entry.expense
      if (entry.cash_interest) cumCashInterest += entry.cash_interest

      // First entry has no P&L or APY yet
      if (index === 0) {
        if (entry.action === 'BUY' && entry.amount) {
          totalBuys += entry.amount
          costBasis += entry.amount
        }
        return { date: entryDate, pnl: 0, apy: 0 }
      }

      const daysElapsed = Math.max(1, (entryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // Total return = currentValue + priorSells + dividends + interest - expenses - totalBuys + previousCyclesGain
      const totalMoneyOut = entry.value + totalSells + cumDividends + cumCashInterest - cumExpenses + previousCyclesGain
      const totalReturn = totalMoneyOut - totalBuys

      // Simple return = totalReturn / currentValue (if value > 0)
      const returnPct = entry.value > 0 ? totalReturn / entry.value : 0
      // Annualize: APY = (1 + returnPct)^(365/days) - 1
      const clampedReturnPct = Math.max(-0.99, returnPct)
      const apy = daysElapsed > 0 ? Math.pow(1 + clampedReturnPct, 365 / daysElapsed) - 1 : 0

      // NOW process this row's buy/sell action (for next iteration)
      if (entry.action === 'BUY' && entry.amount) {
        totalBuys += entry.amount
        costBasis += entry.amount
      } else if (entry.action === 'SELL' && entry.amount) {
        totalSells += entry.amount
        // Check for full liquidation
        const isFullLiquidation = entry.value === 0 || entry.value <= entry.amount
        if (isFullLiquidation) {
          const extracted = entry.amount - costBasis
          previousCyclesGain += extracted
          costBasis = 0
          totalBuys = 0
          totalSells = 0
        } else {
          // Partial sell - reduce cost basis proportionally
          const sellProportion = entry.amount / (entry.value + entry.amount)
          costBasis -= costBasis * sellProportion
        }
      }

      return { date: entryDate, pnl: totalReturn, apy: isFinite(apy) ? apy : 0 }
    })
  }, [fund])

  // Draw Fund APY chart
  useEffect(() => {
    if (!apyChartRef.current || chartData.length === 0) return

    const svg = d3.select(apyChartRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 25, left: 50 }
    const width = apyChartRef.current.clientWidth - margin.left - margin.right
    const height = apyChartRef.current.clientHeight - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const data = chartData.filter(d => isFinite(d.apy))

    if (data.length === 0) return

    // Use state bounds if available, otherwise auto-scale with reasonable limits
    const yExtent = d3.extent(data, d => d.apy) as [number, number]
    let yMin = apyBounds.yMin ?? Math.max(-2, yExtent[0])
    let yMax = apyBounds.yMax ?? Math.min(2, yExtent[1])

    // Ensure a minimum range to avoid collapsed scale when all values are the same
    if (yMin === yMax) {
      const padding = Math.abs(yMin) * 0.1 || 0.1
      yMin = yMin - padding
      yMax = yMax + padding
    }

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date) as [Date, Date])
      .range([0, width])

    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .nice()
      .range([height, 0])

    const zeroY = y(Math.max(yMin, Math.min(yMax, 0)))

    // Clip paths for positive and negative regions
    const clipIdPos = `apy-clip-pos-${Date.now()}`
    const clipIdNeg = `apy-clip-neg-${Date.now()}`

    const defs = g.append('defs')

    // Positive clip (above zero line)
    defs.append('clipPath')
      .attr('id', clipIdPos)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', zeroY)

    // Negative clip (below zero line)
    defs.append('clipPath')
      .attr('id', clipIdNeg)
      .append('rect')
      .attr('x', 0)
      .attr('y', zeroY)
      .attr('width', width)
      .attr('height', height - zeroY)

    // Positive area (green) - from 0 up to positive values
    const positiveArea = d3.area<{ date: Date; apy: number }>()
      .x(d => x(d.date))
      .y0(zeroY)
      .y1(d => y(Math.max(0, Math.min(yMax, d.apy))))
      .curve(d3.curveMonotoneX)

    // Negative area (red) - from 0 down to negative values
    const negativeArea = d3.area<{ date: Date; apy: number }>()
      .x(d => x(d.date))
      .y0(zeroY)
      .y1(d => y(Math.min(0, Math.max(yMin, d.apy))))
      .curve(d3.curveMonotoneX)

    // Line
    const line = d3.line<{ date: Date; apy: number }>()
      .x(d => x(d.date))
      .y(d => y(Math.max(yMin, Math.min(yMax, d.apy))))
      .curve(d3.curveMonotoneX)

    // Draw positive area (green)
    g.append('path')
      .datum(data)
      .attr('fill', 'rgba(16, 185, 129, 0.2)')
      .attr('clip-path', `url(#${clipIdPos})`)
      .attr('d', positiveArea)

    // Draw negative area (red)
    g.append('path')
      .datum(data)
      .attr('fill', 'rgba(239, 68, 68, 0.2)')
      .attr('clip-path', `url(#${clipIdNeg})`)
      .attr('d', negativeArea)

    // Positive line (green) - clipped to positive region
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1.5)
      .attr('clip-path', `url(#${clipIdPos})`)
      .attr('d', line)

    // Negative line (red) - clipped to negative region
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#a72e2eff')
      .attr('stroke-width', 1.5)
      .attr('clip-path', `url(#${clipIdNeg})`)
      .attr('d', line)

    // Zero line
    if (yMin < 0 && yMax > 0) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(0))
        .attr('y2', y(0))
        .attr('stroke', '#64748b')
        .attr('stroke-dasharray', '3,3')
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d => d3.timeFormat('%b %y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${((d as number) * 100).toFixed(0)}%`))
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

    focus.append('circle')
      .attr('class', 'hover-circle')
      .attr('r', 4)
      .attr('fill', '#10b981')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

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

    const bisect = d3.bisector<{ date: Date; apy: number }, Date>(d => d.date).left

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
        const yPos = y(Math.max(yMin, Math.min(yMax, d.apy)))

        focus.select('.hover-line').attr('x1', xPos).attr('x2', xPos)
        focus.select('.hover-circle').attr('cx', xPos).attr('cy', yPos)

        const dateStr = d3.timeFormat('%b %d, %Y')(d.date)
        const pct = d.apy * 100
        const valueStr = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'

        const tooltipGroup = focus.select('.tooltip-group')
        const dateText = tooltipGroup.select('.tooltip-date').text(dateStr)
        const valueText = tooltipGroup.select('.tooltip-value').text(valueStr)

        const dateBBox = (dateText.node() as SVGTextElement).getBBox()
        const valueBBox = (valueText.node() as SVGTextElement).getBBox()
        const tooltipWidth = Math.max(dateBBox.width, valueBBox.width) + 16
        const tooltipHeight = 32

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

  }, [chartData, apyBounds, chartResize])

  // Draw P&L chart
  useEffect(() => {
    if (!pnlChartRef.current || chartData.length === 0) return

    const svg = d3.select(pnlChartRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 25, left: 50 }
    const width = pnlChartRef.current.clientWidth - margin.left - margin.right
    const height = pnlChartRef.current.clientHeight - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const data = chartData

    if (data.length === 0) return

    // Use state bounds if available, otherwise auto-scale
    const yExtent = d3.extent(data, d => d.pnl) as [number, number]
    let yMin = pnlBounds.yMin ?? yExtent[0]
    let yMax = pnlBounds.yMax ?? yExtent[1]

    // Ensure a minimum range
    if (yMin === yMax) {
      const padding = Math.abs(yMin) * 0.1 || 100
      yMin = yMin - padding
      yMax = yMax + padding
    }

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date) as [Date, Date])
      .range([0, width])

    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .nice()
      .range([height, 0])

    const zeroY = y(Math.max(yMin, Math.min(yMax, 0)))

    // Clip paths for positive and negative regions
    const clipIdPos = `pnl-clip-pos-${Date.now()}`
    const clipIdNeg = `pnl-clip-neg-${Date.now()}`

    const defs = g.append('defs')

    // Positive clip (above zero line)
    defs.append('clipPath')
      .attr('id', clipIdPos)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', zeroY)

    // Negative clip (below zero line)
    defs.append('clipPath')
      .attr('id', clipIdNeg)
      .append('rect')
      .attr('x', 0)
      .attr('y', zeroY)
      .attr('width', width)
      .attr('height', height - zeroY)

    // Positive area (green) - from 0 up to positive values
    const positiveArea = d3.area<ChartDataPoint>()
      .x(d => x(d.date))
      .y0(zeroY)
      .y1(d => y(Math.max(0, Math.min(yMax, d.pnl))))
      .curve(d3.curveMonotoneX)

    // Negative area (red) - from 0 down to negative values
    const negativeArea = d3.area<ChartDataPoint>()
      .x(d => x(d.date))
      .y0(zeroY)
      .y1(d => y(Math.min(0, Math.max(yMin, d.pnl))))
      .curve(d3.curveMonotoneX)

    // Line
    const line = d3.line<ChartDataPoint>()
      .x(d => x(d.date))
      .y(d => y(Math.max(yMin, Math.min(yMax, d.pnl))))
      .curve(d3.curveMonotoneX)

    // Draw positive area (green)
    g.append('path')
      .datum(data)
      .attr('fill', 'rgba(16, 185, 129, 0.2)')
      .attr('clip-path', `url(#${clipIdPos})`)
      .attr('d', positiveArea)

    // Draw negative area (red)
    g.append('path')
      .datum(data)
      .attr('fill', 'rgba(239, 68, 68, 0.2)')
      .attr('clip-path', `url(#${clipIdNeg})`)
      .attr('d', negativeArea)

    // Positive line (green) - clipped to positive region
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1.5)
      .attr('clip-path', `url(#${clipIdPos})`)
      .attr('d', line)

    // Negative line (red) - clipped to negative region
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 1.5)
      .attr('clip-path', `url(#${clipIdNeg})`)
      .attr('d', line)

    // Zero line
    if (yMin < 0 && yMax > 0) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(0))
        .attr('y2', y(0))
        .attr('stroke', '#64748b')
        .attr('stroke-dasharray', '3,3')
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d => d3.timeFormat('%b %y')(d as Date)))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => {
        const val = d as number
        if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(0)}K`
        return `$${val.toFixed(0)}`
      }))
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '9px')

    svg.selectAll('.domain').attr('stroke', '#334155')
    svg.selectAll('.tick line').attr('stroke', '#334155')

    // Hover tooltip
    const focus = g.append('g').style('display', 'none')

    focus.append('line')
      .attr('class', 'hover-line')
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')

    focus.append('circle')
      .attr('class', 'hover-circle')
      .attr('r', 4)
      .attr('fill', '#10b981')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

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

    const bisect = d3.bisector<ChartDataPoint, Date>(d => d.date).left

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
        const yPos = y(Math.max(yMin, Math.min(yMax, d.pnl)))

        // Update circle color based on value
        const pointColor = d.pnl >= 0 ? '#10b981' : '#7a2323ff'
        focus.select('.hover-circle').attr('fill', pointColor)

        focus.select('.hover-line').attr('x1', xPos).attr('x2', xPos)
        focus.select('.hover-circle').attr('cx', xPos).attr('cy', yPos)

        const dateStr = d3.timeFormat('%b %d, %Y')(d.date)
        const valueStr = (d.pnl >= 0 ? '+' : '') + new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(d.pnl)

        const tooltipGroup = focus.select('.tooltip-group')
        const dateText = tooltipGroup.select('.tooltip-date').text(dateStr)
        const valueText = tooltipGroup.select('.tooltip-value').text(valueStr)

        const dateBBox = (dateText.node() as SVGTextElement).getBBox()
        const valueBBox = (valueText.node() as SVGTextElement).getBBox()
        const tooltipWidth = Math.max(dateBBox.width, valueBBox.width) + 16
        const tooltipHeight = 32

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

  }, [chartData, pnlBounds, chartResize])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatPercent = (value: number) => {
    const pct = value * 100
    return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
  }

  // Compute running totals and metrics for each entry
  const computedEntries = useMemo(() => {
    if (!fund) return []

    const startDate = new Date(fund.config.start_date)
    const sorted = [...fund.entries].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    let totalBuys = 0
    let totalSells = 0
    let cumDividends = 0
    let cumExpenses = 0
    let cumCashInterest = 0
    let cumDeposits = 0
    let cumWithdrawals = 0
    let lastNonZeroValue = 0
    let lastApy = 0
    let costBasis = 0
    let cumExtracted = 0
    let previousCyclesGain = 0 // Realized gains from previous liquidation cycles

    return sorted.map((entry, index) => {
      const entryDate = new Date(entry.date)

      // Track DEPOSIT/WITHDRAW for fund_size calculation
      if (entry.action === 'DEPOSIT' && entry.amount) {
        cumDeposits += entry.amount
      } else if (entry.action === 'WITHDRAW' && entry.amount) {
        cumWithdrawals += entry.amount
      }

      // Track dividends, expenses, cash interest FIRST (they affect this row's APY and fund_size)
      if (entry.dividend) cumDividends += entry.dividend
      if (entry.expense) cumExpenses += entry.expense
      if (entry.cash_interest) cumCashInterest += entry.cash_interest

      // Calculate fund_size: use manual override if set, otherwise calculate dynamically
      const calculatedFundSize = fund.config.fund_size_usd
        + cumDeposits - cumWithdrawals
        + cumDividends + cumCashInterest - cumExpenses
      const fundSize = entry.fund_size ?? calculatedFundSize

      // Calculate APY BEFORE processing this row's buy/sell action
      // Total return = currentValue + priorSells + dividends + interest - expenses - totalBuys + previousCyclesGain
      const totalMoneyOut = entry.value + totalSells + cumDividends + cumCashInterest - cumExpenses + previousCyclesGain
      const totalReturn = totalMoneyOut - totalBuys

      const daysElapsed = Math.max(1, (entryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      const isFirstEntry = index === 0

      // For APY calculation, use current value if > 0, otherwise use last non-zero value
      const denominatorValue = entry.value > 0 ? entry.value : lastNonZeroValue
      const returnPct = denominatorValue > 0 ? totalReturn / denominatorValue : 0
      // Annualize: APY = (1 + returnPct)^(365/days) - 1
      // Clamp returnPct to avoid NaN from Math.pow with negative base
      const clampedReturnPct = Math.max(-0.99, returnPct)
      let apy = isFirstEntry ? 0 : (daysElapsed > 0 ? Math.pow(1 + clampedReturnPct, 365 / daysElapsed) - 1 : 0)

      // If value is 0 (closed fund), preserve the last valid APY
      if (entry.value === 0 && lastApy !== 0) {
        apy = lastApy
      }

      // Track last non-zero value and APY for closed fund handling
      if (entry.value > 0) {
        lastNonZeroValue = entry.value
        lastApy = apy
      }

      // Calculate cash BEFORE the action (what was available before BUY/SELL)
      const netInvestedBefore = totalBuys - totalSells
      const cash = fundSize === 0 ? 0 : Math.max(0, fundSize - netInvestedBefore)

      // NOW process this row's buy/sell action (for next iteration and display)
      let extracted = 0
      if (entry.action === 'BUY' && entry.amount) {
        totalBuys += entry.amount
        costBasis += entry.amount
      } else if (entry.action === 'SELL' && entry.amount) {
        totalSells += entry.amount
        // Calculate extracted profit from this sell
        // If selling to 0 (liquidation), extracted = sell_amount - remaining_cost_basis
        // Otherwise, extracted = sell_amount - proportional_cost_basis
        if (entry.value === 0 || entry.value <= entry.amount) {
          // Full liquidation - extract remaining profit
          extracted = entry.amount - costBasis
          // Capture the realized gain from this cycle before resetting
          previousCyclesGain += extracted
          costBasis = 0
          // Reset running totals for next investment cycle
          totalBuys = 0
          totalSells = 0
        } else {
          // Partial sell - proportional cost basis
          const sellProportion = entry.amount / (entry.value + entry.amount)
          const costBasisReturned = costBasis * sellProportion
          extracted = entry.amount - costBasisReturned
          costBasis -= costBasisReturned
        }
        cumExtracted += extracted
      }

      // Net invested = buys - sells (what's still "in" the fund from cash perspective)
      // If fund is closed or we just sold everything, we have nothing invested
      const isFullLiquidation = entry.action === 'SELL' && entry.amount && entry.amount >= entry.value
      const netInvested = (fundSize === 0 || isFullLiquidation) ? 0 : totalBuys - totalSells

      // Post-action equity value (entry.value is pre-action)
      let postActionValue = entry.value
      if (entry.action === 'BUY' && entry.amount) {
        postActionValue = entry.value + entry.amount
      } else if (entry.action === 'SELL' && entry.amount) {
        postActionValue = Math.max(0, entry.value - entry.amount)
      }

      // Unrealized gain = post-action asset value - cost basis
      const unrealized = postActionValue - costBasis

      // Total gain = total return (realized + unrealized + dividends + interest - expenses)
      const gainUsd = isFirstEntry ? 0 : totalReturn
      const gainPct = isFirstEntry ? 0 : (totalBuys > 0 ? totalReturn / totalBuys : 0)

      return {
        ...entry,
        originalIndex: index,
        fundSize,
        totalInvested: netInvested,
        cash,
        cumDividends,
        cumExpenses,
        cumCashInterest,
        extracted,
        cumExtracted,
        unrealized,
        gainUsd,
        gainPct,
        apy
      }
    })
  }, [fund])

  const sortedEntries = useMemo(() => {
    if (computedEntries.length === 0) return []
    const entries = [...computedEntries]
    entries.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
    })
    return entries
  }, [computedEntries, sortOrder])

  const toggleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-mint-400"></div>
      </div>
    )
  }

  if (!fund) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400 mb-3 text-sm">Fund not found</p>
        <Link to="/" className="text-mint-400 hover:underline text-sm">Back to Dashboard</Link>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {/* Header with Config Tags */}
        <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Title Row */}
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white">
                  <span className="capitalize">{fund.platform}</span> - <span className="uppercase">{fund.ticker}</span>
                </h1>
                {/* Mode Tag */}
                <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                  fund.config.accumulate
                    ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                    : 'bg-orange-900/50 text-orange-300 border border-orange-700'
                }`}>
                  {fund.config.accumulate ? 'Accumulate' : 'Liquidate'}
                </span>
                {/* Closed Tag */}
                {fund.config.fund_size_usd === 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-700 text-slate-400 rounded">Closed</span>
                )}
                {/* Recommendation Badge */}
                {state?.recommendation && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    state.recommendation.action === 'BUY'
                      ? 'bg-green-900/50 text-green-300 border border-green-700'
                      : 'bg-orange-900/50 text-orange-300 border border-orange-700'
                  }`}>
                    {state.recommendation.action} {formatCurrency(state.recommendation.amount)}
                  </span>
                )}
              </div>
              {/* Config Details Row */}
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                <span title="Fund Size">
                  <span className="text-slate-500">Size:</span> <span className="text-white">{formatCurrency(fund.config.fund_size_usd)}</span>
                </span>
                <span className="text-slate-600">|</span>
                <span title="Target APY">
                  <span className="text-slate-500">APY:</span> <span className="text-mint-400">{(fund.config.target_apy * 100).toFixed(0)}%</span>
                </span>
                <span className="text-slate-600">|</span>
                <span title="Check Interval">
                  <span className="text-slate-500">Every:</span> <span className="text-white">{fund.config.interval_days}d</span>
                </span>
                <span className="text-slate-600">|</span>
                <span title="DCA Amounts (Min/Mid/Max)">
                  <span className="text-slate-500">DCA:</span> <span className="text-white">${fund.config.input_min_usd}/${fund.config.input_mid_usd}/${fund.config.input_max_usd}</span>
                </span>
                <span className="text-slate-600">|</span>
                <span title="Max At / Min Profit">
                  <span className="text-slate-500">Max@:</span> <span className="text-white">{(fund.config.max_at_pct * 100).toFixed(0)}%</span>
                  <span className="text-slate-500 ml-1">Profit:</span> <span className="text-white">${fund.config.min_profit_usd}</span>
                </span>
              </div>
            </div>
            {/* Edit Button */}
            <Link
              to={`/fund/${fund.id}/edit`}
              className="flex-shrink-0 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
              title="Edit Fund"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Current State + P&L + APY Charts Row (3 columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Current State */}
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <h2 className="text-sm font-semibold text-white mb-2">Current State</h2>
            {fund.config.fund_size_usd === 0 && state?.closedMetrics ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[10px] text-slate-400">Total Invested</p>
                  <p className="font-medium text-white">{formatCurrency(state.closedMetrics.total_invested_usd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Total Returned</p>
                  <p className="font-medium text-white">{formatCurrency(state.closedMetrics.total_returned_usd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Net Gain/Loss</p>
                  <p className={`font-medium ${state.closedMetrics.net_gain_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(state.closedMetrics.net_gain_usd)} ({formatPercent(state.closedMetrics.return_pct)})
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Annualized Return</p>
                  <p className={`font-medium ${state.closedMetrics.apy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPercent(state.closedMetrics.apy)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Dividends</p>
                  <p className="font-medium text-mint-400">{formatCurrency(state.closedMetrics.total_dividends_usd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Cash Interest</p>
                  <p className="font-medium text-mint-400">{formatCurrency(state.closedMetrics.total_cash_interest_usd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Duration</p>
                  <p className="font-medium text-white">{state.closedMetrics.duration_days} days</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Expenses</p>
                  <p className="font-medium text-red-400">{formatCurrency(state.closedMetrics.total_expenses_usd)}</p>
                </div>
              </div>
            ) : fund.config.fund_size_usd === 0 ? (
              <p className="text-slate-400 text-sm">This fund is closed. Historical data preserved below.</p>
            ) : state?.state ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[10px] text-slate-400">Start Input</p>
                  <p className="font-medium text-white">{formatCurrency(state.state.start_input_usd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Actual Value</p>
                  <p className="font-medium text-mint-400">{formatCurrency(state.state.actual_value_usd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Expected Target</p>
                  <p className="font-medium text-white">{formatCurrency(state.state.expected_target_usd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Target Diff</p>
                  <p className={`font-medium ${state.state.target_diff_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(state.state.target_diff_usd)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Gain</p>
                  <p className={`font-medium ${state.state.gain_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(state.state.gain_usd)} ({formatPercent(state.state.gain_pct)})
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Cash Available</p>
                  <p className="font-medium text-white">{formatCurrency(state.state.cash_available_usd)}</p>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No state data available</p>
            )}
          </div>

          {/* P&L Chart */}
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">P&L</h2>
              <ChartSettings bounds={pnlBounds} onChange={updatePnlBounds} />
            </div>
            <svg
              ref={pnlChartRef}
              className="w-full flex-1 min-h-[100px]"
              style={{ overflow: 'visible' }}
            />
          </div>

          {/* Fund APY Chart */}
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">APY</h2>
              <ChartSettings bounds={apyBounds} onChange={updateApyBounds} isPercent />
            </div>
            <svg
              ref={apyChartRef}
              className="w-full flex-1 min-h-[100px]"
              style={{ overflow: 'visible' }}
            />
          </div>
        </div>

        {/* Fund Analysis Charts (3-column grid) */}
        <FundCharts entries={fund.entries} config={fund.config} fundId={fund.id} />

        {/* Entries Table */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-x-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
            <h2 className="text-base font-semibold text-white">
              Entries ({fund.entries.length})
            </h2>
            <div className="flex items-center gap-2">
              {/* Column Configuration */}
              <div className="relative" ref={columnMenuRef}>
                <button
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  title="Configure columns"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </button>
                {showColumnMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-20 py-1 min-w-[200px]">
                    <div className="px-3 py-1.5 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-600">
                      Columns (drag to reorder)
                    </div>
                    {orderedColumns.map(col => (
                      <div
                        key={col.id}
                        draggable
                        onDragStart={() => handleDragStart(col.id)}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-2 px-2 py-1.5 hover:bg-slate-600 cursor-grab text-xs ${
                          draggedColumn === col.id ? 'opacity-50 bg-slate-600' : ''
                        }`}
                      >
                        <svg className="w-3 h-3 text-slate-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
                        </svg>
                        <label className="flex items-center gap-2 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isColumnVisible(col.id)}
                            onChange={() => toggleColumn(col.id)}
                            className="rounded border-slate-500 bg-slate-800 text-mint-500 focus:ring-mint-500"
                          />
                          <span className="text-slate-200">{col.label}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAddEntry(true)}
                className="px-2 py-1 text-xs bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors font-medium"
              >
                + Take Action
              </button>
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs">
                {visibleOrderedColumns.map((col, idx) => {
                  const isFirst = idx === 0
                  if (col.id === 'date') {
                    return (
                      <th
                        key={col.id}
                        draggable
                        onDragStart={() => handleDragStart(col.id)}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDragEnd={handleDragEnd}
                        className={`px-2 py-2 cursor-grab ${isFirst ? 'sticky left-0 bg-slate-800 z-10' : ''} ${draggedColumn === col.id ? 'opacity-50' : ''}`}
                      >
                        <button
                          onClick={toggleSort}
                          className="flex items-center gap-1 hover:text-white transition-colors"
                        >
                          Date
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {sortOrder === 'desc' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            )}
                          </svg>
                        </button>
                      </th>
                    )
                  }
                  if (col.id === 'edit') {
                    return (
                      <th
                        key={col.id}
                        draggable
                        onDragStart={() => handleDragStart(col.id)}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDragEnd={handleDragEnd}
                        className={`px-2 py-2 w-10 cursor-grab ${draggedColumn === col.id ? 'opacity-50' : ''}`}
                      />
                    )
                  }
                  if (col.id === 'notes') {
                    return (
                      <th
                        key={col.id}
                        draggable
                        onDragStart={() => handleDragStart(col.id)}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDragEnd={handleDragEnd}
                        className={`px-2 py-2 cursor-grab ${draggedColumn === col.id ? 'opacity-50' : ''}`}
                      >
                        {col.label}
                      </th>
                    )
                  }
                  return (
                    <th
                      key={col.id}
                      draggable
                      onDragStart={() => handleDragStart(col.id)}
                      onDragOver={(e) => handleDragOver(e, col.id)}
                      onDragEnd={handleDragEnd}
                      className={`px-2 py-2 text-right cursor-grab ${draggedColumn === col.id ? 'opacity-50' : ''}`}
                    >
                      {col.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry, i) => (
                <tr key={i} className="border-b border-slate-700/50 text-xs hover:bg-slate-700/30">
                  {visibleOrderedColumns.map((col, idx) => {
                    const isFirst = idx === 0
                    switch (col.id) {
                      case 'date':
                        return (
                          <td key={col.id} className={`px-2 py-1.5 text-white ${isFirst ? 'sticky left-0 bg-slate-800 z-10' : ''}`}>
                            {entry.date}
                          </td>
                        )
                      case 'equity':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-mint-400">
                            {formatCurrency(entry.value)}
                          </td>
                        )
                      case 'action':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right">
                            {entry.fundSize === 0 ? (
                              <span className="text-slate-500 italic">Close</span>
                            ) : entry.action && (
                              <span className={
                                entry.action === 'BUY' ? 'text-green-400'
                                : entry.action === 'SELL' ? 'text-orange-400'
                                : entry.action === 'HOLD' ? 'text-slate-400'
                                : entry.action === 'DEPOSIT' ? 'text-blue-400'
                                : entry.action === 'WITHDRAW' ? 'text-purple-400'
                                : ''
                              }>
                                {entry.action}
                              </span>
                            )}
                          </td>
                        )
                      case 'amount':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-white">
                            {entry.amount ? formatCurrency(entry.amount) : '-'}
                          </td>
                        )
                      case 'invested':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-blue-400">
                            {formatCurrency(entry.totalInvested)}
                          </td>
                        )
                      case 'cash':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-green-300">
                            {formatCurrency(entry.cash)}
                          </td>
                        )
                      case 'fundSize':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-slate-400">
                            {entry.fundSize === 0 ? (
                              <span className="text-slate-500 italic">closed</span>
                            ) : (
                              formatCurrency(entry.fundSize)
                            )}
                          </td>
                        )
                      case 'marginAvail':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-purple-400">
                            {entry.margin_borrowed ? formatCurrency(entry.margin_borrowed) : '-'}
                          </td>
                        )
                      case 'unrealized':
                        return (
                          <td key={col.id} className={`px-2 py-1.5 text-right ${entry.unrealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(entry.unrealized)}
                          </td>
                        )
                      case 'pnl':
                        return (
                          <td key={col.id} className={`px-2 py-1.5 text-right ${entry.gainUsd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(entry.gainUsd)}
                          </td>
                        )
                      case 'apy':
                        return (
                          <td key={col.id} className={`px-2 py-1.5 text-right ${entry.apy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPercent(entry.apy)}
                          </td>
                        )
                      case 'dividend':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-yellow-400">
                            {entry.dividend ? formatCurrency(entry.dividend) : '-'}
                          </td>
                        )
                      case 'cumDividends':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-yellow-400/70">
                            {entry.cumDividends > 0 ? formatCurrency(entry.cumDividends) : '-'}
                          </td>
                        )
                      case 'expense':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-red-400">
                            {entry.expense ? formatCurrency(entry.expense) : '-'}
                          </td>
                        )
                      case 'cumExpense':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-red-400/70">
                            {entry.cumExpenses > 0 ? formatCurrency(entry.cumExpenses) : '-'}
                          </td>
                        )
                      case 'cashInt':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-cyan-400">
                            {entry.cash_interest ? formatCurrency(entry.cash_interest) : '-'}
                          </td>
                        )
                      case 'cumCashInt':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-cyan-400/70">
                            {entry.cumCashInterest > 0 ? formatCurrency(entry.cumCashInterest) : '-'}
                          </td>
                        )
                      case 'extracted':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-orange-400">
                            {entry.extracted !== 0 ? formatCurrency(entry.extracted) : '-'}
                          </td>
                        )
                      case 'cumExtracted':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-right text-orange-400/70">
                            {entry.cumExtracted !== 0 ? formatCurrency(entry.cumExtracted) : '-'}
                          </td>
                        )
                      case 'notes':
                        return (
                          <td key={col.id} className="px-2 py-1.5 text-slate-400 max-w-[150px] truncate" title={entry.notes || ''}>
                            {entry.notes || '-'}
                          </td>
                        )
                      case 'edit':
                        return (
                          <td key={col.id} className="px-2 py-1.5">
                            <button
                              onClick={() => setEditingEntry({ index: entry.originalIndex, entry })}
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-600 rounded transition-colors"
                              title="Edit entry"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </td>
                        )
                      default:
                        return null
                    }
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Take Action Modal */}
        {showAddEntry && (
          <AddEntryModal
            fundId={fund.id}
            fundTicker={fund.ticker}
            currentRecommendation={state?.recommendation}
            onClose={() => setShowAddEntry(false)}
            onAdded={loadData}
          />
        )}

        {/* Edit Entry Modal */}
        {editingEntry && (
          <EditEntryModal
            fundId={fund.id}
            fundTicker={fund.ticker}
            entryIndex={editingEntry.index}
            entry={editingEntry.entry}
            onClose={() => setEditingEntry(null)}
            onUpdated={loadData}
          />
        )}
      </div>

      {/* Edit Panel */}
      {isEditing && (
        <EditFundPanel
          fundId={fund.id}
          fundPlatform={fund.platform}
          fundTicker={fund.ticker}
          config={fund.config}
          onUpdated={loadData}
        />
      )}
    </>
  )
}
