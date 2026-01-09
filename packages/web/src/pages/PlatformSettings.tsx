import { useParams, Link } from 'react-router-dom'
import { ApiKeyModal } from '../components/ApiKeyModal'

export function PlatformSettings() {
  const { platformId } = useParams<{ platformId: string }>()

  const isCoinbase = platformId?.toLowerCase() === 'coinbase'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to={`/platform/${platformId}`}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white capitalize">{platformId} Settings</h1>
          <p className="text-sm text-slate-400">Configure platform-specific settings</p>
        </div>
      </div>

      {isCoinbase ? (
        <div className="space-y-6">
          {/* Coinbase API Keys Section */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">API Keys</h2>
            <p className="text-sm text-slate-400 mb-4">
              Manage Coinbase Advanced Trade API keys for automatic data sync.
              Keys are stored securely in your macOS Keychain.
            </p>
            <ApiKeyModal
              isOpen={true}
              onClose={() => {}}
              embedded={true}
            />
          </div>

          {/* API Info */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
            <h3 className="text-sm font-medium text-white mb-2">API Access</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• API keys are used for <span className="text-green-400">read-only</span> access to your account</li>
              <li>• No trades will ever be executed through this application</li>
              <li>• Data fetched: positions, fills (trades), funding payments</li>
              <li>• Keys are stored in macOS Keychain, never in files or logs</li>
            </ul>
          </div>

          {/* How to get API keys */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
            <h3 className="text-sm font-medium text-white mb-2">How to Create API Keys</h3>
            <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
              <li>Go to <a href="https://www.coinbase.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:underline">Coinbase API Settings</a></li>
              <li>Click "New API Key"</li>
              <li>Select "CDP API Key" type</li>
              <li>Give it a nickname (e.g., "EscapeMint")</li>
              <li>For permissions, select only "View" access</li>
              <li>Copy the API Key name and Private Key</li>
              <li>Paste them in the form above</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 text-center">
          <p className="text-slate-400">No special settings available for {platformId}</p>
        </div>
      )}
    </div>
  )
}
