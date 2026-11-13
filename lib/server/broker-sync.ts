import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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

export async function getBrokerSyncSnapshotServer(userId?: string | null, locale: JournalLocale = 'de'): Promise<BrokerSyncSnapshot> {
  const text = journalText(locale)
  const localReviewSnapshot = getLocalMb4ReviewSnapshot({
    nodeEnv: process.env.NODE_ENV,
    fixtureFlag: process.env.EQUORA_MB4_REVIEW_FIXTURE,
  })
  if (localReviewSnapshot) {
    return locale === 'de' ? localReviewSnapshot : { ...localReviewSnapshot, notice: 'Local demo: sample data only. Broker access is off.' }
  }

  if (!hasSupabaseClientEnv()) {
    return emptySnapshot({
      source: 'demo',
      notice: text("Demo: Brokerverbindungen sind in dieser Umgebung noch nicht eingerichtet.", "Demo: Broker connections are unavailable."),
    })
  }

  try {
    const scopedUserId = userId ?? null
    const serverAvailable = hasSupabaseServerEnv()
    const supabase = scopedUserId && serverAvailable
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && serverAvailable) {
      return emptySnapshot({ notice: text("Kein Nutzerkonto für die Broker-Verbindung verfügbar.", "No user account is available for this connection.") })
    }

    let resolvedUserId = scopedUserId
    if (!resolvedUserId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        return emptySnapshot({
          notice: text("Die Anmeldung konnte gerade nicht geprüft werden. Der gespeicherte Verbindungsbestand bleibt unbekannt.", "Your sign-in and saved connections could not be checked."),
        })
      }
      resolvedUserId = user?.id ?? null
    }
    if (!resolvedUserId) {
      return emptySnapshot({ notice: text("Bitte anmelden, um einen Broker zu verbinden.", "Sign in to connect a broker.") })
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
          notice: text("Die Brokerverwaltung ist in dieser Umgebung noch nicht eingerichtet. Bitte wende dich an die Administration.", "Broker management is unavailable here. Contact your administrator."),
        })
      }

      return emptySnapshot({
        notice: text("Die Broker-Verbindungsübersicht konnte gerade nicht gelesen werden. Es wurden keine Zugangsdaten verändert.", "The connection list could not be loaded. Your credentials were not changed."),
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
        ? text("Die Verbindungsübersicht ist verfügbar. Kontodetails und Abrufverlauf fehlen in dieser Ansicht. Diese Ansicht startet keinen Datenabruf.", "The connection list is available. Account details and retrieval history are unavailable in this view. Opening this page does not start data retrieval.")
        : text("Die Verbindungsübersicht ist verfügbar. Kontodetails und Abrufverlauf fehlen in dieser Ansicht. Der MEXC-Abruf ist deaktiviert.", "The connection list is available. Account details and retrieval history are unavailable in this view. MEXC data access is off."),
    }
  } catch {
    return emptySnapshot({
      notice: text("Die Broker-Verbindung ist derzeit nicht erreichbar. Es wurden keine Zugangsdaten übertragen.", "The broker connection is unavailable. No credentials were sent."),
    })
  }
}
