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
