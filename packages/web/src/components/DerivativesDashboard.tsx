/**
 * Derivatives Dashboard Component
 * Shows position summary: contracts, entry price, liquidation price, P&L, margin.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  fetchPositions,
  fetchPortfolio,
  fetchPrice,
  type Position,
  type PortfolioSummary
} from '../api/derivatives'

interface DerivativesDashboardProps {
  keyName: string
  productId: string
}

export function DerivativesDashboard({ keyName, productId }: DerivativesDashboardProps) {
  const [positions, setPositions] = useState<Position[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadData = useCallback(async () => {
    if (!keyName) return

    setLoading(true)

    const [posResult, portResult, priceResult] = await Promise.all([
      fetchPositions(keyName),
      fetchPortfolio(keyName),
      fetchPrice(keyName, productId)
    ])

    if (posResult.data) {
      setPositions(posResult.data.positions)
    } else if (posResult.error) {
      toast.error(`Failed to fetch positions: ${posResult.error}`)
    }

    if (portResult.data) {
      setPortfolio(portResult.data)
    }

    if (priceResult.data) {
      setCurrentPrice(priceResult.data.price)
    }

    setLastUpdated(new Date())
    setLoading(false)
  }, [keyName, productId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatBtc = (value: number) => {
    return value.toFixed(6) + ' BTC'
  }

  const formatPercent = (value: number) => {
    return (value * 100).toFixed(2) + '%'
  }

  // Find position for our product
  const position = positions.find(p => p.productId === productId || p.productId.startsWith('BIP'))

  if (!keyName) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <p className="text-slate-400 text-center">
          No API key configured. Add an API key to view position data.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Portfolio Summary */}
      {portfolio && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">Portfolio Summary</h3>
            <button
              onClick={loadData}
              disabled={loading}
              className="text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400">Total Equity</p>
              <p className="text-lg font-bold text-white">{formatCurrency(portfolio.totalEquity)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Margin Available</p>
              <p className="text-lg font-semibold text-green-400">{formatCurrency(portfolio.marginAvailable)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Margin Used</p>
              <p className="text-lg font-semibold text-orange-400">{formatCurrency(portfolio.marginUsed)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Maintenance Margin</p>
              <p className="text-lg font-semibold text-slate-300">{formatCurrency(portfolio.maintenanceMargin)}</p>
            </div>
          </div>

          {/* Margin utilization bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Margin Utilization</span>
              <span>{formatPercent(portfolio.marginUsed / portfolio.totalEquity)}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (portfolio.marginUsed / portfolio.totalEquity) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Position Details */}
      {position ? (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">
              {position.productId}
              <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                position.side === 'LONG' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
              }`}>
                {position.side}
              </span>
            </h3>
            {currentPrice && (
              <span className="text-sm text-slate-400">
                Current: <span className="text-white font-medium">{formatCurrency(currentPrice)}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400">Contracts</p>
              <p className="text-lg font-bold text-white">{position.metrics.contracts.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{formatBtc(position.metrics.btcSize)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Entry Price</p>
              <p className="text-lg font-semibold text-white">{formatCurrency(position.metrics.entryPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Notional Value</p>
              <p className="text-lg font-semibold text-slate-300">{formatCurrency(position.metrics.notionalValue)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Unrealized P&L</p>
              <p className={`text-lg font-bold ${
                position.metrics.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {position.metrics.unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(position.metrics.unrealizedPnl)}
              </p>
            </div>
          </div>

          {/* P&L breakdown */}
          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Aggregated P&L</span>
              <span className={parseFloat(position.aggregatedPnl) >= 0 ? 'text-green-400' : 'text-red-400'}>
                {parseFloat(position.aggregatedPnl) >= 0 ? '+' : ''}{formatCurrency(parseFloat(position.aggregatedPnl))}
              </span>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <p className="text-slate-400 text-center">Loading position data...</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <p className="text-slate-400 text-center">No open positions found.</p>
        </div>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-xs text-slate-500 text-right">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
