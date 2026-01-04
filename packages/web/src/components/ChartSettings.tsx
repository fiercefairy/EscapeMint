import { useState, useEffect, useRef } from 'react'
import type { ChartBounds } from '../api/funds'

interface ChartSettingsProps {
  bounds: ChartBounds
  onChange: (bounds: ChartBounds) => void
  isPercent?: boolean
}

export function ChartSettings({ bounds, onChange, isPercent = false }: ChartSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const toDisplay = (val: number | undefined) => {
    if (val === undefined) return ''
    return isPercent ? (val * 100).toString() : val.toString()
  }
  const [localMin, setLocalMin] = useState(() => toDisplay(bounds.yMin))
  const [localMax, setLocalMax] = useState(() => toDisplay(bounds.yMax))
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalMin(toDisplay(bounds.yMin))
    setLocalMax(toDisplay(bounds.yMax))
  }, [bounds, isPercent])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleApply = () => {
    const newBounds: ChartBounds = {}
    if (localMin !== '') {
      newBounds.yMin = isPercent ? parseFloat(localMin) / 100 : parseFloat(localMin)
    }
    if (localMax !== '') {
      newBounds.yMax = isPercent ? parseFloat(localMax) / 100 : parseFloat(localMax)
    }
    onChange(newBounds)
    setIsOpen(false)
  }

  const handleClear = () => {
    setLocalMin('')
    setLocalMax('')
    onChange({})
    setIsOpen(false)
  }

  const hasBounds = bounds.yMin !== undefined || bounds.yMax !== undefined

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded hover:bg-slate-700 transition-colors ${hasBounds ? 'text-mint-400' : 'text-slate-500'}`}
        title="Configure Y-axis bounds"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-6 z-50 bg-slate-700 rounded-lg shadow-lg border border-slate-600 p-2 min-w-[160px]">
          <div className="text-[10px] text-slate-400 mb-1.5">Y-Axis Bounds</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-slate-400 w-8">Min:</label>
              <input
                type="number"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                placeholder="Auto"
                className="flex-1 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-600 rounded text-white w-16"
              />
              {isPercent && <span className="text-[10px] text-slate-400">%</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-slate-400 w-8">Max:</label>
              <input
                type="number"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                placeholder="Auto"
                className="flex-1 px-1.5 py-0.5 text-xs bg-slate-800 border border-slate-600 rounded text-white w-16"
              />
              {isPercent && <span className="text-[10px] text-slate-400">%</span>}
            </div>
          </div>
          <div className="flex gap-1.5 mt-2">
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 px-2 py-1 text-[10px] bg-slate-600 text-white rounded hover:bg-slate-500"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 px-2 py-1 text-[10px] bg-mint-600 text-white rounded hover:bg-mint-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
