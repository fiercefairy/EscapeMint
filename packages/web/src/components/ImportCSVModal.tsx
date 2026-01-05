import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  previewRobinhoodImport,
  applyRobinhoodImport,
  readFileAsText,
  getBrowserStatus,
  connectBrowser,
  scrapeRobinhoodHistory,
  disconnectBrowser,
  type ImportPreview
} from '../api/import'
import { notifyFundsChanged } from '../api/funds'

interface ImportCSVModalProps {
  onClose: () => void
  onImported?: () => void
}

type Step = 'upload' | 'preview' | 'importing' | 'done'
type ImportMode = 'csv' | 'scrape'
type BrowserConnectionStatus = 'unknown' | 'checking' | 'connected' | 'disconnected' | 'connecting'

export function ImportCSVModal({ onClose, onImported }: ImportCSVModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [platform] = useState('robinhood') // Expandable to other platforms later
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [importing, setImporting] = useState(false)

  // Scraping mode state
  const [importMode, setImportMode] = useState<ImportMode>('csv')
  const [browserStatus, setBrowserStatus] = useState<BrowserConnectionStatus>('unknown')
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scraping, setScraping] = useState(false)

  // Check browser connection status on mount and when switching to scrape mode
  useEffect(() => {
    if (importMode === 'scrape' && browserStatus === 'unknown') {
      checkBrowserStatus()
    }
  }, [importMode, browserStatus])

  const checkBrowserStatus = useCallback(async () => {
    setBrowserStatus('checking')
    const result = await getBrowserStatus()
    if (result.error) {
      setBrowserStatus('disconnected')
    } else {
      setBrowserStatus(result.data?.connected ? 'connected' : 'disconnected')
    }
  }, [])

  const handleConnectBrowser = useCallback(async () => {
    setBrowserStatus('connecting')
    const result = await connectBrowser()
    if (result.error) {
      toast.error(result.error)
      setBrowserStatus('disconnected')
    } else {
      toast.success(result.data?.message ?? 'Connected to browser')
      setBrowserStatus('connected')
    }
  }, [])

  const handleDisconnectBrowser = useCallback(async () => {
    const result = await disconnectBrowser()
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Disconnected from browser')
      setBrowserStatus('disconnected')
    }
  }, [])

  const handleScrapeUrl = useCallback(async () => {
    if (!scrapeUrl.trim()) {
      toast.error('Please enter a Robinhood history URL')
      return
    }

    // Validate URL pattern
    if (!scrapeUrl.includes('robinhood.com') || !scrapeUrl.includes('history')) {
      toast.error('Please enter a valid Robinhood history URL')
      return
    }

    setScraping(true)
    setStep('importing')

    const result = await scrapeRobinhoodHistory(scrapeUrl, platform)
    setScraping(false)

    if (result.error) {
      toast.error(result.error)
      setStep('upload')
      return
    }

    if (!result.data || result.data.transactions.length === 0) {
      toast.error('No transactions found on page')
      setStep('upload')
      return
    }

    setPreview(result.data)
    // Select all matched transactions by default
    const matched = new Set<number>()
    result.data.transactions.forEach((tx, i) => {
      if (tx.fundExists) matched.add(i)
    })
    setSelectedTransactions(matched)
    setStep('preview')
  }, [scrapeUrl, platform])

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setStep('importing')
    const content = await readFileAsText(file).catch(() => null)

    if (!content) {
      toast.error('Failed to read file')
      setStep('upload')
      return
    }

    const result = await previewRobinhoodImport(content, platform)

    if (result.error) {
      toast.error(result.error)
      setStep('upload')
      return
    }

    if (!result.data || result.data.transactions.length === 0) {
      toast.error('No valid transactions found in CSV')
      setStep('upload')
      return
    }

    setPreview(result.data)
    // Select all matched transactions by default
    const matched = new Set<number>()
    result.data.transactions.forEach((tx, i) => {
      if (tx.fundExists) matched.add(i)
    })
    setSelectedTransactions(matched)
    setStep('preview')
  }, [platform])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const toggleTransaction = useCallback((index: number) => {
    setSelectedTransactions(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback((checked: boolean) => {
    if (!preview) return
    if (checked) {
      const all = new Set<number>()
      preview.transactions.forEach((tx, i) => {
        if (tx.fundExists) all.add(i)
      })
      setSelectedTransactions(all)
    } else {
      setSelectedTransactions(new Set())
    }
  }, [preview])

  const handleApply = useCallback(async () => {
    if (!preview) return

    const selected = preview.transactions.filter((_, i) => selectedTransactions.has(i))
    if (selected.length === 0) {
      toast.error('No transactions selected')
      return
    }

    setImporting(true)
    const result = await applyRobinhoodImport(selected, true)
    setImporting(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    if (result.data) {
      const { applied, skipped, errors } = result.data
      if (errors.length > 0) {
        toast.error(`Import completed with errors: ${errors.join(', ')}`)
      } else if (applied > 0) {
        toast.success(`Imported ${applied} transaction${applied !== 1 ? 's' : ''} (${skipped} skipped)`)
        notifyFundsChanged()
        onImported?.()
        onClose()
      } else {
        toast.info(`No new transactions imported (${skipped} skipped as duplicates)`)
      }
    }
  }, [preview, selectedTransactions, onImported, onClose])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const matchedCount = preview?.transactions.filter(tx => tx.fundExists).length ?? 0
  const selectedCount = selectedTransactions.size

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-4xl border border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Import Transactions</h2>
          <p className="text-slate-400 text-sm mt-1">
            Import transaction history from Robinhood
          </p>

          {/* Mode tabs - only show when not in preview */}
          {step === 'upload' && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setImportMode('csv')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  importMode === 'csv'
                    ? 'bg-mint-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                CSV Upload
              </button>
              <button
                onClick={() => setImportMode('scrape')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  importMode === 'scrape'
                    ? 'bg-mint-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Scrape URL
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && importMode === 'csv' && (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isDragging
                  ? 'border-mint-500 bg-mint-500/10'
                  : 'border-slate-600 hover:border-slate-500'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="text-4xl mb-4">📄</div>
              <p className="text-white font-medium mb-2">
                Drop your Robinhood CSV file here
              </p>
              <p className="text-slate-400 text-sm mb-4">
                or click to browse
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
                id="csv-file-input"
              />
              <label
                htmlFor="csv-file-input"
                className="inline-block px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 cursor-pointer transition-colors"
              >
                Select File
              </label>
              <p className="text-slate-500 text-xs mt-4">
                Export from Robinhood: Account → Documents → Account Statements → Transaction History
              </p>
            </div>
          )}

          {step === 'upload' && importMode === 'scrape' && (
            <div className="space-y-6">
              {/* Browser connection status */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-slate-300">Browser Connection</h3>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      browserStatus === 'connected' ? 'bg-green-400' :
                      browserStatus === 'checking' || browserStatus === 'connecting' ? 'bg-amber-400 animate-pulse' :
                      'bg-red-400'
                    }`} />
                    <span className="text-sm text-slate-400">
                      {browserStatus === 'connected' ? 'Connected' :
                       browserStatus === 'checking' ? 'Checking...' :
                       browserStatus === 'connecting' ? 'Connecting...' :
                       'Disconnected'}
                    </span>
                  </div>
                </div>

                {browserStatus === 'disconnected' && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-400">
                      To scrape Robinhood, launch Chrome with remote debugging enabled:
                    </p>
                    <code className="block bg-slate-800 text-mint-400 text-xs p-3 rounded font-mono overflow-x-auto">
                      /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port={import.meta.env.VITE_CDP_PORT ?? 5549}
                    </code>
                    <p className="text-sm text-slate-400">
                      Then log into Robinhood in that browser and click Connect below.
                    </p>
                    <button
                      onClick={handleConnectBrowser}
                      disabled={browserStatus === 'connecting'}
                      className="px-4 py-2 bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors disabled:opacity-50"
                    >
                      {browserStatus === 'connecting' ? 'Connecting...' : 'Connect to Browser'}
                    </button>
                  </div>
                )}

                {browserStatus === 'connected' && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-green-400">
                      Connected to Chrome with remote debugging
                    </p>
                    <button
                      onClick={handleDisconnectBrowser}
                      className="px-3 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-500 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              {/* URL input */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Robinhood History URL
                </label>
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://robinhood.com/crypto/history/..."
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-500"
                  disabled={browserStatus !== 'connected'}
                />
                <p className="text-xs text-slate-500">
                  Navigate to the asset in Robinhood, click the history/activity link, and paste the URL here.
                  <br />
                  Examples:
                  <br />
                  • Crypto: <code className="text-mint-400">https://robinhood.com/crypto/history/UUID</code>
                  <br />
                  • Stocks: <code className="text-mint-400">https://robinhood.com/history/UUID?account=individual</code>
                </p>
              </div>

              {/* Scrape button */}
              <button
                onClick={handleScrapeUrl}
                disabled={browserStatus !== 'connected' || !scrapeUrl.trim() || scraping}
                className="w-full px-4 py-3 bg-mint-600 text-white rounded-lg hover:bg-mint-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scraping ? 'Scraping...' : 'Scrape Transaction History'}
              </button>
            </div>
          )}

          {step === 'importing' && !preview && (
            <div className="text-center py-12">
              <div className="animate-spin text-4xl mb-4">⏳</div>
              <p className="text-slate-400">
                {scraping ? 'Scraping transaction history...' : 'Parsing CSV...'}
              </p>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-700/50 rounded p-4">
                  <div className="text-2xl font-bold text-white">{preview.summary.total}</div>
                  <div className="text-sm text-slate-400">Total Transactions</div>
                </div>
                <div className="bg-slate-700/50 rounded p-4">
                  <div className="text-2xl font-bold text-green-400">{preview.summary.matched}</div>
                  <div className="text-sm text-slate-400">Matched to Funds</div>
                </div>
                <div className="bg-slate-700/50 rounded p-4">
                  <div className="text-2xl font-bold text-amber-400">{preview.summary.unmatched}</div>
                  <div className="text-sm text-slate-400">Unmatched (need fund)</div>
                </div>
              </div>

              {/* By Symbol breakdown */}
              {Object.keys(preview.summary.bySymbol).length > 0 && (
                <div className="bg-slate-700/30 rounded p-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-2">By Symbol</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(preview.summary.bySymbol).map(([symbol, data]) => (
                      <div
                        key={symbol}
                        className={`px-3 py-1 rounded text-sm ${
                          data.fundExists
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {symbol}: {data.count} txns
                        {data.fundId && (
                          <span className="text-slate-400 ml-1">
                            → {data.fundId}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched warning */}
              {preview.summary.unmatched > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded p-4">
                  <p className="text-amber-300 text-sm">
                    <strong>Note:</strong> {preview.summary.unmatched} transaction(s) have no matching fund.
                    Create funds for these symbols first to import them.
                  </p>
                </div>
              )}

              {/* Transactions table */}
              <div className="border border-slate-700 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="p-2 text-left">
                        <input
                          type="checkbox"
                          checked={selectedCount === matchedCount && matchedCount > 0}
                          onChange={(e) => toggleAll(e.target.checked)}
                          className="rounded border-slate-600"
                        />
                      </th>
                      <th className="p-2 text-left text-slate-300">Date</th>
                      <th className="p-2 text-left text-slate-300">Action</th>
                      <th className="p-2 text-left text-slate-300">Symbol</th>
                      <th className="p-2 text-right text-slate-300">Qty</th>
                      <th className="p-2 text-right text-slate-300">Price</th>
                      <th className="p-2 text-right text-slate-300">Amount</th>
                      <th className="p-2 text-left text-slate-300">Fund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.transactions.map((tx, i) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-700 ${
                          !tx.fundExists ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedTransactions.has(i)}
                            onChange={() => toggleTransaction(i)}
                            disabled={!tx.fundExists}
                            className="rounded border-slate-600"
                          />
                        </td>
                        <td className="p-2 text-slate-300">{tx.date}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            tx.action === 'BUY' ? 'bg-green-500/20 text-green-300' :
                            tx.action === 'SELL' ? 'bg-red-500/20 text-red-300' :
                            tx.action === 'DIVIDEND' ? 'bg-blue-500/20 text-blue-300' :
                            tx.action === 'INTEREST' ? 'bg-purple-500/20 text-purple-300' :
                            'bg-slate-500/20 text-slate-300'
                          }`}>
                            {tx.action}
                          </span>
                        </td>
                        <td className="p-2 text-white font-medium">{tx.symbol || '-'}</td>
                        <td className="p-2 text-right text-slate-300">
                          {tx.quantity > 0 ? tx.quantity.toFixed(6) : '-'}
                        </td>
                        <td className="p-2 text-right text-slate-300">
                          {tx.price > 0 ? formatCurrency(tx.price) : '-'}
                        </td>
                        <td className="p-2 text-right text-white">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="p-2">
                          {tx.fundId ? (
                            <span className={tx.fundExists ? 'text-green-400' : 'text-amber-400'}>
                              {tx.fundId}
                              {!tx.fundExists && ' (missing)'}
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between items-center">
          <div className="text-sm text-slate-400">
            {step === 'preview' && selectedCount > 0 && (
              <span>{selectedCount} transaction{selectedCount !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            {step === 'preview' && (
              <button
                type="button"
                onClick={handleApply}
                disabled={importing || selectedCount === 0}
                className="px-4 py-2 bg-mint-600 text-white rounded hover:bg-mint-700 transition-colors disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${selectedCount} Transaction${selectedCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
