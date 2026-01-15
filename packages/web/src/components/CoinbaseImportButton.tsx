/**
 * CoinbaseImportButton Component
 * Button that performs a full import/re-import of Coinbase transactions for a derivatives fund.
 * This is a "full import" flow that:
 * 1. Clears existing fund entries immediately
 * 2. Clears the transaction archive
 * 3. Scrapes all transactions back to the fund's start date
 * 4. Applies all transactions at once after scraping completes (batch apply)
 */

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  scrapeCoinbaseTransactionsStream,
  type CoinbaseScrapeStatusEvent,
  type CoinbaseScrapeProgressEvent,
  type CoinbaseScrapeCompleteEvent
} from '../api/import'

interface ImportProgress {
  status: string
  phase: 'connecting' | 'navigating' | 'loading' | 'scraping' | 'applying' | 'complete' | 'error'
  current: number
  total: number
  newCount: number
  entriesApplied: number
  lastTx: {
    date: string
    type: string
    symbol?: string
    amount: number
    title: string
    isPerpRelated: boolean
  } | null
}

interface CoinbaseImportButtonProps {
  fundId: string
  fundStartDate: string  // ISO date from fund config - scrape will stop here
  hasEntries: boolean    // True if fund already has entries (show "Re-import" vs "Import")
  onComplete?: () => void
  className?: string
}

