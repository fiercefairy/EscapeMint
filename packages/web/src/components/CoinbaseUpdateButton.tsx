/**
 * CoinbaseUpdateButton Component
 * Button that scrapes new Coinbase transactions and automatically applies them to a derivatives fund.
 * This is a streamlined "Update" flow that:
 * 1. Scrapes new transactions (stopping at the last entry date)
 * 2. Automatically applies all new perp-related transactions to the fund
 */

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  scrapeCoinbaseTransactionsStream,
  type CoinbaseScrapeStatusEvent,
  type CoinbaseScrapeProgressEvent,
  type CoinbaseScrapeCompleteEvent
} from '../api/import'

interface UpdateProgress {
  status: string
  phase: 'connecting' | 'navigating' | 'loading' | 'scraping' | 'applying' | 'complete' | 'error'
  current: number
  total: number
  newCount: number
  applied?: number
  skipped?: number
  lastTx: {
    date: string
    type: string
    symbol?: string
    amount: number
    title: string
    isPerpRelated: boolean
  } | null
}

interface CoinbaseUpdateButtonProps {
  fundId: string
  lastEntryDate?: string | undefined  // ISO date of the last entry in the fund
  onComplete?: () => void
  className?: string
}

export function CoinbaseUpdateButton({
  fundId,
  lastEntryDate,
  onComplete,
  className = ''
}: CoinbaseUpdateButtonProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress>({
    status: '',
    phase: 'connecting',
    current: 0,
    total: 0,
    newCount: 0,
    lastTx: null
  })

  const scrapeStreamRef = useRef<{ close: () => void } | null>(null)

  const handleUpdate = useCallback(async () => {
    setIsUpdating(true)
    setShowProgress(true)
    setProgress({
      status: 'Connecting to browser...',
      phase: 'connecting',
      current: 0,
      total: 0,
      newCount: 0,
      lastTx: null
    })

    // Use lastEntryDate as stopDate if provided
    const stopDate = lastEntryDate

    scrapeStreamRef.current = scrapeCoinbaseTransactionsStream(
      { stopDate, fundId },
      {
        onStatus: (data: CoinbaseScrapeStatusEvent) => {
          setProgress(prev => ({
            ...prev,
            status: data.message,
            phase: data.phase as UpdateProgress['phase']
          }))
        },
        onProgress: (data: CoinbaseScrapeProgressEvent) => {
          setProgress({
            status: `Scraped ${data.current} transactions (${data.newCount} new)`,
            phase: 'scraping',
            current: data.current,
            total: data.total,
            newCount: data.newCount,
            lastTx: data.lastTransaction
          })
        },
        onComplete: (data: CoinbaseScrapeCompleteEvent) => {
          // Streaming endpoint already applied entries when fundId was passed
          const entriesApplied = data.entriesApplied ?? 0

          setProgress(prev => ({
            ...prev,
            phase: 'complete',
            status: `Update complete: ${entriesApplied} entries applied`,
            applied: entriesApplied,
            skipped: 0
          }))

          if (entriesApplied > 0) {
            toast.success(`Applied ${entriesApplied} entries`)
          } else if (data.newCount > 0) {
            toast.info(`${data.newCount} new transactions scraped`)
          } else {
            toast.info('No new transactions found')
          }

          setIsUpdating(false)
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
          setIsUpdating(false)
        }
      }
    )
  }, [lastEntryDate, fundId, onComplete])

  const handleCancel = useCallback(() => {
    scrapeStreamRef.current?.close()
    setIsUpdating(false)
    setShowProgress(false)
    toast.info('Update cancelled')
  }, [])

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-1"
        >
          {isUpdating ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Update
            </>
          )}
        </button>
        {isUpdating && (
          <button
            onClick={handleCancel}
            className="px-1.5 py-1 text-xs bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Display */}
      {showProgress && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 rounded-lg p-3 text-sm space-y-2 border border-slate-700 shadow-xl z-50 min-w-[300px]">
          {/* Status */}
          <div className="flex items-center gap-2">
            {(progress.phase === 'scraping' || progress.phase === 'applying') && (
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
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

          {/* Progress Bar */}
          {progress.phase === 'scraping' && progress.total > 0 && (
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.min((progress.current / progress.total) * 100, 100)}%` }}
              />
            </div>
          )}

          {/* Last Transaction */}
          {progress.lastTx && progress.phase === 'scraping' && (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className={progress.lastTx.isPerpRelated ? 'text-blue-400' : 'text-slate-500'}>
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

          {/* Summary */}
          {progress.phase === 'complete' && (
            <div className="text-xs text-slate-400">
              {progress.applied} entries added, {progress.skipped} duplicates skipped
            </div>
          )}
        </div>
      )}
    </div>
  )
}
