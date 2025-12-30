const API_BASE = '/api/v1'

export interface Platform {
  id: string
  name: string
  color?: string
  cash_apy?: number
  auto_calculate_interest?: boolean
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
