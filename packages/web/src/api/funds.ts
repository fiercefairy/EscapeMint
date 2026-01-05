const API_BASE = '/api/v1'

// Event to notify components when funds list changes
export const FUNDS_CHANGED_EVENT = 'escapemint:funds-changed'

export function notifyFundsChanged() {
  window.dispatchEvent(new CustomEvent(FUNDS_CHANGED_EVENT))
}

export interface ChartBounds {
  yMin?: number
  yMax?: number
}

export type FundStatus = 'active' | 'closed'
export type FundType = 'cash' | 'stock' | 'crypto'

export interface FundConfig {
  fund_type?: FundType
  status?: FundStatus
  fund_size_usd: number
  target_apy: number
  interval_days: number
  input_min_usd: number
  input_mid_usd: number
  input_max_usd: number
  max_at_pct: number
  min_profit_usd: number
  cash_apy: number
  margin_apr: number
  margin_access_usd: number
  accumulate: boolean
  manage_cash?: boolean
  auto_apply_cash_apy?: boolean
  margin_enabled?: boolean
  dividend_reinvest?: boolean
  interest_reinvest?: boolean
  expense_from_fund?: boolean
  cash_fund?: string  // ID of cash fund to use when manage_cash=false
  start_date: string
  chart_bounds?: Record<string, ChartBounds>
  charts_collapsed?: boolean
  entries_column_order?: string[]
  entries_visible_columns?: string[]
  audited?: string
}

export interface FundSummary {
  id: string
  platform: string
  ticker: string
  config: FundConfig
  entryCount: number
  latestEquity: {
    date: string
    value: number
  } | null
}

export interface FundEntry {
  date: string
  value: number
  cash?: number  // Actual cash available in account (tracked, not calculated)
  action?: 'BUY' | 'SELL' | 'HOLD' | 'DEPOSIT' | 'WITHDRAW'
  amount?: number
  shares?: number
  price?: number
  dividend?: number
  expense?: number
  cash_interest?: number
  fund_size?: number
  margin_available?: number
  margin_borrowed?: number
  notes?: string
}

export interface FundState {
  cash_available_usd: number
  expected_target_usd: number
  actual_value_usd: number
  start_input_usd: number
  gain_usd: number
  gain_pct: number
  target_diff_usd: number
  cash_interest_usd: number
  realized_gains_usd: number
}

export interface Recommendation {
  action: 'BUY' | 'SELL'
  amount: number
  explanation: {
    start_input_usd: number
    expected_target_usd: number
    actual_value_usd: number
    gain_usd: number
    gain_pct: number
    target_diff_usd: number
    cash_available_usd: number
    limit_usd: number
    reasoning: string
  }
  insufficient_cash?: boolean
}

export interface FundDetail {
  id: string
  platform: string
  ticker: string
  config: FundConfig
  entries: FundEntry[]
}

export interface ClosedFundMetrics {
  total_invested_usd: number
  total_returned_usd: number
  total_dividends_usd: number
  total_cash_interest_usd: number
  total_expenses_usd: number
  net_gain_usd: number
  return_pct: number
  apy: number
  start_date: string
  end_date: string
  duration_days: number
}

export interface FundStateResponse {
  fund: {
    id: string
    platform: string
    ticker: string
    config: FundConfig
  }
  state: FundState | null
  recommendation: Recommendation | null
  closedMetrics: ClosedFundMetrics | null
  margin_available?: number
  margin_borrowed?: number
  cash_available?: number
  cash_source?: string | null  // null if from own fund, fund ID if from shared cash fund
  fund_size?: number
}

export interface ApiResult<T> {
  data?: T
  error?: string
}

export async function fetchFunds(includeTest = false): Promise<ApiResult<FundSummary[]>> {
  const url = includeTest ? `${API_BASE}/funds?include_test=true` : `${API_BASE}/funds`
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch funds' } }))
    return { error: error.error?.message ?? 'Failed to fetch funds' }
  }
  const data = await response.json()
  return { data }
}

export async function fetchFund(id: string): Promise<ApiResult<FundDetail>> {
  const response = await fetch(`${API_BASE}/funds/${id}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Fund not found' } }))
    return { error: error.error?.message ?? 'Fund not found' }
  }
  const data = await response.json()
  return { data }
}

export async function fetchFundState(id: string): Promise<ApiResult<FundStateResponse>> {
  const response = await fetch(`${API_BASE}/funds/${id}/state`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch fund state' } }))
    return { error: error.error?.message ?? 'Failed to fetch fund state' }
  }
  const data = await response.json()
  return { data }
}

export async function updateFundConfig(id: string, config: Partial<FundConfig>): Promise<ApiResult<FundDetail>> {
  const response = await fetch(`${API_BASE}/funds/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to update fund' } }))
    return { error: error.error?.message ?? 'Failed to update fund' }
  }
  const data = await response.json()
  return { data }
}

