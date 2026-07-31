import 'server-only'

export function isPerformanceDiagnosticsEnabled() {
  return process.env.NODE_ENV === 'development' || process.env.EQUORA_PERFORMANCE_DIAGNOSTICS === 'true'
}
