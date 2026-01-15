export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

/**
 * Compact currency format for chart axes: $1.2M, $50K, $500
 */
export const formatCurrencyCompact = (value: number): string => {
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}

export const formatPercent = (value: number) => {
  // Handle edge cases
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return '--'
  }
  // Clamp extremely large values
  const clamped = Math.max(-9999, Math.min(9999, value))
  const pct = clamped * 100
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
}

/**
 * Simple percent format for allocations: 45.2%
 */
export const formatPercentSimple = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Format date in local timezone as YYYY-MM-DD
 * Use this instead of toISOString() to avoid UTC timezone issues
 */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Detect if a value change looks like a digit error (missing or extra digit)
 * Returns 'extra' if user likely added a digit, 'missing' if likely removed one, null if ok
 */
export function detectDigitError(newValue: number, priorValue: number): 'extra' | 'missing' | null {
  // Skip if either value is 0 or negative
  if (newValue <= 0 || priorValue <= 0) return null

  // Calculate the ratio
  const ratio = newValue / priorValue

  // Check for ~10x increase (extra digit)
  // Range 8-12 allows ~20% variance around 10x to catch values like $1,200 -> $11,000 (9.17x)
  // while avoiding false positives from more modest legitimate gains
  if (ratio >= 8 && ratio <= 12) {
    return 'extra'
  }

  // Check for ~0.1x decrease (missing digit)
  // Range 0.08-0.12 is the inverse of 8-12, catching values like $12,000 -> $1,200 (0.1x)
  if (ratio >= 0.08 && ratio <= 0.12) {
    return 'missing'
  }

  return null
}

/**
 * Get the expected current equity from a list of fund entries
 * Used for digit error detection when entering new equity values
 * Calculates equity AFTER the last action (since value is BEFORE action)
 */
export const getPriorEquity = (entries: {
  date: string
  value?: number
  action?: string
  amount?: number
  dividend?: number
  cash_interest?: number
}[]): number | null => {
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const lastEntry = sorted[sorted.length - 1]
  if (!lastEntry || lastEntry.value === undefined) return null

  let equity = lastEntry.value
  const amount = lastEntry.amount ?? 0

  // Calculate expected equity AFTER the last action
  // value is the equity BEFORE the action was taken
  switch (lastEntry.action) {
    case 'BUY':
    case 'DEPOSIT':
      equity += amount
      break
    case 'SELL':
    case 'WITHDRAW':
      equity -= amount
      break
    // HOLD, MARGIN, derivatives actions: no simple amount-based change
  }

  // Add dividend and interest income (these are always additions)
  equity += lastEntry.dividend ?? 0
  equity += lastEntry.cash_interest ?? 0

  return equity
}