export async function updateFund(id: string, updates: { config?: Partial<FundConfig>; platform?: string; ticker?: string }): Promise<ApiResult<FundDetail>> {
  const response = await fetch(`${API_BASE}/funds/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to update fund' } }))
    return { error: error.error?.message ?? 'Failed to update fund' }
  }
  const data = await response.json()
  return { data }
}

export async function deleteFund(id: string): Promise<ApiResult<void>> {
  const response = await fetch(`${API_BASE}/funds/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to delete fund' } }))
    return { error: error.error?.message ?? 'Failed to delete fund' }
  }
  return {}
}

export async function createFund(data: {
  platform: string
  ticker: string
  config: Partial<FundConfig>
  initialEntry?: Partial<FundEntry>
}): Promise<ApiResult<FundDetail>> {
  const response = await fetch(`${API_BASE}/funds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to create fund' } }))
    return { error: error.error?.message ?? 'Failed to create fund' }
  }
  const result = await response.json()
  return { data: result }
}

export async function addFundEntry(id: string, entry: Partial<FundEntry>): Promise<ApiResult<{ entry: FundEntry; state: FundState; recommendation: Recommendation }>> {
  const response = await fetch(`${API_BASE}/funds/${id}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to add entry' } }))
    return { error: error.error?.message ?? 'Failed to add entry' }
  }
  const data = await response.json()
  return { data }
}

export async function previewRecommendation(id: string, equityValue: number, date?: string): Promise<ApiResult<{ state: FundState; recommendation: Recommendation | null; margin_available: number; fund_size: number }>> {
  const response = await fetch(`${API_BASE}/funds/${id}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ equity_value_usd: equityValue, date })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to preview recommendation' } }))
    return { error: error.error?.message ?? 'Failed to preview recommendation' }
  }
  const data = await response.json()
  return { data }
}

export async function updateFundEntry(id: string, entryIndex: number, entry: FundEntry): Promise<ApiResult<{ entry: FundEntry; fund: FundDetail }>> {
  const response = await fetch(`${API_BASE}/funds/${id}/entries/${entryIndex}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to update entry' } }))
    return { error: error.error?.message ?? 'Failed to update entry' }
  }
  const data = await response.json()
  return { data }
}

