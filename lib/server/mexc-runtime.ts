import 'server-only'

import { hasSupabaseServerEnv } from '@/lib/supabase/config'
import { hasBrokerIdentityKey } from '@/lib/server/broker-account-identity'
import { hasBrokerSecretKey } from '@/lib/server/broker-secret-store'

export type MexcRuntimeMode = 'off' | 'probe' | 'capture'

export const MEXC_RUNTIME_GATE = 'g1_deployment_controlled' as const

export function getMexcRuntimeMode(): MexcRuntimeMode {
  const value = process.env.EQUORA_MEXC_RUNTIME_MODE?.trim().toLowerCase()
  return value === 'probe' || value === 'capture' ? value : 'off'
}

export function isMexcRuntimeActivated() {
  return getMexcRuntimeMode() !== 'off'
}

export function isMexcAutomaticCaptureActivated() {
  return getMexcRuntimeMode() === 'capture'
}

export function isMexcCaptureEnvironmentReady() {
  return hasSupabaseServerEnv() && hasBrokerSecretKey() && hasBrokerIdentityKey()
}

export const MEXC_RUNTIME_BLOCK_MESSAGE =
  'MEXC ist serverseitig deaktiviert. Ohne EQUORA_MEXC_RUNTIME_MODE=probe oder capture wird kein Brokerrequest ausgeführt.'
