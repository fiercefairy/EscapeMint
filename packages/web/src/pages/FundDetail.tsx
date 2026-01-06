import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import * as d3 from 'd3'
import { toast } from 'sonner'
import { fetchFund, fetchFundState, updateFundConfig, type FundDetail as FundDetailType, type FundStateResponse, type FundEntry, type ChartBounds } from '../api/funds'
import { AddEntryModal } from '../components/AddEntryModal'
import { EditEntryModal } from '../components/EditEntryModal'
import { EditFundPanel } from '../components/EditFundPanel'
import { FundCharts } from '../components/FundCharts'
import { ChartSettings } from '../components/ChartSettings'
import { EntriesTable, type ComputedEntry, type ColumnId } from '../components/entriesTable'
import { formatCurrency, formatPercent } from '../utils/format'

// Chart data point for P&L and APY charts
interface ChartDataPoint {
  date: Date
  liquidPnl: number
  realizedPnl: number
  liquidApy: number
  realizedApy: number
}

export function FundDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const isEditing = location.pathname.endsWith('/edit')
  const isAdding = location.pathname.endsWith('/add')

  const [fund, setFund] = useState<FundDetailType | null>(null)
  const [state, setState] = useState<FundStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddEntry, setShowAddEntry] = useState(isAdding)
  const [editingEntry, setEditingEntry] = useState<{ index: number; entry: FundEntry; calculatedFundSize?: number } | null>(null)
  const apyChartRef = useRef<SVGSVGElement>(null)
  const pnlChartRef = useRef<SVGSVGElement>(null)
  const [chartResize, setChartResize] = useState(0)
  const [apyBounds, setApyBounds] = useState<ChartBounds>({})
  const [pnlBounds, setPnlBounds] = useState<ChartBounds>({})
  const [chartsCollapsed, setChartsCollapsed] = useState(false)

  // Resize handler for charts
  useEffect(() => {
    const handleResize = () => setChartResize(n => n + 1)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Sync chart bounds and collapsed state from fund config when fund loads
  useEffect(() => {
    if (!fund) return
    setApyBounds(fund.config.chart_bounds?.apy ?? {})
    setPnlBounds(fund.config.chart_bounds?.pnl ?? {})
    setChartsCollapsed(fund.config.charts_collapsed ?? false)
  }, [fund])

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

  // Toggle charts collapsed state
  const toggleChartsCollapsed = useCallback(async () => {
    const newValue = !chartsCollapsed
    setChartsCollapsed(newValue)
    // Trigger chart redraw after expanding (DOM needs time to render)
    if (!newValue) {
      setTimeout(() => setChartResize(n => n + 1), 50)
    }
    if (!id) return
    await updateFundConfig(id, { charts_collapsed: newValue })
  }, [id, chartsCollapsed])

  // Toggle audited status
  const toggleAudited = useCallback(async () => {
    if (!id || !fund) return
    const newAuditedValue = fund.config.audited ? '' : new Date().toISOString().split('T')[0]
    const result = await updateFundConfig(id, { audited: newAuditedValue })
    if (result.error) {
      toast.error(result.error)
    } else {
      setFund(prev => {
        if (!prev) return null
        const updatedConfig = { ...prev.config, audited: newAuditedValue }
        return { ...prev, config: updatedConfig }
      })
      toast.success(newAuditedValue ? 'Fund marked as audited' : 'Audit status cleared')
    }
  }, [id, fund])

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

  // Handle inline fund updates from edit/delete operations
  // If fund data is provided, update state directly; otherwise fall back to full reload
  const handleFundUpdate = useCallback(async (updatedFund?: FundDetailType) => {
    if (updatedFund) {
      setFund(updatedFund)
      // Also refresh state for recommendation updates
      if (id) {
        const stateResult = await fetchFundState(id)
        if (stateResult.data) {
          setState(stateResult.data)
        }
      }
    } else {
      await loadData()
    }
  }, [id, loadData])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Compute running totals and metrics for each entry
  const computedEntries = useMemo(() => {
    if (!fund) return []

    const startDate = new Date(fund.config.start_date)
    // Track original index before sorting
    const entriesWithOriginalIndex = fund.entries.map((entry, originalIndex) => ({
      ...entry,
      _originalIndex: originalIndex
    }))
    const sorted = entriesWithOriginalIndex.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    let totalBuys = 0
    let totalSells = 0 // For invested calculation (accumulate mode: only liquidations)
    let cumSellProceeds = 0 // For APY calculation (all sell amounts)
    let cumDividends = 0
    let cumExpenses = 0
    let cumCashInterest = 0
    let cumDeposits = 0
    let cumWithdrawals = 0
    let cumShares = 0
    let lastNonZeroValue = 0
    let lastApy = 0
    let costBasis = 0
    let cumExtracted = 0
    let previousCyclesGain = 0 // Realized gains from previous liquidation cycles

    // For cash fund TWAB (Time-Weighted Average Balance) calculation
    let twabNumerator = 0 // sum of (balance * days)
    let lastCashBalance = 0
    let lastEntryDate = startDate

    return sorted.map((entry, index) => {
      const entryDate = new Date(entry.date)

      // For cash fund TWAB: add previous balance * days since last entry
      if (fund.config.fund_type === 'cash' && index > 0) {
        const daysSinceLast = Math.max(0, (entryDate.getTime() - lastEntryDate.getTime()) / (1000 * 60 * 60 * 24))
        twabNumerator += lastCashBalance * daysSinceLast
      }
      lastEntryDate = entryDate
      // Update lastCashBalance with this entry's ending balance (will be used for next iteration)
      lastCashBalance = entry.cash ?? entry.value ?? 0

      // Track DEPOSIT/WITHDRAW for fund_size calculation
      if (entry.action === 'DEPOSIT' && entry.amount) {
        cumDeposits += entry.amount
      } else if (entry.action === 'WITHDRAW' && entry.amount) {
        cumWithdrawals += entry.amount
      }

      // Track dividends, expenses, cash interest, shares FIRST (they affect this row's APY and fund_size)
      // All values are positive in data; apply sign based on context
      if (entry.dividend) cumDividends += Math.abs(entry.dividend)
      if (entry.expense) cumExpenses += Math.abs(entry.expense)
      if (entry.cash_interest) cumCashInterest += Math.abs(entry.cash_interest)
      // Shares: BUY adds, SELL subtracts
      if (entry.shares) {
        const sharesAbs = Math.abs(entry.shares)
        cumShares += entry.action === 'SELL' ? -sharesAbs : sharesAbs
      }

      // Calculate fund_size: use manual override if set, otherwise calculate dynamically
      // For cash funds, fund_size IS the cash balance (no separate investment pool)
      // For non-cash managing trading funds, fund_size = invested amount (calculated after buy/sell processing below)
      // For cash managing trading funds, fund_size = base + deposits - withdrawals + dividends + interest - expenses
      const isCashFundType = fund.config.fund_type === 'cash'
      const expenseFromFund = fund.config.expense_from_fund !== false
      let calculatedFundSize: number
      if (isCashFundType) {
        // For cash funds, fund_size equals the cash balance
        calculatedFundSize = entry.cash ?? entry.value
      } else {
        // For trading funds with cash management, use the standard formula
        // Non-cash managing funds will be recalculated below after buy/sell processing
        calculatedFundSize = fund.config.fund_size_usd
          + cumDeposits - cumWithdrawals
          + cumDividends + cumCashInterest - (expenseFromFund ? cumExpenses : 0)
      }
      // For cash funds, always use calculated fund_size
      let fundSize = isCashFundType ? calculatedFundSize : (entry.fund_size ?? calculatedFundSize)

      // Calculate APY BEFORE processing this row's buy/sell action
      // Total return = currentValue + priorSellProceeds + dividends + interest - expenses - totalBuys + previousCyclesGain
      const totalMoneyOut = entry.value + cumSellProceeds + cumDividends + cumCashInterest - cumExpenses + previousCyclesGain
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
      // If manage_cash is false, cash is always 0
      const manageCash = fund.config.manage_cash ?? true
      const netInvestedBefore = totalBuys - totalSells
      const cash = !manageCash ? 0 : (fundSize === 0 ? 0 : Math.max(0, fundSize - netInvestedBefore))

      // NOW process this row's buy/sell action (for next iteration and display)
      let extracted = 0
      const isAccumulate = fund.config.accumulate

      if (entry.action === 'BUY' && entry.amount) {
        totalBuys += entry.amount
        costBasis += entry.amount
      } else if (entry.action === 'SELL' && entry.amount) {
        // Check if this is a full liquidation
        // Use cumShares check if fund has share tracking, AND value-based check as fallback
        // Either condition triggers liquidation (share tracking can accumulate errors over time)
        const hasShareTracking = entry.shares !== undefined && entry.shares !== 0
        const sharesLiquidated = hasShareTracking && Math.abs(cumShares) < 0.0001
        const valueLiquidated = entry.value <= entry.amount + 0.01
        const isFullLiquidation = sharesLiquidated || valueLiquidated

        // Always track sell proceeds for APY calculation
        cumSellProceeds += entry.amount

        // In accumulate mode, sells are profit extraction and don't reduce totalSells
        // unless it's a full liquidation. In liquidate mode, all sells reduce invested.
        if (!isAccumulate || isFullLiquidation) {
          totalSells += entry.amount
        }

        // Calculate extracted profit from this sell
        if (isFullLiquidation) {
          // Full liquidation - extract remaining profit
          extracted = entry.amount - costBasis
          // Capture the realized gain from this cycle before resetting
          previousCyclesGain += extracted
          costBasis = 0
          // Reset running totals for next investment cycle
          totalBuys = 0
          totalSells = 0
          cumSellProceeds = 0
        } else {
          // Partial sell
          if (isAccumulate) {
            // Accumulate mode: entire sell amount is profit extraction (cost basis unchanged)
            extracted = entry.amount
          } else {
            // Liquidate mode: proportional cost basis
            const sellProportion = entry.amount / (entry.value + entry.amount)
            const costBasisReturned = costBasis * sellProportion
            extracted = entry.amount - costBasisReturned
            costBasis -= costBasisReturned
          }
        }
        cumExtracted += extracted
      }

      // Net invested = buys - sells (what's still "in" the fund from cash perspective)
      // In accumulate mode, partial sells don't reduce invested (they're profit extraction)
      // Cap at 0 - can't have negative invested
      const netInvested = Math.max(0, totalBuys - totalSells)

      // For non-cash managing funds, fund_size = invested amount (override the earlier calculation)
      if (!manageCash && !isCashFundType) {
        fundSize = netInvested
      }

      // Data integrity check: invested exceeds fund size (purchased without available cash)
      // Use small tolerance (1 cent) for floating point precision
      // Skip check for non-cash managing funds (they don't maintain a cash pool)
      const hasIntegrityIssue = manageCash && fundSize > 0 && netInvested > fundSize + 0.01

      // Post-action cash (what's available AFTER this entry's action)
      const postActionCash = !manageCash ? 0 : (fundSize === 0 ? 0 : Math.max(0, fundSize - netInvested))

      // Post-action equity value (entry.value is pre-action)
      let postActionValue = entry.value
      if (entry.action === 'BUY' && entry.amount) {
        postActionValue = entry.value + entry.amount
      } else if (entry.action === 'SELL' && entry.amount) {
        postActionValue = Math.max(0, entry.value - entry.amount)
      }

      // Unrealized gain = post-action asset value - cost basis
      const unrealized = postActionValue - costBasis

      // APY calculation depends on fund type
      const isCashFund = fund.config.fund_type === 'cash'

      // Realized gain calculation differs by fund type
      // For cash funds: only interest - expenses (no dividends or extractions apply)
      // For trading funds: interest + dividends + extracted profits - expenses
      const realized = isCashFund
        ? cumCashInterest - cumExpenses
        : cumCashInterest + cumDividends + cumExtracted - cumExpenses

      // Liquid P&L = unrealized + realized (total paper + real gains)
      const liquidPnl = unrealized + realized
      let realizedApy = 0
      let liquidApy = 0

      if (isCashFund) {
        // Cash fund APY: based on interest earned minus expenses
        // Use Time-Weighted Average Balance (TWAB) as denominator for accurate APY
        if (Math.abs(realized) < 0.01 || isFirstEntry) {
          realizedApy = 0
          liquidApy = 0
        } else {
          // Calculate TWAB: sum(balance * days) / total_days
          // twabNumerator already accumulated up to this entry
          const twab = daysElapsed > 0 ? twabNumerator / daysElapsed : lastCashBalance

          // Use TWAB as denominator, fall back to current balance if TWAB is 0
          const cashDenominator = twab > 0 ? twab : (fundSize > 0 ? fundSize : 1)

          const cashReturnPct = realized / cashDenominator
          // APY = (1 + return)^(365/days) - 1
          const clampedCashPct = Math.max(-0.99, Math.min(cashReturnPct, 1))
          realizedApy = daysElapsed > 0 ? Math.pow(1 + clampedCashPct, 365 / daysElapsed) - 1 : 0
          // Cap APY at reasonable bounds (-99% to 1000%)
          realizedApy = Math.max(-0.99, Math.min(realizedApy, 10))
          liquidApy = realizedApy
        }
      } else {
        // Trading fund APY: based on invested capital
        const investedDenominator = netInvested > 0 ? netInvested : (costBasis > 0 ? costBasis : denominatorValue)

        // Calculate Realized APY (based only on realized gains relative to invested)
        const realizedReturnPct = investedDenominator > 0 ? realized / investedDenominator : 0
        const clampedRealizedPct = Math.max(-0.99, realizedReturnPct)
        realizedApy = isFirstEntry ? 0 : (daysElapsed > 0 ? Math.pow(1 + clampedRealizedPct, 365 / daysElapsed) - 1 : 0)

        // Liquid APY = based on liquid P&L relative to invested capital
        const liquidReturnPct = investedDenominator > 0 ? liquidPnl / investedDenominator : 0
        const clampedLiquidPct = Math.max(-0.99, liquidReturnPct)
        liquidApy = isFirstEntry ? 0 : (daysElapsed > 0 ? Math.pow(1 + clampedLiquidPct, 365 / daysElapsed) - 1 : 0)
      }

      // If value is 0 (closed fund), preserve the last valid APYs
      // But NOT for cash funds - a $0 pre-action value before DEPOSIT is normal
      if (!isCashFund && entry.value === 0 && lastApy !== 0) {
        realizedApy = lastApy // For closed funds, realized = liquid
        liquidApy = lastApy
      }

      return {
        ...entry,
        originalIndex: entry._originalIndex,
        fundSize,
        totalInvested: netInvested,
        calculatedCash: cash,
        postActionCash,
        cumDividends,
        cumExpenses,
        cumCashInterest,
        extracted,
        cumExtracted,
        cumShares,
        unrealized,
        realized,
        liquidPnl,
        realizedApy,
        liquidApy,
        hasIntegrityIssue
      }
    })
  }, [fund])

  // Get the latest entry for displaying current metrics
  const latestEntry = useMemo(() => {
    if (computedEntries.length === 0) return null
    return computedEntries[computedEntries.length - 1]
  }, [computedEntries])

  // Count entries with data integrity issues
  const integrityIssueCount = useMemo(() => {
    return computedEntries.filter(e => e.hasIntegrityIssue).length
  }, [computedEntries])

  // Draw Fund APY chart (shows both Liquid and Realized APY)
  useEffect(() => {
    if (!apyChartRef.current || computedEntries.length === 0) return

    const svg = d3.select(apyChartRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 25, left: 50 }
    const width = apyChartRef.current.clientWidth - margin.left - margin.right
    const height = apyChartRef.current.clientHeight - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Derive chart data from computedEntries
    const chartData: ChartDataPoint[] = computedEntries.map(e => ({
      date: new Date(e.date),
      liquidPnl: e.liquidPnl,
      realizedPnl: e.realized,
      liquidApy: e.liquidApy,
      realizedApy: e.realizedApy
    }))

    const data = chartData.filter(d => isFinite(d.liquidApy) && isFinite(d.realizedApy))

    if (data.length === 0) return

    // Use state bounds if available, otherwise auto-scale with reasonable limits
    const allApyValues = data.flatMap(d => [d.liquidApy, d.realizedApy])
    const yExtent = d3.extent(allApyValues) as [number, number]
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

    // Clip path for chart area
    const clipId = `apy-clip-${Date.now()}`
    g.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)

    // Liquid APY line (orange - prominent)
    const liquidLine = d3.line<ChartDataPoint>()
      .x(d => x(d.date))
      .y(d => y(Math.max(yMin, Math.min(yMax, d.liquidApy))))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2)
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', liquidLine)

    // Realized APY line (green - secondary)
    const realizedLine = d3.line<ChartDataPoint>()
      .x(d => x(d.date))
      .y(d => y(Math.max(yMin, Math.min(yMax, d.realizedApy))))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2')
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', realizedLine)

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

    // Two circles for the two lines
    focus.append('circle')
      .attr('class', 'hover-circle-liquid')
      .attr('r', 4)
      .attr('fill', '#f59e0b')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    focus.append('circle')
      .attr('class', 'hover-circle-realized')
      .attr('r', 3)
      .attr('fill', '#10b981')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

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
      .attr('class', 'tooltip-liquid')
      .attr('fill', '#f59e0b')
      .attr('font-size', '10px')
      .attr('text-anchor', 'middle')

    tooltip.append('text')
      .attr('class', 'tooltip-realized')
      .attr('fill', '#10b981')
      .attr('font-size', '10px')
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
        const yPosLiquid = y(Math.max(yMin, Math.min(yMax, d.liquidApy)))
        const yPosRealized = y(Math.max(yMin, Math.min(yMax, d.realizedApy)))

        focus.select('.hover-line').attr('x1', xPos).attr('x2', xPos)
        focus.select('.hover-circle-liquid').attr('cx', xPos).attr('cy', yPosLiquid)
        focus.select('.hover-circle-realized').attr('cx', xPos).attr('cy', yPosRealized)

        const dateStr = d3.timeFormat('%b %d, %Y')(d.date)
        const liquidPct = d.liquidApy * 100
        const realizedPct = d.realizedApy * 100
        const liquidStr = `Liquid: ${liquidPct >= 0 ? '+' : ''}${liquidPct.toFixed(1)}%`
        const realizedStr = `Realized: ${realizedPct >= 0 ? '+' : ''}${realizedPct.toFixed(1)}%`

        const tooltipGroup = focus.select('.tooltip-group')
        tooltipGroup.select('.tooltip-date').text(dateStr)
        tooltipGroup.select('.tooltip-liquid').text(liquidStr)
        tooltipGroup.select('.tooltip-realized').text(realizedStr)

        const tooltipWidth = 100
        const tooltipHeight = 46

        let tooltipX = xPos
        const tooltipY = Math.min(yPosLiquid, yPosRealized) - tooltipHeight - 10

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

        tooltipGroup.select('.tooltip-liquid')
          .attr('x', 0)
          .attr('y', 25)

        tooltipGroup.select('.tooltip-realized')
          .attr('x', 0)
          .attr('y', 39)
      })

  }, [computedEntries, apyBounds, chartResize])

  // Draw P&L chart (shows both Liquid and Realized P&L)
  useEffect(() => {
    if (!pnlChartRef.current || computedEntries.length === 0) return

    const svg = d3.select(pnlChartRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 10, right: 10, bottom: 25, left: 50 }
    const width = pnlChartRef.current.clientWidth - margin.left - margin.right
    const height = pnlChartRef.current.clientHeight - margin.top - margin.bottom

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Derive chart data from computedEntries
    const data: ChartDataPoint[] = computedEntries.map(e => ({
      date: new Date(e.date),
      liquidPnl: e.liquidPnl,
      realizedPnl: e.realized,
      liquidApy: e.liquidApy,
      realizedApy: e.realizedApy
    }))

    if (data.length === 0) return

    // Use state bounds if available, otherwise auto-scale
    const allPnlValues = data.flatMap(d => [d.liquidPnl, d.realizedPnl])
    const yExtent = d3.extent(allPnlValues) as [number, number]
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

    // Clip path for chart area
    const clipId = `pnl-clip-${Date.now()}`
    g.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)

    // Liquid P&L line (orange - prominent)
    const liquidLine = d3.line<ChartDataPoint>()
      .x(d => x(d.date))
      .y(d => y(Math.max(yMin, Math.min(yMax, d.liquidPnl))))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2)
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', liquidLine)

    // Realized P&L line (green - secondary)
    const realizedLine = d3.line<ChartDataPoint>()
      .x(d => x(d.date))
      .y(d => y(Math.max(yMin, Math.min(yMax, d.realizedPnl))))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2')
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', realizedLine)

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

    // Two circles for the two lines
    focus.append('circle')
      .attr('class', 'hover-circle-liquid')
      .attr('r', 4)
      .attr('fill', '#f59e0b')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    focus.append('circle')
      .attr('class', 'hover-circle-realized')
      .attr('r', 3)
      .attr('fill', '#10b981')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

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
      .attr('class', 'tooltip-liquid')
      .attr('fill', '#f59e0b')
      .attr('font-size', '10px')
      .attr('text-anchor', 'middle')

    tooltip.append('text')
      .attr('class', 'tooltip-realized')
      .attr('fill', '#10b981')
      .attr('font-size', '10px')
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
        const yPosLiquid = y(Math.max(yMin, Math.min(yMax, d.liquidPnl)))
        const yPosRealized = y(Math.max(yMin, Math.min(yMax, d.realizedPnl)))

        focus.select('.hover-line').attr('x1', xPos).attr('x2', xPos)
        focus.select('.hover-circle-liquid').attr('cx', xPos).attr('cy', yPosLiquid)
        focus.select('.hover-circle-realized').attr('cx', xPos).attr('cy', yPosRealized)

        const dateStr = d3.timeFormat('%b %d, %Y')(d.date)
        const formatCurr = (v: number) => (v >= 0 ? '+' : '') + new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(v)
        const liquidStr = `Liquid: ${formatCurr(d.liquidPnl)}`
        const realizedStr = `Realized: ${formatCurr(d.realizedPnl)}`

        const tooltipGroup = focus.select('.tooltip-group')
        tooltipGroup.select('.tooltip-date').text(dateStr)
        tooltipGroup.select('.tooltip-liquid').text(liquidStr)
        tooltipGroup.select('.tooltip-realized').text(realizedStr)

        const tooltipWidth = 110
        const tooltipHeight = 46

        let tooltipX = xPos
        const tooltipY = Math.min(yPosLiquid, yPosRealized) - tooltipHeight - 10

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

        tooltipGroup.select('.tooltip-liquid')
          .attr('x', 0)
          .attr('y', 25)

        tooltipGroup.select('.tooltip-realized')
          .attr('x', 0)
          .attr('y', 39)
      })

  }, [computedEntries, pnlBounds, chartResize])

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
              {/* Breadcrumb with indicators */}
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <Link to="/" className="text-slate-400 hover:text-white">Dashboard</Link>
                <span className="text-slate-600">/</span>
                <Link to={`/platform/${fund.platform}`} className="text-slate-400 hover:text-white capitalize">{fund.platform}</Link>
                <span className="text-slate-600">/</span>
                <span className="text-white font-medium uppercase">{fund.ticker}</span>
                {/* Closed Tag */}
                {(fund.config.status === 'closed' || (fund.config.status === undefined && fund.config.fund_size_usd === 0)) && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-700 text-slate-400 rounded">Closed</span>
                )}
                {/* Audited Badge - clickable to toggle */}
                <button
                  onClick={toggleAudited}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded flex items-center gap-1 transition-colors ${
                    fund.config.audited
                      ? 'bg-green-900/50 text-green-300 border border-green-700 hover:bg-green-900/70'
                      : 'bg-slate-700/50 text-slate-500 border border-slate-600 hover:bg-slate-700 hover:text-slate-400'
                  }`}
                  title={fund.config.audited ? `Audited on ${fund.config.audited} - click to clear` : 'Click to mark as audited'}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {fund.config.audited ? 'Audited' : 'Audit'}
                </button>
                {/* Recommendation Badge */}
                {state?.recommendation && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      state.recommendation.action === 'BUY'
                        ? 'bg-green-900/50 text-green-300 border border-green-700'
                        : state.recommendation.action === 'HOLD'
                        ? 'bg-slate-700/50 text-slate-300 border border-slate-600'
                        : 'bg-orange-900/50 text-orange-300 border border-orange-700'
                    }`}
                    title={`Cash: ${formatCurrency(state.cash_available ?? 0)}${state.cash_source ? ` (from ${state.cash_source})` : ''}${fund.config.margin_enabled && state.margin_available ? ` | Margin: ${formatCurrency(state.margin_available)}` : ''}`}
                  >
                    {state.recommendation.action === 'HOLD' ? 'HOLD' : `${state.recommendation.action} ${formatCurrency(state.recommendation.amount)}`}
                  </span>
                )}
                {/* Cash/Margin Available */}
                {state && ((state.cash_available ?? 0) > 0 || (fund.config.margin_enabled && (state.margin_available ?? 0) > 0)) && (
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-700/50 text-slate-300 border border-slate-600">
                    {(state.cash_available ?? 0) > 0 && (
                      state.cash_source ? (
                        <Link to={`/fund/${state.cash_source}`} className="hover:text-mint-400">
                          Cash: {formatCurrency(state.cash_available ?? 0)} ↗
                        </Link>
                      ) : (
                        <span>Cash: {formatCurrency(state.cash_available ?? 0)}</span>
                      )
                    )}
                    {(state.cash_available ?? 0) > 0 && fund.config.margin_enabled && (state.margin_available ?? 0) > 0 && <span className="mx-1">|</span>}
                    {fund.config.margin_enabled && (state.margin_available ?? 0) > 0 && <span>Margin: {formatCurrency(state.margin_available ?? 0)}</span>}
                  </span>
                )}
              </div>
              {/* Config Details Row - different for cash vs trading funds */}
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                {fund.config.fund_type === 'cash' ? (
                  // Cash fund: simplified config
                  <>
                    <span title="Fund Type">
                      <span className="text-slate-500">Type:</span> <span className="text-blue-300">Cash</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span title="Cash Balance">
                      <span className="text-slate-500">Balance:</span> <span className="text-white">{formatCurrency(latestEntry?.fundSize ?? 0)}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span title="Total Interest Earned">
                      <span className="text-slate-500">Interest:</span> <span className="text-green-400">{formatCurrency(latestEntry?.cumCashInterest ?? 0)}</span>
                    </span>
                  </>
                ) : (
                  // Trading fund (stock/crypto): full trading config
                  <>
                    <span title="Fund Type">
                      <span className="text-slate-500">Type:</span> <span className={
                        fund.config.fund_type === 'crypto' ? 'text-yellow-300'
                        : fund.config.fund_type === 'derivatives' ? 'text-orange-300'
                        : 'text-green-300'
                      }>{
                        fund.config.fund_type === 'crypto' ? 'Crypto'
                        : fund.config.fund_type === 'derivatives' ? 'Futures'
                        : 'Stock'
                      }</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span title="Mode">
                      <span className="text-slate-500">Mode:</span> <span className={fund.config.accumulate ? 'text-blue-300' : 'text-orange-300'}>{fund.config.accumulate ? 'Accumulate' : 'Liquidate'}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span title="Fund Size">
                      <span className="text-slate-500">Size:</span> <span className="text-white">{formatCurrency(latestEntry?.fundSize ?? fund.config.fund_size_usd)}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span title="Target APY">
                      <span className="text-slate-500">Target APY:</span> <span className="text-mint-400">{(fund.config.target_apy * 100).toFixed(0)}%</span>
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
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
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
        </div>

        {/* Stats Section (collapsible) */}
        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <button
            onClick={toggleChartsCollapsed}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700/50 transition-colors"
          >
            <h2 className="text-base font-semibold text-white">Stats</h2>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${chartsCollapsed ? '' : 'rotate-180'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!chartsCollapsed && (
            <div className="p-3 space-y-3">
              {/* Current State + P&L + APY Charts Row (3 columns) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Current State */}
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <h3 className="text-sm font-semibold text-white mb-2">Current State</h3>
                  {(fund.config.status === 'closed' || (fund.config.status === undefined && fund.config.fund_size_usd === 0)) && state?.closedMetrics ? (
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
                  ) : (fund.config.status === 'closed' || (fund.config.status === undefined && fund.config.fund_size_usd === 0)) ? (
                    <p className="text-slate-400 text-sm">This fund is closed. Historical data preserved below.</p>
                  ) : latestEntry && fund.config.fund_type === 'cash' ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-[10px] text-slate-400">Cash Balance</p>
                        <p className="font-medium text-mint-400">{formatCurrency(latestEntry.postActionCash)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Interest Earned</p>
                        <p className="font-medium text-green-400">{formatCurrency(latestEntry.cumCashInterest)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Expenses</p>
                        <p className="font-medium text-red-400">{formatCurrency(latestEntry.cumExpenses)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Net Gain</p>
                        <p className={`font-medium ${latestEntry.realized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(latestEntry.realized)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Realized APY</p>
                        <p className={`font-medium ${latestEntry.realizedApy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(latestEntry.realizedApy)}
                        </p>
                      </div>
                      {(latestEntry.margin_available ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400">Margin Available</p>
                          <p className="font-medium text-blue-400">{formatCurrency(latestEntry.margin_available ?? 0)}</p>
                        </div>
                      )}
                      {(latestEntry.margin_borrowed ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400">Margin Borrowed</p>
                          <p className="font-medium text-orange-400">{formatCurrency(latestEntry.margin_borrowed ?? 0)}</p>
                        </div>
                      )}
                    </div>
                  ) : latestEntry ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-[10px] text-slate-400">Invested</p>
                        <p className="font-medium text-white">{formatCurrency(latestEntry.totalInvested)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Asset Value</p>
                        <p className="font-medium text-mint-400">{formatCurrency(latestEntry.value)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Unrealized</p>
                        <p className={`font-medium ${latestEntry.unrealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(latestEntry.unrealized)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Cash</p>
                        <p className="font-medium text-white">{formatCurrency(latestEntry.postActionCash)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Realized</p>
                        <p className={`font-medium ${latestEntry.realized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(latestEntry.realized)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Realized APY</p>
                        <p className={`font-medium ${latestEntry.realizedApy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(latestEntry.realizedApy)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Liquid P&L</p>
                        <p className={`font-medium ${latestEntry.liquidPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(latestEntry.liquidPnl)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">Liquid APY</p>
                        <p className={`font-medium ${latestEntry.liquidApy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(latestEntry.liquidApy)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">No state data available</p>
                  )}
                </div>

                {/* P&L Chart */}
                <div className="bg-slate-700/50 rounded-lg p-3 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-white">P&L</h3>
                      <div className="flex gap-2">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
                          Liquid
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span className="w-2 h-0.5" style={{ backgroundColor: '#10b981' }} />
                          Realized
                        </span>
                      </div>
                    </div>
                    <ChartSettings bounds={pnlBounds} onChange={updatePnlBounds} />
                  </div>
                  <svg
                    ref={pnlChartRef}
                    className="w-full flex-1 min-h-[100px]"
                    style={{ overflow: 'visible' }}
                  />
                </div>

                {/* Fund APY Chart */}
                <div className="bg-slate-700/50 rounded-lg p-3 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-white">APY</h3>
                      <div className="flex gap-2">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
                          Liquid
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span className="w-2 h-0.5" style={{ backgroundColor: '#10b981' }} />
                          Realized
                        </span>
                      </div>
                    </div>
                    <ChartSettings bounds={apyBounds} onChange={updateApyBounds} isPercent />
                  </div>
                  <svg
                    ref={apyChartRef}
                    className="w-full flex-1 min-h-[100px]"
                    style={{ overflow: 'visible' }}
                  />
                </div>
              </div>

              {/* Fund Analysis Charts */}
              <FundCharts entries={fund.entries} config={fund.config} fundId={fund.id} />
            </div>
          )}
        </div>

        {/* Data Integrity Alert */}
        {integrityIssueCount > 0 && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-red-300 text-sm font-medium">
                Data Integrity Issue{integrityIssueCount > 1 ? 's' : ''} Detected
              </p>
              <p className="text-red-400/80 text-xs">
                {integrityIssueCount} entr{integrityIssueCount === 1 ? 'y' : 'ies'} where invested amount exceeds fund size (highlighted in red below)
              </p>
            </div>
          </div>
        )}

        {/* Entries Table */}
        <EntriesTable
          fundId={fund.id}
          entries={fund.entries}
          computedEntries={computedEntries as ComputedEntry[]}
          savedColumnOrder={fund.config.entries_column_order as ColumnId[]}
          savedVisibleColumns={fund.config.entries_visible_columns as ColumnId[]}
          fundType={fund.config.fund_type}
          onEdit={(index, entry, calculatedFundSize) => setEditingEntry({ index, entry, calculatedFundSize })}
          onAddEntry={() => setShowAddEntry(true)}
          onReload={loadData}
        />

        {/* Take Action Modal */}
        {showAddEntry && (
          <AddEntryModal
            fundId={fund.id}
            fundTicker={fund.ticker}
            currentRecommendation={state?.recommendation}
            existingEntries={fund.entries}
            targetApy={fund.config.target_apy}
            minProfitUsd={fund.config.min_profit_usd}
            manageCash={fund.config.manage_cash}
            fundType={fund.config.fund_type}
            onClose={() => {
              setShowAddEntry(false)
              if (isAdding) navigate(`/fund/${fund.id}`, { replace: true })
            }}
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
            existingEntries={fund.entries.slice(0, editingEntry.index)}
            calculatedFundSize={editingEntry.calculatedFundSize}
            fundType={fund.config.fund_type}
            manageCash={fund.config.manage_cash}
            onClose={() => setEditingEntry(null)}
            onUpdated={handleFundUpdate}
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
