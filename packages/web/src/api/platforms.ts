const API_BASE = '/api/v1'

export interface Platform {
  id: string
  name: string
  color?: string
  cash_apy?: number
  auto_calculate_interest?: boolean
  manage_cash?: boolean
}

export interface ApiResult<T> {
  data?: T
  error?: string
}

export async function fetchPlatforms(): Promise<ApiResult<Platform[]>> {
  const response = await fetch(`${API_BASE}/platforms`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch platforms' } }))
    return { error: error.error?.message ?? 'Failed to fetch platforms' }
  }
  const data = await response.json()
  return { data }
}

export async function createPlatform(platform: { id: string; name: string; color?: string; cash_apy?: number; auto_calculate_interest?: boolean }): Promise<ApiResult<Platform>> {
  const response = await fetch(`${API_BASE}/platforms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(platform)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to create platform' } }))
    return { error: error.error?.message ?? 'Failed to create platform' }
  }
  const data = await response.json()
  return { data }
}

export async function deletePlatform(id: string): Promise<ApiResult<void>> {
  const response = await fetch(`${API_BASE}/platforms/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to delete platform' } }))
    return { error: error.error?.message ?? 'Failed to delete platform' }
  }
  return {}
}

export async function renamePlatform(id: string, newId: string, newName?: string): Promise<ApiResult<{ id: string; name: string; renamed: number }>> {
  const response = await fetch(`${API_BASE}/platforms/${id}/rename`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newId, newName })
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to rename platform' } }))
    return { error: error.error?.message ?? 'Failed to rename platform' }
  }
  const data = await response.json()
  return { data }
}

export interface PlatformFundMetrics {
  id: string
  ticker: string
  status: string
  fundSize: number
  currentValue: number
  gainUsd: number
  gainPct: number
  entries: number
}

export interface CashInterestHistory {
  date: string
  balance: number
  interest: number
}

export interface ApyHistoryEntry {
  date: string
  rate: number
  notes?: string
}

export interface PlatformMetrics {
  platformId: string
  platformName: string
  cashApy: number
  autoCalculateInterest: boolean
  apyHistory: ApyHistoryEntry[]
  totalFundSize: number
  totalValue: number
  totalCash: number
  totalStartInput: number
  totalDividends: number
  totalExpenses: number
  totalCashInterest: number
  totalGainUsd: number
  totalGainPct: number
  realizedAPY: number
  activeFunds: number
  closedFunds: number
  cashInterestHistory: CashInterestHistory[]
  funds: PlatformFundMetrics[]
}

export async function fetchPlatformMetrics(id: string): Promise<ApiResult<PlatformMetrics>> {
  const response = await fetch(`${API_BASE}/platforms/${id}/metrics`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch platform metrics' } }))
    return { error: error.error?.message ?? 'Failed to fetch platform metrics' }
  }
  const data = await response.json()
  return { data }
}

export async function addApyHistoryEntry(
  platformId: string,
  entry: { date: string; rate: number; notes?: string }
): Promise<ApiResult<ApyHistoryEntry>> {
  const response = await fetch(`${API_BASE}/platforms/${platformId}/apy-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to add APY entry' } }))
    return { error: error.error?.message ?? 'Failed to add APY entry' }
  }
  const data = await response.json()
  return { data }
}

export async function updateApyHistoryEntry(
  platformId: string,
  date: string,
  entry: { rate: number; notes?: string }
): Promise<ApiResult<ApyHistoryEntry>> {
  const response = await fetch(`${API_BASE}/platforms/${platformId}/apy-history/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to update APY entry' } }))
    return { error: error.error?.message ?? 'Failed to update APY entry' }
  }
  const data = await response.json()
  return { data }
}

export async function deleteApyHistoryEntry(
  platformId: string,
  date: string
): Promise<ApiResult<void>> {
  const response = await fetch(`${API_BASE}/platforms/${platformId}/apy-history/${date}`, {
    method: 'DELETE'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to delete APY entry' } }))
    return { error: error.error?.message ?? 'Failed to delete APY entry' }
  }
  return {}
}

// Platform cash management

export interface PlatformCashStatus {
  enabled: boolean
  cashFundId: string | null
  balance: number
  marginAvailable: number
  marginBorrowed: number
  interestEarned: number
  entriesCount?: number
  error?: string
}

export interface EnableCashTrackingResult {
  success: boolean
  cashFundId: string
  migratedCash: number
  migratedMarginAvailable: number
  migratedMarginBorrowed: number
  fundsUpdated: number
  backupFile: string
}

export interface DisableCashTrackingResult {
  success: boolean
  cashFundDeleted: string
  restoredTo: string
  restoredCash: number
  restoredMarginAvailable: number
  restoredMarginBorrowed: number
  fundsUpdated: number
}

export async function fetchPlatformCashStatus(platformId: string): Promise<ApiResult<PlatformCashStatus>> {
  const response = await fetch(`${API_BASE}/platforms/${platformId}/cash`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch platform cash status' } }))
    return { error: error.error?.message ?? 'Failed to fetch platform cash status' }
  }
  const data = await response.json()
  return { data }
}

export async function enableCashTracking(platformId: string): Promise<ApiResult<EnableCashTrackingResult>> {
  const response = await fetch(`${API_BASE}/platforms/${platformId}/enable-cash-tracking`, {
    method: 'POST'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to enable cash tracking' } }))
    return { error: error.error?.message ?? 'Failed to enable cash tracking' }
  }
  const data = await response.json()
  return { data }
}

export async function disableCashTracking(platformId: string, targetFundId?: string): Promise<ApiResult<DisableCashTrackingResult>> {
  const response = await fetch(`${API_BASE}/platforms/${platformId}/disable-cash-tracking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(targetFundId ? { target_fund_id: targetFundId } : {})
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to disable cash tracking' } }))
    return { error: error.error?.message ?? 'Failed to disable cash tracking' }
  }
  const data = await response.json()
  return { data }
}
