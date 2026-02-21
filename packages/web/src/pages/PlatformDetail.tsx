import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  fetchPlatformMetrics,
  fetchPlatformCashStatus,
  enableCashTracking,
  disableCashTracking,
  updatePlatformConfig,
  type PlatformMetrics,
  type PlatformCashStatus
} from '../api/platforms'
import { notifyFundsChanged } from '../api/funds'

import { formatPercent } from '../utils/format'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FundsTable } from '../components/fundsTable'

// Lazy load the heavy ImportWizard component
const ImportWizard = lazy(() => import('../components/ImportWizard').then(m => ({ default: m.ImportWizard })))

export function PlatformDetail() {
  const { platformId } = useParams<{ platformId: string }>()
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState(false)
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [cashStatus, setCashStatus] = useState<PlatformCashStatus | null>(null)
  const [showCashConfirm, setShowCashConfirm] = useState<'enable' | 'disable' | null>(null)
  const [cashActionLoading, setCashActionLoading] = useState(false)
  const [disableTargetFund, setDisableTargetFund] = useState<string>('')

  const loadData = useCallback(async () => {
    if (!platformId) return
    setLoading(true)

    const [metricsResult, cashResult] = await Promise.all([
      fetchPlatformMetrics(platformId),
      fetchPlatformCashStatus(platformId)
    ])

    if (metricsResult.error) {
      toast.error(metricsResult.error)
    } else if (metricsResult.data) {
      setMetrics(metricsResult.data)
    }

    if (cashResult.data) {
      setCashStatus(cashResult.data)
    }

    setLoading(false)
  }, [platformId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleEnableCashTracking = async () => {
    if (!platformId) return
    setCashActionLoading(true)

    const result = await enableCashTracking(platformId)
    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      toast.success(`Cash tracking enabled. Created ${result.data.cashFundId} with ${formatCurrencyPrecise(result.data.migratedCash)} migrated. Backup saved: ${result.data.backupFile}`)
      notifyFundsChanged()
      loadData()
    }

    setCashActionLoading(false)
    setShowCashConfirm(null)
  }

  const handleDisableCashTracking = async (skipRestore = false) => {
    if (!platformId) return
    setCashActionLoading(true)

    const targetFund = skipRestore ? undefined : disableTargetFund || undefined
    const result = await disableCashTracking(platformId, targetFund)
    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      const { restoredTo, restoredCash, restoredMarginAvailable } = result.data
      if (restoredTo) {
        toast.success(`Cash tracking disabled. $${restoredCash.toFixed(2)} cash and $${restoredMarginAvailable.toFixed(2)} margin restored to ${restoredTo}`)
      } else {
        toast.success('Cash tracking disabled')
      }
      notifyFundsChanged()
      loadData()
    }

    setCashActionLoading(false)
    setShowCashConfirm(null)
    setDisableTargetFund('')
  }

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


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mint-400"></div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Platform not found or has no funds</p>
        <Link to="/" className="text-mint-400 hover:underline mt-2 inline-block">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2 text-sm">
            <Link to="/" className="text-slate-400 hover:text-white">Dashboard</Link>
            <span className="text-slate-600">/</span>
            <span className="text-white font-medium capitalize">{metrics.platformName}</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 capitalize">
            {metrics.platformName} Platform
          </h1>
          <p className="text-slate-400 text-sm">
            {metrics.activeFunds} active funds, {metrics.closedFunds} closed
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportWizard(true)}
            className="px-3 py-1.5 text-sm bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors"
          >
            Import
          </button>
          <button
            onClick={() => setEditingConfig(!editingConfig)}
            className="px-3 py-1.5 text-sm bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
          >
            {editingConfig ? 'Cancel' : 'Settings'}
          </button>
        </div>
      </div>

      {/* Platform Config Panel */}
      {editingConfig && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4">Platform Settings</h2>

          {/* Cash Tracking Section */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <h3 className="text-md font-semibold text-white mb-3">Platform Cash Pool</h3>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-sm text-slate-400">
                  {cashStatus?.enabled
                    ? 'Platform-level cash tracking is enabled. All funds share a common cash pool managed by the Cash fund.'
                    : 'Enable platform-level cash tracking to consolidate cash management across all funds into a single Cash fund.'}
                </p>
                {cashStatus?.enabled && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-slate-500">Cash Balance:</span>
                      <span className="ml-2 text-blue-400">{formatCurrencyPrecise(cashStatus.balance)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Interest Earned:</span>
                      <span className="ml-2 text-purple-400">{formatCurrencyPrecise(cashStatus.interestEarned)}</span>
                    </div>
                    {cashStatus.marginBorrowed > 0 && (
                      <div>
                        <span className="text-slate-500">Margin Borrowed:</span>
                        <span className="ml-2 text-orange-400">{formatCurrencyPrecise(cashStatus.marginBorrowed)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                {cashStatus?.enabled ? (
                  <button
                    onClick={() => setShowCashConfirm('disable')}
                    disabled={cashActionLoading}
                    className="px-3 py-1.5 text-sm bg-slate-600 text-white rounded hover:bg-slate-500 transition-colors disabled:opacity-50"
                  >
                    {cashActionLoading ? 'Processing...' : 'Disable'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowCashConfirm('enable')}
                    disabled={cashActionLoading}
                    className="px-3 py-1.5 text-sm bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors disabled:opacity-50"
                  >
                    {cashActionLoading ? 'Processing...' : 'Enable Cash Tracking'}
                  </button>
                )}
              </div>
            </div>
            {cashStatus?.enabled && cashStatus.cashFundId && (
              <div className="mt-3">
                <Link
                  to={`/fund/${cashStatus.cashFundId}`}
                  className="text-sm text-mint-400 hover:underline"
                >
                  View Cash Fund →
                </Link>
              </div>
            )}
          </div>

          {/* Auto Sync Cash Section */}
          {cashStatus?.enabled && (
            <div className="mt-6 pt-4 border-t border-slate-700">
              <h3 className="text-md font-semibold text-white mb-3">Auto-Sync Trades to Cash</h3>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-400">
                    {cashStatus.autoSyncCash
                      ? 'When you record a BUY/SELL/dividend on a trading fund, the cash fund is automatically updated.'
                      : 'Trades on trading funds do not automatically update the cash fund. You must manually record cash movements.'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Use this for platforms like Robinhood where cash is shared across all trading.
                  </p>
                </div>
                <div>
                  <button
                    onClick={async () => {
                      const newValue = !cashStatus.autoSyncCash
                      const result = await updatePlatformConfig(platformId!, { auto_sync_cash: newValue })
                      if (result.error) {
                        toast.error(result.error)
                      } else {
                        toast.success(`Auto-sync ${newValue ? 'enabled' : 'disabled'}`)
                        loadData()
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      cashStatus.autoSyncCash
                        ? 'bg-mint-600 text-white hover:bg-mint-700'
                        : 'bg-slate-600 text-white hover:bg-slate-500'
                    }`}
                  >
                    {cashStatus.autoSyncCash ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* P&L Panel */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">Platform P&L</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Fund Size</div>
            <div className="text-lg font-bold text-white">{formatCurrency(metrics.totalFundSize)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Current Value</div>
            <div className="text-lg font-bold text-mint-400">{formatCurrency(metrics.totalValue)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Invested</div>
            <div className="text-lg font-bold text-white">{formatCurrency(metrics.totalStartInput)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Unrealized</div>
            <div className={`text-lg font-bold ${metrics.totalUnrealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrencyPrecise(metrics.totalUnrealized)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Realized</div>
            <div className={`text-lg font-bold ${metrics.totalRealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrencyPrecise(metrics.totalRealized)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Liquid P&L</div>
            <div className={`text-lg font-bold ${metrics.totalGainUsd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(metrics.totalGainUsd)}
              <span className="text-sm ml-1">({formatPercent(metrics.totalGainPct)})</span>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Cash</div>
            <div className="text-sm text-blue-400">{formatCurrency(metrics.totalCash)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Dividends</div>
            <div className="text-sm text-green-400">{formatCurrencyPrecise(metrics.totalDividends)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Expenses</div>
            <div className="text-sm text-red-400">{formatCurrencyPrecise(metrics.totalExpenses)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Cash Interest</div>
            <div className="text-sm text-purple-400">{formatCurrencyPrecise(metrics.totalCashInterest)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Active / Closed</div>
            <div className="text-sm text-slate-300">{metrics.activeFunds} / {metrics.closedFunds}</div>
          </div>
        </div>
      </div>

      {/* Funds Table */}
      <FundsTable
        platformId={platformId ?? ''}
        funds={metrics.funds}
        savedColumnOrder={metrics.fundsColumnOrder}
        savedVisibleColumns={metrics.fundsVisibleColumns}
        onReload={loadData}
      />

      {/* Import Wizard - lazy loaded */}
      {showImportWizard && (
        <Suspense fallback={<div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-50"><div className="animate-spin h-8 w-8 border-2 border-mint-500 border-t-transparent rounded-full" /></div>}>
          <ImportWizard
            onClose={() => setShowImportWizard(false)}
            onImported={loadData}
            platform={platformId}
          />
        </Suspense>
      )}

      {/* Cash Tracking Confirmation Dialogs */}
      {showCashConfirm === 'enable' && (
        <ConfirmDialog
          title="Enable Platform Cash Tracking"
          message={`This will:\n\n1. Create an automatic backup of all fund data\n2. Create a "${platformId}-cash" fund to manage the shared cash pool\n3. Consolidate cash from all existing funds (${formatCurrencyPrecise(metrics?.totalCash ?? 0)})\n4. Disable individual cash tracking on trading funds\n\nThis action can be reversed but may require manual adjustment.`}
          confirmLabel="Enable Cash Tracking"
          cancelLabel="Cancel"
          onConfirm={handleEnableCashTracking}
          onCancel={() => setShowCashConfirm(null)}
        />
      )}

      {showCashConfirm === 'disable' && metrics && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Disable Platform Cash Tracking</h2>

            <p className="text-slate-300 text-sm mb-4">
              This will restore cash and margin tracking to a single trading fund and delete the cash fund.
            </p>

            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">
                Select fund to restore cash/margin into:
              </label>
              <select
                value={disableTargetFund}
                onChange={(e) => setDisableTargetFund(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-red-500"
              >
                <option value="">Select a fund...</option>
                {metrics.funds
                  .filter(f => f.ticker.toLowerCase() !== 'cash')
                  .map(fund => (
                    <option key={fund.id} value={fund.id}>
                      {fund.ticker.toUpperCase()} - {formatCurrencyPrecise(fund.currentValue)}
                    </option>
                  ))}
              </select>
            </div>

            {cashStatus && (
              <div className="mb-4 p-3 bg-slate-700/50 rounded-lg text-sm">
                <p className="text-slate-300">Will restore:</p>
                <ul className="text-slate-400 mt-1 space-y-1">
                  <li>• Cash: {formatCurrencyPrecise(cashStatus.balance ?? 0)}</li>
                  <li>• Margin Available: {formatCurrencyPrecise(cashStatus.marginAvailable ?? 0)}</li>
                  <li>• Margin Borrowed: {formatCurrencyPrecise(cashStatus.marginBorrowed ?? 0)}</li>
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCashConfirm(null)
                  setDisableTargetFund('')
                }}
                className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDisableCashTracking(true)}
                disabled={cashActionLoading}
                className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors disabled:opacity-50"
                title="Just disable without restoring data"
              >
                {cashActionLoading ? 'Disabling...' : 'Skip Restore'}
              </button>
              <button
                onClick={() => handleDisableCashTracking(false)}
                disabled={!disableTargetFund || cashActionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {cashActionLoading ? 'Disabling...' : 'Restore & Disable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
