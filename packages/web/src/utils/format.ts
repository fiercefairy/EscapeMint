export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
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
