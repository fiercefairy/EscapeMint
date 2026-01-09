import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { useSettings } from '../contexts/SettingsContext'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useDashboard } from '../contexts/DashboardContext'

const API_BASE = '/api/v1'

interface BackupConfig {
  backup_dir: string
  is_icloud: boolean
}

interface BackupInfo {
  name: string
  date: string
}

interface BackupListResponse {
  backup_dir: string
  backups: BackupInfo[]
}

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

interface TestDataStatus {
  priceDataAvailable: boolean
  missingPriceData: string[]
  existingTestFunds: number
  testFundIds: string[]
}

interface TestDataGenerateResult {
  success: boolean
  deletedExisting: number
  createdFunds: number
  funds: Array<{
    id: string
    platform: string
    ticker: string
    fundType: string
    entryCount: number
    lastDate: string
    lastValue: number
  }>
}

export function Settings() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [restoreConfirm, setRestoreConfirm] = useState<BackupInfo | null>(null)
  const [testDataStatus, setTestDataStatus] = useState<TestDataStatus | null>(null)
  const [generatingTestData, setGeneratingTestData] = useState(false)
  const [deletingTestData, setDeletingTestData] = useState(false)
  const [testDataConfirm, setTestDataConfirm] = useState<'generate' | 'delete' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings, updateSetting } = useSettings()
  const { refresh: refreshDashboard } = useDashboard()
  const prevTestFundsMode = useRef(settings.testFundsMode)

  // Refresh dashboard when testFundsMode changes
  useEffect(() => {
    if (prevTestFundsMode.current !== settings.testFundsMode) {
      prevTestFundsMode.current = settings.testFundsMode
      // Small delay to ensure WebSocket has reconnected
      const timer = setTimeout(() => {
        refreshDashboard()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [settings.testFundsMode, refreshDashboard])

  // Load backup config and list on mount
  useEffect(() => {
    const loadBackupInfo = async () => {
      const [configRes, listRes] = await Promise.all([
        fetch(`${API_BASE}/backup/config`),
        fetch(`${API_BASE}/backup`)
      ])

      if (configRes.ok) {
        const config: BackupConfig = await configRes.json()
        setBackupConfig(config)
      }

      if (listRes.ok) {
        const list: BackupListResponse = await listRes.json()
        setBackups(list.backups)
      }
    }

    loadBackupInfo()
  }, [])

  // Load test data status on mount
  useEffect(() => {
    const loadTestDataStatus = async () => {
      const response = await fetch(`${API_BASE}/test-data/status`)
      if (response.ok) {
        const status: TestDataStatus = await response.json()
        setTestDataStatus(status)
      }
    }
    loadTestDataStatus()
  }, [])

  const refreshTestDataStatus = async () => {
    const response = await fetch(`${API_BASE}/test-data/status`)
    if (response.ok) {
      const status: TestDataStatus = await response.json()
      setTestDataStatus(status)
    }
  }

  const handleGenerateTestData = async () => {
    setGeneratingTestData(true)
    setTestDataConfirm(null)

    const response = await fetch(`${API_BASE}/test-data/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weeklyAmount: 100,
        initialFundSize: 10000,
        deleteExisting: true
      })
    })

    if (!response.ok) {
      toast.error('Failed to generate test data')
      setGeneratingTestData(false)
      return
    }

    const result: TestDataGenerateResult = await response.json()

    if (result.success) {
      toast.success(`Created ${result.createdFunds} test funds with simulated DCA history`)
      await refreshTestDataStatus()
      refreshDashboard()
    } else {
      toast.error('Test data generation failed')
    }

    setGeneratingTestData(false)
  }

  const handleDeleteTestData = async () => {
    setDeletingTestData(true)
    setTestDataConfirm(null)

    const response = await fetch(`${API_BASE}/test-data`, {
      method: 'DELETE'
    })

    if (!response.ok) {
      toast.error('Failed to delete test data')
      setDeletingTestData(false)
      return
    }

    const result = await response.json()

    if (result.success) {
      toast.success(`Deleted ${result.deletedCount} test funds`)
      await refreshTestDataStatus()
      refreshDashboard()
    } else {
      toast.error('Test data deletion failed')
    }

    setDeletingTestData(false)
  }

  const handleBackup = async () => {
    setBackingUp(true)

    const response = await fetch(`${API_BASE}/backup`, {
      method: 'POST'
    })

    if (!response.ok) {
      toast.error('Failed to create backup')
      setBackingUp(false)
      return
    }

    const result = await response.json()

    if (result.success) {
      toast.success(`Backup created with ${result.fund_count} funds`)
      // Refresh backup list
      const listRes = await fetch(`${API_BASE}/backup`)
      if (listRes.ok) {
        const list: BackupListResponse = await listRes.json()
        setBackups(list.backups)
      }
    } else {
      toast.error(result.error ?? 'Backup failed')
    }

    setBackingUp(false)
  }

  const handleRestore = async (backup: BackupInfo) => {
    setRestoring(true)
    setRestoreConfirm(null)

    const response = await fetch(`${API_BASE}/backup/restore/${encodeURIComponent(backup.name)}`, {
      method: 'POST'
    })

    if (!response.ok) {
      toast.error('Failed to restore backup')
      setRestoring(false)
      return
    }

    const result = await response.json()

    if (result.success) {
      toast.success(`Restored ${result.fund_count} funds from backup`)
      // Reload the page to reflect restored data
      window.location.reload()
    } else {
      toast.error(result.error ?? 'Restore failed')
    }

    setRestoring(false)
  }

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

      {/* iCloud Backup Section */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">
          {backupConfig?.is_icloud ? 'iCloud Backup' : 'Data Backup'}
        </h2>
        <p className="text-sm text-slate-400 mb-3">
          {backupConfig?.is_icloud
            ? 'Backup fund data and configs to iCloud for safekeeping.'
            : 'Backup fund data and configs to a local directory.'}
        </p>

        {backupConfig && (
          <p className="text-xs text-slate-500 mb-3">
            <span className="text-slate-400">Backup location:</span>{' '}
            <code className="bg-slate-700 px-1 rounded">{backupConfig.backup_dir}</code>
          </p>
        )}

        <button
          onClick={handleBackup}
          disabled={backingUp}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {backingUp ? 'Creating Backup...' : 'Create Backup'}
        </button>

        {backups.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Recent Backups</h3>
            <ul className="space-y-2 text-xs text-slate-400">
              {backups.slice(0, 5).map((backup) => (
                <li key={backup.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">-</span>
                    <span>{backup.date}</span>
                  </div>
                  <button
                    onClick={() => setRestoreConfirm(backup)}
                    disabled={restoring}
                    className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
            {backups.length > 5 && (
              <p className="text-xs text-slate-500 mt-1">
                + {backups.length - 5} more backups
              </p>
            )}
          </div>
        )}
      </div>

      {/* Test Funds Mode */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">Data Mode</h2>
        <p className="text-sm text-slate-400 mb-3">
          Switch between viewing your real funds or test/demo funds.
        </p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="fundsMode"
              checked={!settings.testFundsMode}
              onChange={() => updateSetting('testFundsMode', false)}
              className="w-4 h-4 border-slate-600 bg-slate-700 text-mint-500 focus:ring-mint-500 focus:ring-offset-slate-800"
            />
            <span className="text-sm text-white">My Funds</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="fundsMode"
              checked={settings.testFundsMode}
              onChange={() => updateSetting('testFundsMode', true)}
              className="w-4 h-4 border-slate-600 bg-slate-700 text-mint-500 focus:ring-mint-500 focus:ring-offset-slate-800"
            />
            <span className="text-sm text-white">Test Funds</span>
          </label>
        </div>
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

      {/* Test/Demo Data Section */}
      <div className="bg-slate-800 rounded-lg p-3 md:p-4 border border-slate-700">
        <h2 className="text-base font-semibold text-white mb-2">Test/Demo Data</h2>
        <p className="text-sm text-slate-400 mb-3">
          Generate demo funds with 5 years of simulated DCA investing using real historical prices
          for BTC, TQQQ, and SPXL. Each fund starts with $10K and invests $100/week.
        </p>

        {testDataStatus && (
          <div className="text-xs text-slate-500 mb-3 space-y-1">
            {testDataStatus.existingTestFunds > 0 ? (
              <p>
                <span className="text-slate-400">Existing test funds:</span>{' '}
                {testDataStatus.testFundIds.join(', ')}
              </p>
            ) : (
              <p className="text-slate-400">No test funds currently loaded.</p>
            )}
            {!testDataStatus.priceDataAvailable && (
              <p className="text-amber-400">
                Missing price data: {testDataStatus.missingPriceData.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setTestDataConfirm('generate')}
            disabled={generatingTestData || !testDataStatus?.priceDataAvailable}
            className="px-3 py-1.5 text-sm bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors disabled:opacity-50"
          >
            {generatingTestData ? 'Generating...' : 'Load Test Data'}
          </button>

          {testDataStatus && testDataStatus.existingTestFunds > 0 && (
            <button
              onClick={() => setTestDataConfirm('delete')}
              disabled={deletingTestData}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deletingTestData ? 'Deleting...' : 'Delete Test Data'}
            </button>
          )}
        </div>
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

      {/* Restore Confirmation Dialog */}
      {restoreConfirm && (
        <ConfirmDialog
          title="Restore Backup"
          message={`Are you sure you want to restore the backup from ${restoreConfirm.date}?\n\nThis will replace ALL current data with the backup data. This action cannot be undone.`}
          confirmLabel="Restore"
          variant="danger"
          onConfirm={() => handleRestore(restoreConfirm)}
          onCancel={() => setRestoreConfirm(null)}
        />
      )}

      {/* Test Data Generate Confirmation */}
      {testDataConfirm === 'generate' && (
        <ConfirmDialog
          title="Load Test Data"
          message={`This will create 5 demo funds simulating DCA investing over 5 years:\n\n• coinbasetest-btc (Bitcoin)\n• robinhoodtest-tqqq (3x Nasdaq ETF)\n• robinhoodtest-spxl (3x S&P 500 ETF)\n• Plus cash funds for each platform\n\n${testDataStatus?.existingTestFunds ? 'Existing test funds will be replaced.' : ''}`}
          confirmLabel="Load Test Data"
          variant="default"
          onConfirm={handleGenerateTestData}
          onCancel={() => setTestDataConfirm(null)}
        />
      )}

      {/* Test Data Delete Confirmation */}
      {testDataConfirm === 'delete' && (
        <ConfirmDialog
          title="Delete Test Data"
          message={`This will permanently delete all ${testDataStatus?.existingTestFunds ?? 0} test funds:\n\n${testDataStatus?.testFundIds.map(id => `• ${id}`).join('\n') ?? ''}\n\nThis action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeleteTestData}
          onCancel={() => setTestDataConfirm(null)}
        />
      )}
    </div>
  )
}
