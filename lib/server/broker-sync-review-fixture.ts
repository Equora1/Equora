import 'server-only'

import { MEXC_RUNTIME_GATE } from '@/lib/server/mexc-runtime'
import type { BrokerSyncSnapshot } from '@/lib/server/broker-sync'

const LOCAL_REVIEW_FLAG = 'local_only'

export function getLocalMb4ReviewSnapshot({
  nodeEnv,
  fixtureFlag,
}: {
  nodeEnv: string | undefined
  fixtureFlag: string | undefined
}): BrokerSyncSnapshot | null {
  if (nodeEnv !== 'development' || fixtureFlag !== LOCAL_REVIEW_FLAG) return null

  return {
    connections: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        providerCode: 'mexc',
        accountLabel: 'MEXC Reviewkonto',
        environment: 'live',
        status: 'ready',
        technicalReadResult: 'legacy_read_observed',
        readOnlyAttestation: 'user_confirmed',
        permissionEvidence: 'limited_read_observed',
        accountIdentityResult: 'pseudonymous_binding_present',
        historyCoverage: 'capture_observed',
        lastCaptureAt: '2026-08-22T20:00:00.000Z',
        hasSanitizedError: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        providerCode: 'mexc',
        accountLabel: 'Unbekannter MEXC-Zustand',
        environment: 'unknown',
        status: 'unknown',
        technicalReadResult: 'not_persisted',
        readOnlyAttestation: 'not_confirmed',
        permissionEvidence: 'not_persisted',
        accountIdentityResult: 'not_available',
        historyCoverage: 'not_observed',
        lastCaptureAt: null,
        hasSanitizedError: false,
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        providerCode: 'unknown',
        accountLabel: 'Nicht unterstützter Provider',
        environment: 'unknown',
        status: 'unknown',
        technicalReadResult: 'not_persisted',
        readOnlyAttestation: 'not_confirmed',
        permissionEvidence: 'not_persisted',
        accountIdentityResult: 'not_available',
        historyCoverage: 'not_observed',
        lastCaptureAt: null,
        hasSanitizedError: false,
      },
    ],
    recentRuns: [],
    preview: [],
    schemaReady: true,
    secureStoreReady: false,
    connectorReady: false,
    runtimeEnabled: false,
    runtimeMode: 'off',
    runtimeGate: MEXC_RUNTIME_GATE,
    source: 'demo',
    notice: 'Lokale MB4-Reviewfixture: ausschließlich synthetische, secret-freie Zustände; Runtime und Brokerzugriff bleiben aus.',
  }
}