export async function deleteFundEntry(id: string, entryIndex: number): Promise<ApiResult<{ fund: FundDetail }>> {
  const response = await fetch(`${API_BASE}/funds/${id}/entries/${entryIndex}`, {
    method: 'DELETE'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to delete entry' } }))
    return { error: error.error?.message ?? 'Failed to delete entry' }
  }
  const data = await response.json()
  return { data }
}

export async function recalculateFund(id: string): Promise<ApiResult<{ message: string; fund: FundDetail }>> {
  const response = await fetch(`${API_BASE}/funds/${id}/recalculate`, {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to recalculate fund' } }))
    return { error: error.error?.message ?? 'Failed to recalculate fund' }
  }
  const data = await response.json()
  return { data }
}

export type InterpolatableColumn = 'margin_available' | 'margin_borrowed' | 'fund_size' | 'value'

export interface InterpolateResult {
  success: boolean
  message: string
  interpolated: number
  column: string
  totalEntries: number
  knownValues: number
}

export async function interpolateColumn(id: string, column: InterpolatableColumn): Promise<ApiResult<InterpolateResult>> {
  const response = await fetch(`${API_BASE}/funds/${id}/interpolate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: `Failed to interpolate ${column} values` } }))
    return { error: error.error?.message ?? `Failed to interpolate ${column} values` }
  }
  const data = await response.json()
  return { data }
}

// Aggregate calculations for dashboard
export interface FundMetrics {
  id: string
  platform: string
  ticker: string
  status: 'active' | 'closed'
  fundType: 'cash' | 'stock' | 'crypto'
  fundSize: number
  currentValue: number
  startInput: number
  daysActive: number
  timeWeightedFundSize: number
  realizedGains: number
  realizedAPY: number
  liquidAPY: number
  projectedAnnualReturn: number
  gainUsd: number
  gainPct: number
  fundShares: number
  fundSharesPct: number
}

export interface AggregateMetrics {
  totalFundSize: number
  totalValue: number
  totalStartInput: number
  totalTimeWeightedFundSize: number
  totalDaysActive: number
  totalRealizedGains: number
  realizedAPY: number
  liquidAPY: number
  projectedAnnualReturn: number
  totalGainUsd: number
  totalGainPct: number
  activeFunds: number
  closedFunds: number
  funds: FundMetrics[]
}

export async function fetchAggregateMetrics(includeTest = false): Promise<ApiResult<AggregateMetrics>> {
  const url = includeTest ? `${API_BASE}/funds/aggregate?include_test=true` : `${API_BASE}/funds/aggregate`
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch aggregate metrics' } }))
    return { error: error.error?.message ?? 'Failed to fetch aggregate metrics' }
  }
  const data = await response.json()
  return { data }
}

// Audit trail entry with fund info
export interface AuditEntry {
  fundId: string
  platform: string
  ticker: string
  date: string
  value: number
  action?: 'BUY' | 'SELL' | 'HOLD' | 'DEPOSIT' | 'WITHDRAW'
  amount?: number
  dividend?: number
  expense?: number
  notes?: string
}

export async function fetchAllEntries(): Promise<ApiResult<AuditEntry[]>> {
  // Fetch all funds and flatten their entries
  const fundsResult = await fetchFunds()
  if (fundsResult.error) {
    return { error: fundsResult.error }
  }

  const allEntries: AuditEntry[] = []

  // Fetch details for each fund to get entries
  const promises = (fundsResult.data ?? []).map(async (fundSummary) => {
    const fundResult = await fetchFund(fundSummary.id)
    if (fundResult.data) {
      const fund = fundResult.data
      for (const entry of fund.entries) {
        allEntries.push({
          fundId: fund.id,
          platform: fund.platform,
          ticker: fund.ticker,
          ...entry
        })
      }
    }
  })

  await Promise.all(promises)

  // Sort by date descending
  allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return { data: allEntries }
}

// Legacy fallback for calculating metrics from fund summaries
export function calculateAggregateMetrics(funds: FundSummary[]): Omit<AggregateMetrics, 'funds' | 'totalStartInput' | 'totalTimeWeightedFundSize' | 'totalDaysActive' | 'totalRealizedGains'> {
  let totalFundSize = 0
  let totalValue = 0
  let activeFunds = 0
  let closedFunds = 0

  for (const fund of funds) {
    totalFundSize += fund.config.fund_size_usd
    totalValue += fund.latestEquity?.value ?? 0

    if (fund.config.status === 'closed') {
      closedFunds++
    } else {
      activeFunds++
    }
  }

  const totalGainUsd = totalValue - totalFundSize
  const totalGainPct = totalFundSize > 0 ? (totalValue / totalFundSize - 1) : 0

  // Fallback estimate - use weighted average of target APYs
  const weightedAPY = funds.reduce((sum, f) => sum + f.config.target_apy * f.config.fund_size_usd, 0) / (totalFundSize || 1)
  const realizedAPY = weightedAPY
  const projectedAnnualReturn = totalValue * realizedAPY

  return {
    totalFundSize,
    totalValue,
    totalGainUsd,
    totalGainPct,
    realizedAPY,
    projectedAnnualReturn,
    activeFunds,
    closedFunds
  }
}

// Historical time series data for charts
export interface TimeSeriesPoint {
  date: string
  totalFundSize: number
  totalValue: number
  totalCash: number
  totalMarginBorrowed: number
  totalStartInput: number
  totalDividends: number
  totalExpenses: number
  realizedAPY: number
  dpiLiquid: number
  dpiExtracted: number
}

export interface AllocationData {
  id: string
  ticker: string
  platform: string
  value: number
  cash: number
  fundSize: number
  marginAccess: number
  marginBorrowed: number
}

export interface HistoryResponse {
  timeSeries: TimeSeriesPoint[]
  currentAllocations: AllocationData[]
  totals: {
    totalCurrentValue: number
    totalCurrentCash: number
    totalCurrentMarginAccess: number
    totalCurrentMarginBorrowed: number
  }
}

export async function fetchHistory(includeTest = false): Promise<ApiResult<HistoryResponse>> {
  const url = includeTest ? `${API_BASE}/funds/history?include_test=true` : `${API_BASE}/funds/history`
  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch history' } }))
    return { error: error.error?.message ?? 'Failed to fetch history' }
  }
  const data = await response.json()
  return { data }
}
