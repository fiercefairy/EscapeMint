/**
 * Funding Tracker Component
 * Shows funding payments history, USDC rewards, and cumulative totals.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  fetchCoinbaseArchive,
  fetchFunding,
  addManualFunding,
  addManualReward,
  deleteFundingEntry,
  deleteRewardEntry,
  type CoinbaseArchive,
  type CoinbaseFundingEntry,
  type CoinbaseRewardEntry,
  type FundingPayment
} from '../api/derivatives'

interface FundingTrackerProps {
  keyName?: string
  productId: string
}

type TabType = 'funding' | 'rewards' | 'api'

export function FundingTracker({ keyName, productId }: FundingTrackerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('funding')
  const [archive, setArchive] = useState<CoinbaseArchive | null>(null)
  const [apiFunding, setApiFunding] = useState<FundingPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  // Add form state
  const [newDate, setNewDate] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newType, setNewType] = useState<'usdc_interest' | 'staking' | 'other'>('usdc_interest')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)

    // Load local archive
    const archiveResult = await fetchCoinbaseArchive()
    if (archiveResult.data) {
      setArchive(archiveResult.data)
    }

    // Load API funding if key available
    if (keyName) {
      const fundingResult = await fetchFunding(keyName, productId)
      if (fundingResult.data) {
        setApiFunding(fundingResult.data.payments)
      }
    }

    setLoading(false)
  }, [keyName, productId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAddEntry = async () => {
    if (!newDate || !newAmount) {
      toast.error('Date and amount are required')
      return
    }

    setSaving(true)
    const amount = parseFloat(newAmount)

    if (activeTab === 'funding') {
      const result = await addManualFunding(newDate, amount, productId)
      if (result.data?.success) {
        toast.success(result.data.message)
        await loadData()
        setShowAddForm(false)
        setNewDate('')
        setNewAmount('')
      } else {
        toast.error(result.error ?? 'Failed to add funding entry')
      }
    } else if (activeTab === 'rewards') {
      const result = await addManualReward(newDate, amount, newType)
      if (result.data?.success) {
        toast.success(result.data.message)
        await loadData()
        setShowAddForm(false)
        setNewDate('')
        setNewAmount('')
      } else {
        toast.error(result.error ?? 'Failed to add reward entry')
      }
    }

    setSaving(false)
  }

  const handleDeleteFunding = async (entry: CoinbaseFundingEntry) => {
    const result = await deleteFundingEntry(entry.date, entry.amount)
    if (result.data?.success) {
      toast.success(result.data.message)
      await loadData()
    } else {
      toast.error(result.error ?? 'Failed to delete entry')
    }
  }

  const handleDeleteReward = async (entry: CoinbaseRewardEntry) => {
    const result = await deleteRewardEntry(entry.date, entry.amount, entry.type)
    if (result.data?.success) {
      toast.success(result.data.message)
      await loadData()
    } else {
      toast.error(result.error ?? 'Failed to delete entry')
    }
  }

  const formatCurrency = (value: number) => {
    const prefix = value >= 0 ? '+' : ''
    return prefix + new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {archive && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <p className="text-xs text-slate-400">Funding Received</p>
            <p className="text-lg font-bold text-green-400">
              {formatCurrency(archive.summary.totalFundingProfit)}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <p className="text-xs text-slate-400">Funding Paid</p>
            <p className="text-lg font-bold text-red-400">
              {formatCurrency(-archive.summary.totalFundingLoss)}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <p className="text-xs text-slate-400">Net Funding</p>
            <p className={`text-lg font-bold ${archive.summary.netFunding >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(archive.summary.netFunding)}
            </p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <p className="text-xs text-slate-400">USDC Rewards</p>
            <p className="text-lg font-bold text-blue-400">
              {formatCurrency(archive.summary.totalRewards)}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => { setActiveTab('funding'); setShowAddForm(false) }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'funding'
                ? 'text-orange-400 border-b-2 border-orange-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Funding ({archive?.summary.fundingPaymentCount ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab('rewards'); setShowAddForm(false) }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'rewards'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Rewards ({archive?.summary.rewardCount ?? 0})
          </button>
          {keyName && (
            <button
              onClick={() => { setActiveTab('api'); setShowAddForm(false) }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'api'
                  ? 'text-green-400 border-b-2 border-green-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              API Data ({apiFunding.length})
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading...</div>
          ) : (
            <>
              {/* Add Entry Button */}
              {(activeTab === 'funding' || activeTab === 'rewards') && (
                <div className="mb-4">
                  {showAddForm ? (
                    <div className="bg-slate-700/50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Date</label>
                          <input
                            type="date"
                            value={newDate}
                            onChange={(e) => setNewDate(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Amount {activeTab === 'funding' && '(negative = paid)'}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={newAmount}
                            onChange={(e) => setNewAmount(e.target.value)}
                            placeholder={activeTab === 'funding' ? '-25.50' : '100.00'}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {activeTab === 'rewards' && (
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Type</label>
                          <select
                            value={newType}
                            onChange={(e) => setNewType(e.target.value as typeof newType)}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-orange-500 focus:outline-none"
                          >
                            <option value="usdc_interest">USDC Interest</option>
                            <option value="staking">Staking</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={handleAddEntry}
                          disabled={saving}
                          className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Add Entry'}
                        </button>
                        <button
                          onClick={() => { setShowAddForm(false); setNewDate(''); setNewAmount('') }}
                          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="w-full px-4 py-2 border-2 border-dashed border-slate-600 hover:border-orange-500 text-slate-400 hover:text-orange-400 rounded-lg text-sm transition-colors"
                    >
                      + Add {activeTab === 'funding' ? 'Funding Entry' : 'Reward Entry'}
                    </button>
                  )}
                </div>
              )}

              {/* Funding List */}
              {activeTab === 'funding' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {archive?.fundingPayments.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No funding entries yet.</p>
                  ) : (
                    archive?.fundingPayments.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
                      >
                        <div>
                          <p className="text-sm text-white">{formatDate(entry.date)}</p>
                          {entry.rate && (
                            <p className="text-xs text-slate-500">Rate: {entry.rate}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono font-medium ${
                            entry.amount >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {formatCurrency(entry.amount)}
                          </span>
                          <button
                            onClick={() => handleDeleteFunding(entry)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Rewards List */}
              {activeTab === 'rewards' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {archive?.rewards.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No reward entries yet.</p>
                  ) : (
                    archive?.rewards.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
                      >
                        <div>
                          <p className="text-sm text-white">{formatDate(entry.date)}</p>
                          <p className="text-xs text-slate-500 capitalize">{entry.type.replace('_', ' ')}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-medium text-blue-400">
                            {formatCurrency(entry.amount)}
                          </span>
                          <button
                            onClick={() => handleDeleteReward(entry)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* API Funding List */}
              {activeTab === 'api' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {apiFunding.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No API funding data available.</p>
                  ) : (
                    apiFunding.map((payment, index) => (
                      <div
                        key={`${payment.time}-${index}`}
                        className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
                      >
                        <div>
                          <p className="text-sm text-white">
                            {new Date(payment.time).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">Rate: {payment.rate}</p>
                        </div>
                        <span className={`font-mono font-medium ${
                          parseFloat(payment.amount) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {formatCurrency(parseFloat(payment.amount))}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
