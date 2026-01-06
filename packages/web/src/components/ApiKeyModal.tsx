/**
 * API Key Management Modal for Coinbase derivatives.
 * Allows adding, testing, and removing API keys stored in macOS Keychain.
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { listApiKeys, storeApiKey, deleteApiKey, testApiKey, type ApiKeyInfo } from '../api/derivatives'
import { ConfirmDialog } from './ConfirmDialog'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  onKeySelected?: (keyName: string) => void
  selectedKey?: string
}

export function ApiKeyModal({ isOpen, onClose, onKeySelected, selectedKey }: ApiKeyModalProps) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Add form state
  const [newKeyName, setNewKeyName] = useState('')
  const [newApiKey, setNewApiKey] = useState('')
  const [newApiSecret, setNewApiSecret] = useState('')
  const [saving, setSaving] = useState(false)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    const result = await listApiKeys()
    if (result.data) {
      setKeys(result.data.keys)
    } else if (result.error) {
      toast.error(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadKeys()
    }
  }, [isOpen, loadKeys])

  const handleAddKey = async () => {
    if (!newKeyName.trim() || !newApiKey.trim() || !newApiSecret.trim()) {
      toast.error('All fields are required')
      return
    }

    setSaving(true)
    const result = await storeApiKey(newKeyName.trim(), newApiKey.trim(), newApiSecret.trim())

    if (result.data?.success) {
      toast.success(result.data.message)
      setShowAddForm(false)
      setNewKeyName('')
      setNewApiKey('')
      setNewApiSecret('')
      await loadKeys()

      // Auto-select newly added key
      if (onKeySelected) {
        onKeySelected(newKeyName.trim())
      }
    } else {
      toast.error(result.error ?? 'Failed to store API key')
    }
    setSaving(false)
  }

  const handleTestKey = async (name: string) => {
    setTesting(name)
    const result = await testApiKey(name)

    if (result.data?.valid) {
      toast.success(`API key "${name}" is valid`)
    } else {
      toast.error(result.data?.error ?? result.error ?? 'Key test failed')
    }
    setTesting(null)
  }

  const handleDeleteKey = async (name: string) => {
    const result = await deleteApiKey(name)

    if (result.data?.success) {
      toast.success(result.data.message)
      await loadKeys()

      // If deleted key was selected, clear selection
      if (selectedKey === name && onKeySelected) {
        onKeySelected('')
      }
    } else {
      toast.error(result.error ?? 'Failed to delete API key')
    }
    setDeleteConfirm(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Coinbase API Keys</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : keys.length === 0 && !showAddForm ? (
            <div className="text-center py-8 text-slate-400">
              <p className="mb-4">No API keys stored yet.</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
              >
                Add Your First API Key
              </button>
            </div>
          ) : (
            <>
              {/* Existing keys list */}
              {keys.map((key) => (
                <div
                  key={key.name}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    selectedKey === key.name
                      ? 'bg-orange-900/20 border-orange-600'
                      : 'bg-slate-700/50 border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full bg-orange-600/20 flex items-center justify-center cursor-pointer hover:bg-orange-600/40 transition-colors"
                      onClick={() => onKeySelected?.(key.name)}
                      title="Select this key"
                    >
                      <span className="text-orange-400 font-bold text-sm">
                        {key.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-white font-medium">{key.name}</p>
                      <p className="text-xs text-slate-400">Stored in Keychain</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedKey === key.name && (
                      <span className="px-2 py-1 text-xs bg-orange-600 text-white rounded">
                        Active
                      </span>
                    )}
                    <button
                      onClick={() => handleTestKey(key.name)}
                      disabled={testing === key.name}
                      className="px-3 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors disabled:opacity-50"
                    >
                      {testing === key.name ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(key.name)}
                      className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-900 text-red-400 hover:text-red-300 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {/* Add new key form */}
              {showAddForm ? (
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600 space-y-3">
                  <h3 className="text-sm font-medium text-white mb-3">Add New API Key</h3>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Key Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., coinbase-main"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">API Key</label>
                    <input
                      type="text"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder="organizations/xxx/apiKeys/xxx"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm font-mono focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">API Secret (ES256 Private Key)</label>
                    <textarea
                      value={newApiSecret}
                      onChange={(e) => setNewApiSecret(e.target.value)}
                      placeholder="-----BEGIN EC PRIVATE KEY-----&#10;...&#10;-----END EC PRIVATE KEY-----"
                      rows={4}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm font-mono focus:border-orange-500 focus:outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleAddKey}
                      disabled={saving}
                      className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Key'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false)
                        setNewKeyName('')
                        setNewApiKey('')
                        setNewApiSecret('')
                      }}
                      className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mt-2">
                    Keys are stored securely in macOS Keychain. Only read-only API access is used.
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full px-4 py-2 border-2 border-dashed border-slate-600 hover:border-orange-500 text-slate-400 hover:text-orange-400 rounded-lg transition-colors"
                >
                  + Add API Key
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
          API keys are used for read-only access to Coinbase perpetual futures data.
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete API Key"
          message={`Are you sure you want to delete the API key "${deleteConfirm}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => handleDeleteKey(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
