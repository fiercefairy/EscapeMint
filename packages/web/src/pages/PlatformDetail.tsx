import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  fetchPlatformMetrics,
  createPlatform,
  addApyHistoryEntry,
  updateApyHistoryEntry,
  deleteApyHistoryEntry,
  fetchPlatformCashStatus,
  enableCashTracking,
  disableCashTracking,
  type PlatformMetrics,
  type ApyHistoryEntry,
  type PlatformCashStatus
} from '../api/platforms'
import { notifyFundsChanged } from '../api/funds'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ApyEntryModal } from '../components/ApyEntryModal'
import { ImportWizard } from '../components/ImportWizard'

export function PlatformDetail() {
  const { platformId } = useParams<{ platformId: string }>()
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingConfig, setEditingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({
    cashApy: 0,
    autoCalculateInterest: false
  })
  const [showApyModal, setShowApyModal] = useState(false)
  const [editingApyEntry, setEditingApyEntry] = useState<ApyHistoryEntry | undefined>()
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [cashStatus, setCashStatus] = useState<PlatformCashStatus | null>(null)
  const [showCashConfirm, setShowCashConfirm] = useState<'enable' | 'disable' | null>(null)
  const [cashActionLoading, setCashActionLoading] = useState(false)
  const [disableTargetFund, setDisableTargetFund] = useState<string>('')

  const loadData = async () => {
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
      setConfigForm({
        cashApy: (metricsResult.data.cashApy || 0) * 100,
        autoCalculateInterest: metricsResult.data.autoCalculateInterest
      })
    }

    if (cashResult.data) {
      setCashStatus(cashResult.data)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [platformId])

  const handleSaveConfig = async () => {
    if (!platformId || !metrics) return

    const result = await createPlatform({
      id: platformId,
      name: metrics.platformName,
      cash_apy: configForm.cashApy / 100,
      auto_calculate_interest: configForm.autoCalculateInterest
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Platform settings updated')
      setEditingConfig(false)
      loadData()
    }
  }

  const handleSaveApyEntry = async (entry: { date: string; rate: number; notes?: string }) => {
    if (!platformId) return

    const result = editingApyEntry
      ? await updateApyHistoryEntry(platformId, editingApyEntry.date, { rate: entry.rate, notes: entry.notes })
      : await addApyHistoryEntry(platformId, entry)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editingApyEntry ? 'APY entry updated' : 'APY entry added')
      setShowApyModal(false)
      setEditingApyEntry(undefined)
      loadData()
    }
  }

  const handleDeleteApyEntry = async (date: string) => {
    if (!platformId) return

    const result = await deleteApyHistoryEntry(platformId, date)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('APY entry deleted')
      loadData()
    }
  }

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

  const openAddApyModal = () => {
    setEditingApyEntry(undefined)
    setShowApyModal(true)
  }

  const openEditApyModal = (entry: ApyHistoryEntry) => {
    setEditingApyEntry(entry)
    setShowApyModal(true)
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

  const formatPercent = (value: number) => {
    return (value * 100).toFixed(2) + '%'
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
          <div className="flex items-center gap-2">
            <Link to="/" className="text-slate-400 hover:text-white text-sm">Dashboard</Link>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cash APY (%)</label>
              <input
                type="number"
                step="0.01"
                value={configForm.cashApy}
                onChange={(e) => setConfigForm({ ...configForm, cashApy: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-mint-500"
              />
              <p className="text-xs text-slate-500 mt-1">Interest rate for cash held on this platform</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Auto-Calculate Interest</label>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={configForm.autoCalculateInterest}
                  onChange={(e) => setConfigForm({ ...configForm, autoCalculateInterest: e.target.checked })}
                  className="rounded border-slate-600 bg-slate-700 text-mint-500"
                />
                <span className="text-sm text-white">Automatically calculate cash interest on entry save</span>
              </label>
            </div>
          </div>

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

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveConfig}
              className="px-4 py-2 bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors text-sm"
            >
              Save Settings
            </button>
          </div>
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
            <div className="text-xs text-slate-400 mb-1">Total Cash</div>
            <div className="text-lg font-bold text-blue-400">{formatCurrency(metrics.totalCash)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Gain/Loss</div>
            <div className={`text-lg font-bold ${metrics.totalGainUsd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(metrics.totalGainUsd)}
              <span className="text-sm ml-1">({formatPercent(metrics.totalGainPct)})</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Realized APY</div>
            <div className={`text-lg font-bold ${metrics.realizedAPY >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPercent(metrics.realizedAPY)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Cash APY</div>
            <div className="text-lg font-bold text-purple-400">
              {formatPercent(metrics.cashApy)}
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">Total Invested</div>
            <div className="text-sm text-white">{formatCurrency(metrics.totalStartInput)}</div>
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
        </div>
      </div>

      {/* APY Rate History */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">APY Rate History</h2>
          <button
            onClick={openAddApyModal}
            className="px-3 py-1.5 text-sm bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors"
          >
            Add Entry
          </button>
        </div>
        {metrics.apyHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">APY Rate</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...metrics.apyHistory].reverse().map((entry) => (
                  <tr key={entry.date} className="border-b border-slate-700/50">
                    <td className="px-3 py-2 text-slate-300">{entry.date}</td>
                    <td className="px-3 py-2 text-right text-purple-400 font-medium">
                      {formatPercent(entry.rate)}
                    </td>
                    <td className="px-3 py-2 text-slate-400 max-w-xs truncate">
                      {entry.notes || '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openEditApyModal(entry)}
                        className="text-slate-400 hover:text-white mr-2 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteApyEntry(entry.date)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">No APY history recorded yet. Add entries to track rate changes over time.</p>
        )}
      </div>

      {/* Funds List */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-4">Funds on this Platform</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="px-3 py-2 text-left">Fund</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Fund Size</th>
                <th className="px-3 py-2 text-right">Current Value</th>
                <th className="px-3 py-2 text-right">Gain/Loss</th>
                <th className="px-3 py-2 text-right">Entries</th>
              </tr>
            </thead>
            <tbody>
              {metrics.funds.map((fund) => (
                <tr
                  key={fund.id}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => window.location.href = `/fund/${fund.id}`}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium text-white uppercase">{fund.ticker}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      fund.status === 'active'
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-slate-500/20 text-slate-300'
                    }`}>
                      {fund.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-white">{formatCurrency(fund.fundSize)}</td>
                  <td className="px-3 py-2 text-right text-mint-400">{formatCurrency(fund.currentValue)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={fund.gainUsd >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {formatCurrency(fund.gainUsd)}
                      <span className="text-xs ml-1">({formatPercent(fund.gainPct)})</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-400">{fund.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* APY Entry Modal */}
      {showApyModal && (
        <ApyEntryModal
          onClose={() => {
            setShowApyModal(false)
            setEditingApyEntry(undefined)
          }}
          onSave={handleSaveApyEntry}
          existingEntry={editingApyEntry}
        />
      )}

      {/* Import Wizard */}
      {showImportWizard && (
        <ImportWizard
          onClose={() => setShowImportWizard(false)}
          onImported={loadData}
          platform={platformId}
        />
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
                  <li>• Cash: {formatCurrencyPrecise(cashStatus.currentCash ?? 0)}</li>
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
