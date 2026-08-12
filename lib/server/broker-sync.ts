import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasBrokerSecretKey } from '@/lib/server/broker-secret-store'
import { hasBrokerIdentityKey } from '@/lib/server/broker-account-identity'
import { mapCaptureRawEventToPreview } from '@/lib/server/broker-preview'
import { isMexcRuntimeActivated, MEXC_RUNTIME_GATE } from '@/lib/server/mexc-runtime'
import type { BrokerCaptureRunSummary, BrokerPreviewItem } from '@/lib/types/broker-sync'
import type { BrokerConnectionRow } from '@/lib/types/db'

export type BrokerSyncSnapshot = {
  connections: BrokerConnectionRow[]
  recentRuns: BrokerCaptureRunSummary[]
  preview: BrokerPreviewItem[]
  schemaReady: boolean
  secureStoreReady: boolean
  connectorReady: boolean
  runtimeGate: typeof MEXC_RUNTIME_GATE
  source: 'demo' | 'supabase'
  notice: string | null
}

type CapturePreviewRow = Readonly<{
  id: string
  broker_account_id: string
  event_type: string
  external_event_id: string | null
  provider_occurred_at_us: number | string | null
  raw_payload: unknown
}>

const CONNECTION_SELECT = [
  'id',
  'user_id',
  'provider',
  'account_label',
  'environment',
  'status',
  'permissions',
  'sync_mode',
  'last_sync_at',
  'last_error',
  'created_at',
  'updated_at',
].join(',')

const RUN_SELECT = [
  'id',
  'user_id',
  'broker_account_id',
  'status',
  'trigger_kind',
  'lane_id',
  'started_at',
  'completed_at',
  'observed_event_count',
  'inserted_raw_event_count',
  'repeated_observation_count',
  'failed_request_count',
  'scope_count',
  'created_at',
].join(',')

const RAW_EVENT_SELECT = [
  'id',
  'broker_account_id',
  'event_type',
  'external_event_id',
  'provider_occurred_at_us',
  'raw_payload',
  'created_at',
].join(',')

function isMissingSchema(message?: string, code?: string) {
  const normalized = message?.toLowerCase() ?? ''
  return code === '42P01'
    || normalized.includes('broker_connections')
    || normalized.includes('broker_capture_runs')
    || normalized.includes('broker_capture_raw_events')
}

function emptySnapshot(overrides: Partial<BrokerSyncSnapshot> = {}): BrokerSyncSnapshot {
  return {
    connections: [],
    recentRuns: [],
    preview: [],
    schemaReady: false,
    secureStoreReady: false,
    connectorReady: false,
    runtimeGate: MEXC_RUNTIME_GATE,
    source: 'supabase',
    notice: null,
    ...overrides,
  }
}

export async function getBrokerSyncSnapshotServer(userId?: string | null): Promise<BrokerSyncSnapshot> {
  if (!hasSupabaseClientEnv()) {
    return emptySnapshot({
      schemaReady: true,
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
      const { data: { user } } = await supabase.auth.getUser()
      resolvedUserId = user?.id ?? null
    }
    if (!resolvedUserId) {
      return emptySnapshot({ notice: 'Bitte anmelden, um einen Broker zu verbinden.' })
    }

    const secureStoreResponsePromise = serverAvailable
      ? createSupabaseServerClient()
          .from('broker_credentials')
          .select('id')
          .eq('user_id', resolvedUserId)
          .limit(1)
      : Promise.resolve({ data: null, error: null })
    const [
      connectionsResponse,
      accountsResponse,
      runsResponse,
      previewResponse,
      secureStoreResponse,
    ] = await Promise.all([
      supabase
        .from('broker_connections')
        .select(CONNECTION_SELECT)
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: false }),
      supabase
        .from('broker_connection_accounts')
        .select('connection_id,broker_account_id')
        .eq('user_id', resolvedUserId)
        .eq('status', 'active'),
      supabase
        .from('broker_capture_runs')
        .select(RUN_SELECT)
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('broker_capture_raw_events')
        .select(RAW_EVENT_SELECT)
        .eq('user_id', resolvedUserId)
        .in('event_type', ['order', 'execution'])
        .order('provider_occurred_at_us', { ascending: false, nullsFirst: false })
        .limit(30),
      secureStoreResponsePromise,
    ])

    const firstError = connectionsResponse.error ?? accountsResponse.error
      ?? runsResponse.error ?? previewResponse.error
    if (firstError) {
      if (isMissingSchema(firstError.message, firstError.code)) {
        return emptySnapshot({
          notice: 'Die Broker-Grundlage fehlt noch. Bitte zuerst den SQL-Patch v57.52 in Supabase ausführen.',
        })
      }

      return emptySnapshot({
        notice: 'Die Broker-Daten konnten gerade nicht gelesen werden. Es wurden keine Zugangsdaten verändert.',
      })
    }

    const secureStoreReady = serverAvailable && !secureStoreResponse.error

    const connectionByAccount = new Map(
      (accountsResponse.data ?? []).map((row) => [row.broker_account_id, row.connection_id]),
    )
    const previewRows = (previewResponse.data ?? []) as unknown as CapturePreviewRow[]
    const preview = previewRows.flatMap((row) => {
      const connectionId = connectionByAccount.get(row.broker_account_id)
      return connectionId ? [mapCaptureRawEventToPreview(row, connectionId)] : []
    })

    return {
      connections: (connectionsResponse.data ?? []) as unknown as BrokerConnectionRow[],
      recentRuns: (runsResponse.data ?? []) as unknown as BrokerCaptureRunSummary[],
      preview,
      schemaReady: true,
      secureStoreReady,
      connectorReady: serverAvailable && secureStoreReady && hasBrokerSecretKey() && hasBrokerIdentityKey() && isMexcRuntimeActivated(),
      runtimeGate: MEXC_RUNTIME_GATE,
      source: 'supabase',
      notice: serverAvailable && secureStoreReady && hasBrokerSecretKey() && hasBrokerIdentityKey()
        ? isMexcRuntimeActivated()
          ? 'MEXC Read-only ist für einen ausdrücklich ausgelösten Verbindungscheck vorbereitet. Automatische Rohdatenerfassung ist nur im separaten Capture-Modus aktiv; Journalimport bleibt aus.'
          : 'Der MEXC-Connector ist per MEXC_RUNTIME_MODE=off deaktiviert. Es werden keine Brokerrequests ausgeführt.'
        : null,
    }
  } catch {
    return emptySnapshot({
      notice: 'Die Broker-Verbindung ist derzeit nicht erreichbar. Es wurden keine Zugangsdaten übertragen.',
    })
  }
}
