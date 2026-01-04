import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { fetchPlatforms, createPlatform, deletePlatform, renamePlatform, type Platform } from '../api/platforms'

export function Platforms() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newPlatform, setNewPlatform] = useState({ id: '', name: '' })
  const [editForm, setEditForm] = useState({ newId: '', newName: '', cash_apy: '', auto_calculate_interest: false })

  const loadPlatforms = async () => {
    setLoading(true)
    const result = await fetchPlatforms()
    if (result.error) {
      toast.error(result.error)
    } else {
      setPlatforms(result.data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadPlatforms()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlatform.id.trim() || !newPlatform.name.trim()) return

    const result = await createPlatform({
      id: newPlatform.id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name: newPlatform.name
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Platform created')
      setNewPlatform({ id: '', name: '' })
      setShowAddForm(false)
      loadPlatforms()
    }
  }

  const handleDelete = async (id: string) => {
    const result = await deletePlatform(id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Platform deleted')
      loadPlatforms()
    }
  }

  const handleStartEdit = (platform: Platform) => {
    setEditingId(platform.id)
    setEditForm({
      newId: platform.id,
      newName: platform.name,
      cash_apy: platform.cash_apy ? (platform.cash_apy * 100).toString() : '',
      auto_calculate_interest: platform.auto_calculate_interest ?? false
    })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm({ newId: '', newName: '', cash_apy: '', auto_calculate_interest: false })
  }

  const handleSaveEdit = async (oldId: string) => {
    if (!editForm.newId.trim() || !editForm.newName.trim()) return

    // If ID changed, use rename API
    if (oldId !== editForm.newId.toLowerCase().replace(/[^a-z0-9-]/g, '-')) {
      const result = await renamePlatform(oldId, editForm.newId, editForm.newName)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const msg = result.data?.renamed
        ? `Platform renamed (${result.data.renamed} fund(s) updated)`
        : 'Platform updated'
      toast.success(msg)
    }

    // Update platform settings (name, cash_apy, auto_calculate_interest)
    const platformUpdate: Parameters<typeof createPlatform>[0] = {
      id: editForm.newId,
      name: editForm.newName,
      auto_calculate_interest: editForm.auto_calculate_interest
    }
    if (editForm.cash_apy) {
      platformUpdate.cash_apy = parseFloat(editForm.cash_apy) / 100
    }
    const result = await createPlatform(platformUpdate)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Platform settings saved')
      setEditingId(null)
      loadPlatforms()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Platforms</h1>
          <p className="text-sm text-slate-400">Manage trading platforms and brokerages</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 text-sm bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors"
        >
          {showAddForm ? 'Cancel' : 'Add Platform'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">ID (lowercase)</label>
              <input
                type="text"
                value={newPlatform.id}
                onChange={e => setNewPlatform({ ...newPlatform, id: e.target.value })}
                placeholder="e.g., cryptocom"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Display Name</label>
              <input
                type="text"
                value={newPlatform.name}
                onChange={e => setNewPlatform({ ...newPlatform, name: e.target.value })}
                placeholder="e.g., Crypto.com"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint-500"
                required
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors"
            >
              Create Platform
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-mint-400"></div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Display Name</th>
                <th className="px-4 py-3 text-right">Cash APY</th>
                <th className="px-4 py-3 text-center">Auto Interest</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {platforms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No platforms yet. Add one or create a fund to get started.
                  </td>
                </tr>
              ) : (
                platforms.map(platform => (
                  <tr key={platform.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    {editingId === platform.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editForm.newId}
                            onChange={e => setEditForm({ ...editForm, newId: e.target.value })}
                            className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-mint-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editForm.newName}
                            onChange={e => setEditForm({ ...editForm, newName: e.target.value })}
                            className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-mint-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              value={editForm.cash_apy}
                              onChange={e => setEditForm({ ...editForm, cash_apy: e.target.value })}
                              className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm text-right focus:outline-none focus:border-mint-500"
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                            />
                            <span className="text-slate-400 text-sm">%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, auto_calculate_interest: !editForm.auto_calculate_interest })}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              editForm.auto_calculate_interest ? 'bg-mint-600' : 'bg-slate-600'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                editForm.auto_calculate_interest ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleSaveEdit(platform.id)}
                            className="px-2 py-1 text-xs bg-mint-600 text-white rounded hover:bg-mint-700 mr-2"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-2 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-500"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-white font-mono">{platform.id}</td>
                        <td className="px-4 py-3 text-slate-300">{platform.name}</td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {platform.cash_apy ? `${(platform.cash_apy * 100).toFixed(2)}%` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {platform.auto_calculate_interest ? (
                            <span className="text-mint-400">On</span>
                          ) : (
                            <span className="text-slate-500">Off</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/platform/${platform.id}`}
                            className="px-2 py-1 text-xs bg-mint-600/20 text-mint-400 rounded hover:bg-mint-600/30 mr-2"
                          >
                            Dashboard
                          </Link>
                          <button
                            onClick={() => handleStartEdit(platform)}
                            className="px-2 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-500 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(platform.id)}
                            className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30"
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-sm text-slate-500">
        <p>Note: Renaming a platform ID will update all associated fund files automatically.</p>
        <p>You can only delete platforms that have no funds associated with them.</p>
      </div>
    </div>
  )
}
