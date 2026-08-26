import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  isMissingBrokerSchemaError,
  projectBrokerConnectionSummary,
} from '@/lib/server/broker-connection-view'
import { getLocalMb4ReviewSnapshot } from '@/lib/server/broker-sync-review-fixture'
import { getMexcRuntimeMode, MEXC_RUNTIME_GATE } from '@/lib/server/mexc-runtime'
import type { MexcRuntimeMode } from '@/lib/server/mexc-runtime'
import type {
  BrokerCaptureRunSummary,
  BrokerConnectionSummary,
  BrokerPreviewItem,
} from '@/lib/types/broker-sync'
import type { BrokerConnectionRow } from '@/lib/types/db'

export type BrokerSyncSnapshot = {
  connections: BrokerConnectionSummary[]
  recentRuns: BrokerCaptureRunSummary[]
  preview: BrokerPreviewItem[]
  schemaState: BrokerSchemaState
  secureStoreState: BrokerDependencyState
  connectorState: BrokerDependencyState
  runtimeEnabled: boolean
  runtimeMode: MexcRuntimeMode
  runtimeGate: typeof MEXC_RUNTIME_GATE
  readScope: 'connection_summary_only' | 'full_snapshot'
  source: 'demo' | 'supabase'
  notice: string | null
}

export type BrokerSchemaState = 'ready' | 'missing' | 'unknown'
export type BrokerDependencyState = 'ready' | 'not_ready' | 'not_read'

const CONNECTION_SELECT = [
  'id',
  'provider',
  'account_label',
  'environment',
  'status',
  'permissions',
  'last_error',
].join(',')

function emptySnapshot(overrides: Partial<BrokerSyncSnapshot> = {}): BrokerSyncSnapshot {
  const runtimeMode = getMexcRuntimeMode()

  return {
    connections: [],
    recentRuns: [],
    preview: [],
    schemaState: 'unknown',
    secureStoreState: 'not_read',
    connectorState: 'not_read',
    runtimeEnabled: runtimeMode !== 'off',
    runtimeMode,
    runtimeGate: MEXC_RUNTIME_GATE,
    readScope: 'connection_summary_only',
    source: 'supabase',
    notice: null,
    ...overrides,
  }
}

export async function getBrokerSyncSnapshotServer(userId?: string | null): Promise<BrokerSyncSnapshot> {
  const localReviewSnapshot = getLocalMb4ReviewSnapshot({
    nodeEnv: process.env.NODE_ENV,
    fixtureFlag: process.env.EQUORA_MB4_REVIEW_FIXTURE,
  })
  if (localReviewSnapshot) return localReviewSnapshot

  if (!hasSupabaseClientEnv()) {
    return emptySnapshot({
      source: 'demo',
      notice: 'Demo-Modus: Für eine echte MEXC-Verbindung müssen zuerst die Supabase-Variablen hinterlegt werden.',
    })
  }

  try {
    const scopedUserId = userId ?? null
    const serverAvailable = hasSupabaseServerEnv()
    const supabase = scopedUserId && serverAvailable
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && serverAvailable) {
      return emptySnapshot({ notice: 'Kein Nutzerkonto für die Broker-Verbindung verfügbar.' })
    }

    let resolvedUserId = scopedUserId
    if (!resolvedUserId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        return emptySnapshot({
          notice: 'Die Anmeldung konnte gerade nicht geprüft werden. Der gespeicherte Verbindungsbestand bleibt unbekannt.',
        })
      }
      resolvedUserId = user?.id ?? null
    }
    if (!resolvedUserId) {
      return emptySnapshot({ notice: 'Bitte anmelden, um einen Broker zu verbinden.' })
    }

    const connectionsResponse = await supabase
      .from('broker_connections')
      .select(CONNECTION_SELECT)
      .eq('user_id', resolvedUserId)
      .order('created_at', { ascending: false })

    if (connectionsResponse.error) {
      if (isMissingBrokerSchemaError(connectionsResponse.error)) {
        return emptySnapshot({
          schemaState: 'missing',
          notice: 'Die erforderliche Broker-Grundlage fehlt im aktiven Datenbankvertrag. Es wurde keine Migration ausgeführt.',
        })
      }

      return emptySnapshot({
        notice: 'Die Broker-Verbindungsübersicht konnte gerade nicht gelesen werden. Es wurden keine Zugangsdaten verändert.',
      })
    }

    const runtimeMode = getMexcRuntimeMode()
    const runtimeEnabled = runtimeMode !== 'off'

    return {
      connections: ((connectionsResponse.data ?? []) as unknown as BrokerConnectionRow[])
        .map((connection) => projectBrokerConnectionSummary(
          connection,
          false,
          { state: 'unavailable', lastCaptureAt: null },
        )),
      recentRuns: [],
      preview: [],
      schemaState: 'ready',
      secureStoreState: 'not_read',
      connectorState: 'not_read',
      runtimeEnabled,
      runtimeMode,
      runtimeGate: MEXC_RUNTIME_GATE,
      readScope: 'connection_summary_only',
      source: 'supabase',
      notice: runtimeEnabled
        ? 'Die Connectionübersicht ist lesbar. Secure-Store-, Account-, Capture- und Rohdatendetails bleiben über diesen begrenzten Read-Pfad nicht verfügbar. Diese Ansicht startet keinen Capturelauf.'
        : 'Die Connectionübersicht ist lesbar. Secure-Store-, Account-, Capture- und Rohdatendetails bleiben ohne freigegebenes Read-Modell nicht verfügbar. Der MEXC-Connector ist per MEXC_RUNTIME_MODE=off deaktiviert; es werden keine Brokerrequests ausgeführt.',
    }
  } catch {
    return emptySnapshot({
      notice: 'Die Broker-Verbindung ist derzeit nicht erreichbar. Es wurden keine Zugangsdaten übertragen.',
    })
  }
}
