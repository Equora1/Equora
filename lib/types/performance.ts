export type PerformanceCategory = 'auth' | 'database' | 'transform' | 'page' | 'client' | 'system'

export type PerformanceEvent = {
  id: string
  timestamp: string
  name: string
  category: PerformanceCategory
  durationMs: number
  status: 'ok' | 'error'
  route?: string
  meta?: Record<string, string | number | boolean | null>
}
