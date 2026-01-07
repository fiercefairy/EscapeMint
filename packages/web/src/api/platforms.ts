import { fetchJson, postJson, putJson, deleteResource, API_BASE } from './utils'
import type { ApiResult } from './utils'

// Re-export for backwards compatibility
export type { ApiResult }

export interface Platform {
  id: string
  name: string
  color?: string
  manage_cash?: boolean
  /** When true, trades auto-create entries in the cash fund */
  auto_sync_cash?: boolean
}

export async function fetchPlatforms(): Promise<ApiResult<Platform[]>> {
  return fetchJson<Platform[]>(`${API_BASE}/platforms`, undefined, 'Failed to fetch platforms')
}

export async function createPlatform(platform: { id: string; name: string; color?: string }): Promise<ApiResult<Platform>> {
  return postJson<Platform>(`${API_BASE}/platforms`, platform, 'Failed to create platform')
}

export async function deletePlatform(id: string): Promise<ApiResult<void>> {
  return deleteResource<void>(`${API_BASE}/platforms/${id}`, 'Failed to delete platform')
}

export async function renamePlatform(id: string, newId: string, newName?: string): Promise<ApiResult<{ id: string; name: string; renamed: number }>> {
  return putJson<{ id: string; name: string; renamed: number }>(
    `${API_BASE}/platforms/${id}/rename`,
    { newId, newName },
    'Failed to rename platform'
  )
}

export interface PlatformFundMetrics {
  id: string
  ticker: string
  fundType: string
  status: string
  fundSize: number
  currentValue: number
  cash: number
  startInput: number
  daysActive: number
  dividends: number
  expenses: number
  cashInterest: number
  unrealized: number
  realized: number
  liquidPnl: number
  realizedAPY: number
  liquidAPY: number
  entries: number
  audited?: string
  // Derivatives-specific fields
  position?: number
  avgEntry?: number
  marginBalance?: number
  cumFunding?: number
  cumRebates?: number
  cumFees?: number
}

export interface CashInterestHistory {
  date: string
  balance: number
  interest: number
}

export interface PlatformMetrics {
  platformId: string
  platformName: string
  totalFundSize: number
  totalValue: number
  totalCash: number
  totalStartInput: number
  totalDividends: number
  totalExpenses: number
  totalCashInterest: number
  totalRealized: number
  totalUnrealized: number
  totalGainUsd: number
  totalGainPct: number
  activeFunds: number
  closedFunds: number
  cashInterestHistory: CashInterestHistory[]
  funds: PlatformFundMetrics[]
  // Table configuration
  fundsColumnOrder?: string[]
  fundsVisibleColumns?: string[]
}

export async function fetchPlatformMetrics(id: string): Promise<ApiResult<PlatformMetrics>> {
  return fetchJson<PlatformMetrics>(`${API_BASE}/platforms/${id}/metrics`, undefined, 'Failed to fetch platform metrics')
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
  /** When true, trades auto-create entries in the cash fund */
  autoSyncCash?: boolean
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
  return fetchJson<PlatformCashStatus>(`${API_BASE}/platforms/${platformId}/cash`, undefined, 'Failed to fetch platform cash status')
}

export async function enableCashTracking(platformId: string): Promise<ApiResult<EnableCashTrackingResult>> {
  return postJson<EnableCashTrackingResult>(
    `${API_BASE}/platforms/${platformId}/enable-cash-tracking`,
    {},
    'Failed to enable cash tracking'
  )
}

export async function disableCashTracking(platformId: string, targetFundId?: string): Promise<ApiResult<DisableCashTrackingResult>> {
  return postJson<DisableCashTrackingResult>(
    `${API_BASE}/platforms/${platformId}/disable-cash-tracking`,
    targetFundId ? { target_fund_id: targetFundId } : {},
    'Failed to disable cash tracking'
  )
}

export interface PlatformConfigUpdate {
  funds_column_order?: string[]
  funds_visible_columns?: string[]
  color?: string
  url?: string
  notes?: string
  /** When true, trades auto-create entries in the cash fund */
  auto_sync_cash?: boolean
}

export async function updatePlatformConfig(platformId: string, config: PlatformConfigUpdate): Promise<ApiResult<{ success: boolean }>> {
  return fetchJson<{ success: boolean }>(
    `${API_BASE}/platforms/${platformId}/config`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    },
    'Failed to update platform config'
  )
}
