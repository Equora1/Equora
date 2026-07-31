import 'server-only'

import type { PerformanceCategory, PerformanceEvent } from '@/lib/types/performance'
import { isPerformanceDiagnosticsEnabled } from '@/lib/server/performance-diagnostics'

type PerformanceStore = {
  events: PerformanceEvent[]
}

declare global {
  // eslint-disable-next-line no-var
  var __equoraPerformanceStore: PerformanceStore | undefined
}

const MAX_EVENTS = 300

function getStore(): PerformanceStore {
  if (!globalThis.__equoraPerformanceStore) {
    globalThis.__equoraPerformanceStore = { events: [] }
  }
  return globalThis.__equoraPerformanceStore
}

function safeMeta(meta?: Record<string, unknown>): PerformanceEvent['meta'] {
  if (!meta) return undefined
  const result: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (typeof value === 'string') {
        const cleanValue = ['from', 'to', 'route'].includes(key) ? value.split('?')[0].split('#')[0] : value
        result[key] = cleanValue.slice(0, 160)
      } else {
        result[key] = value
      }
    }
  }
  return Object.keys(result).length ? result : undefined
}

type PerformanceEventInput = Omit<PerformanceEvent, 'id' | 'timestamp' | 'meta'> & { meta?: Record<string, unknown> }

export function recordPerformanceEvent(input: PerformanceEventInput) {
  if (!isPerformanceDiagnosticsEnabled()) return null

  const event: PerformanceEvent = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
    durationMs: Math.max(0, Math.round(input.durationMs * 10) / 10),
    route: input.route?.split('?')[0].split('#')[0].slice(0, 160),
    meta: safeMeta(input.meta),
  }

  const store = getStore()
  store.events.unshift(event)
  if (store.events.length > MAX_EVENTS) store.events.length = MAX_EVENTS

  if (process.env.EQUORA_PERFORMANCE_LOGS === 'true') {
    console.info(`[equora:perf] ${JSON.stringify(event)}`)
  }

  return event
}

export async function measurePerformance<T>(
  name: string,
  category: PerformanceCategory,
  task: () => PromiseLike<T> | T,
  options?: { route?: string; meta?: Record<string, unknown> },
): Promise<T> {
  if (!isPerformanceDiagnosticsEnabled()) return await task()

  const startedAt = performance.now()
  try {
    const result = await task()
    recordPerformanceEvent({
      name,
      category,
      durationMs: performance.now() - startedAt,
      status: 'ok',
      route: options?.route,
      meta: options?.meta,
    })
    return result
  } catch (error) {
    recordPerformanceEvent({
      name,
      category,
      durationMs: performance.now() - startedAt,
      status: 'error',
      route: options?.route,
      meta: {
        ...(options?.meta ?? {}),
        error: error instanceof Error ? error.name : 'unknown',
      },
    })
    throw error
  }
}


export function measurePerformanceSync<T>(
  name: string,
  category: PerformanceCategory,
  task: () => T,
  options?: { route?: string; meta?: Record<string, unknown> },
): T {
  if (!isPerformanceDiagnosticsEnabled()) return task()

  const startedAt = performance.now()
  try {
    const result = task()
    recordPerformanceEvent({
      name,
      category,
      durationMs: performance.now() - startedAt,
      status: 'ok',
      route: options?.route,
      meta: options?.meta,
    })
    return result
  } catch (error) {
    recordPerformanceEvent({
      name,
      category,
      durationMs: performance.now() - startedAt,
      status: 'error',
      route: options?.route,
      meta: { ...(options?.meta ?? {}), error: error instanceof Error ? error.name : 'unknown' },
    })
    throw error
  }
}

export function getPerformanceEvents(limit = 200) {
  if (!isPerformanceDiagnosticsEnabled()) return []
  return getStore().events.slice(0, Math.min(MAX_EVENTS, Math.max(1, limit)))
}

export function clearPerformanceEvents() {
  if (!isPerformanceDiagnosticsEnabled()) return
  getStore().events = []
}
