import type { FundState } from './types.js'

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/**
 * Generates a summary of the fund state for display.
 */
export function summarizeFundState(state: FundState): string {
  const lines = [
    `Total Invested: ${formatCurrency(state.start_input_usd)}`,
    `Current Value: ${formatCurrency(state.actual_value_usd)}`,
    `Expected Target: ${formatCurrency(state.expected_target_usd)}`,
    `Gain: ${formatCurrency(state.gain_usd)} (${formatPercent(state.gain_pct)})`,
    `Target Difference: ${formatCurrency(state.target_diff_usd)}`,
    `Cash Available: ${formatCurrency(state.cash_available_usd)}`,
    `Realized Gains: ${formatCurrency(state.realized_gains_usd)}`
  ]

  return lines.join('\n')
}
