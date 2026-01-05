/**
 * Shared API utilities for consistent error handling and response parsing.
 * Eliminates duplicate error handling patterns across API files.
 */

export interface ApiResult<T> {
  data?: T
  error?: string
}

const API_BASE = '/api/v1'

export { API_BASE }

/**
 * Fetch JSON from an API endpoint with consistent error handling.
 * Replaces 51+ duplicate error handling patterns across API files.
 */
export async function fetchJson<T>(
  endpoint: string,
  options?: RequestInit,
  errorMessage = 'Request failed'
): Promise<ApiResult<T>> {
  const url = endpoint.startsWith('/') ? endpoint : `${API_BASE}/${endpoint}`
  const response = await fetch(url, options)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: errorMessage } }))
    return { error: error.error?.message ?? errorMessage }
  }

  // Handle empty responses (like DELETE operations)
  const text = await response.text()
  if (!text) {
    return {} as ApiResult<T>
  }

  const data = JSON.parse(text) as T
  return { data }
}

/**
 * POST JSON to an API endpoint.
 */
export async function postJson<T>(
  endpoint: string,
  body: unknown,
  errorMessage = 'Request failed'
): Promise<ApiResult<T>> {
  return fetchJson<T>(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, errorMessage)
}

/**
 * PUT JSON to an API endpoint.
 */
export async function putJson<T>(
  endpoint: string,
  body: unknown,
  errorMessage = 'Request failed'
): Promise<ApiResult<T>> {
  return fetchJson<T>(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, errorMessage)
}

/**
 * DELETE an API resource.
 */
export async function deleteResource<T = void>(
  endpoint: string,
  errorMessage = 'Delete failed'
): Promise<ApiResult<T>> {
  return fetchJson<T>(endpoint, { method: 'DELETE' }, errorMessage)
}
