import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { updatePlatformConfig, type PlatformFundMetrics } from '../../api/platforms'
import { updateFundConfig } from '../../api/funds'
import { ALL_FUND_COLUMNS, getDefaultFundColumns, getDefaultFundColumnOrder, type FundColumnId } from './types'

interface FundsTableProps {
  platformId: string
  funds: PlatformFundMetrics[]
  savedColumnOrder?: string[]
  savedVisibleColumns?: string[]
  onReload?: () => void
}

export function FundsTable({
  platformId,
  funds,
  savedColumnOrder,
  savedVisibleColumns,
  onReload
}: FundsTableProps) {
  const navigate = useNavigate()
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  // Get valid column IDs from the current column definitions
  const validColumnIds = new Set(ALL_FUND_COLUMNS.map(c => c.id))

  const [visibleColumns, setVisibleColumns] = useState<Set<FundColumnId>>(() => {
    if (savedVisibleColumns) {
      // Filter to only valid column IDs
      const valid = savedVisibleColumns.filter(id => validColumnIds.has(id as FundColumnId))
      return valid.length > 0 ? new Set(valid as FundColumnId[]) : getDefaultFundColumns()
    }
    return getDefaultFundColumns()
  })
  const [columnOrder, setColumnOrder] = useState<FundColumnId[]>(() => {
    if (savedColumnOrder && savedColumnOrder.length > 0) {
      const defaultOrder = getDefaultFundColumnOrder()
      // Filter saved order to only valid column IDs
      const validSaved = savedColumnOrder.filter(id => validColumnIds.has(id as FundColumnId)) as FundColumnId[]
      const savedSet = new Set(validSaved)
      const missing = defaultOrder.filter(id => !savedSet.has(id))
      return [...validSaved, ...missing]
    }
    return getDefaultFundColumnOrder()
  })
  const [draggedColumn, setDraggedColumn] = useState<FundColumnId | null>(null)
  const columnMenuRef = useRef<HTMLDivElement>(null)

  // Sync column preferences from props
  useEffect(() => {
    if (savedColumnOrder && savedColumnOrder.length > 0) {
      const defaultOrder = getDefaultFundColumnOrder()
      // Filter saved order to only valid column IDs
      const validSaved = savedColumnOrder.filter(id => validColumnIds.has(id as FundColumnId)) as FundColumnId[]
      const savedSet = new Set(validSaved)
      const missing = defaultOrder.filter(id => !savedSet.has(id))
      setColumnOrder([...validSaved, ...missing])
    } else {
      setColumnOrder(getDefaultFundColumnOrder())
    }

    if (savedVisibleColumns && savedVisibleColumns.length > 0) {
      // Filter to only valid column IDs
      const valid = savedVisibleColumns.filter(id => validColumnIds.has(id as FundColumnId))
      setVisibleColumns(valid.length > 0 ? new Set(valid as FundColumnId[]) : getDefaultFundColumns())
    } else {
      setVisibleColumns(getDefaultFundColumns())
    }
  }, [savedColumnOrder, savedVisibleColumns])

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

  // Save column preferences to platform config
  const saveColumnPrefs = useCallback(async (order: FundColumnId[], visible: Set<FundColumnId>) => {
    await updatePlatformConfig(platformId, {
      funds_column_order: order,
      funds_visible_columns: [...visible]
    })
  }, [platformId])

  // Toggle audit status for a fund
  const toggleAudit = async (fundId: string, currentAudited: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation()
    const newValue = currentAudited ? undefined : new Date().toISOString().split('T')[0]
    const result = await updateFundConfig(fundId, { audited: newValue ?? '' })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(newValue ? 'Fund marked as audited' : 'Audit status cleared')
      onReload?.()
    }
  }

  const toggleColumn = (columnId: FundColumnId) => {
    setVisibleColumns(prev => {
      const next = new Set(prev)
      if (next.has(columnId)) {
        next.delete(columnId)
      } else {
        next.add(columnId)
      }
      saveColumnPrefs(columnOrder, next)
      return next
    })
  }

  const isColumnVisible = (columnId: FundColumnId) => visibleColumns.has(columnId)

  // Drag and drop for column reordering
  const handleDragStart = (columnId: FundColumnId) => {
    setDraggedColumn(columnId)
  }

  const handleDragOver = (e: React.DragEvent, targetId: FundColumnId) => {
    e.preventDefault()
    if (!draggedColumn || draggedColumn === targetId) return

    setColumnOrder(prev => {
      const newOrder = [...prev]
      const dragIdx = newOrder.indexOf(draggedColumn)
      const targetIdx = newOrder.indexOf(targetId)
      if (dragIdx === -1 || targetIdx === -1) return prev
      newOrder.splice(dragIdx, 1)
      newOrder.splice(targetIdx, 0, draggedColumn)
      return newOrder
    })
  }

  const handleDragEnd = () => {
    if (draggedColumn) {
      saveColumnPrefs(columnOrder, visibleColumns)
    }
    setDraggedColumn(null)
  }

  // Get ordered visible columns
  const orderedVisibleColumns = columnOrder.filter(id => visibleColumns.has(id))

  // Format helpers
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatCurrencyPrecise = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatPercent = (value: number) => {
    return (value * 100).toFixed(2) + '%'
  }

  const formatNumber = (value: number, decimals = 0) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value)
  }

  // Render cell value based on column
  const renderCell = (fund: PlatformFundMetrics, columnId: FundColumnId) => {
    switch (columnId) {
      case 'ticker':
        return <span className="font-medium text-white uppercase">{fund.ticker}</span>
      case 'status':
        return (
          <span className={`px-2 py-0.5 rounded text-xs ${
            fund.status === 'active'
              ? 'bg-green-500/20 text-green-300'
              : 'bg-slate-500/20 text-slate-300'
          }`}>
            {fund.status}
          </span>
        )
      case 'fundType':
        return <span className="text-slate-400 text-xs uppercase">{fund.fundType}</span>
      case 'fundSize':
        return <span className="text-white">{formatCurrency(fund.fundSize)}</span>
      case 'currentValue':
        return <span className="text-mint-400">{formatCurrency(fund.currentValue)}</span>
      case 'cash':
        return <span className="text-blue-400">{formatCurrency(fund.cash)}</span>
      case 'startInput':
        return <span className="text-white">{formatCurrency(fund.startInput)}</span>
      case 'unrealized':
        return (
          <span className={fund.unrealized >= 0 ? 'text-green-400' : 'text-red-400'}>
            {formatCurrencyPrecise(fund.unrealized)}
          </span>
        )
      case 'realized':
        return (
          <span className={fund.realized >= 0 ? 'text-green-400' : 'text-red-400'}>
            {formatCurrencyPrecise(fund.realized)}
          </span>
        )
      case 'liquidPnl':
        return (
          <span className={fund.liquidPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
            {formatCurrencyPrecise(fund.liquidPnl)}
          </span>
        )
      case 'dividends':
        return <span className="text-green-400">{formatCurrencyPrecise(fund.dividends)}</span>
      case 'expenses':
        return <span className="text-red-400">{formatCurrencyPrecise(fund.expenses)}</span>
      case 'cashInterest':
        return <span className="text-purple-400">{formatCurrencyPrecise(fund.cashInterest)}</span>
      case 'daysActive':
        return <span className="text-slate-400">{formatNumber(fund.daysActive)}</span>
      case 'realizedAPY':
        return (
          <span className={fund.realizedAPY >= 0 ? 'text-green-400' : 'text-red-400'}>
            {formatPercent(fund.realizedAPY)}
          </span>
        )
      case 'liquidAPY':
        return (
          <span className={fund.liquidAPY >= 0 ? 'text-green-400' : 'text-red-400'}>
            {formatPercent(fund.liquidAPY)}
          </span>
        )
      case 'entries':
        return <span className="text-slate-400">{fund.entries}</span>
      case 'audited':
        return (
          <button
            onClick={(e) => toggleAudit(fund.id, fund.audited, e)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              fund.audited
                ? 'bg-green-900/50 text-green-400 hover:bg-green-800/50'
                : 'bg-slate-600/50 text-slate-400 hover:bg-slate-500/50'
            }`}
            title={fund.audited ? `Audited on ${fund.audited} - click to clear` : 'Click to mark as audited'}
          >
            {fund.audited ? '✓' : '○'}
          </button>
        )
      default:
        return null
    }
  }

  // Get column alignment
  const getColumnAlign = (columnId: FundColumnId): 'left' | 'right' => {
    const leftAlignedColumns: FundColumnId[] = ['ticker', 'status', 'fundType', 'audited']
    return leftAlignedColumns.includes(columnId) ? 'left' : 'right'
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Funds on this Platform</h2>
        <div className="relative" ref={columnMenuRef}>
          <button
            onClick={() => setShowColumnMenu(!showColumnMenu)}
            className="px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
          >
            Columns
          </button>
          {showColumnMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
              <div className="p-2 border-b border-slate-700">
                <span className="text-xs text-slate-400">Drag to reorder, click to toggle</span>
              </div>
              {columnOrder.map(columnId => {
                const column = ALL_FUND_COLUMNS.find(c => c.id === columnId)
                if (!column) return null
                return (
                  <div
                    key={columnId}
                    draggable
                    onDragStart={() => handleDragStart(columnId)}
                    onDragOver={(e) => handleDragOver(e, columnId)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 px-3 py-2 cursor-move hover:bg-slate-700 ${
                      draggedColumn === columnId ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isColumnVisible(columnId)}
                      onChange={() => toggleColumn(columnId)}
                      className="rounded border-slate-600 bg-slate-700 text-mint-500 focus:ring-mint-500"
                    />
                    <span className="text-sm text-slate-300 flex-1">{column.label}</span>
                    <span className="text-slate-600">⋮⋮</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              {orderedVisibleColumns.map(columnId => {
                const column = ALL_FUND_COLUMNS.find(c => c.id === columnId)
                if (!column) return null
                const align = getColumnAlign(columnId)
                return (
                  <th
                    key={columnId}
                    className={`px-3 py-2 ${align === 'left' ? 'text-left' : 'text-right'}`}
                  >
                    {column.label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {funds.map((fund) => (
              <tr
                key={fund.id}
                className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                onClick={() => navigate(`/fund/${fund.id}`)}
              >
                {orderedVisibleColumns.map(columnId => {
                  const align = getColumnAlign(columnId)
                  return (
                    <td
                      key={columnId}
                      className={`px-3 py-2 ${align === 'left' ? 'text-left' : 'text-right'}`}
                    >
                      {renderCell(fund, columnId)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
