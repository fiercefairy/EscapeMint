/**
 * Shared EventSource streaming utilities.
 * Eliminates duplicate SSE listener setup across 4+ streaming functions.
 */

import { API_BASE } from './utils'

/**
 * Standard callbacks for SSE streaming operations.
 */
export interface StreamCallbacks<
  TStatus = unknown,
  TProgress = unknown,
  TComplete = unknown,
  TError = { message: string }
> {
  onStatus?: (data: TStatus) => void
  onProgress?: (data: TProgress) => void
  onComplete?: (data: TComplete) => void
  onError?: (data: TError) => void
}

/**
 * Create an EventSource with standard event listeners.
 * Replaces 4 identical streaming function implementations.
 *
 * @param endpoint - API endpoint (will be prefixed with API_BASE if not absolute)
 * @param callbacks - Event handlers for status, progress, complete, and error events
 * @returns Object with close() method to terminate the stream
 */
export function createEventStream<
  TStatus = unknown,
  TProgress = unknown,
  TComplete = unknown,
  TError = { message: string }
>(
  endpoint: string,
  callbacks: StreamCallbacks<TStatus, TProgress, TComplete, TError>
): { eventSource: EventSource; close: () => void } {
  const url = endpoint.startsWith('http') || endpoint.startsWith('/')
    ? endpoint
    : `${API_BASE}/${endpoint}`

  const eventSource = new EventSource(url)

  eventSource.addEventListener('status', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as TStatus
    callbacks.onStatus?.(data)
  })

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as TProgress
    callbacks.onProgress?.(data)
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as TComplete
    callbacks.onComplete?.(data)
    eventSource.close()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    if (e.data) {
      const data = JSON.parse(e.data) as TError
      callbacks.onError?.(data)
    } else {
      callbacks.onError?.({ message: 'Connection lost' } as TError)
    }
    eventSource.close()
  })

  // Handle connection errors
  eventSource.onerror = () => {
    callbacks.onError?.({ message: 'Connection error' } as TError)
    eventSource.close()
  }

  return {
    eventSource,
    close: () => eventSource.close()
  }
}

/**
 * Build a query string from parameters.
 */
export function buildQueryString(params: Record<string, string | boolean | number | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value))
    }
  }
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}
