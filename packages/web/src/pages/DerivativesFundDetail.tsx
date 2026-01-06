/**
 * Derivatives Fund Detail Page
 * Main page for viewing derivatives fund with tabs for position, funding, and history.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { fetchFund, type FundDetail } from '../api/funds'
import { listApiKeys, fetchFills, type ApiKeyInfo, type Fill } from '../api/derivatives'
import { DerivativesDashboard } from '../components/DerivativesDashboard'
import { FundingTracker } from '../components/FundingTracker'
import { ApiKeyModal } from '../components/ApiKeyModal'
import { CoinbaseScrapeButton } from '../components/CoinbaseScrapeButton'

type TabType = 'position' | 'funding' | 'history'

export function DerivativesFundDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()

  // Determine active tab from URL
  const pathParts = location.pathname.split('/')
  const lastPart = pathParts[pathParts.length - 1]
  const initialTab: TabType = lastPart === 'funding' ? 'funding'
    : lastPart === 'history' ? 'history'
    : 'position'

  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [fund, setFund] = useState<FundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [fills, setFills] = useState<Fill[]>([])
  const [loadingFills, setLoadingFills] = useState(false)

  // Load fund data
  const loadFund = useCallback(async () => {
    if (!id) return

    setLoading(true)
    const result = await fetchFund(id)

    if (result.data) {
      setFund(result.data)
      // Use configured API key if set
      if (result.data.config.api_key_name) {
        setSelectedKey(result.data.config.api_key_name)
      }
    } else if (result.error) {
      toast.error(result.error)
    }
    setLoading(false)
  }, [id])

  // Load API keys
  const loadApiKeys = useCallback(async () => {
    const result = await listApiKeys()
    if (result.data) {
      setApiKeys(result.data.keys)
      // Auto-select first key if none selected
      if (!selectedKey && result.data.keys.length > 0) {
        setSelectedKey(result.data.keys[0]?.name ?? '')
      }
    }
  }, [selectedKey])

  useEffect(() => {
    loadFund()
    loadApiKeys()
  }, [loadFund, loadApiKeys])

  // Update tab from URL changes
  useEffect(() => {
    const pathParts = location.pathname.split('/')
    const lastPart = pathParts[pathParts.length - 1]
    const newTab: TabType = lastPart === 'funding' ? 'funding'
      : lastPart === 'history' ? 'history'
      : 'position'
    setActiveTab(newTab)
  }, [location.pathname])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const basePath = `/derivatives/${id}`
    if (tab === 'position') {
      navigate(basePath)
    } else {
      navigate(`${basePath}/${tab}`)
    }
  }

  const handleKeySelected = (keyName: string) => {
    setSelectedKey(keyName)
    setShowApiKeyModal(false)
  }

  // Get product ID from fund config
  const productId = fund?.config.product_id ?? 'BIP-20DEC30-CDE'

  // Load fills from Coinbase API
  const loadFills = useCallback(async () => {
    if (!selectedKey || !productId) return

    setLoadingFills(true)
    const result = await fetchFills(selectedKey, productId)
    if (result.data) {
      setFills(result.data.fills)
    } else if (result.error) {
      toast.error(result.error)
    }
    setLoadingFills(false)
  }, [selectedKey, productId])

  // Sync data from Coinbase API
  const handleSync = async () => {
    if (!selectedKey) {
      toast.error('Please select an API key first')
      return
    }

    setSyncing(true)
    toast.info('Fetching data from Coinbase API...')

    // Fetch fills
    const fillsResult = await fetchFills(selectedKey, productId)
    if (fillsResult.error) {
      toast.error(`Failed to fetch fills: ${fillsResult.error}`)
      setSyncing(false)
      return
    }

    const fetchedFills = fillsResult.data?.fills ?? []
    setFills(fetchedFills)

    toast.success(`Fetched ${fetchedFills.length} fills from Coinbase`)
    setSyncing(false)
  }

  // Load fills when switching to history tab
  useEffect(() => {
    if (activeTab === 'history' && selectedKey && fills.length === 0) {
      loadFills()
    }
  }, [activeTab, selectedKey, fills.length, loadFills])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-slate-800 rounded-lg p-8 text-center text-slate-400">
          Loading fund...
        </div>
      </div>
    )
  }

  if (!fund) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-slate-800 rounded-lg p-8 text-center">
          <p className="text-slate-400 mb-4">Fund not found</p>
          <Link to="/" className="text-orange-400 hover:text-orange-300">
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white uppercase">{fund.id.replace(/-/g, ' ')}</h1>
            <p className="text-sm text-slate-400">
              {productId} • Derivatives Fund
            </p>
          </div>
        </div>

        {/* Scrape and Sync Actions */}
        <div className="flex items-center gap-3">
          <CoinbaseScrapeButton
            fundId={id}
            variant="primary"
          />
          <div className="flex items-center gap-2">
            {selectedKey ? (
              <span className="px-2 py-1 text-xs bg-green-900/50 text-green-400 rounded">
                {selectedKey}
              </span>
            ) : (
              <span className="px-2 py-1 text-xs bg-yellow-900/50 text-yellow-400 rounded">
                No API Key
              </span>
            )}
          </div>
          {selectedKey && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync from API'}
            </button>
          )}
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            {apiKeys.length === 0 ? 'Add API Key' : 'Manage Keys'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-slate-800 rounded-lg border border-slate-700">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => handleTabChange('position')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'position'
                ? 'text-orange-400 border-b-2 border-orange-400 -mb-px'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Position
          </button>
          <button
            onClick={() => handleTabChange('funding')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'funding'
                ? 'text-orange-400 border-b-2 border-orange-400 -mb-px'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Funding & Rewards
          </button>
          <button
            onClick={() => handleTabChange('history')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-orange-400 border-b-2 border-orange-400 -mb-px'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Trade History
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4">
          {activeTab === 'position' && (
            <DerivativesDashboard keyName={selectedKey} productId={productId} />
          )}

          {activeTab === 'funding' && (
            <FundingTracker keyName={selectedKey} productId={productId} />
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Trade History</h3>
                <button
                  onClick={loadFills}
                  disabled={loadingFills || !selectedKey}
                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors disabled:opacity-50"
                >
                  {loadingFills ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {!selectedKey ? (
                <div className="text-center py-8 text-slate-400">
                  <p>Select an API key to view trade history</p>
                </div>
              ) : loadingFills ? (
                <div className="text-center py-8 text-slate-400">Loading fills...</div>
              ) : fills.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>No fills found. Click "Sync from API" to fetch data.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400 text-xs">
                        <th className="text-left py-2 px-3">Time</th>
                        <th className="text-left py-2 px-3">Side</th>
                        <th className="text-right py-2 px-3">Contracts</th>
                        <th className="text-right py-2 px-3">Price</th>
                        <th className="text-right py-2 px-3">Value</th>
                        <th className="text-right py-2 px-3">Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fills.map((fill) => (
                        <tr key={fill.tradeId} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-2 px-3 text-slate-300">
                            {new Date(fill.tradeTime).toLocaleString()}
                          </td>
                          <td className="py-2 px-3">
                            <span className={fill.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                              {fill.side}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-white">{fill.size}</td>
                          <td className="py-2 px-3 text-right text-white">
                            ${Number(fill.price).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right text-white">
                            ${(Number(fill.size) * Number(fill.price) * 0.01).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400">
                            ${Number(fill.commission).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-slate-500 mt-2">
                    Showing {fills.length} fills
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fund Config Info */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-white mb-3">Fund Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Product ID</p>
            <p className="text-white font-mono">{productId}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Initial Margin</p>
            <p className="text-white">{((fund.config.initial_margin_rate ?? 0.20) * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Maintenance Margin</p>
            <p className="text-white">{((fund.config.maintenance_margin_rate ?? 0.05) * 100).toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Contract Multiplier</p>
            <p className="text-white">{fund.config.contract_multiplier ?? 0.01} BTC</p>
          </div>
        </div>
      </div>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onKeySelected={handleKeySelected}
        selectedKey={selectedKey}
      />
    </div>
  )
}
