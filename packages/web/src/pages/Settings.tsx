import { useState, useRef } from 'react'
import { toast } from 'sonner'
import { useSettings } from '../contexts/SettingsContext'

const API_BASE = '/api/v1'

interface ExportData {
  version: string
  exported_at: string
  fund_count: number
  funds: unknown[]
}

interface ImportResult {
  success: boolean
  results: {
    imported: number
    skipped: number
    errors: string[]
  }
}

export function Settings() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings, updateSetting } = useSettings()

  const handleExport = async () => {
    setExporting(true)

    const response = await fetch(`${API_BASE}/export`)
    if (!response.ok) {
      toast.error('Failed to export data')
      setExporting(false)
      return
    }

    const data: ExportData = await response.json()

    // Create and download file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `escapemint-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success(`Exported ${data.fund_count} funds`)
    setExporting(false)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)

    const reader = new FileReader()
    reader.onload = async (event) => {
      const content = event.target?.result as string
      let data: ExportData

      try {
        data = JSON.parse(content)
      } catch {
        toast.error('Invalid JSON file')
        setImporting(false)
        return
      }

      if (!data.funds || !Array.isArray(data.funds)) {
        toast.error('Invalid export file: missing funds array')
        setImporting(false)
        return
      }

      const response = await fetch(`${API_BASE}/export/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funds: data.funds,
          mode: importMode
        })
      })

      if (!response.ok) {
        toast.error('Failed to import data')
        setImporting(false)
        return
      }

      const result: ImportResult = await response.json()

      if (result.success) {
        toast.success(`Imported ${result.results.imported} funds, skipped ${result.results.skipped}`)
        if (result.results.errors.length > 0) {
          toast.error(`Errors: ${result.results.errors.join(', ')}`)
        }
      } else {
        toast.error('Import failed')
      }

      setImporting(false)
    }

    reader.onerror = () => {
      toast.error('Failed to read file')
      setImporting(false)
    }

    reader.readAsText(file)

    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400">Manage your data and preferences.</p>
      </div>

      {/* Export Section */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">Export Data</h2>
        <p className="text-sm text-slate-400 mb-3">
          Download all fund data as a JSON file.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-3 py-1.5 text-sm bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export All Data'}
        </button>
      </div>

      {/* Import Section */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">Import Data</h2>
        <p className="text-sm text-slate-400 mb-3">
          Import fund data from a previously exported JSON file.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <label className="text-sm text-slate-400">Mode:</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-white cursor-pointer">
              <input
                type="radio"
                name="importMode"
                value="merge"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
                className="text-mint-500"
              />
              <span>Merge</span>
            </label>
            <label className="flex items-center gap-1.5 text-sm text-white cursor-pointer">
              <input
                type="radio"
                name="importMode"
                value="replace"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
                className="text-mint-500"
              />
              <span>Replace</span>
            </label>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          onClick={handleImportClick}
          disabled={importing}
          className="px-3 py-1.5 text-sm bg-slate-600 text-white rounded hover:bg-slate-500 transition-colors disabled:opacity-50"
        >
          {importing ? 'Importing...' : 'Select File'}
        </button>
      </div>

      {/* Advanced/Beta Tools */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">Advanced/Beta Tools</h2>
        <p className="text-sm text-slate-400 mb-3">
          Enable experimental features like Paste Column and Recalculate buttons.
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.advancedTools}
            onChange={(e) => updateSetting('advancedTools', e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-mint-500 focus:ring-mint-500 focus:ring-offset-slate-800"
          />
          <span className="text-sm text-white">Enable Advanced/Beta Tools</span>
        </label>
      </div>

      {/* Data Info */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">Data Storage</h2>
        <div className="space-y-1.5 text-sm text-slate-400">
          <p>
            <span className="text-white">Location:</span> <code className="bg-slate-700 px-1 rounded text-xs">data/funds/</code>
          </p>
          <p>
            <span className="text-white">Format:</span> TSV files with config header
          </p>
        </div>
      </div>

      {/* About */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">About</h2>
        <p className="text-sm text-slate-400">Local-first capital allocation engine.</p>
        <p className="text-xs text-slate-500 mt-1">Version 1.0.0</p>
      </div>
    </div>
  )
}
