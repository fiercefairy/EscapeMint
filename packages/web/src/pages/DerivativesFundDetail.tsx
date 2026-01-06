/**
 * Derivatives Fund Detail Page
 * Main page for viewing derivatives fund with tabs for position, funding, and history.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { fetchFund, type FundDetail } from '../api/funds'
import { listApiKeys, type ApiKeyInfo } from '../api/derivatives'
import { DerivativesDashboard } from '../components/DerivativesDashboard'
import { FundingTracker } from '../components/FundingTracker'
import { ApiKeyModal } from '../components/ApiKeyModal'

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

        {/* API Key Selector */}
        <div className="flex items-center gap-3">
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
            <div className="text-center py-8 text-slate-400">
              <p className="mb-2">Trade history view coming soon.</p>
              <p className="text-sm">
                Use the API at <code className="bg-slate-700 px-2 py-1 rounded">/api/v1/derivatives/fills/{productId}</code> to view fills.
              </p>
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
