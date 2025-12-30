import type { SubFund, CreateSubFundInput, ApiResult } from './types'

const API_BASE = '/api/v1'

export async function fetchSubFunds(): Promise<ApiResult<SubFund[]>> {
  const response = await fetch(`${API_BASE}/subfunds`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to fetch subfunds' } }))
    return { error: error.error?.message ?? 'Failed to fetch subfunds' }
  }
  const data = await response.json()
  return { data }
}

export async function fetchSubFund(id: string): Promise<ApiResult<SubFund>> {
  const response = await fetch(`${API_BASE}/subfunds/${id}`)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'SubFund not found' } }))
    return { error: error.error?.message ?? 'SubFund not found' }
  }
  const data = await response.json()
  return { data }
}

export async function createSubFund(input: CreateSubFundInput): Promise<ApiResult<SubFund>> {
  const response = await fetch(`${API_BASE}/subfunds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to create subfund' } }))
    return { error: error.error?.message ?? 'Failed to create subfund' }
  }
  const data = await response.json()
  return { data }
}

export async function updateSubFund(id: string, input: Partial<CreateSubFundInput>): Promise<ApiResult<SubFund>> {
  const response = await fetch(`${API_BASE}/subfunds/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to update subfund' } }))
    return { error: error.error?.message ?? 'Failed to update subfund' }
  }
  const data = await response.json()
  return { data }
}

export async function deleteSubFund(id: string): Promise<ApiResult<void>> {
  const response = await fetch(`${API_BASE}/subfunds/${id}`, {
    method: 'DELETE'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Failed to delete subfund' } }))
    return { error: error.error?.message ?? 'Failed to delete subfund' }
  }
  return {}
}
