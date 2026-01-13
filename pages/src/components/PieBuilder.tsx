import { useState } from 'react'

interface Props {
  spxlPct: number
  tqqqPct: number
  btcPct: number
  onChange: (spxlPct: number, tqqqPct: number, btcPct: number) => void
}

export function PieBuilder({ spxlPct, tqqqPct, btcPct, onChange }: Props) {
  const total = spxlPct + tqqqPct + btcPct
  const [locked, setLocked] = useState<{ SPXL: boolean; TQQQ: boolean; BTC: boolean }>({
    SPXL: false,
    TQQQ: false,
    BTC: false
  })

  const toggleLock = (asset: 'SPXL' | 'TQQQ' | 'BTC') => {
    setLocked(prev => ({ ...prev, [asset]: !prev[asset] }))
  }

  const handleChange = (asset: 'SPXL' | 'TQQQ' | 'BTC', value: number) => {
    let newSpxl = spxlPct
    let newTqqq = tqqqPct
    let newBtc = btcPct

    // Set the changed value
    if (asset === 'SPXL') newSpxl = value
    else if (asset === 'TQQQ') newTqqq = value
    else newBtc = value

    // Calculate difference from 100%
    const newTotal = newSpxl + newTqqq + newBtc
    const diff = newTotal - 100

    if (diff !== 0) {
      // Get unlocked others (not the changed one, and not locked)
      const unlocked: { asset: 'SPXL' | 'TQQQ' | 'BTC'; val: number }[] = []
      if (asset !== 'SPXL' && !locked.SPXL) unlocked.push({ asset: 'SPXL', val: newSpxl })
      if (asset !== 'TQQQ' && !locked.TQQQ) unlocked.push({ asset: 'TQQQ', val: newTqqq })
      if (asset !== 'BTC' && !locked.BTC) unlocked.push({ asset: 'BTC', val: newBtc })

      const unlockedTotal = unlocked.reduce((sum, u) => sum + u.val, 0)

      if (unlocked.length > 0 && (unlockedTotal > 0 || diff < 0)) {
        // Distribute the difference to unlocked assets
        for (const u of unlocked) {
          const adjust = unlockedTotal > 0
            ? (diff * u.val / unlockedTotal)
            : (diff / unlocked.length)
          const newVal = Math.max(0, Math.min(100, u.val - adjust))
          if (u.asset === 'SPXL') newSpxl = newVal
          else if (u.asset === 'TQQQ') newTqqq = newVal
          else newBtc = newVal
        }
      }
    }

    // Round to whole numbers
    newSpxl = Math.round(newSpxl)
    newTqqq = Math.round(newTqqq)
    newBtc = Math.round(newBtc)

    // Final adjustment to ensure exactly 100% after rounding (only adjust unlocked)
    const finalTotal = newSpxl + newTqqq + newBtc
    if (finalTotal !== 100) {
      const adjust = 100 - finalTotal
      // Find largest unlocked non-changed value to adjust
      const adjustable = [
        { asset: 'SPXL', val: newSpxl, canAdjust: asset !== 'SPXL' && !locked.SPXL },
        { asset: 'TQQQ', val: newTqqq, canAdjust: asset !== 'TQQQ' && !locked.TQQQ },
        { asset: 'BTC', val: newBtc, canAdjust: asset !== 'BTC' && !locked.BTC }
      ].filter(a => a.canAdjust).sort((a, b) => b.val - a.val)

      if (adjustable.length > 0) {
        if (adjustable[0].asset === 'SPXL') newSpxl += adjust
        else if (adjustable[0].asset === 'TQQQ') newTqqq += adjust
        else newBtc += adjust
      }
    }

    onChange(newSpxl, newTqqq, newBtc)
  }

  return (
    <div className="space-y-1.5">
      {/* Visual bar */}
      <div className="h-5 rounded overflow-hidden flex">
        {spxlPct > 0 && (
          <div
            className="flex items-center justify-center text-[9px] text-white font-medium gap-1"
            style={{ width: `${spxlPct}%`, backgroundColor: '#3b82f6' }}
            title={`SPXL: ${spxlPct}%`}
          >
            {spxlPct > 20 ? `SPXL ${spxlPct}%` : spxlPct > 10 ? `${spxlPct}%` : ''}
          </div>
        )}
        {tqqqPct > 0 && (
          <div
            className="flex items-center justify-center text-[9px] text-white font-medium gap-1"
            style={{ width: `${tqqqPct}%`, backgroundColor: '#22c55e' }}
            title={`TQQQ: ${tqqqPct}%`}
          >
            {tqqqPct > 20 ? `TQQQ ${tqqqPct}%` : tqqqPct > 10 ? `${tqqqPct}%` : ''}
          </div>
        )}
        {btcPct > 0 && (
          <div
            className="flex items-center justify-center text-[9px] text-white font-medium gap-1"
            style={{ width: `${btcPct}%`, backgroundColor: '#f97316' }}
            title={`BTC: ${btcPct}%`}
          >
            {btcPct > 20 ? `BTC ${btcPct}%` : btcPct > 10 ? `${btcPct}%` : ''}
          </div>
        )}
      </div>

      {/* Sliders */}
      <div className="space-y-1">
        <SliderControl label="SPXL" value={spxlPct} onChange={(v) => handleChange('SPXL', v)} color="#3b82f6" locked={locked.SPXL} onToggleLock={() => toggleLock('SPXL')} />
        <SliderControl label="TQQQ" value={tqqqPct} onChange={(v) => handleChange('TQQQ', v)} color="#22c55e" locked={locked.TQQQ} onToggleLock={() => toggleLock('TQQQ')} />
        <SliderControl label="BTC" value={btcPct} onChange={(v) => handleChange('BTC', v)} color="#f97316" locked={locked.BTC} onToggleLock={() => toggleLock('BTC')} />
      </div>

      {total !== 100 && (
        <div className="text-[10px] text-yellow-400">
          Must total 100%
        </div>
      )}
    </div>
  )
}

interface SliderControlProps {
  label: string
  value: number
  onChange: (value: number) => void
  color: string
  locked: boolean
  onToggleLock: () => void
}

function SliderControl({ label, value, onChange, color, locked, onToggleLock }: SliderControlProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onToggleLock}
        className={`w-4 h-4 flex items-center justify-center rounded text-[10px] transition-colors ${
          locked ? 'bg-yellow-600 text-white' : 'bg-slate-600 text-slate-400 hover:bg-slate-500'
        }`}
        title={locked ? 'Unlock' : 'Lock'}
      >
        {locked ? '🔒' : '🔓'}
      </button>
      <span className="text-[10px] text-slate-400 w-9">{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} 0%, ${color} ${value}%, #334155 ${value}%, #334155 100%)`,
          height: '6px',
          borderRadius: '3px'
        }}
      />
      <span className="text-[10px] text-slate-300 font-mono w-7 text-right">{value}%</span>
    </div>
  )
}