export function CoinbaseImportButton({
  fundId,
  fundStartDate,
  hasEntries,
  onComplete,
  className = ''
}: CoinbaseImportButtonProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [progress, setProgress] = useState<ImportProgress>({
    status: '',
    phase: 'connecting',
    current: 0,
    total: 0,
    newCount: 0,
    entriesApplied: 0,
    lastTx: null
  })

  const scrapeStreamRef = useRef<{ close: () => void } | null>(null)

  const startImport = useCallback(async () => {
    setShowConfirm(false)
    setIsImporting(true)
    setShowProgress(true)
    setProgress({
      status: 'Clearing existing data...',
      phase: 'loading',
      current: 0,
      total: 0,
      newCount: 0,
      entriesApplied: 0,
      lastTx: null
    })

    // Clear the transactions archive to force a full re-scrape
    const clearArchiveResponse = await fetch('/api/v1/import/coinbase/transactions/archive', {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!clearArchiveResponse.ok) {
      setProgress(prev => ({
        ...prev,
        phase: 'error',
        status: 'Failed to clear transactions archive'
      }))
      toast.error('Failed to clear transactions archive')
      setIsImporting(false)
      return
    }

    setProgress(prev => ({
      ...prev,
      status: 'Connecting to browser...',
      phase: 'connecting'
    }))

    // Start scraping with clearFundEntries enabled
    // The server will clear fund entries immediately, scrape all data,
    // then apply all transactions at once after scraping completes
    scrapeStreamRef.current = scrapeCoinbaseTransactionsStream(
      {
        stopDate: fundStartDate,
        fundId,
        clearFundEntries: true  // Clear fund entries immediately on server
      },
      {
        onStatus: (data: CoinbaseScrapeStatusEvent & { cleared?: number }) => {
          setProgress(prev => ({
            ...prev,
            status: data.message,
            phase: data.phase as ImportProgress['phase']
          }))
          // If entries were cleared, trigger a UI refresh immediately
          if (data.cleared !== undefined) {
            onComplete?.()
          }
        },
        onProgress: (data: CoinbaseScrapeProgressEvent) => {
          setProgress(prev => ({
            ...prev,
            status: `Scraped ${data.current} transactions...`,
            phase: 'scraping',
            current: data.current,
            total: data.total,
            newCount: data.newCount,
            lastTx: data.lastTransaction
          }))
        },
        onApplied: (data) => {
          // Batch apply completed - update progress and refresh UI
          setProgress(prev => ({
            ...prev,
            entriesApplied: data.entriesApplied,
            phase: 'applying',
            status: `Applied ${data.entriesApplied} entries to fund`
          }))
          // Trigger UI refresh to show all entries
          onComplete?.()
        },
        onComplete: (data: CoinbaseScrapeCompleteEvent) => {
          const entriesApplied = data.entriesApplied || 0

          setProgress(prev => ({
            ...prev,
            phase: 'complete',
            status: `Import complete: ${entriesApplied} entries imported`,
            entriesApplied
          }))

          if (entriesApplied > 0) {
            toast.success(`Imported ${entriesApplied} entries`)
          } else {
            toast.info('No entries to import')
          }

          setIsImporting(false)
          onComplete?.()

          // Hide progress after a delay
          setTimeout(() => {
            setShowProgress(false)
          }, 3000)
        },
        onError: (data) => {
          setProgress(prev => ({
            ...prev,
            phase: 'error',
            status: data.message
          }))
          toast.error(data.message)
          setIsImporting(false)
        }
      }
    )
  }, [fundStartDate, fundId, onComplete])

  const handleClick = useCallback(() => {
    if (hasEntries) {
      // Show confirmation dialog for re-import
      setShowConfirm(true)
    } else {
      // No entries, proceed directly
      startImport()
    }
  }, [hasEntries, startImport])

  const handleCancel = useCallback(() => {
    scrapeStreamRef.current?.close()
    setIsImporting(false)
    setShowProgress(false)
    setShowConfirm(false)
    toast.info('Import cancelled')
  }, [])

  const buttonLabel = hasEntries ? 'Re-import' : 'Import'

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={isImporting}
          className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-1"
        >
          {isImporting ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {buttonLabel}
            </>
          )}
        </button>
        {isImporting && (
          <button
            onClick={handleCancel}
            className="px-1.5 py-1 text-xs bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md border border-slate-700 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-3">Confirm Re-import</h3>
            <p className="text-slate-300 mb-4">
              This will clear all existing entries in this fund and re-import from Coinbase.
              This action cannot be undone.
            </p>
            <p className="text-slate-400 text-sm mb-4">
              Scraping will go back to: <span className="text-white font-mono">{fundStartDate}</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startImport}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Clear & Re-import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Display - positioned to extend left to avoid overflow on right edge */}
      {showProgress && (
        <div className="absolute top-full right-0 mt-1 bg-slate-800 rounded-lg p-3 text-sm space-y-2 border border-slate-700 shadow-xl z-50 min-w-[300px]">
          {/* Status */}
          <div className="flex items-center gap-2">
            {(progress.phase === 'scraping' || progress.phase === 'applying' || progress.phase === 'connecting' || progress.phase === 'navigating' || progress.phase === 'loading') && (
              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            )}
            {progress.phase === 'complete' && (
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {progress.phase === 'error' && (
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className={`${
              progress.phase === 'complete' ? 'text-green-400' :
              progress.phase === 'error' ? 'text-red-400' :
              'text-slate-300'
            }`}>
              {progress.status}
            </span>
          </div>

          {/* Progress Bar - shown during scraping */}
          {progress.phase === 'scraping' && progress.total > 0 && (
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((progress.current / progress.total) * 100, 100)}%` }}
              />
            </div>
          )}

          {/* Last Transaction - shown during scraping */}
          {progress.lastTx && progress.phase === 'scraping' && (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className={progress.lastTx.isPerpRelated ? 'text-amber-400' : 'text-slate-500'}>
                {progress.lastTx.isPerpRelated ? 'PERP' : 'Other'}
              </span>
              <span>{progress.lastTx.date}</span>
              <span className="text-slate-500">|</span>
              <span>{progress.lastTx.type}</span>
              <span className="text-slate-500">|</span>
              <span className={progress.lastTx.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${progress.lastTx.amount.toFixed(2)}
              </span>
            </div>
          )}

          {/* Applying phase indicator */}
          {progress.phase === 'applying' && (
            <div className="text-xs text-amber-400">
              Processing and sorting entries...
            </div>
          )}

          {/* Summary */}
          {progress.phase === 'complete' && (
            <div className="text-xs text-slate-400">
              {progress.entriesApplied} entries imported
            </div>
          )}
        </div>
      )}
    </div>
  )
}
