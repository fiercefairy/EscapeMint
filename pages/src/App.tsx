import { useState, useEffect, useCallback } from 'react'
import { loadHistoricalData } from './data/historical-loader'
import type { HistoricalData, DateRange } from './data/types'
import type { ScenarioConfig } from './engine/backtest'
import { BacktestView } from './components/BacktestView'
import { DateRangePicker } from './components/DateRangePicker'

const STORAGE_KEY = 'escapemint-backtest-config'

function getDefaultConfig(): ScenarioConfig {
  return {
    id: 'backtest',
    name: 'DCA Backtest',
    spxlPct: 25,
    tqqqPct: 25,
    btcPct: 50,
    initialCash: 10000,
    weeklyDCA: 100,
    targetAPY: 0.40,
    minProfitUSD: 1000,
    accumulate: false,
    inputMin: 100,
    inputMid: 200,
    inputMax: 250,
    maxAtPct: -0.25,
    marginAccessUSD: 0,
    marginAPR: 0.05,
    cashAPY: 0.04
  }
}

function loadStoredConfig(): ScenarioConfig {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    const parsed = JSON.parse(stored)
    // Merge with defaults to handle any new fields
    return { ...getDefaultConfig(), ...parsed }
  }
  return getDefaultConfig()
}

function saveConfig(config: ScenarioConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function BacktestApp() {
  const [historicalData, setHistoricalData] = useState<Record<string, HistoricalData> | null>(null)
  const [config, setConfig] = useState<ScenarioConfig>(loadStoredConfig)
  const [availableRange, setAvailableRange] = useState<DateRange | null>(null)
  const [selectedRange, setSelectedRange] = useState<DateRange | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleConfigChange = useCallback((newConfig: ScenarioConfig) => {
    setConfig(newConfig)
    saveConfig(newConfig)
  }, [])

  const handleReset = useCallback(() => {
    const defaults = getDefaultConfig()
    setConfig(defaults)
    saveConfig(defaults)
  }, [])

  useEffect(() => {
    loadHistoricalData()
      .then(data => {
        setHistoricalData(data)

        // Calculate available date range (overlap of all three assets)
        const startDates = Object.values(data).map(d => d.startDate)
        const endDates = Object.values(data).map(d => d.endDate)

        const available: DateRange = {
          start: startDates.sort()[startDates.length - 1], // Latest start
          end: endDates.sort()[0] // Earliest end
        }

        setAvailableRange(available)
        // Default to full available range
        setSelectedRange(available)

        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load historical data:', err)
        setError(err.message || 'Failed to load historical data')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading historical data...</p>
        </div>
      </div>
    )
  }

  if (error || !historicalData || !availableRange || !selectedRange) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠</div>
          <h1 className="text-2xl font-bold mb-2">Error Loading Data</h1>
          <p className="text-slate-400 mb-4">{error || 'Failed to load historical data'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header + Date Range - Responsive */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
            <div>
              <h1 className="text-lg font-bold">EscapeMint Backtest</h1>
              <p className="text-xs text-slate-500">Bet long on the future to build a money tree</p>
            </div>
            <DateRangePicker
              availableRange={availableRange}
              selectedRange={selectedRange}
              onChange={setSelectedRange}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4">
        <BacktestView
          config={config}
          historicalData={historicalData}
          dateRange={selectedRange}
          onChange={handleConfigChange}
          onReset={handleReset}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-slate-500">
          <p>Historical data: SPXL (3x S&P 500), TQQQ (3x NASDAQ), BTC (Bitcoin)</p>
          <p className="mt-1">All calculations run in-browser using EscapeMint engine</p>
        </div>
      </footer>
    </div>
  )
}
