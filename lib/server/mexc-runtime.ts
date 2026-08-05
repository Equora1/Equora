export const MEXC_RUNTIME_GATE = 'g1_transport_only' as const

export function isMexcRuntimeActivated() {
  return false
}

export const MEXC_RUNTIME_BLOCK_MESSAGE =
  'MEXC ist in diesem Entwicklungsstand noch nicht für automatische Abrufe aktiviert. Der GET-only-Transport wird zuerst vollständig gegen Gate G1 geprüft.'
